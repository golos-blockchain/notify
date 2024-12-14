const golos = require('golos-lib-js');
const Tarantool = require('./tarantool');
const { opGroup } = require('./msg_utils')
const { SCOPES, sleep } = require('./utils');
const { signal_fire } = require('./signals');
const { cleanupStats } = require('./api/stats')
const { getSubs, putEvent } = require('./api/subs')
const { addCounter } = require('./api/counters');
const { putToQueues, make_queue_id } = require('./api/queues');
const { putToMsgGroupQueues } = require('./api/group_queues')

const processedPosts = {};

const MIN_MODERS_TO_NOT_BOTHER_GROUP_OWNER = 3

function getPostKey(op) {
    return op.author + '/' + op.permlink;
}

async function cleanupQueues() {
    console.log('cleanupQueues (just update it 4)');
    const res = await Tarantool.instance('tarantool').call(
        'queue_list_for_cleanup');
    if (!res[0][0]) return;
    const { queue_ids } = res[0][0];
    if (!queue_ids && !queue_ids.length) return;

    for (const [acc, id] of queue_ids) {
        console.log('cleaning:', acc, id);

        let hasWs = false
        const subs = global.queueSubscribers[acc]
        if (subs) {
            for (const [ xSession, sub ] of Object.entries(subs)) {
                if (sub.subscriber_id === id && sub.ws && !sub.ws.isDead) {
                    hasWs = true
                    break
                }
            }
        }
        if (hasWs) {
            console.log('it has ws')
            continue
        }

        await Tarantool.instance('tarantool').call(
            'queue_unsubscribe', acc, id,
        );

        signal_fire(make_queue_id(acc, id));
    }
    console.log('cleanupQueues end');
}

async function processGroupMember(op) {
    const opJson = JSON.parse(op.json)
    const data = opJson[1]
    const { name, requester, member, member_type } = data
    if (member_type === 'pending') {
        let members = []
        try {
            members = (await golos.api.getGroupMembersAsync({
                group: name,
                member_types: ['moder'],
                limit: 10,
            })).members
        } catch (err) {
            console.error('Error get group moders:', name, err)
        }
        let informed = 0
        for (const mem of members) {
            await addCounter(
                mem.account,
                SCOPES.indexOf('join_request_mod'),
            )
            ++informed
        }
        if (informed < MIN_MODERS_TO_NOT_BOTHER_GROUP_OWNER) {
            let group
            try {
                group = (await golos.api.getGroupsAsync({
                    start_group: name,
                    limit: 1,
                })).groups
                group = group[0]
            } catch (err) {
                console.error('Error get group:', name, err)
            }
            if (group) {
                await addCounter(
                    group.owner,
                    SCOPES.indexOf('join_request_own'),
                )
                ++informed
            }
        }
        console.log('group join', name, informed)
    } else if ((member_type === 'member' || member_type === 'moder')
            && requester !== member) {
        console.log('group member', member)
        if (member_type === 'moder') {
            await addCounter(
                member,
                SCOPES.indexOf('group_member_mod'),
            )
            return
        }
        await addCounter(
            member,
            SCOPES.indexOf('group_member_mem'),
        )
    }
}

async function processMessage(op) {
    const opJson = JSON.parse(op.json);
    if (!Array.isArray(opJson))
        return;
    if (!['private_message', 'private_delete_message', 'private_mark_message',
        'private_group_member'].includes(opJson[0]))
        return;
    if (opJson[0] === 'private_group_member') {
        await processGroupMember(op)
        return
    }
    const data = opJson[1]
    const { group } = opGroup(data)
    console.log(opJson[0], group, data.from, data.to);
    if (group) {
        await putToMsgGroupQueues(
            group,
            opJson,
            op.timestamp_prev,
        )
    } else {
        await addCounter(
            data.to,
            SCOPES.indexOf('message'),
        )
        await putToQueues(
            data.from,
            'message',
            opJson,
            op.timestamp_prev);
        await putToQueues(
            data.to,
            'message',
            opJson,
            op.timestamp_prev);
    }
}

async function processComment(op) {
    let commentBody = op.body;
    if (!commentBody || commentBody.startsWith('@@ '))
        return;

    let post
    try {
        post = await golos.api.getContentAsync(op.author, op.permlink);
        if (!post.author) {
            throw 'post not found';
        }
        op._depth = post.depth;
    } catch (ex) {
        console.error('Err update post', ex);
        return;
    }

    const pkey = getPostKey(op);
    if (processedPosts[pkey])
        return;
    processedPosts[pkey] = true;

    if (post.parent_author) {
        const urlParts = post.url && post.url.split('#')
        if (!urlParts || !urlParts[1] || !urlParts[0]) {
            console.error('wrong post detected: ' + post.url)
            return
        }
        let [ nothing, tag, rootAuthor, rootPermlink ] = urlParts[0].split('/')
        rootAuthor = rootAuthor.replace('@', '')

        const id = rootAuthor + '|' + rootPermlink
        let subs = await getSubs(id)
        subs = subs[0]
        const data = JSON.stringify({
            author: op.author,
            permlink: op.permlink,
            hashlink: post.hashlink,
            title: op.title,
            body: op.body.substr(0, 500)
        })
        for (const sub of subs) {
            const { account } = sub
            if (op.author === account) {
                continue
            }
            await addCounter(
                account,
                SCOPES.indexOf('subscriptions'),
            )
            await putEvent(account, id, data)
        }
    }
}

async function processCommentReply(op) {
    await addCounter(
        op.parent_author,
        SCOPES.indexOf('comment_reply'),
    )
    await putToQueues(
        op.parent_author,
        'comment_reply',
        op,
        op.timestamp_prev);
}

async function processCommentMention(op) {
    console.log('--- mention: ', op.author, op.permlink, '@' + op.mentioned);
    await addCounter(
        op.mentioned,
        SCOPES.indexOf('mention'),
    )
    await putToQueues(
        op.mentioned,
        'mention',
        op,
        op.timestamp_prev);
}

async function processCommentFeed(op) {
    console.log('--- feed: ', op.author, op.permlink, '@' + op.follower);
    await addCounter(
        op.follower,
        SCOPES.indexOf('feed'),
    )
    await putToQueues(
        op.follower,
        'feed',
        op,
        op.timestamp_prev);
}

async function processTransfer(op) {
    if (op.from == op.to)
        return;
    console.log('transfer', op.from, op.to);

    await addCounter(
        op.from,
        SCOPES.indexOf('send'),
    )
    await addCounter(
        op.to,
        SCOPES.indexOf('receive'),
    )
    await putToQueues(
        op.from,
        'send',
        op,
        op.timestamp_prev);
    await putToQueues(
        op.to,
        'receive',
        op,
        op.timestamp_prev);
}

async function processDonate(op) {
    if (op.from == op.to)
        return;

    let scope = 'donate'

    const { target } = op.memo
    if (target && target.from && (target.to || target.group) && target.nonce) {
        scope = 'donate_msgs'
    }

    console.log(scope, op.from, op.to);

    await addCounter(
        op.to,
        SCOPES.indexOf(scope),
    )
    await putToQueues(
        op.to,
        scope,
        op,
        op.timestamp_prev);
    if (scope === 'donate_msgs') {
        await putToQueues(
            op.from,
            scope,
            op,
            op.timestamp_prev)
    }
}

async function processDelegateVS(op) {
    console.log('--- delegate vesting shares:', op.delegatee, op.delegatee, op.vesting_shares)

    const vs = parseFloat(op.vesting_shares)

    if (vs === 0) return // if it is cancel

    await addCounter(
        op.delegatee,
        SCOPES.indexOf('delegate_vs'),
    )
}

async function processFillOrder(op) {
    console.log('--- fill_order: ', op.current_owner, op.open_owner);
    await addCounter(
        op.current_owner,
        SCOPES.indexOf('fill_order'),
    )
    await addCounter(
        op.open_owner,
        SCOPES.indexOf('fill_order'),
    )
    await putToQueues(
        op.current_owner,
        'fill_order',
        op,
        op.timestamp_prev);
    await putToQueues(
        op.open_owner,
        'fill_order',
        op,
        op.timestamp_prev);
}

async function processSubscriptionPayment(op) {
    if (op.payment_type === 'first') {
        console.log('--- new sponsor: ', op.subscriber, op.author, op.oid)
        await addCounter(
            op.author,
            SCOPES.indexOf('new_sponsor'),
        )
    }
}

async function processSubscriptionInactive(op) {
    console.log('--- subscription inactive: ', op.subscriber, op.author, op.oid)
    await addCounter(
        op.subscriber,
        SCOPES.indexOf('sponsor_inactive'),
    )
}

async function processNftIssue(op) {
    console.log('--- nft issue: ', op.creator, op.to, op.token_id)
    if (op.creator !== op.to)
        await addCounter(
            op.to,
            SCOPES.indexOf('nft_receive'),
        )
}

async function processNftTransfer(op) {
    console.log('--- nft transfer: ', op.from, op.to, op.token_id)
    await addCounter(
        op.to,
        SCOPES.indexOf('nft_receive'),
    )
}

async function processNftBuy(op) {
    // conditions #1 and #2 are "offer/auction"
    // cond #3 is "not auction"
    if (op.token_id && op.name && op.order_id) {
        console.log('--- nft offer: ', op.buyer, op.token_id, op.order_id, op.name)

        let token
        for (let r = 1; r <= 2; ++r) {
            if (r > 1) await sleep(500);
            try {
                token = await golos.api.getNftTokensAsync({
                    select_token_ids: [op.token_id]
                })
                token = token[0]
                break
            } catch (err) {
                console.error('processNftBuy: cannot get NFT:', op.token_id, err)
            }
        }

        if (!token) {
            console.error('processNftBuy: cannot get NFT:', op.token_id)
        }

        await addCounter(
            token.owner,
            SCOPES.indexOf('nft_buy_offer'),
        )
    }
}

async function processNftTokenSold(op) {
    console.log('--- nft token sold: ', op.actor, op.seller, op.buyer, op.token_id)
    if (op.actor !== op.seller && op.actor) { // auction -> op.actor is empty
        await addCounter(
            op.seller,
            SCOPES.indexOf('nft_token_sold'),
        )
    } else {
        await addCounter(
            op.buyer,
            SCOPES.indexOf('nft_token_sold'),
        )
    }
}

async function processReferral(op) {
    console.log('--- referral: ', op.referrer, op.referral)
    await addCounter(
        op.referrer,
        SCOPES.indexOf('referral'),
    )
}

async function processOp(op_data) {
    let [ opType, op ] = op_data;

    op.type = opType;

    if (opType === 'custom_json' && op['id'] === 'private_message')
        await processMessage(op);

    if (opType === 'comment')
        await processComment(op);
    if (opType === 'comment_reply')
        await processCommentReply(op);
    if (opType === 'comment_mention')
        await processCommentMention(op);
    if (opType === 'comment_feed')
        await processCommentFeed(op);

    if (opType.startsWith('transfer') || opType === 'claim')
        await processTransfer(op);

    if (opType === 'donate')
        await processDonate(op);

    if (opType === 'delegate_vesting_shares' || opType === 'delegate_vesting_shares_with_interest')
        await processDelegateVS(op)

    if (opType === 'fill_order')
        await processFillOrder(op);

    if (opType === 'subscription_payment')
        await processSubscriptionPayment(op)

    if (opType === 'subscription_inactive')
        await processSubscriptionInactive(op)

    if (opType === 'nft_token')
        await processNftIssue(op)

    if (opType === 'nft_transfer')
        await processNftTransfer(op)

    if (opType === 'nft_buy')
        await processNftBuy(op)

    if (opType === 'nft_token_sold')
        await processNftTokenSold(op)

    if (opType === 'referral')
        await processReferral(op)
}

module.exports = function startFeeding() {
    console.log('Started feeding from blockchain');

    golos.api.streamEvents(async (err, event, eventmeta) => {
        if (err) {
            console.error('FEED: streamEvents fail');
            console.error(err);
            return;
        }
        event[1].timestamp_prev = eventmeta.timestamp;
        await processOp(event);

        if (eventmeta.block % 10 === 0) {
            await cleanupQueues()
        }
        if (eventmeta.block % 10 === 0) {
            await cleanupStats()
        }
    });
}
