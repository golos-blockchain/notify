const koaRouter = require('koa-router');
const Tarantool = require('../tarantool');
const { returnError, NTYPES } = require('../utils');

module.exports = function useQueuesApi(app) {
    const router = new koaRouter();
    app.use(router.routes());

    router.get('/subscribe/@:account/:types', async (ctx) => {
        const { account, types } = ctx.params;

        if (!ctx.session.a) {
            return returnError(ctx, 'Access denied - not authorized');
        }

        if (account !== ctx.session.a) {
            return returnError(ctx, 'Access denied - wrong account');
        }

        let typesStr = types.split(',');

        if (!typesStr.length) {
            return returnError(ctx, 'No correct notification types');
        }

        let ntypes = {};
        for (let type of typesStr) {
            const i = NTYPES.indexOf(type);
            if (i === -1) {
                return returnError(ctx, `Wrong notification type - ${type}`);
            }
            ntypes[i] = true;
            if (i === 0) { // 'total'
                ntypes = { '0': true, };
                break;
            }
        }

        let subscriber_id = 0;
        try {
            const res = await Tarantool.instance('tarantool').call('notification_subscribe', account, ntypes);
            subscriber_id = res[0][0];
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
                tasks: res[0][0].tasks,
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
