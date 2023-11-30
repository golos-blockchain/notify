const koaRouter = require('koa-router');
const Tarantool = require('../tarantool');
const { returnError, SCOPES } = require('../utils');
const { getArg, getAuthArgs, resData, resError } = require('../ws_utils')

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

const getCounters = async (account) => {
    const res = await Tarantool.instance('tarantool').select('counters', 0, 1, 0, 'eq', account);
    return countersArrayToMap(toResArray(res))
}

global.counterSubscribers = {}

const cleanSubscribers = (maxCount = 50) => {
    try {
        let count = 0
        for (const [ account, subs ] of Object.entries(global.counterSubscribers)) {
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
        console.error('cleanSubscribers', err)
    }
}

const addCounter = async (account, scope) => {
    await Tarantool.instance('tarantool').call('counter_add',
        account,
        scope,
    )

    try {
        const subs = global.counterSubscribers[account]
        if (subs) {
            const counters = await getCounters(account)

            for (const [ xSession, sub ] of Object.entries(subs)) {
                if (sub.ws && !sub.ws.isDead) {
                    resData({
                        id: null,
                        ws: sub.ws
                    }, {
                        event: 'counter',
                        counters
                    })
                }
            }
        }
    } catch (err) {
        console.error('addCounter WS error', err, account)
    }
}

const makeCountersRead = async (account, scopes) => {
    let counters = countersArrayToMap([])

    if (scopes) {
        try {
            let res
            for (const scope of scopes.split(',')) {
                const i = SCOPES.indexOf(scope)
                if (i === -1) {
                    continue
                }
                res = await Tarantool.instance('tarantool').call('counter_read', account, i)
            }
            counters = countersArrayToMap(toResArray(res))
        } catch (error) {
            return { counters, error }
        }
    }

    return { counters }
}

module.exports = function useCountersApi(app) {
    const router = new koaRouter();
    app.use(router.routes());

    router.get('/counters/@:account', async (ctx) => {
        const { account } = ctx.params;

        try {
            const counters = await getCounters(account)
            ctx.body = {
                counters,
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

        const { counters, error } = await makeCountersRead(account, scopes)
        if (error) {
            console.error(`[reqid ${ctx.request.header['x-request-id']}] ${ctx.session.a} ERRORLOG counter_read @${account} ${error.message}`)

            ctx.body = {
                counters,
                status: 'err',
                error: 'Tarantool error'
            }
            return
        }

        ctx.body = {
            counters,
            status: 'ok',
        }
    });
}

module.exports.countersWsApi = {
    'counters': async (ctx) => {
        const account = getArg(ctx, 'account')
        if (!account) {
            resError(ctx, 400, 'No account argument')
            return
        }

        try {
            const counters = await getCounters(account)
            resData(ctx, {
                counters,
                status: 'ok',
            })
        } catch (error) {
            console.error('WS counters error:', error, account)

            resError(ctx, 400, 'Tarantool error', {
                counters: countersArrayToMap([])
            })
        }
    },

    'counters/read': async (ctx) => {
        const { account } = getAuthArgs(ctx)
        if (!account) return

        const scopes = getArg(ctx, 'scopes')
        if (!scopes) {
            resError(ctx, 400, 'No scopes argument')
            return
        }

        const { counters, error } = await makeCountersRead(account, scopes)

        if (error) {
            console.error('WS counters error:', error, account)

            resError(ctx, 400, 'Tarantool error', {
                counters
            })
            return
        }

        resData(ctx, {
            counters,
            status: 'ok',
        })
    },

    'counters/subscribe': async (ctx) => {
        const { account, xSession } = getAuthArgs(ctx)
        if (!account) return

        cleanSubscribers()

        global.counterSubscribers[account] = global.counterSubscribers[account] || {}
        const subscriber = global.counterSubscribers[account][xSession]
        if (subscriber) {
            resData(ctx, {
                status: 'ok',
                already_subscribed: true
            })
            return
        }

        global.counterSubscribers[account][xSession] = { ws: ctx.ws }

        resData(ctx, {
            status: 'ok',
            already_subscribed: false
        })
    },

    'counters/unsubscribe': async (ctx) => {
        const { account, xSession } = getAuthArgs(ctx)
        if (!account) return

        let was = false
        const subs = global.counterSubscribers[account]
        if (subs) {
            if (subs[xSession]) {
                delete subs[xSession]
                was = true
            }
        }

        resData(ctx, {
            status: 'ok',
            was
        })
    }
}

module.exports.addCounter = addCounter
