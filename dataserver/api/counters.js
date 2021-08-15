const koaRouter = require('koa-router');
const Tarantool = require('../tarantool');
const { returnError, SCOPES } = require('../utils');

function toResArray(result) {
    if (!result || result.length < 1) return [];
    return result[0].slice(1);
}

function countersArrayToMap(data) {
    const counters = data && data.length ?
         (data.length === 1 ? data[0].slice(1) : data) : [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    return counters.reduce((result, n, i) => {
        result[SCOPES[i]] = n;
        return result;
    }, {});
}

module.exports = function useCountersApi(app) {
    const router = new koaRouter();
    app.use(router.routes());

    router.get('/counters/@:account', async (ctx) => {
        const { account } = ctx.params;

        try {
            const res = await Tarantool.instance('tarantool').select('counters', 0, 1, 0, 'eq', account);
            ctx.body = {
                counters: countersArrayToMap(toResArray(res)),
                status: 'ok',
            };
        } catch (error) {
            console.error(`[reqid ${ctx.request.header['x-request-id']}] ${ctx.session.a} ${ctx.method} ERRORLOG counters @${account} ${error.message}`);
            ctx.body = {
                counters: countersArrayToMap([]),
                status: 'err',
                error: 'Tarantool error'
            };
        }
    });

    router.put('/counters/@:account/:scopes', async (ctx) => {
        const { account, scopes } = ctx.params;

        if (!ctx.session.a) {
            ctx.status = 403;
            return returnError(ctx, 'Access denied - not authorized');
        }

        if (account !== ctx.session.a) {
            ctx.status = 403;
            return returnError(ctx, 'Access denied - wrong account');
        }

        let counters = countersArrayToMap([]);

        if (scopes) {
            try {
                let res;
                for (const scope of scopes.split(',')) {
                    const i = SCOPES.indexOf(scope);
                    if (i === -1) {
                        continue;
                    }
                    res = await Tarantool.instance('tarantool').call('counter_read', account, i);
                }
                counters = countersArrayToMap(toResArray(res));
            } catch (error) {
                console.error(`[reqid ${ctx.request.header['x-request-id']}] ${ctx.session.a} ERRORLOG counter_read @${account} ${error.message}`);

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
