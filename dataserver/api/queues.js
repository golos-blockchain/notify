const koaRouter = require('koa-router');
const Tarantool = require('../tarantool');
const { fillOpMiniAccounts } = require('../msg_utils')
const { returnError, SCOPES, sleep } = require('../utils');
const { signal_create, signal_fire, signal_check } = require('../signals');
const { getArg, getAuthArgs, resData, resError } = require('../ws_utils')

function make_queue_id(account, subscriber_id) {
    return 'queue_' + account.split('-').join('_') + '_' + subscriber_id;
}

global.queueSubscribers = {}

global.slowsCounter = 0

const cleanQueueSubscribers = (maxCount = 50) => {
    try {
        let count = 0
        for (const [ account, subs ] of Object.entries(global.queueSubscribers)) {
            for (const [ xSession, sub ] of Object.entries(subs)) {
                if (sub.ws.isDead) {
                    delete subs[xSession]
                    if (++count > maxCount) {
                        return
                    }
                }
            }
        }
    } catch (err) {
        console.error('cleanQueueSubscribers', err)
    }
}

async function subscribe(account, scopesStr) {
    if (!scopesStr.length) {
        throw new Error('No correct notification scopes')
    }

    let scopeIds = {}
    for (let scope of scopesStr) {
        const i = SCOPES.indexOf(scope)
        if (i === -1) {
            throw new Error(`Wrong notification scope - ${scope}`)
        }
        scopeIds[i] = true
        if (i === 0) { // 'total'
            scopeIds = { '0': true, }
            break;
        }
    }

    let subscriber_id = 0
    try {
        const start = new Date()

        const res = await Tarantool.instance('tarantool').call('queue_subscribe', account, scopeIds)

        const elapse = new Date() - start
        if (elapse > 3000) {
            console.warn(`PULSE-SLOW: queues @${account} ${elapse}`)
            ++global.slowsCounter
        }

        subscriber_id = res[0][0]

        return subscriber_id
    } catch (error) {
        throw new Error('Tarantool error: ' + error.message)
    }
}

async function unsubscribe(account, subscriber_id) {
    let was = true
    try {
        const res = await Tarantool.instance('tarantool').call('queue_unsubscribe', account, parseInt(subscriber_id))
        was = res[0][0].was
        return was
    } catch (error) {
        throw new Error('Tarantool error: ' + error.message)
    }
}

function sendSocketSubscriber(account, id, task) {
    try {
        const subs = global.queueSubscribers[account]
        //console.log(subs)
        if (subs) {
            for (const [ xSession, sub ] of Object.entries(subs)) {
                //console.log('WSSS', sub.subscriber_id, id)
                if (sub.ws && !sub.ws.isDead && sub.subscriber_id === id) {
                    //console.log('sending')
                    resData({
                        id: null,
                        ws: sub.ws
                    }, {
                        event: 'queue',
                        tasks: [task],
                    })
                }
            }
        }
    } catch (err) {
        console.error('sendSocketSubscriber WS error', err, account)
    }
}

async function putToQueues(account, scope, opData, timestamp) {
    const scopeStr = scope
    scope = SCOPES.indexOf(scope)

    const res = await Tarantool.instance('tarantool').call(
        'queue_list', account, scope,
    );
    if (!res[0][0]) return;
    const { queue_ids } = res[0][0];
    if (!queue_ids && !queue_ids.length) return;

    // if operation is not custom_json
    if (!opData[1]) {
        opData = [opData.type, opData];
    }

    try {
        await fillOpMiniAccounts(opData)
    } catch (err) {
        console.error('putToQueues - mini account filling failure', err)
    }

    const task = {
        scope: scopeStr,
        data: opData,
        timestamp,
    }

    for (const [acc, id] of queue_ids) {
        await Tarantool.instance('tarantool').call(
            'queue_put', id, scope, opData, timestamp,
        );

        const queue_id = make_queue_id(acc, id)
        signal_fire(queue_id);

        sendSocketSubscriber(acc, id, task)
    }
}

module.exports = function useQueuesApi(app) {
    const router = new koaRouter();
    app.use(router.routes());

    router.get('/_stats', async (ctx) => {
        try {
            const res = await Tarantool.instance('tarantool').call('queue_stats');
            ctx.body = {
                status: 'ok',
                queues: res,
                slowsCounter: global.slowsCounter,
            };
        } catch (error) {
            console.error(`[reqid ${ctx.request.header['x-request-id']}] ${ctx.method} ERRORLOG /stats ${error.message}`);
            return returnError(ctx, 'Tarantool error');
        }
    });

    router.get('/subscribe/@:account/:scopes', async (ctx) => {
        const { account, scopes } = ctx.params

        if (!ctx.session.a) {
            ctx.status = 403
            return returnError(ctx, 'Access denied - not authorized')
        }

        if (account !== ctx.session.a) {
            ctx.status = 403
            return returnError(ctx, 'Access denied - wrong account')
        }

        let scopesStr = scopes.split(',');

        let subscriber_id
        try {
            subscriber_id = await subscribe(account, scopesStr)
        } catch (error) {
            console.error(`[reqid ${ctx.request.header['x-request-id']}] ${ctx.method} ERRORLOG /subscribe @${account} ${error.message}`)
            ctx.status = 400
            ctx.body = {
                subscriber_id: null,
                status: 'err',
                error: 'Tarantool error',
            }
            return
        }

        ctx.body = {
            subscriber_id,
            status: 'ok',
        }
    });

    router.get('/unsubscribe/@:account/:subscriber_id', async (ctx) => {
        const { account, subscriber_id } = ctx.params;

        if (!ctx.session.a) {
            ctx.status = 403;
            return returnError(ctx, 'Access denied - not authorized');
        }

        if (account !== ctx.session.a) {
            ctx.status = 403;
            return returnError(ctx, 'Access denied - wrong account');
        }

        let was = true
        try {
            was = await unsubscribe(account, parseInt(subscriber_id))
        } catch (error) {
            console.error(`[reqid ${ctx.request.header['x-request-id']}] ${ctx.method} ERRORLOG /unsubscribe @${account} ${error.message}`);
            return returnError(ctx, 'Tarantool error')
        }

        signal_fire(make_queue_id(account, subscriber_id));

        ctx.body = {
            was,
            status: 'ok',
        };
    });

    router.get('/take/@:account/:subscriber_id/:task_ids?', async (ctx) => {
        const { account, subscriber_id, task_ids } = ctx.params;

        if (!ctx.session.a) {
            ctx.status = 403;
            return returnError(ctx, 'Access denied - not authorized');
        }

        if (account !== ctx.session.a) {
            ctx.status = 403;
            return returnError(ctx, 'Access denied - wrong account');
        }

        const remove_task_ids = task_ids ? task_ids.split('-').map(x => +x) : [];

        try {
            let res = await Tarantool.instance('tarantool').call('queue_take', account, parseInt(subscriber_id), remove_task_ids);
            res = res[0][0];
            if (!res.tasks.length && !res.error) {
                const queue_id = make_queue_id(account, subscriber_id);
                console.log(queue_id, 'No tasks instantly, waiting...');

                if (!signal_create(queue_id)) {
                    ctx.status = res.status || 400;
                    ctx.body = {
                        tasks: [],
                        status: 'err',
                        error: '/take already called for this queue',
                    };
                    return;
                }

                let waited = 0;
                while (waited < 20000) {
                    if (!signal_check(queue_id)) break;
                    await sleep(100);
                    waited += 100;
                }

                signal_fire(queue_id);

                res = await Tarantool.instance('tarantool').call('queue_take', account, parseInt(subscriber_id), []);
                res = res[0][0];
            }
            for (let task of res.tasks) {
                task.scope = SCOPES[task.scope];
            }
            if (res.error) {
                console.error(`[reqid ${ctx.request.header['x-request-id']}] ${ctx.method} ERRORLOG /take @${account} ${res.error}`);
                ctx.status = res.status || 400;
                ctx.body = {
                    tasks: [],
                    status: 'err',
                    error: res.error,
                };
                return;
            }
            ctx.body = {
                tasks: res.tasks,
                __: Math.floor(Date.now() / 1000),
                status: 'ok',
            };
        } catch (error) {
            console.error(`[reqid ${ctx.request.header['x-request-id']}] ${ctx.method} ERRORLOG /take @${account} ${error.message}`);
            ctx.status = 400;
            ctx.body = {
                tasks: [],
                status: 'err',
                error: 'Tarantool error',
            };
        }
    });
}

module.exports.queuesWsApi = {
    'queues/get': async (ctx) => {
        resData(ctx, {
            status: 'ok',
        })
    },

    'queues/subscribe': async (ctx) => {
        const { account, xSession } = getAuthArgs(ctx)
        if (!account) return

        cleanQueueSubscribers()

        let scopesStr = getArg(ctx, 'scopes')
        if (!scopesStr) {
            resError(ctx, 400, 'No scopes argument')
            return
        }
        scopesStr = scopesStr.split(',')

        global.queueSubscribers[account] = global.queueSubscribers[account] || {}
        const subscriber = global.queueSubscribers[account][xSession]
        if (subscriber) {
            resData(ctx, {
                status: 'ok',
                subscriber_id: subscriber.subscriber_id,
                already_subscribed: true
            })
            return
        }

        let subscriber_id
        try {
            subscriber_id = await subscribe(account, scopesStr)
        } catch (error) {
            console.error('queues/subscribe WS error', error.message)
            resError(ctx, 400, 'Tarantool-step error', {
                err_message: error.message
            })
            return
        }

        global.queueSubscribers[account][xSession] = { ws: ctx.ws, subscriber_id }

        resData(ctx, {
            status: 'ok',
            already_subscribed: false,
            subscriber_id
        })
    },

    'queues/unsubscribe': async (ctx) => {
        const { account, xSession } = getAuthArgs(ctx)
        if (!account) return

        const subscriber_id = getArg(ctx, 'subscriber_id')
        if (!subscriber_id) {
            resError(ctx, 400, 'No subscriber_id argument')
            return
        }

        let was = false
        const subs = global.queueSubscribers[account]
        if (subs) {
            if (subs[xSession]) {
                delete subs[xSession]
                was = true
            }
        }

        try {
            was = was || await unsubscribe(account, parseInt(subscriber_id))
        } catch (error) {
            console.error('queues/unsubscribe WS error', error.message)
            resError(ctx, 400, 'Tarantool-step error', {
                err_message: error.message
            })
        }

        resData(ctx, {
            status: 'ok',
            was
        })
    },
}

module.exports.sendSocketSubscriber = sendSocketSubscriber
module.exports.putToQueues = putToQueues;
module.exports.make_queue_id = make_queue_id;
