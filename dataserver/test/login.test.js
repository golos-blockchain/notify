const crossFetch = require('cross-fetch');
const golos = require('golos-classic-js');
const {Signature, hash} = require('golos-classic-js/lib/auth/ecc');

golos.config.set('websocket', 'ws://127.0.0.1:8091');
golos.config.set('chain_id', '5876894a41e6361bde2e73278f07340f2eb8b41c2facd29099de9deef6cdb679');

let fetch = null, cookieJar = null;
let initCookies = () => {
    const fc = require('fetch-cookie');
    cookieJar = new fc.toughCookie.CookieJar();
    fetch = fc(crossFetch, cookieJar);
};
initCookies();

const HOST = 'http://localhost:8805';

const request_base = {
    method: 'post',
    mode: 'no-cors',
    credentials: 'include',
    headers: {
        Accept: 'application/json',
        'Content-type': 'application/json'
    }
};

test('/healthcheck: server is running and connects to Golos node', async () => {
    var resp = null;
    try {
        resp = await fetch(HOST + '/healthcheck');
    } catch (err) {
        console.error('It looks like notify server is not running. It should be running to pass these tests.')
        expect(true).toBe(false);
    }
    resp = await resp.json();

    console.log('Server is running - healthcheck is good! Now test its response');

    expect(resp.status).toBe('ok');
    expect(resp.data).toBe('OK');
});

var obtainLoginChallenge = async () => {
    var body = {
        account: 'cyberfounder',
    };
    var request = Object.assign({}, request_base, {
        body: JSON.stringify(body),
    });

    var resp = await fetch(HOST + '/login_account', request);
    
    var json = await resp.json();
    expect(json.status).toBe('ok');
    expect(typeof json.login_challenge).toBe('string');
    expect(json.login_challenge.length).toBe(16*2);
    console.log('login_challenge is ', json.login_challenge);

    var cookies = cookieJar.getCookiesSync(HOST);
    expect(cookies.length).toBe(2);
    console.log('cookies are also ok');

    return json.login_challenge;
};

test('/login_account - missing account', async () => {
    initCookies();

    console.log('step 1: login_challenge')

    var login_challenge = await obtainLoginChallenge();

    console.log('step 2: signing and authorizing')

    const signatures = {};

    var body = {
        account: 'eva',
        signatures,
    };
    var request = Object.assign({}, request_base, {
        body: JSON.stringify(body),
    });

    var resp = await fetch(HOST + '/login_account', request);

    var json = await resp.json();
    expect(json.error).toBe('missing blockchain account');
    expect(json.status).toBe('err');
});

test('/login_account - wrong signature', async () => {
    console.log('step 1: login_challenge')

    var login_challenge = await obtainLoginChallenge();

    console.log('step 2: signing and authorizing')

    const signatures = {};
    const challenge = { token: login_challenge };
    const bufSha = hash.sha256(JSON.stringify(challenge, null, 0))
    const sign = (role, d) => {
        if (!d) return
        const sig = Signature.signBufferSha256(bufSha, d)
        signatures[role] = sig.toHex()
    }
    sign('posting', '5JFZC7AtEe1wF2ce6vPAUxDeevzYkPgmtR14z9ZVgvCCtrFAaLw');

    var body = {
        account: 'cyberfounder',
        signatures,
    };
    var request = Object.assign({}, request_base, {
        body: JSON.stringify(body),
    });

    var resp = await fetch(HOST + '/login_account', request);

    var json = await resp.json();
    expect(json.error).toBe('wrong signatures');
    expect(json.status).toBe('err');
});

test('/login_account', async () => {
    console.log('step 1: login_challenge')

    var login_challenge = await obtainLoginChallenge();

    console.log('step 2: signing and authorizing')

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
        account: 'cyberfounder',
        signatures,
    };
    var request = Object.assign({}, request_base, {
        body: JSON.stringify(body),
    });

    var resp = await fetch(HOST + '/login_account', request);

    var json = await resp.json();
    expect(json.error).toBe(undefined);
    expect(json.status).toBe('ok');
    expect(typeof json.guid).toBe('string');
    expect(json.guid.length).toBeGreaterThan(0);

    console.log('account tarantool guid:', json.guid);
});

jest.setTimeout(30000);

test('/counters', async () => {
    var request = Object.assign({}, request_base, {
        method: 'get',
    });
    var resp = await fetch(HOST + '/counters/@cyberfounder', request);
    var json = await resp.json();

    expect(json.error).toBe(undefined);
    expect(json.status).toBe('ok');

    try {
        expect(json.counters.length).toBe(0);
    } catch {
        expect(json.counters.length).toBe(16);
    }

    let all = json.counters[0] || 0;
    let send = json.counters[3] || 0;
    let receive = json.counters[11] || 0;

    await golos.broadcast.transferAsync(
        '5JVFFWRLwz6JoP9kguuRFfytToGU6cLgBVTL9t6NB3D3BQLbUBS',
        'cyberfounder', 'null', '10.000 GOLOS', '');

    await new Promise((resolve) => setTimeout(resolve, 3000));

    var resp = await fetch(HOST + '/counters/@cyberfounder', request);
    var json = await resp.json();
    expect(json.counters[0]).toBe(all + 1);
    expect(json.counters[3]).toBe(send + 1);
    expect(json.counters[11]).toBe(receive);

    var request = Object.assign({}, request_base, {
        method: 'put',
    });
    var resp = await fetch(HOST + '/counters/@cyberfounder/3', request);
    var json = await resp.json();
    expect(json.error).toBe(undefined);
    expect(json.status).toBe('ok');
    expect(json.counters.length).toBe(16);
    expect(json.counters[3]).toBe(0);
});
