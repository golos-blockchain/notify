const koaRouter = require('koa-router');

module.exports = function useMsgsApi(app) {
    const router = new koaRouter();
    app.use(router.routes());

    router.post('/msgs/send', (ctx) => {

    });

    router.get('/msgs/types/@:from/@:to', (ctx) => {

    });
}
