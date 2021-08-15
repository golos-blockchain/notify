const koaRouter = require('koa-router');
const Tarantool = require('../tarantool');
const { returnError, SCOPES, sleep } = require('../utils');
const { signal_create, signal_fire, signal_check } = require('../signals');

function make_queue_id(account, subscriber_id) {
    return 'queue_' + account.split('-').join('_') + '_' + subscriber_id;
}

async function putToQueues(account, scope, opData, timestamp) {
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

    for (const [acc, id] of queue_ids) {
        const queue_id = make_queue_id(acc, id);

        await Tarantool.instance('tarantool').call(
            'queue_put', queue_id, scope, opData, timestamp,
        );

        signal_fire(queue_id);
    }
}

module.exports = function useQueuesApi(app) {
    const router = new koaRouter();
    app.use(router.routes());

    let slowsCounter = 0;

    router.get('/_stats', async (ctx) => {
        try {
            const res = await Tarantool.instance('tarantool').call('queue_stats');
            ctx.body = {
                status: 'ok',
                queues: res,
                slowsCounter,
            };
        } catch (error) {
            console.error(`[reqid ${ctx.request.header['x-request-id']}] ${ctx.method} ERRORLOG /stats ${error.message}`);
            return returnError(ctx, 'Tarantool error');
        }
    });

    router.get('/subscribe/@:account/:scopes', async (ctx) => {
        const { account, scopes } = ctx.params;

        if (!ctx.session.a) {
            ctx.status = 403;
            return returnError(ctx, 'Access denied - not authorized');
        }

        if (account !== ctx.session.a) {
            ctx.status = 403;
            return returnError(ctx, 'Access denied - wrong account');
        }

        let scopesStr = scopes.split(',');

        if (!scopesStr.length) {
            return returnError(ctx, 'No correct notification scopes');
        }

        let scopeIds = {};
        for (let scope of scopesStr) {
            const i = SCOPES.indexOf(scope);
            if (i === -1) {
                return returnError(ctx, `Wrong notification scope - ${scope}`);
            }
            scopeIds[i] = true;
            if (i === 0) { // 'total'
                scopeIds = { '0': true, };
                break;
            }
        }

        let subscriber_id = 0;
        try {
            const start = new Date();

            const res = await Tarantool.instance('tarantool').call('queue_subscribe', account, scopeIds);

            const elapse = new Date() - start;
            if (elapse > 3000) {
                console.warn(`PULSE-SLOW: queues @${account} ${elapse}`);
                ++slowsCounter;
            }

            subscriber_id = res[0][0];
        } catch (error) {
            console.error(`[reqid ${ctx.request.header['x-request-id']}] ${ctx.method} ERRORLOG /subscribe @${account} ${error.message}`);
            ctx.status = 400;
            ctx.body = {
                subscriber_id: null,
                status: 'err',
                error: 'Tarantool error',
            };
            return;
        }

        ctx.body = {
            subscriber_id,
            status: 'ok',
        };
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

        let was = true;
        try {
            const res = await Tarantool.instance('tarantool').call('queue_unsubscribe', account, parseInt(subscriber_id));
            was = res[0][0].was;
        } catch (error) {
            console.error(`[reqid ${ctx.request.header['x-request-id']}] ${ctx.method} ERRORLOG /unsubscribe @${account} ${error.message}`);
            return returnError(ctx, 'Tarantool error');
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

module.exports.putToQueues = putToQueues;
module.exports.make_queue_id = make_queue_id;
