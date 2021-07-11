const golos = require('golos-classic-js');
const {Signature, hash} = require('golos-classic-js/lib/auth/ecc');

const log = (msg) => {
    console.log(msg);
    cy.log(msg);
};

let { NODE_URL, CHAIN_ID, ACC, ACC_POSTING, ACC_ACTIVE } = Cypress.env();
golos.config.set('websocket', NODE_URL);
if (CHAIN_ID) {
    golos.config.set('chain_id', CHAIN_ID);
}

const HOST = 'http://localhost:8805';

const request_base = {
    method: 'post',
    credentials: 'include',
    headers: {
        Accept: 'application/json',
        'Content-type': 'application/json'
    }
};

it('/ healthcheck: server is running and connects to Golos node', async () => {
    var resp = null;
    try {
        resp = await fetch(HOST + '/');
    } catch (err) {
        log('It looks like notify server is not running. It should be running to pass these tests.')
        expect(true).to.equal(false);
    }
    resp = await resp.json();

    log('Server is running - healthcheck is good! Now test its response');

    expect(resp.status).to.equal('ok');
    expect(resp.version.length).to.be.at.least('1.0-dev'.length);
});

var obtainLoginChallenge = async () => {
    var body = {
        account: ACC,
    };
    var request = Object.assign({}, request_base, {
        body: JSON.stringify(body),
    });

    var resp = await fetch(HOST + '/login_account', request);
    
    var json = await resp.json();
    expect(json.status).to.equal('ok');
    expect(typeof json.login_challenge).to.equal('string');
    expect(json.login_challenge.length).to.equal(16*2);
    log('login_challenge is ' + json.login_challenge);

    return json.login_challenge;
};

it('/login_account - missing account', async () => {
    log('step 1: login_challenge')

    var login_challenge = await obtainLoginChallenge();

    log('step 2: signing and authorizing')

    const signatures = {};

    var body = {
        account: 'eveevileve',
        signatures,
    };
    var request = Object.assign({}, request_base, {
        body: JSON.stringify(body),
    });

    var resp = await fetch(HOST + '/login_account', request);

    var json = await resp.json();
    expect(json.error).to.equal('missing blockchain account');
    expect(json.status).to.equal('err');
});

it('/login_account - wrong signature', async () => {
    log('step 1: login_challenge')

    var login_challenge = await obtainLoginChallenge();

    log('step 2: signing and authorizing')

    const signatures = {};
    const challenge = { token: login_challenge };
    const bufSha = hash.sha256(JSON.stringify(challenge, null, 0))
    const sign = (role, d) => {
        if (!d) return
        const sig = Signature.signBufferSha256(bufSha, d)
        signatures[role] = sig.toHex()
    }
    sign('posting', ACC_ACTIVE);

    var body = {
        account: ACC,
        signatures,
    };
    var request = Object.assign({}, request_base, {
        body: JSON.stringify(body),
    });

    var resp = await fetch(HOST + '/login_account', request);

    var json = await resp.json();
    expect(json.error).to.equal('wrong signatures');
    expect(json.status).to.equal('err');
});

it('/login_account - good + /counters', async () => {
    log('step 1: login_challenge')

    var login_challenge = await obtainLoginChallenge();

    log('step 2: signing and authorizing')

    const signatures = {};
    const challenge = { token: login_challenge };
    const bufSha = hash.sha256(JSON.stringify(challenge, null, 0))
    const sign = (role, d) => {
        if (!d) return
        const sig = Signature.signBufferSha256(bufSha, d)
        signatures[role] = sig.toHex()
    }
    sign('posting', '5K1aJ8JayUA7c2Ptg9Y2DetKxSvXGXa5GCcvYeHtn1Xh3v4egPS');

    var body = {
        account: ACC,
        signatures,
    };
    var request = Object.assign({}, request_base, {
        body: JSON.stringify(body),
    });

    var resp = await fetch(HOST + '/login_account', request);

    var json = await resp.json();
    expect(json.error).to.equal(undefined);
    expect(json.status).to.equal('ok');
    expect(typeof json.guid).to.equal('string');
    expect(json.guid.length).to.be.above(0);

    log('account tarantool guid:', json.guid);

    var request = Object.assign({}, request_base, {
        method: 'get',
    });
    var resp = await fetch(HOST + `/counters/@${ACC}`, request);
    var json = await resp.json();

    expect(json.error).to.equal(undefined);
    expect(json.status).to.equal('ok');

    try {
        expect(json.counters.length).to.equal(0);
    } catch {
        expect(json.counters.length).to.equal(16);
    }

    let all = json.counters[0] || 0;
    let send = json.counters[3] || 0;
    let receive = json.counters[11] || 0;

    await golos.broadcast.transferAsync(
        ACC_ACTIVE,
        ACC, 'null', '0.001 GOLOS', '');

    await new Promise((resolve) => setTimeout(resolve, 3000 + 500));

    var resp = await fetch(HOST + `/counters/@${ACC}`, request);
    var json = await resp.json();
    expect(json.counters[0]).to.equal(all + 1);
    expect(json.counters[3]).to.equal(send + 1);
    expect(json.counters[11]).to.equal(receive);

    var request = Object.assign({}, request_base, {
        method: 'put',
    });
    var resp = await fetch(HOST + `/counters/@${ACC}/3`, request);
    var json = await resp.json();
    expect(json.error).to.equal(undefined);
    expect(json.status).to.equal('ok');
    expect(json.counters.length).to.equal(16);
    expect(json.counters[3]).to.equal(0);
});
