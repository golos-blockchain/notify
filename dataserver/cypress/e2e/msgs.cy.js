const { golos } = global;

let { ACC, ACC2, ACC_POSTING, ACC_ACTIVE } = Cypress.env();

let { NODE_URL, CHAIN_ID } = Cypress.env();
golos.config.set('websocket', NODE_URL);
if (CHAIN_ID) {
    golos.config.set('chain_id', CHAIN_ID);
}

async function sendMsgOffchain(body) {
    var request = {...global.getRequestBase(),
        method: 'post',
        body: JSON.stringify(body),
        headers: {
            'X-Session': global.session,
        },
    };

    var resp = await fetch(global.HOST + '/msgs/send_offchain', request);
    var json = await resp.json();
    return json;
}

describe('msgs offchain sending tests', function () {

    beforeEach(async function() {
        if (!global.sessionAcc) {
            global.log(`Login to ${ACC}...`)

            global.session = null;
            var login_challenge = await AuthClient.obtainLoginChallenge(ACC);

            var json = await AuthClient.signAndAuth(login_challenge, ACC, ACC_POSTING);
            expect(json.error).to.equal(undefined);
            expect(json.status).to.equal('ok');

            console.log('session1: ' + AuthClient.session);

            var json = await global.login(ACC, AuthClient.session);
            expect(json.error).to.equal(undefined);
            expect(json.status).to.equal('ok');

            expect(global.session).not.to.equal(undefined);
            console.log('session2: ' + global.session);

            global.sessionAcc = global.session;
        }
        if (!global.sessionAcc2) {
            global.log(`Login to ${ACC2}...`)

            AuthClient.session = null;
            var login_challenge = await AuthClient.obtainLoginChallenge(ACC2);

            var json = await AuthClient.signAndAuth(login_challenge, ACC2, ACC_POSTING);
            expect(json.error).to.equal(undefined);
            expect(json.status).to.equal('ok');

            console.log('session1: ' + AuthClient.session);

            var json = await global.login(ACC2, AuthClient.session);
            expect(json.error).to.equal(undefined);
            expect(json.status).to.equal('ok');

            expect(global.session).not.to.equal(undefined);
            console.log('session2: ' + global.session);

            global.sessionAcc2 = global.session;
        }
    })

    it('unauthorized', async function() {
        global.session = null;

        var body = {
            from: ACC,
        };
        var json = await sendMsgOffchain(body);
        expect(json.error).to.equal(`Missing posting authority: ${ACC}`);
        expect(json.status).to.equal('err');
    })

    it('unauthorized and empty', async function() {
        global.session = null;

        var body = {
        };
        var json = await sendMsgOffchain(body);
        expect(json.error).to.equal(`Account name from is invalid - Account name should not be empty.`);
        expect(json.status).to.equal('err');
    })

    it('no `to` field', async function() {
        global.session = global.sessionAcc;

        var body = {
            from: ACC,
        };
        var json = await sendMsgOffchain(body);
        expect(json.error).to.equal(`Account name to is invalid - Account name should not be empty.`);
        expect(json.status).to.equal('err');
    })

    it('write to yourself', async function() {
        global.session = global.sessionAcc;

        var body = {
            from: ACC,
            to: ACC,
        };
        var json = await sendMsgOffchain(body);
        expect(json.error).to.equal(`You cannot write to yourself`);
        expect(json.status).to.equal('err');
    })

    it('no nonce', async function() {
        global.session = global.sessionAcc;

        var body = {
            from: ACC,
            to: ACC2,
        };
        var json = await sendMsgOffchain(body);
        expect(json.error).to.equal(`\`nonce\` should be an integer`);
        expect(json.status).to.equal('err');
    })

    it('zero nonce', async function() {
        global.session = global.sessionAcc;

        var body = {
            from: ACC,
            to: ACC2,
            nonce: 0,
        };
        var json = await sendMsgOffchain(body);
        expect(json.error).to.equal(`\`nonce\` can\'t be zero`);
        expect(json.status).to.equal('err');
    })

    it('no checksum', async function() {
        global.session = global.sessionAcc;

        var body = {
            from: ACC,
            to: ACC2,
            nonce: 1,
        };
        var json = await sendMsgOffchain(body);
        expect(json.error).to.equal(`\`checksum\` should be an integer`);
        expect(json.status).to.equal('err');
    })

    it('no encrypted_message', async function() {
        global.session = global.sessionAcc;

        var body = {
            from: ACC,
            to: ACC2,
            nonce: 1,
            checksum: 2,
        };
        var json = await sendMsgOffchain(body);
        expect(json.error).to.equal(`Encrypted message is too small`);
        expect(json.status).to.equal('err');
    })

    it('not-string encrypted_message', async function() {
        global.session = global.sessionAcc;

        var body = {
            from: ACC,
            to: ACC2,
            nonce: 1,
            checksum: 2,
            encrypted_message: 123,
        };
        var json = await sendMsgOffchain(body);
        expect(json.error).to.equal(`Encrypted message is too small`);
        expect(json.status).to.equal('err');
    })

    it('small encrypted_message', async function() {
        global.session = global.sessionAcc;

        var body = {
            from: ACC,
            to: ACC2,
            nonce: 1,
            checksum: 2,
            encrypted_message: '123456789012345',
        };
        var json = await sendMsgOffchain(body);
        expect(json.error).to.equal(`Encrypted message is too small`);
        expect(json.status).to.equal('err');
    })

    it('missing to account', async function() {
        global.session = global.sessionAcc;

        var body = {
            from: ACC,
            to: 'missingacc',
            nonce: 1,
            checksum: 2,
            encrypted_message: '1234567890123456',
        };
        var json = await sendMsgOffchain(body);
        expect(json.error).to.equal(`Missing account to`);
        expect(json.status).to.equal('err');
    })

    it('no from key', async function() {
        global.session = global.sessionAcc;

        var body = {
            from: ACC,
            to: ACC2,
            nonce: 1,
            checksum: 2,
            encrypted_message: '1234567890123456',
        };
        var json = await sendMsgOffchain(body);
        expect(json.error).to.equal(`from_memo_key is not match with from account memo_key`);
        expect(json.status).to.equal('err');
    })

    it('wrong from key', async function() {
        global.session = global.sessionAcc;

        var body = {
            from: ACC,
            to: ACC2,
            from_memo_key: '1',
            nonce: 1,
            checksum: 2,
            encrypted_message: '1234567890123456',
        };
        var json = await sendMsgOffchain(body);
        expect(json.error).to.equal(`from_memo_key is not match with from account memo_key`);
        expect(json.status).to.equal('err');
    })

    it('no to key', async function() {
        global.session = global.sessionAcc;

        var body = {
            from: ACC,
            to: ACC2,
            from_memo_key: 'GLS58g5rWYS3XFTuGDSxLVwiBiPLoAyCZgn6aB9Ueh8Hj5qwQA3r6',
            nonce: 1,
            checksum: 2,
            encrypted_message: '1234567890123456',
        };
        var json = await sendMsgOffchain(body);
        expect(json.error).to.equal(`to_memo_key is not match with to account memo_key`);
        expect(json.status).to.equal('err');
    })

    it('wrong to key', async function() {
        global.session = global.sessionAcc;

        var body = {
            from: ACC,
            to: ACC2,
            from_memo_key: 'GLS58g5rWYS3XFTuGDSxLVwiBiPLoAyCZgn6aB9Ueh8Hj5qwQA3r6',
            to_memo_key: '1',
            nonce: 1,
            checksum: 2,
            encrypted_message: '1234567890123456',
        };
        var json = await sendMsgOffchain(body);
        expect(json.error).to.equal(`to_memo_key is not match with to account memo_key`);
        expect(json.status).to.equal('err');
    })

    it('good + queues + counters', async function() {
        global.session = global.sessionAcc;
        const subACC = await global.subscribe(ACC, 'message');

        global.session = global.sessionAcc2;
        const subACC2 = await global.subscribe(ACC2, 'message');

        global.log('Checking ACC counters before operation...')

        var request = {...getRequestBase(),
            method: 'get',
        };
        var resp = await fetch(global.HOST + `/counters/@${ACC}`, request);
        var json = await resp.json();

        expect(json.error).to.equal(undefined);
        expect(json.status).to.equal('ok');

        let accMessages = json.counters.message;

        global.log('Checking ACC2 counters before operation...')

        var request = {...getRequestBase(),
            method: 'get',
        };
        var resp = await fetch(global.HOST + `/counters/@${ACC}`, request);
        var json = await resp.json();

        expect(json.error).to.equal(undefined);
        expect(json.status).to.equal('ok');

        let acc2Messages = json.counters.message;

        global.log('Sending offchain...')

        global.session = global.sessionAcc;

        let data = golos.messages.encode(ACC_ACTIVE, 'GLS58g5rWYS3XFTuGDSxLVwiBiPLoAyCZgn6aB9Ueh8Hj5qwQA3r6',
            golos.messages.newTextMsg('Hello world', 'golos-messenger', 1));

        var body = {
            from: ACC,
            to: ACC2,
            nonce: data.nonce,
            from_memo_key: 'GLS58g5rWYS3XFTuGDSxLVwiBiPLoAyCZgn6aB9Ueh8Hj5qwQA3r6',
            to_memo_key: 'GLS58g5rWYS3XFTuGDSxLVwiBiPLoAyCZgn6aB9Ueh8Hj5qwQA3r6',
            checksum: data.checksum,
            update: false,
            encrypted_message: data.encrypted_message,
        };

        var json = await sendMsgOffchain(body);
        expect(json.error).to.equal(undefined);
        expect(json.status).to.equal('ok');

        global.log('Take ACC...')

        global.session = global.sessionAcc;

        var request = {...getRequestBase(),
            method: 'get',
        };
        var resp = await fetch(global.HOST + `/take/@${ACC}/${subACC}`, request);
        var json = await resp.json();

        expect(json.error).to.equal(undefined);
        expect(json.status).to.equal('ok');
        expect(json.tasks[0].scope).to.equal('message');
        expect(json.tasks[0].data[0]).to.equal('private_message');
        expect(json.tasks[0].data[1].from).to.equal(ACC);
        expect(json.tasks[0].data[1].to).to.equal(ACC2);
        expect(json.tasks[0].data[1].from_memo_key).to.equal(body.from_memo_key);
        expect(json.tasks[0].data[1].to_memo_key).to.equal(body.to_memo_key);
        expect(json.tasks[0].data[1].encrypted_message).to.equal(data.encrypted_message);
        expect(json.tasks[0].data[1].nonce).to.equal(data.nonce);
        expect(json.tasks[0].data[1].checksum).to.equal(data.checksum);
        expect(json.tasks[0].data[1].update).to.equal(false);
        expect(json.tasks[0].data[1]._offchain).to.equal(true);

        global.log('Take ACC2...')

        global.session = global.sessionAcc2;

        var request = {...getRequestBase(),
            method: 'get',
        };
        var resp = await fetch(global.HOST + `/take/@${ACC2}/${subACC2}`, request);
        var json = await resp.json();

        expect(json.error).to.equal(undefined);
        expect(json.status).to.equal('ok');
        expect(json.tasks[0].scope).to.equal('message');
        expect(json.tasks[0].data[0]).to.equal('private_message');
        expect(json.tasks[0].data[1].from).to.equal(ACC);
        expect(json.tasks[0].data[1].to).to.equal(ACC2);
        expect(json.tasks[0].data[1].from_memo_key).to.equal(body.from_memo_key);
        expect(json.tasks[0].data[1].to_memo_key).to.equal(body.to_memo_key);
        expect(json.tasks[0].data[1].encrypted_message).to.equal(data.encrypted_message);
        expect(json.tasks[0].data[1].nonce).to.equal(data.nonce);
        expect(json.tasks[0].data[1].checksum).to.equal(data.checksum);
        expect(json.tasks[0].data[1].update).to.equal(false);
        expect(json.tasks[0].data[1]._offchain).to.equal(true);

        global.log('Checking ACC counters after operation...')

        var request = {...getRequestBase(),
            method: 'get',
        };
        var resp = await fetch(global.HOST + `/counters/@${ACC}`, request);
        var json = await resp.json();

        expect(json.error).to.equal(undefined);
        expect(json.status).to.equal('ok');

        expect(json.counters.message).to.equal(accMessages);

        global.log('Checking ACC2 counters after operation...')

        var request = {...getRequestBase(),
            method: 'get',
        };
        var resp = await fetch(global.HOST + `/counters/@${ACC}`, request);
        var json = await resp.json();

        expect(json.error).to.equal(undefined);
        expect(json.status).to.equal('ok');

        expect(json.counters.message).to.equal(acc2Messages);
    })
})
