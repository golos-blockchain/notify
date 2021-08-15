const golos = require('golos-classic-js');
const Tarantool = require('./tarantool');
const { SCOPES } = require('./utils');
const { signal_fire } = require('./signals');
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

async function processMentions(text, op) {
    const mentions = [...text.matchAll(/\@[\w\d.-]+/g)];
    if (!mentions.length)
        return;

    for (let mention of mentions) {
        mention = mention[0].substring(1);
        if (mention === op.author || mention === op.parent_author) {
            // don't notify on self-mentions
            // and don't notify mentions of parent_author (because it duplicates comment_reply)
            continue;
        }
        console.log('--- mention: ', op.author, op.permlink, '@' + mention);

        await putToQueues(
            mention,
            'mention',
            op,
            op.timestamp_prev);
    }
}

async function processComment(op) {
    let commentBody = op.body;
    if (!commentBody || commentBody.startsWith('@@ '))
        return;

    try {
        const post = await golos.api.getContentAsync(op.author, op.permlink);
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

    processMentions(commentBody, op)

    if (op.parent_author && op.parent_author !== op.author) {
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
    console.log('donate', op.from, op.to);

    await Tarantool.instance('tarantool').call('counter_add',
        op.to,
        SCOPES.indexOf('donate'),
    );
    await putToQueues(
        op.to,
        'donate',
        op,
        op.timestamp_prev);
}

async function processOp(op_data) {
    let [ opType, op ] = op_data;

    op.type = opType;

    if (opType === 'custom_json' && op['id'] === 'private_message')
        await processMessage(op);

    if (opType === 'comment')
        await processComment(op);

    if (opType.startsWith('transfer') || opType === 'claim')
        await processTransfer(op);

    if (opType === 'donate')
        await processDonate(op);
}

module.exports = function startFeeding() {
    console.log('Started feeding from blockchain');

    golos.api.streamOperations(async (err, op, tx, block) => {
        if (err) {
            console.error('FEED: streamOperations fail');
            console.error(err);
            return;
        }
        op[1].timestamp_prev = block.timestamp_prev;
        await processOp(op);

        if (block.block_num % 10 === 0)
            await cleanupQueues();
    });
}
