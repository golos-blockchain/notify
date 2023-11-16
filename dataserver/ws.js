const { WebSocketServer } = require('ws')

const { getArg, resData, resError } = require('./ws_utils')
const { countersWsApi } = require('./api/counters')

let routes = {}
routes = {...routes, ...countersWsApi}
const routeKeys = Object.keys(routes)

const wsListen = (port, path, onListen) => {
    const wss = new WebSocketServer({
        port,
        path,
    })

    wss.on('connection', (ws, req) => {
        const forwardedFor = req.headers['x-forwarded-for']
        ws.remoteIp = forwardedFor ? forwardedFor.split(',')[0].trim() : req.socket.remoteAddress

        ws.on('error', console.error)

        ws.on('message', async (msg) => {
            let data
            try {
                data = JSON.parse(msg)
            } catch (err) {
                resError(ws, 400, 'Wrong JSON: ' + err.message)
                return
            }

            if (!data.api) {
                resError(ws, 400, 'No API route specified in message')
                return
            }

            if (!routeKeys.includes(data.api)) {
                resError(ws, 400, 'No such API route: ' + data.api)
                return
            }

            await routes[data.api](data.args, ws)
            return
        })
    })

    onListen()
}

module.exports = {
    getArg,
    resData,
    resError,
    wsListen
}
