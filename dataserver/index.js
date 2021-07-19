const koa = require('koa');
const koaBody = require('koa-body');
const session = require('koa-session-auth');
const koaRouter = require('koa-router');
const cors = require('koa-cors');
const livereload = require('koa-livereload');
const golos = require('golos-classic-js');

const version = require('./version');
const useAuthApi = require('./api/auth');
const useCountersApi = require('./api/counters');
const useQueuesApi = require('./api/queues');
const useMsgsApi = require('./api/msgs');

const NODE_URL = process.env.NODE_URL || 'https://api.golos.id';
golos.config.set('websocket', NODE_URL);
if (process.env.CHAIN_ID) {
    golos.config.set('chain_id', process.env.CHAIN_ID);
}

const SESSION_SECRET = process.env.SESSION_SECRET || 'should-be-really-generated-secret';

const app = new koa();

const router = new koaRouter();

router.get('/', async (ctx) => {
    ctx.body = {
        status: 'ok',
        version,
        date: new Date(),
    };
});


app.use(livereload());
app.use(cors({ credentials: true,
    expose: ['X-Session'],
}));
app.keys = [SESSION_SECRET];
app.use(session({
    useToken: true,
    useCookie: false,
    key: 'X-Session',
}, app));

app.use(koaBody());
app.use(router.routes());
app.use(router.allowedMethods());

useAuthApi(app);
useCountersApi(app);
useQueuesApi(app);
useMsgsApi(app);

app.listen(8805, () => console.log('running on port 8805'));
