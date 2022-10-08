const golos = require('golos-lib-js')
const koaRouter = require('koa-router')

const Tarantool = require('../tarantool')
const { returnError, } = require('../utils')

async function getSubs(entityId) {
    return await Tarantool.instance('tarantool').call(
        'get_subs', entityId
    )
}

async function putEvent(account, entityId, dataStr) {
    const event = await Tarantool.instance('tarantool').call(
        'put_event', account, entityId, dataStr
    )
    return event
}

function checkAuth(ctx, account) {
    if (!ctx.session.a) {
        ctx.status = 403;
        return returnError(ctx, 'Access denied - not authorized');
    }

    if (account !== ctx.session.a) {
        ctx.status = 403;
        return returnError(ctx, 'Access denied - wrong account');
    }

    return null
}

module.exports = function useSubsApi(app) {
    const router = new koaRouter()
    app.use(router.routes())

    router.post('/subs/subscribe', async (ctx) => {
        let params = ctx.request.body
        if (typeof(params) === 'string') params = JSON.parse(params)
        const { account, entity_id, } = params

        const err = checkAuth(ctx, account)
        if (err) return err

        const [ author, permlink ] = entity_id.split('|')
        const post = await golos.api.getContentAsync(author, permlink)
        if (!post.author) {
            return returnError(ctx, 'Post not found')
        }
        if (!post.hashlink) {
            return returnError(ctx, 'Post has no hashlink')
        }

        let subRes
        try {
            subRes = await Tarantool.instance('tarantool').call(
                'subscribe_it', account, entity_id, post.hashlink
            )
            subRes = subRes[0][0]

            ctx.body = {
                status: 'ok',
                result: subRes
            }
        } catch (err) {
            return returnError(ctx, err.message || 'Unknown')
        }
    })

    router.get('/subs/@:account', async (ctx) => {
        const { account } = ctx.params
        const { from, limit } = ctx.query

        let subsRes = await Tarantool.instance('tarantool').call(
            'list_subs', account, from || 0, limit || 0
        )
        subsRes = subsRes[0][0]

        ctx.body = {
            status: 'ok',
            result: subsRes
        }
    })

    router.patch('/subs/@:account/:entity_id', async (ctx) => {
        const { account, entity_id } = ctx.params

        const err = checkAuth(ctx, account)
        if (err) return err

        await Tarantool.instance('tarantool').call(
            'mark_read', account, entity_id
        )

        ctx.body = {
            status: 'ok'
        }
    })

    router.get('/subs/@:account/:entity_id/events', async (ctx) => {
        const { account, entity_id } = ctx.params

        let result = await Tarantool.instance('tarantool').call(
            'get_events', account, entity_id
        )
        result = result[0]

        ctx.body = {
            status: 'ok',
            result
        }
    })

    router.delete('/subs/@:account/:entity_id/unsubscribe', async (ctx) => {
        const { account, entity_id } = ctx.params

        const err = checkAuth(ctx, account)
        if (err) return err

        await Tarantool.instance('tarantool').call(
            'unsubscribe_it', account, entity_id
        )

        ctx.body = {
            status: 'ok'
        }
    })
}

module.exports.getSubs = getSubs
module.exports.putEvent = putEvent
