const koa = require('koa');
const koaBody = require('koa-body');
const session = require('koa-session-auth');
const koaRouter = require('koa-router');
const cors = require('koa-cors');
const livereload = require('koa-livereload');
const golos = require('golos-classic-js');
const { Signature, hash, PublicKey } = require('golos-classic-js/lib/auth/ecc');
const secureRandom = require('secure-random');

const Tarantool = require('./tarantool');
const version = require('./version');

const NODE_URL = process.env.NODE_URL || 'https://api.golos.id';
golos.config.set('websocket', NODE_URL);
if (process.env.CHAIN_ID) {
    golos.config.set('chain_id', process.env.CHAIN_ID);
}

const SESSION_SECRET = process.env.SESSION_SECRET || 'should-be-really-generated-secret';

const app = new koa();

const router = new koaRouter();

const returnError = (ctx, error) => {
    ctx.body = {status: 'err', error: error};
};

router.get('/', async (ctx) => {
    ctx.body = {
        status: 'ok',
        version,
        date: new Date(),
    };
});

router.post('/login_account', async (ctx) => {
    let params = ctx.request.body;
    if (typeof(params) === 'string') params = JSON.parse(params);
    const { account, signatures } = params;
    if (!account) {
        return returnError(ctx, 'account is required');
    }
    let { login_challenge } = ctx.session;
    if (!signatures) { // step 1
        if (!login_challenge) {
            login_challenge = secureRandom.randomBuffer(16).toString('hex');
            ctx.session.login_challenge = login_challenge;
        }
        ctx.body = {
            login_challenge,
            already_authorized: ctx.session.a,
            status: 'ok',
        }
    } else { // step 2
        if (!login_challenge) {
            return returnError(ctx, 'no login_challenge in session');
        }

        const [chainAccount] = await golos.api.getAccountsAsync([account]);
        if (!chainAccount) {
            return returnError(ctx, 'missing blockchain account');
        }

        const auth = { posting: false };
        const bufSha = hash.sha256(JSON.stringify({token: login_challenge}, null, 0));
        const verify = (type, sigHex, pubkey, weight, weight_threshold) => {
            if (!sigHex) return
            if (weight !== 1 || weight_threshold !== 1) {
                console.error(`/login_account login_challenge unsupported ${type} auth configuration: ${account}`);
            } else {
                const parseSig = hexSig => {
                    try {
                        return Signature.fromHex(hexSig);
                    } catch(e) {
                        return null;
                    }
                };
                const sig = parseSig(sigHex)
                const public_key = PublicKey.fromString(pubkey)
                const verified = sig.verifyHash(bufSha, public_key)
                auth[type] = verified
            }
        }
        const { posting: { key_auths: [[posting_pubkey, weight]], weight_threshold } } = chainAccount;
        verify('posting', signatures.posting, posting_pubkey, weight, weight_threshold);
        if (!auth.posting) {
            return returnError(ctx, 'wrong signatures');
        }

        ctx.session.a = account;

        ctx.body = {
            status: 'ok'
        };

        if (process.env.TARANTOOL_HOST) {
            try {
                const res = await Tarantool.instance('tarantool').call('get_guid', account);
                const [ acc, guid ] = res[0][0];
                ctx.body = Object.assign(ctx.body, { guid })
            } catch (e) {}
        }
    }
});

router.get('/logout_account', (ctx) => {
    const was_logged_in = !!ctx.session.a;
    ctx.session.a = null;
    ctx.body = {
        status: 'ok',
        was_logged_in,
    };
});

router.get('/subscribe/@:account/:subscriber_id?', async (ctx) => {
    const { account } = ctx.params;
    let { subscriber_id } = ctx.params;

    if (!ctx.session.a) {
        return returnError(ctx, 'Access denied - not authorized');
    }

    if (account !== ctx.session.a) {
        return returnError(ctx, 'Access denied - wrong account');
    }

    if (!subscriber_id) {
        subscriber_id = Math.floor(Math.random() * 10000);
    }

    try {
        const res = await Tarantool.instance('tarantool').call('notification_subscribe', account, subscriber_id);
    } catch (error) {
        console.error(`[reqid ${ctx.request.header['x-request-id']}] ${ctx.method} ERRORLOG notifications @${account} ${error.message}`);
        ctx.body = {
            subscriber_id: null,
            status: 'err',
            error: 'Tarantool error',
        };
        return;
    }

    ctx.body = {
        subscriber_id,
        status: 'ok',
    };
});

router.get('/take/@:account/:subscriber_id/:task_ids?', async (ctx) => {
    const { account, subscriber_id, task_ids } = ctx.params;

    if (!ctx.session.a) {
        return returnError(ctx, 'Access denied - not authorized');
    }

    if (account !== ctx.session.a) {
        return returnError(ctx, 'Access denied - wrong account');
    }

    const remove_task_ids = task_ids ? task_ids.split('-').map(x => +x) : [];

    try {
        const res = await Tarantool.instance('tarantool').call('notification_take', account, subscriber_id, remove_task_ids);
        ctx.body = {
            tasks: [res[0]],
            status: 'ok',
        };
    } catch (error) {
        console.error(`[reqid ${ctx.request.header['x-request-id']}] ${ctx.method} ERRORLOG notifications @${account} ${error.message}`);
        ctx.body = {
            tasks: null,
            status: 'err',
            error: 'Tarantool error',
        };
    }
});

router.post('/msgs/send', (ctx) => {

});

router.get('/msgs/types/@:from/@:to', (ctx) => {

});

function toResArray(result) {
    if (!result || result.length < 1) return [];
    return result[0].slice(1);
}

router.get('/counters/@:account', async (ctx) => {
    const { account } = ctx.params;

    try {
        const res = await Tarantool.instance('tarantool').select('notifications', 0, 1, 0, 'eq', account);
        ctx.body = {
            counters: toResArray(res),
            status: 'ok',
        };
    } catch (error) {
        console.error(`[reqid ${ctx.request.header['x-request-id']}] ${ctx.session.a} ${ctx.method} ERRORLOG notifications @${account} ${error.message}`);
        ctx.body = {
            counters: [],
            status: 'err',
            error: 'Tarantool error'
        };
    }
});

router.put('/counters/@:account/:ids', async (ctx) => {
    const { account, ids } = ctx.params;

    if (!ctx.session.a) {
        return returnError(ctx, 'Access denied - not authorized');
    }

    if (account !== ctx.session.a) {
        return returnError(ctx, 'Access denied - wrong account');
    }

    let counters = [];

    if (ids) {
        const fields = ids.split('-');
        try {
            let res;
            for (const id of fields) {
                res = await Tarantool.instance('tarantool').call('notification_read', account, id);
            }
            counters = toResArray(res);
        } catch (error) {
            console.error(`[reqid ${ctx.request.header['x-request-id']}] ${ctx.session.a} ERRORLOG notifications @${account} ${error.message}`);

            ctx.body = {
                counters,
                status: 'err',
                error: 'Tarantool error'
            };
            return;
        }
    }

    ctx.body = {
        counters,
        status: 'ok',
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

app.listen(8805, () => console.log('running on port 8805'));
