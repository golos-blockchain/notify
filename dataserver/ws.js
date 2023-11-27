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
        ws.isAlive = true

        const forwardedFor = req.headers['x-forwarded-for']
        ws.remoteIp = forwardedFor ? forwardedFor.split(',')[0].trim() : req.socket.remoteAddress

        ws.on('error', console.error)

        ws.on('pong', () => {
            ws.isAlive = true
        })

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

            try {
                await routes[data.api]({
                    id: data.id,
                    args: data.args,
                    ws
                })
            } catch (err) {
                console.error('Internal ws error:', err)
                resError(ws, 500, err ? err.message : 'Internal error')
            }
        })
    })

    const pingInterval = setInterval(() => {
        wss.clients.forEach((ws) => {
            if (ws.isAlive === false) {
                ws.isDead = true
                return ws.terminate()
            }

            ws.isAlive = false
            ws.ping()
        })
    }, 30000)

    wss.on('close', () => {
        clearInterval(pingInterval)
    })

    onListen()
}

module.exports = {
    getArg,
    resData,
    resError,
    wsListen
}
