const koaRouter = require('koa-router');
const golos = require('golos-lib-js');
const Tarantool = require('../tarantool');
const { returnError, SCOPES } = require('../utils');
const { GOLOS_CHECK_VALUE, GOLOS_CHECK_PARAM_ACCOUNT } = require('../offchain_validators');
const { signal_fire } = require('../signals');
const { putToQueues } = require('./queues');
const { putToGroupQueues } = require('./group_queues')
const isBlocking = require('../isBlocking')

class private_message_operation {
    constructor(obj) {
        const { from, to, nonce, from_memo_key, to_memo_key,
            checksum, update, encrypted_message, extensions, } = obj;
        this.from = from;
        this.to = to;
        this.nonce = nonce;
        this.from_memo_key = from_memo_key;
        this.to_memo_key = to_memo_key;
        this.checksum = checksum;
        this.update = update;
        this.encrypted_message = encrypted_message;

        if (extensions) {
            for (const ext of extensions) {
                const [ key, data ] = ext
                if (key === 0) {
                    this.has_group = true
                    this.group = data.group
                    this.requester = data.requester || ''
                    this.mentions = data.mentions ? [...new Set(data.mentions)] : []
                }
            }
        }
    }

    getAuthority() {
        if (this.update) {
            if (this.requester) return this.requester
        }
        return this.from;
    }

    validate() {
        const { from, to, nonce, from_memo_key, to_memo_key,
            checksum, update, encrypted_message,
            group, requester, mentions } = this

        GOLOS_CHECK_PARAM_ACCOUNT(this, 'from');
        if (!group || to) {
            GOLOS_CHECK_PARAM_ACCOUNT(this, 'to');
        }

        GOLOS_CHECK_VALUE(from != to, 'You cannot write to yourself');

        GOLOS_CHECK_VALUE(!update, 'You cannot update message offchain');

        GOLOS_CHECK_VALUE(!isNaN(parseInt(nonce)),
            '`nonce` should be an integer');

        GOLOS_CHECK_VALUE(parseInt(nonce) != 0,
            '`nonce` can\'t be zero');

        GOLOS_CHECK_VALUE(Number.isInteger(checksum),
            '`checksum` should be an integer');

        GOLOS_CHECK_VALUE(typeof(encrypted_message) === 'string' && encrypted_message.length >= 16,
            'Encrypted message is too small');

        if (this.has_group) {
            GOLOS_CHECK_VALUE(!!group, 'Invalid group')
        }
        if (requester) {
            GOLOS_CHECK_PARAM_ACCOUNT(this, 'requester')
        }
        if (mentions) {
            for (let i = 0; i < mentions.length; ++i) {
                GOLOS_CHECK_PARAM_ACCOUNT(mentions, i)
            }
        }
    }
};

module.exports = function useMsgsApi(app) {
    const router = new koaRouter();
    app.use(router.routes());

    router.post('/msgs/send_offchain', async (ctx) => {
        try {
            let params = ctx.request.body;
            if (typeof(params) === 'string') params = JSON.parse(params);

            const { from, to, nonce, from_memo_key, to_memo_key,
                checksum, update, encrypted_message, } = params;

            let fromAcc, toAcc

            let op = new private_message_operation(params);

            GOLOS_CHECK_VALUE(op.getAuthority() === ctx.session.a,
                'Missing posting authority: ' + op.getAuthority());

            op.validate();

            const names = [from]
            if (to) names.push(to)
            for (const men of op.mentions || []) {
                names.push(men)
            }
            const accs = await golos.api.getAccountsAsync(names, { current: from })
            GOLOS_CHECK_VALUE(accs.length !== 0 && accs[0].name === from,
                'Missing account from');
            if (to) {
                GOLOS_CHECK_VALUE(accs.length >= 2 && accs[1].name === to,
                    'Missing account to');
            }
            for (let i = 2; i < names.length; ++i) {
                GOLOS_CHECK_VALUE(accs[i] && accs[i].name === names[i],
                    'Missing account @' + names[i] + ' (mentions')
            }

            fromAcc = accs[0]
            toAcc = accs[1]

            if (op.group) {
                const { emptyPublicKey } = golos.messages
                GOLOS_CHECK_VALUE(from_memo_key === emptyPublicKey,
                    'Memo keys should be empty for groups')
                GOLOS_CHECK_VALUE(to_memo_key === emptyPublicKey,
                    'Memo keys should be empty for groups')

                const auth = op.getAuthority()
                const reqMems = [auth]
                let pgo = (await golos.api.getGroupsAsync({
                    start_group: op.group,
                    limit: 1,
                    with_members: {
                        accounts: reqMems
                    },
                })).groups
                pgo = pgo[0]
                GOLOS_CHECK_VALUE(pgo, 'Missing group (empty result)')
                GOLOS_CHECK_VALUE(pgo.name === op.group, `Missing group (${pgo.name} !== ${op.group})`)

                const { owner, privacy, member_list } = pgo
                const member = member_list && member_list.find(mem => mem.account === auth)
                const isModer = owner === auth || (member && member.member_type === 'moder')
                if (privacy !== 'public_group') {
                    const isMember = isModer || (member && member.member_type === 'member')
                    GOLOS_CHECK_VALUE(isMember,
                        'You should be member of the group.')
                } else {
                    const isBanned = member && member.member_type === 'banned'
                    GOLOS_CHECK_VALUE(!isBanned,
                        'You are banned.')
                }
                if (auth !== op.from) {
                    GOLOS_CHECK_VALUE(isModer, 'You should be moderator.')
                }
            } else {
                GOLOS_CHECK_VALUE(from_memo_key === fromAcc.memo_key,
                    'from_memo_key is not match with from account memo_key');

                if (toAcc)
                    GOLOS_CHECK_VALUE(to_memo_key === toAcc.memo_key,
                        'to_memo_key is not match with to account memo_key');
            }

            const now = new Date().toISOString().split('.')[0];

            for (let i = 1; i < accs.length; ++i) {
                const blocking = await isBlocking(accs[i], fromAcc)
                if (blocking) {
                    if (blocking === 1) {
                        console.error(`/msgs/send_offchain @${from} wants to bypass blacklist of @${accs[i].name}`)
                    } else {
                        console.error(`/msgs/send_offchain @${from} wants to bypass do-not-bother preset of @${accs[i].name}`)
                    }
                    ctx.body = {
                        status: 'ok',
                    }
                    return
                }
            }

            if (op.group) {
                try {
                    console.log(op.group)
                    await putToGroupQueues(
                        op.group,
                        'message',
                        ['private_message', {...params, _offchain: true}],
                        now
                    )
                    ctx.body = {
                        status: 'ok',
                    }
                } catch (error) {
                    console.error(`[reqid ${ctx.request.header['x-request-id']}] ${ctx.method} ERRORLOG /msgs/send_offchain /${group} ${error.message}`)
                    ctx.body = {
                        status: 'err',
                        error: 'Tarantool error when notifying group watchers',
                    }
                }
                return
            }

            try {
                await putToQueues(
                    from,
                    'message',
                    ['private_message', {...params, _offchain: true}],
                    now);
            } catch (error) {
                console.error(`[reqid ${ctx.request.header['x-request-id']}] ${ctx.method} ERRORLOG /msgs/send_offchain @${from} ${error.message}`);
                ctx.body = {
                    status: 'err',
                    error: 'Tarantool error when notifying from',
                };
                return;
            }

            try {
                await putToQueues(
                    to,
                    'message',
                    ['private_message', {...params, _offchain: true}],
                    now);
            } catch (error) {
                console.error(`[reqid ${ctx.request.header['x-request-id']}] ${ctx.method} ERRORLOG /msgs/send_offchain @${from} ${error.message}`);
                ctx.body = {
                    status: 'err',
                    error: 'Tarantool error when notifying to',
                };
                return;
            }

            ctx.body = {
                status: 'ok',
            }
        } catch (error) {
            return returnError(ctx, error.message);
        }
    });

    // Very experimental method, do not rely on it
    router.get('/msgs/get_inbox/@:account/:select_accounts?', async (ctx) => {
        const { account, select_accounts } = ctx.params
        const { offset, limit, unread_only } = ctx.query

        try {
            const result = await golos.api.getInboxAsync(account, {
                select_accounts: select_accounts ? JSON.parse(select_accounts)  : [],
                offset,
                limit,
                unread_only
            })
            for (let obj of result) {
                obj.__time = Math.floor(+new Date(obj.create_date + 'Z') / 1000)
            }
            ctx.body = {
                status: 'ok',
                result
            }
        } catch (err) {
            console.error('/msgs/get_inbox', err, account)
            ctx.body = {
                status: 'err',
            }
        }
    })
}
