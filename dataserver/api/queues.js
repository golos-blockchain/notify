const koaRouter = require('koa-router');
const Tarantool = require('../tarantool');
const { returnError } = require('../utils');

module.exports = function useQueuesApi(app) {
    const router = new koaRouter();
    app.use(router.routes());

    router.get('/subscribe/@:account/:subscriber_id?', async (ctx) => {
        const { account } = ctx.params;
        let { subscriber_id } = ctx.params;

        if (!ctx.session.a) {
            return returnError(ctx, 'Access denied - not authorized');
        }

        if (account !== ctx.session.a) {
            return returnError(ctx, 'Access denied - wrong account');
        }

        if (!subscriber_id) {
            subscriber_id = Math.floor(Math.random() * 10000);
        }

        try {
            const res = await Tarantool.instance('tarantool').call('notification_subscribe', account, subscriber_id);
        } catch (error) {
            console.error(`[reqid ${ctx.request.header['x-request-id']}] ${ctx.method} ERRORLOG notifications @${account} ${error.message}`);
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

    router.get('/take/@:account/:subscriber_id/:task_ids?', async (ctx) => {
        const { account, subscriber_id, task_ids } = ctx.params;

        if (!ctx.session.a) {
            return returnError(ctx, 'Access denied - not authorized');
        }

        if (account !== ctx.session.a) {
            return returnError(ctx, 'Access denied - wrong account');
        }

        const remove_task_ids = task_ids ? task_ids.split('-').map(x => +x) : [];

        try {
            const res = await Tarantool.instance('tarantool').call('notification_take', account, subscriber_id, remove_task_ids);
            ctx.body = {
                tasks: [res[0]],
                status: 'ok',
            };
        } catch (error) {
            console.error(`[reqid ${ctx.request.header['x-request-id']}] ${ctx.method} ERRORLOG notifications @${account} ${error.message}`);
            ctx.body = {
                tasks: null,
                status: 'err',
                error: 'Tarantool error',
            };
        }
    });
}
