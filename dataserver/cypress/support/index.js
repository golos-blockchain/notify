const {Signature, hash} = require('golos-classic-js/lib/auth/ecc');

global.HOST = 'http://localhost:8805';

global.request_base = {
    method: 'post',
    credentials: 'include',
    headers: {
        Accept: 'application/json',
        'Content-type': 'application/json'
    }
};

let { NODE_URL, CHAIN_ID, ACC, ACC_POSTING, ACC_ACTIVE } = Cypress.env();

// Import commands.js using ES2015 syntax:
import './commands'

// Alternatively you can use CommonJS syntax:
// require('./commands')

global.obtainLoginChallenge = async (acc) => {
    var body = {
        account: acc,
    };
    var request = Object.assign({}, global.request_base, {
        body: JSON.stringify(body),
    });

    var resp = await fetch(global.HOST + '/login_account', request);

    var json = await resp.json();
    expect(json.status).to.equal('ok');
    expect(typeof json.login_challenge).to.equal('string');
    expect(json.login_challenge.length).to.equal(16*2);
    cy.log2('login_challenge is ' + json.login_challenge);

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
    var request = Object.assign({}, request_base, {
        body: JSON.stringify(body),
    });

    var resp = await fetch(global.HOST + '/login_account', request);

    var json = await resp.json();
    return json;
};
