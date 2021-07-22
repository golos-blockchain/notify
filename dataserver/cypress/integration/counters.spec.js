const { golos } = global;

let { ACC, ACC_POSTING, ACC_ACTIVE } = Cypress.env();

let { NODE_URL, CHAIN_ID } = Cypress.env();
golos.config.set('websocket', NODE_URL);
if (CHAIN_ID) {
    golos.config.set('chain_id', CHAIN_ID);
}

it('/counters', async function() {
    global.log('Login...')

    var login_challenge = await global.obtainLoginChallenge(ACC);

    var json = await global.signAndAuth(login_challenge, ACC, ACC_POSTING);
    expect(json.error).to.equal(undefined);
    expect(json.status).to.equal('ok');

    global.log('Checking counters before operation...')

    var request = {...getRequestBase(),
        method: 'get',
    };
    var resp = await fetch(global.HOST + `/counters/@${ACC}`, request);
    var json = await resp.json();

    expect(json.error).to.equal(undefined);
    expect(json.status).to.equal('ok');

    let { total, send, receive } = json.counters;

    global.log('Doing operation...')

    await golos.broadcast.transferAsync(
        ACC_ACTIVE,
        ACC, 'null', '0.001 GOLOS', '');

    await new Promise((resolve) => setTimeout(resolve, 3000 + 500));

    global.log('Checking counters after operation...')

    var resp = await fetch(global.HOST + `/counters/@${ACC}`, request);
    var json = await resp.json();
    expect(json.counters.total).to.equal(total + 1);
    expect(json.counters.send).to.equal(send + 1);
    expect(json.counters.receive).to.equal(receive);

    global.log('Clearing counters and checking them...')

    var request = {...getRequestBase(),
        method: 'put',
    };
    var resp = await fetch(global.HOST + `/counters/@${ACC}/send`, request);
    var json = await resp.json();
    expect(json.error).to.equal(undefined);
    expect(json.status).to.equal('ok');
    expect(json.counters.send).to.equal(0);
});
