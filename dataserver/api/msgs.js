const koaRouter = require('koa-router');
const golos = require('golos-classic-js');
const Tarantool = require('../tarantool');
const { returnError, SCOPES } = require('../utils');
const { GOLOS_CHECK_VALUE, GOLOS_CHECK_PARAM_ACCOUNT } = require('../offchain_validators');

class private_message_operation {
    constructor(obj) {
        const { from, to, nonce, from_memo_key, to_memo_key,
            checksum, update, encrypted_message, } = obj;
        this.from = from;
        this.to = to;
        this.nonce = nonce;
        this.from_memo_key = from_memo_key;
        this.to_memo_key = to_memo_key;
        this.checksum = checksum;
        this.update = update;
        this.encrypted_message = encrypted_message;
    }

    getAuthority() {
        return this.from;
    }

    validate() {
        const { from, to, nonce, from_memo_key, to_memo_key,
            checksum, update, encrypted_message, } = this;

        GOLOS_CHECK_PARAM_ACCOUNT(this, 'from');
        GOLOS_CHECK_PARAM_ACCOUNT(this, 'to');

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
    }
};

module.exports = function useMsgsApi(app) {
    const router = new koaRouter();
    app.use(router.routes());

    router.post('/msgs/send_offchain', async (ctx) => {
        let params = ctx.request.body;
        if (typeof(params) === 'string') params = JSON.parse(params);

        const { from, to, nonce, from_memo_key, to_memo_key,
            checksum, update, encrypted_message, } = params;

        let op = null;
        try {
            op = new private_message_operation(params);

            GOLOS_CHECK_VALUE(op.getAuthority() === ctx.session.a,
                'Missing posting authority: ' + op.getAuthority());

            op.validate();

            const accs = await golos.api.getAccountsAsync([from, to]);
            GOLOS_CHECK_VALUE(accs.length !== 0 && accs[0].name === from,
                'Missing account from');
            GOLOS_CHECK_VALUE(accs.length === 2,
                'Missing account to');

            const [ fromAcc, toAcc ] = accs;

            GOLOS_CHECK_VALUE(from_memo_key === fromAcc.memo_key,
                'from_memo_key is not match with from account memo_key');

            GOLOS_CHECK_VALUE(to_memo_key === toAcc.memo_key,
                'to_memo_key is not match with to account memo_key');
        } catch (error) {
            return returnError(ctx, error.message);
        }

        const now = new Date().toISOString().split('.')[0];

        try {
            const res = await Tarantool.instance('tarantool').call(
                'notification_add',
                from,
                SCOPES.indexOf('message'),
                false,
                ['private_message', {...params, _offchain: true}],
                now,
            );
        } catch (error) {
            console.error(`[reqid ${ctx.request.header['x-request-id']}] ${ctx.method} ERRORLOG notifications @${from} ${error.message}`);
            ctx.body = {
                status: 'err',
                error: 'Tarantool error when notifying from',
            };
            return;
        }

        try {
            const res = await Tarantool.instance('tarantool').call(
                'notification_add',
                to,
                SCOPES.indexOf('message'),
                false,
                ['private_message', {...params, _offchain: true}],
                now,
            );
            ctx.body = {
                status: 'ok',
            };
        } catch (error) {
            console.error(`[reqid ${ctx.request.header['x-request-id']}] ${ctx.method} ERRORLOG notifications @${from} ${error.message}`);
            ctx.body = {
                status: 'err',
                error: 'Tarantool error when notifying to',
            };
            return;
        }
    });
}
