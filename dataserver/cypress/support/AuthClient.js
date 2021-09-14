const { Signature, hash } = require('golos-classic-js/lib/auth/ecc');

export default class AuthClient {
    static AUTH_HOST = 'http://localhost:8080';

    static getRequestBase() {
        return {
            method: 'post',
            credentials: 'include',
            headers: {
                Accept: 'application/json',
                'Content-type': 'application/json',
                'X-Auth-Session': AuthClient.session,
            },
        };
    };

    static async obtainLoginChallenge(acc) {
        var body = {
            account: acc,
        };
        var request = Object.assign({}, AuthClient.getRequestBase(), {
            body: JSON.stringify(body),
        });

        var resp = await fetch(AuthClient.AUTH_HOST + '/api/login_account', request);

        var json = await resp.json();
        expect(json.error).to.equal(undefined);
        expect(json.status).to.equal('ok');
        expect(typeof json.login_challenge).to.equal('string');
        expect(json.login_challenge.length).to.equal(16*2);
        global.log('login_challenge is ' + json.login_challenge);

        AuthClient.session = resp.headers.get('X-Auth-Session');

        return json.login_challenge;
    }

    static async signAndAuth(login_challenge, acc, postingKey) {
        const signatures = {};
        const challenge = { token: login_challenge };
        const bufSha = hash.sha256(JSON.stringify(challenge, null, 0))
        const sign = (role, d) => {
            if (!d) return
            const sig = Signature.signBufferSha256(bufSha, d)
            signatures[role] = sig.toHex()
        }
        sign('posting', postingKey);

        var body = {
            account: acc,
            signatures,
        };
        var request = {...AuthClient.getRequestBase(),
            body: JSON.stringify(body),
            headers: {
                'X-Session': global.session,
            },
        };

        var resp = await fetch(AuthClient.AUTH_HOST + '/api/login_account', request);

        AuthClient.session = resp.headers.get('X-Auth-Session');

        var json = await resp.json();
        return json;
    }
}
