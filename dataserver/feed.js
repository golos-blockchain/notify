const golos = require('golos-lib-js');
const Tarantool = require('./tarantool');
const { SCOPES } = require('./utils');
const { signal_fire } = require('./signals');
const { cleanupStats } = require('./api/stats')
const { getSubs, putEvent } = require('./api/subs')
const { putToQueues, make_queue_id } = require('./api/queues');

const processedPosts = {};

function getPostKey(op) {
    return op.author + '/' + op.permlink;
}

async function cleanupQueues() {
    console.log('cleanupQueues');
    const res = await Tarantool.instance('tarantool').call(
        'queue_list_for_cleanup');
    if (!res[0][0]) return;
    const { queue_ids } = res[0][0];
    if (!queue_ids && !queue_ids.length) return;

    for (const [acc, id] of queue_ids) {
        console.log('cleaning:', acc, id);

        await Tarantool.instance('tarantool').call(
            'queue_unsubscribe', acc, id,
        );

        signal_fire(make_queue_id(acc, id));
    }
    console.log('cleanupQueues end');
}

async function processMessage(op) {
    const opJson = JSON.parse(op.json);
    if (!Array.isArray(opJson))
        return;
    if (!['private_message', 'private_delete_message', 'private_mark_message'].includes(opJson[0]))
        return;
    const data = opJson[1];
    console.log(opJson[0], data.from, data.to);
    await Tarantool.instance('tarantool').call('counter_add',
        data.to,
        SCOPES.indexOf('message'),
    );
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
            await Tarantool.instance('tarantool').call('counter_add',
                account,
                SCOPES.indexOf('subscriptions'),
            )
            await putEvent(account, id, data)
        }
    }
}

async function processCommentReply(op) {
    await Tarantool.instance('tarantool').call('counter_add',
        op.parent_author,
        SCOPES.indexOf('comment_reply'),
    );
    await putToQueues(
        op.parent_author,
        'comment_reply',
        op,
        op.timestamp_prev);
}

async function processCommentMention(op) {
    console.log('--- mention: ', op.author, op.permlink, '@' + op.mentioned);
    await Tarantool.instance('tarantool').call('counter_add',
        op.mentioned,
        SCOPES.indexOf('mention'),
    );
    await putToQueues(
        op.mentioned,
        'mention',
        op,
        op.timestamp_prev);
}

async function processCommentFeed(op) {
    console.log('--- feed: ', op.author, op.permlink, '@' + op.follower);
    await Tarantool.instance('tarantool').call('counter_add',
        op.follower,
        SCOPES.indexOf('feed'),
    );
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

    await Tarantool.instance('tarantool').call('counter_add',
        op.from,
        SCOPES.indexOf('send'),
    );
    await Tarantool.instance('tarantool').call('counter_add',
        op.to,
        SCOPES.indexOf('receive'),
    );
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
    if (target && target.from && target.to && target.nonce) {
        scope = 'donate_msgs'
    }

    console.log(scope, op.from, op.to);

    await Tarantool.instance('tarantool').call('counter_add',
        op.to,
        SCOPES.indexOf(scope),
    );
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

    await Tarantool.instance('tarantool').call('counter_add',
        op.delegatee,
        SCOPES.indexOf('delegate_vs'),
    )
}

async function processFillOrder(op) {
    console.log('--- fill_order: ', op.current_owner, op.open_owner);
    await Tarantool.instance('tarantool').call('counter_add',
        op.current_owner,
        SCOPES.indexOf('fill_order'),
    );
    await Tarantool.instance('tarantool').call('counter_add',
        op.open_owner,
        SCOPES.indexOf('fill_order'),
    );
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
        await Tarantool.instance('tarantool').call('counter_add',
            op.author,
            SCOPES.indexOf('new_sponsor'),
        )
    }
}

async function processSubscriptionInactive(op) {
    console.log('--- subscription inactive: ', op.subscriber, op.author, op.oid)
    await Tarantool.instance('tarantool').call('counter_add',
        op.subscriber,
        SCOPES.indexOf('sponsor_inactive'),
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
