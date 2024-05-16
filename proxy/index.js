const httpProxy = require('http-proxy')

const HTTP_PORT = 8807
const WS_PORT = 8808

const { NOTIFY, NOTIFY_WS } = process.env
if (!NOTIFY) {
    throw new Error('Cannot run Notify Proxy - no NOTIFY env variable.')
}
if (!NOTIFY_WS) {
    console.warn('No NOTIFY_WS env variable, so Notify Proxy will support http only.')
}

const proxy = httpProxy.createProxyServer({
    target: NOTIFY
}).listen(HTTP_PORT)

const logNow = () => {
  return '[' + new Date().toLocaleString() + ']'
}

let reqID = 0

proxy.on('proxyReq', (proxyReq, req, res, options) => {
    req.marker = ++reqID
    try {
        console.log(logNow(), '#' + req.marker + ':', req.method, req.url)
    } catch (err) {
        console.error('proxyReq error:', err)
    }
})

proxy.on('proxyRes', (proxyReq, req, res, options) => {
    try {
        console.log(logNow(), 'Finish #' + req.marker)
    } catch (err) {
        console.error('proxyRes error:', err)
    }
})

console.log('HTTP Notify proxed on', HTTP_PORT, 'port')

if (NOTIFY_WS) {
    const proxyWs = httpProxy.createProxyServer({
        target: NOTIFY_WS,
        ws: true
    }).listen(WS_PORT)

    proxy.on('proxyReqWs', (proxyReq, req, res, options) => {
        try {
            console.log(logNow(), 'WebSocket:', req, res, options)
        } catch (err) {
            console.error('proxyReqWs error:', err)
        }
    })

    console.log('WS Notify proxed on', WS_PORT, 'port, path is / (not /ws)')
}