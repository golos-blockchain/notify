global.golos = require('golos-classic-js');
const { Signature, hash } = require('golos-classic-js/lib/auth/ecc');

let { NODE_URL, CHAIN_ID } = Cypress.env();
golos.config.set('websocket', NODE_URL);
if (CHAIN_ID) {
    golos.config.set('chain_id', CHAIN_ID);
}

global.HOST = 'http://localhost:8805';

global.log = (msg) => {
    console.log(msg);
    cy.log(msg);
};

global.getRequestBase = function() {
    return {
        method: 'post',
        credentials: 'include',
        headers: {
            Accept: 'application/json',
            'Content-type': 'application/json',
            'X-Session': global.session,
        },
    };
};

beforeEach(function() {
    delete global.session;
});

// Import commands.js using ES2015 syntax:
import './commands'

// Alternatively you can use CommonJS syntax:
// require('./commands')

global.obtainLoginChallenge = async (acc) => {
    var body = {
        account: acc,
    };
    var request = Object.assign({}, global.getRequestBase(), {
        body: JSON.stringify(body),
    });

    var resp = await fetch(global.HOST + '/login_account', request);

    var json = await resp.json();
    expect(json.error).to.equal(undefined);
    expect(json.status).to.equal('ok');
    expect(typeof json.login_challenge).to.equal('string');
    expect(json.login_challenge.length).to.equal(16*2);
    global.log('login_challenge is ' + json.login_challenge);

    global.session = resp.headers.get('X-Session');

    return json.login_challenge;
};

global.signAndAuth = async (login_challenge, acc, postingKey) => {
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
    var request = {...global.getRequestBase(),
        body: JSON.stringify(body),
        headers: {
            'X-Session': global.session,
        },
    };

    var resp = await fetch(global.HOST + '/login_account', request);

    global.session = resp.headers.get('X-Session');

    var json = await resp.json();
    return json;
};
