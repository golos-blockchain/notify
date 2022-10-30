const golos = require('golos-lib-js')
const koaRouter = require('koa-router')
const requestIp = require('request-ip')

const Tarantool = require('../tarantool')
const { returnError, } = require('../utils')

async function cleanupStats() {
    console.log('cleanupStats')
    await Tarantool.instance('tarantool').call('cleanup_stats')
    console.log('cleanupStats end')
}

module.exports = function useStatsApi(app) {
    const router = new koaRouter()
    app.use(router.routes())

    router.post('/stats/view', async (ctx) => {
        let params = ctx.request.body
        if (typeof(params) === 'string') params = JSON.parse(params)
        const { author, permlink, } = params
        let con
        try {
            con = await golos.api.getContentAsync(author, permlink)
        } catch (err) {
            console.error(err)
            return returnError(ctx, 'Cannot fetch post')
        }

        if (!con.id) {
            return returnError(ctx, 'Post not found')
        }

        const hash = con.id
        const ip = requestIp.getClientIp(ctx.request)

        let res = await Tarantool.instance('tarantool').call(
            'record_view', hash, ip
        )
        res = res[0][0]

        ctx.body = {
            ip,
            status: res.error ? 'err' : 'ok',
            ...res
        }
    })

    const getViews = async (ids, ctx) => {
        const result = []
        if (ids.length > 100) {
            return returnError(ctx, 'Limit is 100 items')
        }
        for (let id of ids) {
            id = parseInt(id) || 0
            let vw = await Tarantool.instance('tarantool').call(
                'get_viewable', id
            )
            vw = vw[0][0]
            result.push(vw)
        }

        ctx.body = {
            status: 'ok',
            result
        }
    }

    router.get('/stats/views/:ids', async (ctx) => {
        const { ids } = ctx.params

        await getViews(ids.split(','), ctx)
    })

    router.post('/stats/views', async (ctx) => {
        let params = ctx.request.body
        if (typeof(params) === 'string') params = JSON.parse(params)
        const { items, } = params

        await getViews(items, ctx)
    })
}

module.exports.cleanupStats = cleanupStats
