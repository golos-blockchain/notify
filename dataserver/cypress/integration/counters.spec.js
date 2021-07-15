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

    var request = Object.assign({}, getRequestBase(), {
        method: 'get',
    });
    var resp = await fetch(global.HOST + `/counters/@${ACC}`, request);
    var json = await resp.json();

    expect(json.error).to.equal(undefined);
    expect(json.status).to.equal('ok');

    if (json.counters.length !== 16) {
        expect(json.counters.length).to.equal(0);
    } else {
        expect(json.counters.length).to.equal(16);
    }

    let all = json.counters[0] || 0;
    let send = json.counters[3] || 0;
    let receive = json.counters[11] || 0;

    global.log('Doing operation...')

    await golos.broadcast.transferAsync(
        ACC_ACTIVE,
        ACC, 'null', '0.001 GOLOS', '');

    await new Promise((resolve) => setTimeout(resolve, 3000 + 500));

    global.log('Checking counters after operation...')

    var resp = await fetch(global.HOST + `/counters/@${ACC}`, request);
    var json = await resp.json();
    expect(json.counters[0]).to.equal(all + 1);
    expect(json.counters[3]).to.equal(send + 1);
    expect(json.counters[11]).to.equal(receive);

    global.log('Clearing counters and checking them...')

    var request = Object.assign({}, getRequestBase(), {
        method: 'put',
    });
    var resp = await fetch(global.HOST + `/counters/@${ACC}/3`, request);
    var json = await resp.json();
    expect(json.error).to.equal(undefined);
    expect(json.status).to.equal('ok');
    expect(json.counters.length).to.equal(16);
    expect(json.counters[3]).to.equal(0);
});
