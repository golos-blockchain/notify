const koaRouter = require('koa-router');
const Tarantool = require('../tarantool');
const { returnError } = require('../utils');

function toResArray(result) {
    if (!result || result.length < 1) return [];
    return result[0].slice(1);
}

module.exports = function useCountersApi(app) {
    const router = new koaRouter();
    app.use(router.routes());

    router.get('/counters/@:account', async (ctx) => {
        const { account } = ctx.params;

        try {
            const res = await Tarantool.instance('tarantool').select('notifications', 0, 1, 0, 'eq', account);
            ctx.body = {
                counters: toResArray(res),
                status: 'ok',
            };
        } catch (error) {
            console.error(`[reqid ${ctx.request.header['x-request-id']}] ${ctx.session.a} ${ctx.method} ERRORLOG notifications @${account} ${error.message}`);
            ctx.body = {
                counters: [],
                status: 'err',
                error: 'Tarantool error'
            };
        }
    });

    router.put('/counters/@:account/:ids', async (ctx) => {
        const { account, ids } = ctx.params;

        if (!ctx.session.a) {
            return returnError(ctx, 'Access denied - not authorized');
        }

        if (account !== ctx.session.a) {
            return returnError(ctx, 'Access denied - wrong account');
        }

        let counters = [];

        if (ids) {
            const fields = ids.split('-');
            try {
                let res;
                for (const id of fields) {
                    res = await Tarantool.instance('tarantool').call('notification_read', account, id);
                }
                counters = toResArray(res);
            } catch (error) {
                console.error(`[reqid ${ctx.request.header['x-request-id']}] ${ctx.session.a} ERRORLOG notifications @${account} ${error.message}`);

                ctx.body = {
                    counters,
                    status: 'err',
                    error: 'Tarantool error'
                };
                return;
            }
        }

        ctx.body = {
            counters,
            status: 'ok',
        };
    });
}
