const getArg = (args, key) => {
    if (!args) return null
    return args[key]
}

const resData = (ws, data = null) => {
    const obj = {
        err: null,
        data
    }
    const msg = JSON.stringify(obj)
    ws.send(msg)
}

const resError = (ws, err, errMsg = '', data = null) => {
    const obj = {
        err: { code: err || 400, msg: errMsg || '' },
        data
    }
    const msg = JSON.stringify(obj)
    console.error('WS Error from ' + ws.remoteIp + ':', err, errMsg)
    ws.send(msg)
}

module.exports = {
    getArg,
    resData,
    resError,
}
