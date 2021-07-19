const { golos } = global;

let { ACC, ACC2, ACC_POSTING, ACC_ACTIVE } = Cypress.env();

let { NODE_URL, CHAIN_ID } = Cypress.env();
golos.config.set('websocket', NODE_URL);
if (CHAIN_ID) {
    golos.config.set('chain_id', CHAIN_ID);
}

describe('queues - data tests', function () {

    beforeEach(async function() {
        if (!global.sessionAcc) {
            global.log(`Login to ${ACC}...`)

            global.session = null;
            var login_challenge = await global.obtainLoginChallenge(ACC);

            var json = await global.signAndAuth(login_challenge, ACC, ACC_POSTING);
            expect(json.error).to.equal(undefined);
            expect(json.status).to.equal('ok');
            global.sessionAcc = global.session;
        }
        if (!global.sessionAcc2) {
            global.log(`Login to ${ACC2}...`)

            global.session = null;
            var login_challenge = await global.obtainLoginChallenge(ACC2);

            var json = await global.signAndAuth(login_challenge, ACC2, ACC_POSTING);
            expect(json.error).to.equal(undefined);
            expect(json.status).to.equal('ok');
            global.sessionAcc2 = global.session;
        }
    })

    it('transfer', async function() {
        global.session = global.sessionAcc;
        const subACC = await global.subscribe(ACC, 'send');

        global.session = global.sessionAcc2;
        const subACC2 = await global.subscribe(ACC2, 'receive');

        global.log('Do operation...')

        await golos.broadcast.transferAsync(
            ACC_ACTIVE,
            ACC, ACC2, '0.001 GOLOS', 'Test notify');

        global.log('Take ACC...')

        global.session = global.sessionAcc;

        var request = {...getRequestBase(),
            method: 'get',
        };
        var resp = await fetch(global.HOST + `/take/@${ACC}/${subACC}`, request);
        var json = await resp.json();

        expect(json.error).to.equal(undefined);
        expect(json.status).to.equal('ok');
        expect(json.tasks[0].scope).to.equal('send');
        expect(json.tasks[0].data[0]).to.equal('transfer');
        expect(json.tasks[0].data[1].from).to.equal(ACC);
        expect(json.tasks[0].data[1].to).to.equal(ACC2);
        expect(json.tasks[0].data[1].amount).to.equal('0.001 GOLOS');
        expect(json.tasks[0].data[1].memo).to.equal('Test notify');

        global.log('Take ACC2...')

        global.session = global.sessionAcc2;

        var request = {...getRequestBase(),
            method: 'get',
        };
        var resp = await fetch(global.HOST + `/take/@${ACC2}/${subACC2}`, request);
        var json = await resp.json();

        expect(json.error).to.equal(undefined);
        expect(json.status).to.equal('ok');
        expect(json.tasks[0].scope).to.equal('receive');
        expect(json.tasks[0].data[0]).to.equal('transfer');
        expect(json.tasks[0].data[1].from).to.equal(ACC);
        expect(json.tasks[0].data[1].to).to.equal(ACC2);
        expect(json.tasks[0].data[1].amount).to.equal('0.001 GOLOS');
        expect(json.tasks[0].data[1].memo).to.equal('Test notify');
    })

    it('message', async function() {
        global.session = global.sessionAcc;
        const subACC = await global.subscribe(ACC, 'message');

        global.session = global.sessionAcc2;
        const subACC2 = await global.subscribe(ACC2, 'message');

        global.log('Do operation...')

        let data = golos.messages.encode(ACC_ACTIVE, 'GLS58g5rWYS3XFTuGDSxLVwiBiPLoAyCZgn6aB9Ueh8Hj5qwQA3r6',
            golos.messages.newTextMsg('Hello world', 'golos-messenger', 1));

        var pm = JSON.stringify(['private_message', {
            from: ACC,
            to: ACC2,
            nonce: data.nonce,
            from_memo_key: 'GLS58g5rWYS3XFTuGDSxLVwiBiPLoAyCZgn6aB9Ueh8Hj5qwQA3r6',
            to_memo_key: 'GLS58g5rWYS3XFTuGDSxLVwiBiPLoAyCZgn6aB9Ueh8Hj5qwQA3r6',
            checksum: data.checksum,
            update: false,
            encrypted_message: data.encrypted_message,
        }]);

        await golos.broadcast.customJsonAsync(ACC_POSTING, [], [ACC], 'private_message', pm)

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
        expect(json.tasks[0].data[1].encrypted_message).to.equal(data.encrypted_message);
        expect(json.tasks[0].data[1].nonce).to.equal(data.nonce);
        expect(json.tasks[0].data[1].checksum).to.equal(data.checksum);
        expect(json.tasks[0].data[1].update).to.equal(false);

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
        expect(json.tasks[0].data[1].encrypted_message).to.equal(data.encrypted_message);
        expect(json.tasks[0].data[1].nonce).to.equal(data.nonce);
        expect(json.tasks[0].data[1].checksum).to.equal(data.checksum);
        expect(json.tasks[0].data[1].update).to.equal(false);
    })

    it('donate', async function() {
        global.session = global.sessionAcc;
        const subACC = await global.subscribe(ACC, 'donate');

        global.session = global.sessionAcc2;
        const subACC2 = await global.subscribe(ACC2, 'donate');

        global.log('Do transfer_to_tip...')

        await golos.broadcast.transferToTipAsync(
            ACC_ACTIVE,
            ACC, ACC, '0.002 GOLOS', 'Test notify', []);

        global.log('Do donate...')

        await golos.broadcast.donateAsync(
            ACC_POSTING,
            ACC, ACC2, '0.001 GOLOS', {app: 'gns-test', version: 1, comment: 'Test', target: {}}, []);

        global.log('Do donate 2...')

        await golos.broadcast.donateAsync(
            ACC_POSTING,
            ACC, ACC2, '0.001 GOLOS', {app: 'gns-test', version: 2, comment: 'Test', target: {
                author: ACC2,
                permlink: 'test-test',
            }}, []);

        global.log('Take ACC2...')

        global.session = global.sessionAcc2;

        var request = {...getRequestBase(),
            method: 'get',
        };
        var resp = await fetch(global.HOST + `/take/@${ACC2}/${subACC2}`, request);
        var json = await resp.json();

        expect(json.error).to.equal(undefined);
        expect(json.status).to.equal('ok');
        expect(json.tasks[0].scope).to.equal('donate');
        expect(json.tasks[0].data[0]).to.equal('donate');
        expect(json.tasks[0].data[1].from).to.equal(ACC);
        expect(json.tasks[0].data[1].to).to.equal(ACC2);
        expect(json.tasks[0].data[1].amount).to.equal('0.001 GOLOS');
        expect(json.tasks[0].data[1].memo.app).to.equal('gns-test');
        expect(json.tasks[0].data[1].memo.version).to.equal(1);
        expect(json.tasks[0].data[1].memo.comment).to.equal('Test');

        global.log('Take ACC2...')

        global.session = global.sessionAcc2;

        var request = {...getRequestBase(),
            method: 'get',
        };
        var resp = await fetch(global.HOST + `/take/@${ACC2}/${subACC2}/${json.tasks[0].id}`, request);
        var json = await resp.json();

        expect(json.error).to.equal(undefined);
        expect(json.status).to.equal('ok');
        expect(json.tasks[0].data[0]).to.equal('donate');
        expect(json.tasks[0].data[1].from).to.equal(ACC);
        expect(json.tasks[0].data[1].to).to.equal(ACC2);
        expect(json.tasks[0].data[1].amount).to.equal('0.001 GOLOS');
        expect(json.tasks[0].data[1].memo.app).to.equal('gns-test');
        expect(json.tasks[0].data[1].memo.version).to.equal(2);
        expect(json.tasks[0].data[1].memo.comment).to.equal('Test');
        expect(json.tasks[0].data[1].memo.target.author).to.equal(ACC2);
        expect(json.tasks[0].data[1].memo.target.permlink).to.equal('test-test');
    })

    it('comment_reply', async function() {
        global.session = global.sessionAcc;
        const subACC = await global.subscribe(ACC, 'comment_reply');

        global.session = global.sessionAcc2;
        const subACC2 = await global.subscribe(ACC2, 'comment_reply');

        global.log('Transfer vesting to ACC2...')

        await golos.broadcast.transferToVestingAsync(
            ACC_ACTIVE,
            ACC, ACC2, '100.000 GOLOS');

        const permlink = `test-test-${global.random()}`;

        global.log('Post by ACC...')

        await golos.broadcast.commentAsync(
            ACC_POSTING,
            '', 'test', ACC, permlink, 'Post', 'test post', '{"test":1}');

        global.log('Comment by ACC2...')

        await golos.broadcast.commentAsync(
            ACC_POSTING,
            ACC, permlink, ACC2, `re-${permlink}`, 'RE', 'test comment', '{"test":1}');

        global.log('Comment reply by ACC...')

        await golos.broadcast.commentAsync(
            ACC_POSTING,
            ACC2, `re-${permlink}`, ACC, `re-${permlink}2`, 'RE', 'test comment reply', '{"test":1}');

        global.log('Take ACC...')

        global.session = global.sessionAcc;

        var request = {...getRequestBase(),
            method: 'get',
        };
        var resp = await fetch(global.HOST + `/take/@${ACC}/${subACC}`, request);
        var json = await resp.json();

        expect(json.error).to.equal(undefined);
        expect(json.status).to.equal('ok');
        expect(json.tasks[0].scope).to.equal('comment_reply');

        global.log('Take ACC2...')

        global.session = global.sessionAcc2;

        var request = {...getRequestBase(),
            method: 'get',
        };
        var resp = await fetch(global.HOST + `/take/@${ACC2}/${subACC2}`, request);
        var json = await resp.json();

        expect(json.error).to.equal(undefined);
        expect(json.status).to.equal('ok');
        expect(json.tasks[0].scope).to.equal('comment_reply');
    })

    it('mention', async function() {
        global.session = global.sessionAcc;
        const subACC = await global.subscribe(ACC, 'mention,comment_reply');

        global.session = global.sessionAcc2;
        const subACC2 = await global.subscribe(ACC2, 'mention,comment_reply');

        global.log('Transfer vesting to ACC2...')

        await golos.broadcast.transferToVestingAsync(
            ACC_ACTIVE,
            ACC, ACC2, '100.000 GOLOS');

        const permlink = `test-test-${global.random()}`;

        global.log('Post by ACC2...')

        await golos.broadcast.commentAsync(
            ACC_POSTING,
            '', 'test', ACC2, permlink, 'Post', `@${ACC}, hi!`, '{"test":1}');

        global.log('Comment by ACC...')

        await golos.broadcast.commentAsync(
            ACC_POSTING,
            ACC2, permlink, ACC, `re-${permlink}`, 'RE', `@${ACC2} hi! How are you?`, '{"test":1}');

        global.log('Take ACC...')

        global.session = global.sessionAcc;

        var request = {...getRequestBase(),
            method: 'get',
        };
        var resp = await fetch(global.HOST + `/take/@${ACC}/${subACC}`, request);
        var json = await resp.json();

        expect(json.error).to.equal(undefined);
        expect(json.status).to.equal('ok');
        expect(json.tasks[0].scope).to.equal('mention');

        global.log('Take ACC2...')

        global.session = global.sessionAcc2;

        var request = {...getRequestBase(),
            method: 'get',
        };
        var resp = await fetch(global.HOST + `/take/@${ACC2}/${subACC2}`, request);
        var json = await resp.json();

        expect(json.error).to.equal(undefined);
        expect(json.status).to.equal('ok');
        expect(json.tasks[0].scope).to.equal('comment_reply');
    })
})
