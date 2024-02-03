const koaRouter = require('koa-router');
const golos = require('golos-lib-js');
const { Signature, hash, PublicKey } = require('golos-lib-js/lib/auth/ecc');
const secureRandom = require('secure-random');
const axios = require('axios');

const Tarantool = require('../tarantool');
const { returnError } = require('../utils');

module.exports = function useAuthApi(app) {
    const router = new koaRouter();
    app.use(router.routes());

    router.post('/login_account', async (ctx) => {
        let params = ctx.request.body;
        if (typeof(params) === 'string') params = JSON.parse(params);
        const { account, authSession, } = params;
        if (!account) {
            return returnError(ctx, 'account is required');
        }
        if (!authSession) {
            return returnError(ctx, 'authSession is required');
        }

        axios.interceptors.response.use(
            res => res,
            err => err.response);

        const { AUTH_HOST, SITE_DOMAIN, } = process.env;

        const res = await axios.post(new URL('/api/login_account', AUTH_HOST).toString(),
            {
                account,
            }, {
                headers: {
                    'X-Auth-Session': authSession,
                    Origin: 'http://' + SITE_DOMAIN,
                },
            });
        if (!res) {
            console.error('Cannot login in auth service. Looks like there is wrong AUTH_HOST in config, or auth service is down. AUTH_HOST:', AUTH_HOST);
            return returnError(ctx, 'Cannot connect auth service');
        }
        if (res.data.already_authorized !== account) {
            console.error(account, res.data);
            return returnError(ctx, res.data.error);
        }

        ctx.session.a = account;

        try {
            ctx.session.save()
            await ctx.session.manuallyCommit()
            ctx.session._requireSave = false
            const xSession = ctx.response.get('X-Session')

            global.session[xSession] = {
                account
            }
        } catch (err) {
            console.error('/login_account - WebSocket session failure', err)
        }

        ctx.body = {
            status: 'ok'
        };
    });

    router.get('/logout_account', (ctx) => {
        const was_logged_in = !!ctx.session.a;

        try {
            if (was_logged_in) {
                const xSession = ctx.request.get('X-Session')
                delete global.session[xSession]
            }
        } catch (err) {
            console.error('/logout_account - WebSocket session failure', err)
        }

        ctx.session.a = null;
        ctx.body = {
            status: 'ok',
            was_logged_in,
        };
    });
}
