global.session = global.session || {}

const getArg = (ctx, key) => {
    if (!ctx.args) return null
    return ctx.args[key]
}

const resData = (ctx, data = null) => {
    const obj = {
        id: ctx.id,
        err: null,
        data
    }
    const msg = JSON.stringify(obj)
    ctx.ws.send(msg)
}

const resError = (ctx, err, errMsg = '', data = null) => {
    const obj = {
        id: ctx.id,
        err: { code: err || 400, msg: errMsg || '' },
        data
    }
    const msg = JSON.stringify(obj)
    console.error('WS Error from ' + ctx.ws.remoteIp + ':', err, errMsg)
    ctx.ws.send(msg)
}

const getAuthArgs = (ctx) => {
    const account = getArg(ctx, 'account')
    if (!account) {
        resError(ctx, 400, 'No account argument')
        return {}
    }

    const xSession = getArg(ctx, 'X-Session')
    if (!xSession) {
        resError(ctx, 400, 'No X-Session argument')
        return {}
    }

    const session = global.session[xSession]
    if (!session) {
        resError(ctx, 403, 'Access denied - not authorized')
        return {}
    }
    if (session.account !== account) {
        resError(ctx, 403, 'Access denied - wrong account', global.session)
        return {}
    }

    return { session, account, xSession }
}

module.exports = {
    getArg,
    resData,
    resError,
    getAuthArgs,
}
