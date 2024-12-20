const { WebSocketServer } = require('ws')

const { getArg, resData, resError } = require('./ws_utils')
const { countersWsApi } = require('./api/counters')
const { queuesWsApi } = require('./api/queues')
const { groupQueuesWsApi } = require('./api/group_queues')

let routes = {}
routes = {...routes, ...countersWsApi, ...queuesWsApi, ...groupQueuesWsApi}
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
                resError({ ws }, 400, 'Wrong JSON: ' + err.message)
                return
            }

            if (data.ping) {
                //console.log('WS Ping:', ws.remoteIp)
                return
            }

            const ctx = {
                id: data.id,
                args: data.args,
                ws
            }

            if (!data.api) {
                resError(ctx, 400, 'No API route specified in message')
                return
            }

            if (!routeKeys.includes(data.api)) {
                resError(ctx, 400, 'No such API route: ' + data.api)
                return
            }

            try {
                await routes[data.api](ctx)
            } catch (err) {
                console.error('Internal ws error:', err)
                resError(ctx, 500, err ? err.message : 'Internal error')
            }
        })

        ws.on('close', () => {
            ws.isDead = true
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
        console.log('clear WS alive check')
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
