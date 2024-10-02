const koaRouter = require('koa-router');
const Tarantool = require('../tarantool');
const { returnError } = require('../utils');
const { make_queue_id, sendSocketSubscriber } = require('./queues');
const { signal_fire } = require('../signals');
const { getArg, getAuthArgs, resData, resError } = require('../ws_utils')

async function setGroups(account, subscriber_id, watchMap) {
    let res
    try {
        res = await Tarantool.instance('tarantool').call('set_queue_groups',
            account, parseInt(subscriber_id), watchMap)

        res = res[0][0]

        return res
    } catch (error) {
        throw new Error('Tarantool error: ' + error.message)
    }
}

async function putToGroupQueues(group, scope, opData, timestamp) {
    let res
    try {
        const task = {
            scope,
            data: opData,
            timestamp,
        }

        res = await Tarantool.instance('tarantool').call('list_queues_by_group',
            group)

        res = res[0][0]
        const { subscriber_ids } = res
        for (let [id, scope] of Object.entries(subscriber_ids)) {
            try {
                id = parseInt(id) // Lua keys are string

                let put = await Tarantool.instance('tarantool').call(
                    'queue_put', id, 'message', opData, timestamp,
                )
                put = put[0][0]
                const { account } = put

                const queue_id = make_queue_id(account, id)
                signal_fire(queue_id)

                sendSocketSubscriber(account, id, task)
            } catch (err) {
                console.error('putToGroupQueues - queue_put', group, id, err)
            }
        }

        return res
    } catch (error) {
        console.error('putToGroupQueues', error)
    }
    return res
}

module.exports = function useGroupQueuesApi(app) {
    const router = new koaRouter()
    app.use(router.routes())

    router.get('/queues/watch/@:account/:subscriber_id/:o_type', async (ctx) => {
        const { account, subscriber_id, o_type } = ctx.params
        const { o, o_scope } = ctx.query

        if (!ctx.session.a) {
            ctx.status = 403
            return returnError(ctx, 'Access denied - not authorized')
        }

        if (account !== ctx.session.a) {
            ctx.status = 403
            return returnError(ctx, 'Access denied - wrong account')
        }

        if (o_type !== 'group') {
            ctx.status = 400
            return returnError(ctx, 'Only `group` type supported now')
        }
        if (o_scope !== '*') {
            ctx.status = 400
            return returnError(ctx, 'Only * scope supported now')
        }
        if (o.length > 128) {
            ctx.status = 400
            return returnError(ctx, 'Object id <= 128')
        }

        let result
        try {
            result = await setGroups(account, subscriber_id, {
                [o]: o_scope
            })
        } catch (error) {
            console.error(`[reqid ${ctx.request.header['x-request-id']}] ${ctx.method} ERRORLOG /queues/watch @${account}`, error)
            ctx.status = 400
            ctx.body = {
                result: null,
                status: 'err',
                error: 'Tarantool error',
            }
            return
        }

        ctx.body = {
            result,
            status: 'ok',
        }
    })
}

module.exports.groupQueuesWsApi = {
    'queues/watch': async (ctx) => {
        const { account, } = getAuthArgs(ctx)
        if (!account) return

        const subscriber_id = getArg(ctx, 'subscriber_id')
        if (!subscriber_id) {
            resError(ctx, 400, 'No subscriber_id argument')
            return
        }

        let groupScopes = {}

        let objects = getArg(ctx, 'objects')
        if (!objects) {
            resError(ctx, 400, 'No objects argument')
            return
        }
        objects = Object.entries(objects)
        if (!objects.length || objects.length !== 1) {
            resError(ctx, 400, 'objects count should be 1')
            return
        }
        for (const [o, data] of objects) {
            if (o.length > 128) {
                resError(ctx, 400, 'object id <= 128')
                return
            }
            if (data) {
                resError(ctx, 400, '"' + o + '" object should have data')
                return
            }
            const { type, scope } = data
            if (type !== 'group') {
                resError(ctx, 400, '"' + o + '" object type should be group')
                return
            }
            if (scope !== '*') {
                resError(ctx, 400, '"' + o + '" object scope should be *')
                return
            }
            groupScopes[o] = scope
        }

        let result
        try {
            result = await setGroups(account, subscriber_id, groupScopes)
        } catch (error) {
            console.error('queues/watch WS error', error.message)
            resError(ctx, 400, 'Tarantool-step error', {
                err_message: error.message
            })
            return
        }

        resData(ctx, {
            status: 'ok',
            result,
        })
    },
}

module.exports.putToGroupQueues = putToGroupQueues
