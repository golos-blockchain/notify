let { ACC, ACC_POSTING, ACC_ACTIVE } = Cypress.env();

let { NODE_URL, CHAIN_ID } = Cypress.env();
golos.config.set('websocket', NODE_URL);
if (CHAIN_ID) {
    golos.config.set('chain_id', CHAIN_ID);
}

it('/ healthcheck: server is running and connects to Golos node', async function() {
    var resp = null;
    try {
        resp = await fetch(global.HOST + '/');
    } catch (err) {
        global.log('It looks like notify server is not running. It should be running to pass these tests.')
        expect(true).to.equal(false);
    }
    resp = await resp.json();

    global.log('Server is running - healthcheck is good! Now test its response');

    expect(resp.status).to.equal('ok');
    expect(resp.version.length).to.be.at.least('1.0-dev'.length);
});

it('/login_account - missing account', async function() {
    global.log('step 1: login_challenge')

    var login_challenge = await global.obtainLoginChallenge('eveevileve');

    global.log('step 2: signing and authorizing')

    const signatures = {};

    var body = {
        account: 'eveevileve',
        signatures,
    };
    var request = {...getRequestBase(),
        body: JSON.stringify(body),
    };

    var resp = await fetch(global.HOST + '/login_account', request);

    var json = await resp.json();
    expect(json.error).to.equal('missing blockchain account');
    expect(json.status).to.equal('err');
});

it('/login_account - wrong signature', async function() {
    global.log('step 1: login_challenge')

    var login_challenge = await global.obtainLoginChallenge(ACC);

    global.log('step 2: signing and authorizing')

    var json = await global.signAndAuth(login_challenge, ACC, ACC_ACTIVE);
    expect(json.error).to.equal('wrong signatures');
    expect(json.status).to.equal('err');
});

it('/login_account - good', async function() {
    global.log('step 1: login_challenge')

    var login_challenge = await global.obtainLoginChallenge(ACC);

    global.log('step 2: signing and authorizing')

    var json = await global.signAndAuth(login_challenge, ACC, ACC_POSTING);
    expect(json.error).to.equal(undefined);
    expect(json.status).to.equal('ok');
    expect(typeof json.guid).to.equal('string');
    expect(json.guid.length).to.be.above(0);

    global.log('account tarantool guid:', json.guid);
});

it('/logout_account', async function() {
    global.log('Login...')

    var login_challenge = await global.obtainLoginChallenge(ACC);

    var json = await global.signAndAuth(login_challenge, ACC, ACC_POSTING);
    expect(json.error).to.equal(undefined);
    expect(json.status).to.equal('ok');

    global.log('Logout...');

    var request = {...getRequestBase(),
        method: 'get',
    };

    var resp = await fetch(global.HOST + '/logout_account', request);

    var json = await resp.json();
    expect(json.error).to.equal(undefined);
    expect(json.status).to.equal('ok');
    expect(json.was_logged_in).to.equal(true);

    global.session = resp.headers.get('X-Session');

    global.log('Logout twice...');

    var request = {...getRequestBase(),
        method: 'get',
    };

    var resp = await fetch(global.HOST + '/logout_account', request);

    var json = await resp.json();
    expect(json.error).to.equal(undefined);
    expect(json.status).to.equal('ok');
    expect(json.was_logged_in).to.equal(false);
});
