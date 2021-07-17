const koaRouter = require('koa-router');
const Tarantool = require('../tarantool');
const { returnError, SCOPES } = require('../utils');

module.exports = function useQueuesApi(app) {
    const router = new koaRouter();
    app.use(router.routes());

    router.get('/subscribe/@:account/:scopes', async (ctx) => {
        const { account, scopes } = ctx.params;

        if (!ctx.session.a) {
            return returnError(ctx, 'Access denied - not authorized');
        }

        if (account !== ctx.session.a) {
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
            const res = await Tarantool.instance('tarantool').call('notification_subscribe', account, scopeIds);
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
            let res = await Tarantool.instance('tarantool').call('notification_take', account, subscriber_id, remove_task_ids);
            for (let task of res[0][0].tasks) {
                task.scope = SCOPES[task.scope];
            }
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
