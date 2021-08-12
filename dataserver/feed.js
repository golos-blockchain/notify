const golos = require('golos-classic-js');
const Tarantool = require('./tarantool');
const { SCOPES } = require('./utils');

const processedPosts = {};

function getPostKey(op) {
    return op.author + '/' + op.permlink;
}

async function processMessage(op) {
    const opJson = JSON.parse(op.json);
    if (!Array.isArray(opJson))
        return;
    if (!['private_message', 'private_delete_message', 'private_mark_message'].includes(opJson[0]))
        return;
    const data = opJson[1];
    console.log(opJson[0], data.from, data.to);
    await Tarantool.instance('tarantool').call('notification_add',
        data.from,
        SCOPES.indexOf('message'),
        false,
        opJson,
        new Date().toISOString()
    );
    await Tarantool.instance('tarantool').call('notification_add',
        data.to,
        SCOPES.indexOf('message'),
        opJson[0] === 'private_message',
        opJson,
        new Date().toISOString()
    );
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

        await Tarantool.instance('tarantool').call('notification_add',
            mention,
            SCOPES.indexOf('mention'),
            false,
            op,
            new Date().toISOString()
        );
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
        await Tarantool.instance('tarantool').call('notification_add',
            op.parent_author,
            SCOPES.indexOf('comment_reply'),
            true,
            op,
            new Date().toISOString()
        );
    }
}

async function processTransfer(op) {
    if (op.from == op.to)
        return;
    console.log('transfer', op.from, op.to);
    await Tarantool.instance('tarantool').call('notification_add',
        op.from,
        SCOPES.indexOf('send'),
        true,
        op,
        new Date().toISOString()
    );
    await Tarantool.instance('tarantool').call('notification_add',
        op.to,
        SCOPES.indexOf('receive'),
        true,
        op,
        new Date().toISOString()
    );
}

async function processDonate(op) {
    if (op.from == op.to)
        return;
    console.log('donate', op.from, op.to);
    await Tarantool.instance('tarantool').call('notification_add',
        op.to,
        SCOPES.indexOf('donate'),
        true,
        op,
        new Date().toISOString()
    );
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

    golos.api.streamOperations('head', async (err, op) => {
        if (err) {
            console.error('FEED: streamOperations fail');
            console.error(err);
            return;
        }
        await processOp(op);
    });
}
