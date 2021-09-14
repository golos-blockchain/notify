const koaRouter = require('koa-router');
const golos = require('golos-classic-js');
const { Signature, hash, PublicKey } = require('golos-classic-js/lib/auth/ecc');
const secureRandom = require('secure-random');
const axios = require('axios');

const Tarantool = require('../tarantool');
const { checkOrigin, returnError } = require('../utils');

module.exports = function useAuthApi(app) {
    const router = new koaRouter();
    app.use(router.routes());

    axios.interceptors.response.use(
        res => res,
        err => err.response);

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

        const { AUTH_HOST, } = process.env;

        const res = await axios.post('http://' + AUTH_HOST + '/api/login_account',
            {
                account,
            }, {
                headers: {
                    'X-Auth-Session': authSession,
                    Origin: 'http://localhost',
                },
            });
        if (res.data.already_authorized !== account) {
            console.error(account, res.data);
            return returnError(ctx, res.data.error);
        }

        ctx.session.a = account;

        ctx.body = {
            status: 'ok'
        };
    });

    router.get('/logout_account', (ctx) => {
        const was_logged_in = !!ctx.session.a;
        ctx.session.a = null;
        ctx.body = {
            status: 'ok',
            was_logged_in,
        };
    });
}
