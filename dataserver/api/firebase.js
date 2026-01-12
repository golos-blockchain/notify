const koaRouter = require('koa-router')
const admin = require('firebase-admin')
const config = require('config')

const { fireApps, pushToFirebase } = require('../firebase')
const Tarantool = require('../tarantool')
const { returnError, SCOPES } = require('../utils')

async function registerToken(account, token, scopesStr) {
    if (!scopesStr.length) {
        throw new Error('No correct notification scopes')
    }

    let scopeIds = {}
    for (let scope of scopesStr) {
        const i = SCOPES.indexOf(scope)
        if (i === -1) {
            throw new Error(`Wrong notification scope - ${scope}`)
        }
        scopeIds[i] = true
        if (i === 0) { // 'total'
            scopeIds = { '0': true, }
            break;
        }
    }

    let res
    try {
        res = await Tarantool.instance('tarantool').call('register_token',
            account, token, scopeIds)

        res = res[0][0]

        return res
    } catch (error) {
        throw new Error('Tarantool error: ' + error.message)
    }
}

async function unregisterToken(account, token) {
    let res
    try {
        res = await Tarantool.instance('tarantool').call('unregister_token',
            account, token)

        res = res[0][0]

        return res
    } catch (error) {
        throw new Error('Tarantool error: ' + error.message)
    }
}

async function cleanupFirebase(lifeTime = undefined) {
    if (lifeTime) {
        console.log('cleanupFirebase, lifeTime =', lifeTime)
    } else {
        console.log('cleanupFirebase')
    }
    let res = await Tarantool.instance('tarantool').call('cleanup_tokens', lifeTime)
    res = res[0][0]
    console.log('cleanupFirebase end, removed:', res.removed)
}

async function listTokens(account, scope) {
    let res = await Tarantool.instance('tarantool').call('list_tokens', account, scope)
    res = res[0][0]
    const { tokens } = res
    return tokens[0] ? tokens : []
}

async function putToCloud(account, scope, opData, timestamp) {
    const tokens = await listTokens(account, scope)
    for (const obj of tokens) {
        const { id, token, app } = obj
        try {
            await pushToFirebase(app, token, opData, account)
        } catch (err) {
            if (config.has('cloud_push.log')) {
                console.warn('Cannot sent Firebase push:', account, token, err)
            }
            await Tarantool.instance('tarantool').call('delete_token', id)
            continue 
        }
        try {
            await Tarantool.instance('tarantool').call('update_token', id)
        } catch (err) {}
    }
}

module.exports = function useFirebaseApi(app) {
    const router = new koaRouter()
    app.use(router.routes())

    router.get('/firebase/test/:token', async (ctx) => {
        if (process.env.NODE_ENV !== 'development') {
            ctx.body = { error: '403' }
            return;
        }

        const { token } = ctx.params

        const opData = ['private_message', {
            'from': 'lex',
        }]

        try {
            await pushToFirebase('msg_android', token, opData, 'xel')
            ctx.body = {
                token
            }
        } catch (error) {
            console.error(error);
            ctx.body = {
                token,
                error: error.toString()
            }
        }
    })

    router.post('/firebase/register/:token/:scopes', async (ctx) => {
        if (!ctx.session.a) {
            ctx.status = 403
            return returnError(ctx, 'Access denied - not authorized')
        }

        const account = ctx.session.a

        const { token, scopes } = ctx.params
        if (!token) {
            ctx.status = 400
            return returnError(ctx, 'Wrong token parameter')
        }

        const scopesStr = scopes.split(',')

        let result
        try {
            result = await registerToken(account, token, scopesStr)
        } catch (error) {
            console.error(`[reqid ${ctx.request.header['x-request-id']}] ${ctx.method} ERRORLOG /firebase/register @${account} ${token}`, error)
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

    router.post('/firebase/unregister/:token', async (ctx) => {
        if (!ctx.session.a) {
            ctx.status = 403
            return returnError(ctx, 'Access denied - not authorized')
        }

        const account = ctx.session.a

        const { token } = ctx.params
        if (!token) {
            ctx.status = 400
            return returnError(ctx, 'Wrong token parameter')
        }

        let result
        try {
            result = await unregisterToken(account, token)
        } catch (error) {
            console.error(`[reqid ${ctx.request.header['x-request-id']}] ${ctx.method} ERRORLOG /firebase/unregister @${account} ${token}`, error)
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

module.exports.firebaseWsApi = {
    'firebase/register': async (ctx) => {
        const { account, } = getAuthArgs(ctx)
        if (!account) return

        const token = getArg(ctx, 'token')
        if (!token) {
            resError(ctx, 400, 'Wrong token argument')
            return
        }

        let result
        try {
            result = await registerToken(account, token)
        } catch (error) {
            console.error('firebase/register WS error', error.message)
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
    'firebase/unregister': async (ctx) => {
        const { account, } = getAuthArgs(ctx)
        if (!account) return

        const token = getArg(ctx, 'token')
        if (!token) {
            resError(ctx, 400, 'Wrong token argument')
            return
        }

        let result
        try {
            result = await unregisterToken(account, token)
        } catch (error) {
            console.error('firebase/unregister WS error', error.message)
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

module.exports.cleanupFirebase = cleanupFirebase
module.exports.putToCloud = putToCloud
