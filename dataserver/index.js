const koa = require('koa');
const koaBody = require('koa-body');
const session = require('koa-session-auth');
const koaRouter = require('koa-router');
const cors = require('koa-cors');
const livereload = require('koa-livereload');
const RateLimit = require('koa2-ratelimit').RateLimit;
const golos = require('golos-lib-js');

const version = require('./version');
const errorHandler = require('./error_handler');
const useAuthApi = require('./api/auth');
const useCountersApi = require('./api/counters');
const useQueuesApi = require('./api/queues');
const useMsgsApi = require('./api/msgs');

const startFeeding = require('./feed');

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
    expose: ['X-Session', 'Retry-After'],
}));
app.keys = [SESSION_SECRET];
app.use(session({
    useToken: true,
    useCookie: false,
    key: 'X-Session',
}, app));

const limiter = RateLimit.middleware({
    interval: { min: 1 }, // minutes
    max: 2*120, // max requests per interval for each IP (*2 because including OPTIONS before each request)
    headers: true,
    handler: (ctx) => {
        ctx.status = 429;
        ctx.body = {
            status: 'err',
            error: 'Too many requests',
        };
        ctx.set('Retry-After', 20); // seconds
    },
});
//app.use(limiter);
app.use(errorHandler());

app.use(koaBody());
app.use(router.routes());
app.use(router.allowedMethods());

useAuthApi(app);
useCountersApi(app);
useQueuesApi(app);
useMsgsApi(app);

console.log('Connecting to', NODE_URL);

app.listen(8805, () => console.log('running on port 8805'));

startFeeding();
