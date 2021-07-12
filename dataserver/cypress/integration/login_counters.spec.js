const golos = require('golos-classic-js');
const {Signature, hash} = require('golos-classic-js/lib/auth/ecc');

let { NODE_URL, CHAIN_ID, ACC, ACC_POSTING, ACC_ACTIVE } = Cypress.env();
golos.config.set('websocket', NODE_URL);
if (CHAIN_ID) {
    golos.config.set('chain_id', CHAIN_ID);
}

const HOST = 'http://localhost:8805';

const getRequestBase = () => {
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

it('/ healthcheck: server is running and connects to Golos node', async () => {
    var resp = null;
    try {
        resp = await fetch(HOST + '/');
    } catch (err) {
        cy.log2('It looks like notify server is not running. It should be running to pass these tests.')
        expect(true).to.equal(false);
    }
    resp = await resp.json();

    cy.log2('Server is running - healthcheck is good! Now test its response');

    expect(resp.status).to.equal('ok');
    expect(resp.version.length).to.be.at.least('1.0-dev'.length);
});

it('/login_account - missing account', async () => {
    cy.log2('step 1: login_challenge')

    var login_challenge = await global.obtainLoginChallenge('eveevileve');

    cy.log2('step 2: signing and authorizing')

    const signatures = {};

    var body = {
        account: 'eveevileve',
        signatures,
    };
    var request = Object.assign({}, getRequestBase(), {
        body: JSON.stringify(body),
    });

    var resp = await fetch(HOST + '/login_account', request);

    var json = await resp.json();
    expect(json.error).to.equal('missing blockchain account');
    expect(json.status).to.equal('err');
});

it('/login_account - wrong signature', async () => {
    cy.log2('step 1: login_challenge')

    var login_challenge = await global.obtainLoginChallenge(ACC);

    cy.log2('step 2: signing and authorizing')

    var json = await global.signAndAuth(login_challenge, ACC, ACC_ACTIVE);
    expect(json.error).to.equal('wrong signatures');
    expect(json.status).to.equal('err');
});

it('/login_account - good', async () => {
    cy.log2('step 1: login_challenge')

    var login_challenge = await global.obtainLoginChallenge(ACC);

    cy.log2('step 2: signing and authorizing')

    var json = await global.signAndAuth(login_challenge, ACC, ACC_POSTING);
    expect(json.error).to.equal(undefined);
    expect(json.status).to.equal('ok');
    expect(typeof json.guid).to.equal('string');
    expect(json.guid.length).to.be.above(0);

    cy.log2('account tarantool guid:', json.guid);
});

it('/logout_account', async () => {
    cy.log2('Login...')

    var login_challenge = await global.obtainLoginChallenge(ACC);

    var json = await global.signAndAuth(login_challenge, ACC, ACC_POSTING);
    expect(json.error).to.equal(undefined);
    expect(json.status).to.equal('ok');

    cy.log2('Logout...');

    var request = Object.assign({}, getRequestBase(), {
        method: 'get',
    });

    var resp = await fetch(HOST + '/logout_account', request);

    var json = await resp.json();
    expect(json.error).to.equal(undefined);
    expect(json.status).to.equal('ok');
    expect(json.was_logged_in).to.equal(true);

    global.session = resp.headers.get('X-Session');

    cy.log2('Logout twice...');

    var request = Object.assign({}, getRequestBase(), {
        method: 'get',
    });

    var resp = await fetch(HOST + '/logout_account', request);

    var json = await resp.json();
    expect(json.error).to.equal(undefined);
    expect(json.status).to.equal('ok');
    expect(json.was_logged_in).to.equal(false);
});

it('/counters', async () => {
    cy.log2('Login...')

    var login_challenge = await global.obtainLoginChallenge(ACC);

    var json = await global.signAndAuth(login_challenge, ACC, ACC_POSTING);
    expect(json.error).to.equal(undefined);
    expect(json.status).to.equal('ok');

    cy.log2('Checking counters before operation...')

    var request = Object.assign({}, getRequestBase(), {
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

    cy.log2('Doing operation...')

    await golos.broadcast.transferAsync(
        ACC_ACTIVE,
        ACC, 'null', '0.001 GOLOS', '');

    await new Promise((resolve) => setTimeout(resolve, 3000 + 500));

    cy.log2('Checking counters after operation...')

    var resp = await fetch(HOST + `/counters/@${ACC}`, request);
    var json = await resp.json();
    expect(json.counters[0]).to.equal(all + 1);
    expect(json.counters[3]).to.equal(send + 1);
    expect(json.counters[11]).to.equal(receive);

    cy.log2('Clearing counters and checking them...')

    var request = Object.assign({}, getRequestBase(), {
        method: 'put',
    });
    var resp = await fetch(HOST + `/counters/@${ACC}/3`, request);
    var json = await resp.json();
    expect(json.error).to.equal(undefined);
    expect(json.status).to.equal('ok');
    expect(json.counters.length).to.equal(16);
    expect(json.counters[3]).to.equal(0);
});