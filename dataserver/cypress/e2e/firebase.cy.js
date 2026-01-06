const { golos } = global

let { ACC, ACC2, ACC_POSTING, ACC_ACTIVE } = Cypress.env()

let { NODE_URL, CHAIN_ID } = Cypress.env();
golos.config.set('websocket', NODE_URL)
if (CHAIN_ID) {
    golos.config.set('chain_id', CHAIN_ID)
}

const postFirebase = async (path, body = {}, shouldBeOk = true) => {
    var request = {...getRequestBase(),
        method: 'post',
        body: JSON.stringify(body),
    }
    var resp = await fetch(global.HOST + path, request)
    var json = await resp.json()
    if (shouldBeOk) {
        expect(json.error).to.equal(undefined)
        expect(json.status).to.equal('ok')
        expect(json.result).not.to.equal(undefined)
    }
    return { result: json.result, error: json.error }
}

const registerToken = async (app, token, scopes, shouldBeOk = true) => {
    return await postFirebase(`/firebase/register/${app}/${token}/${scopes}`,
        {}, shouldBeOk)
}

const unregisterToken = async (token, shouldBeOk = true) => {
    return await postFirebase(`/firebase/unregister/${token}`,
        {}, shouldBeOk)
}

const delay = async (msec) => {
    return new Promise(resolve => setTimeout(resolve, msec))
}

describe('firebase - lifecycle tests', function () {
    it('/firebase - register', async function() {
        global.log('--- /firebase - register')

        global.log('Login...')

        var login_challenge = await AuthClient.obtainLoginChallenge(ACC)

        var json = await AuthClient.signAndAuth(login_challenge, ACC, ACC_POSTING)
        expect(json.error).to.equal(undefined)
        expect(json.status).to.equal('ok')

        var json = await global.login(ACC, AuthClient.session);
        expect(json.error).to.equal(undefined)
        expect(json.status).to.equal('ok')

        global.log('Test register - wrong app...')

        const token = 'firebase-test' + Math.random()

        var error = (await registerToken('fake', token, 'send,receive', false)).error
        expect(error).to.equal('Wrong firebase app: fake')

        global.log('Test register - wrong scope...')

        var error = (await registerToken('wallet_android', 'token', 'send,fake', false)).error
        expect(error).to.equal('Wrong notification scope - fake')
    })

    it('/firebase - register-unregister', async function() {
        global.log('--- /firebase - register-unregister')

        global.log('Login...')

        var login_challenge = await AuthClient.obtainLoginChallenge(ACC)

        var json = await AuthClient.signAndAuth(login_challenge, ACC, ACC_POSTING)
        expect(json.error).to.equal(undefined)
        expect(json.status).to.equal('ok')

        var json = await global.login(ACC, AuthClient.session);
        expect(json.error).to.equal(undefined)
        expect(json.status).to.equal('ok')

        global.log('Test register...')

        const token = 'firebase-test' + Math.random()

        var result = (await registerToken('wallet_android', token, 'send,receive')).result
        expect(result.created).not.to.equal(undefined)
        expect(result.updated).to.equal(undefined)

        global.log('Test register again...')

        var result = (await registerToken('wallet_android', token, 'send,receive')).result
        expect(result.created).to.equal(0)
        expect(result.updated).not.to.equal(undefined)

        global.log('Test unregister...')

        var result = (await unregisterToken(token)).result
        expect(result.unregistered).not.to.equal(undefined)
        expect(result.unregistered).not.to.equal(0)

        global.log('Test unregister again...')

        var result = (await unregisterToken(token)).result
        expect(result.unregistered).to.equal(0)
    })

    it('/firebase - register-trigger (transfer)', async function() {
        global.log('--- /firebase - register-trigger (transfer)')

        global.log('Login', ACC, 'and preserve session...')

        var login_challenge = await AuthClient.obtainLoginChallenge(ACC)

        var json = await AuthClient.signAndAuth(login_challenge, ACC, ACC_POSTING)
        expect(json.error).to.equal(undefined)
        expect(json.status).to.equal('ok')

        var json = await global.login(ACC, AuthClient.session);
        expect(json.error).to.equal(undefined)
        expect(json.status).to.equal('ok')

        const sessionAcc = global.session

        global.log('Login' + ACC2 + 'and preserve session...')

        delete AuthClient.session

        var login_challenge = await AuthClient.obtainLoginChallenge(ACC2)

        var json = await AuthClient.signAndAuth(login_challenge, ACC2, ACC_POSTING)
        expect(json.error).to.equal(undefined)
        expect(json.status).to.equal('ok')

        var json = await global.login(ACC2, AuthClient.session);
        expect(json.error).to.equal(undefined)
        expect(json.status).to.equal('ok')

        const sessionAcc2 = global.session

        global.log('Test register', ACC, '...')

        global.session = sessionAcc

        var tokenAcc = 'firebase-test-acc1-' + Math.random()

        var result = (await registerToken('wallet_android', tokenAcc, 'send,receive')).result
        expect(result.created).not.to.equal(undefined)
        expect(result.updated).to.equal(undefined)

        global.log('Test register', ACC2, '...')

        global.session = sessionAcc2

        var tokenAcc2 = 'firebase-test-acc2-' + Math.random()

        var result = (await registerToken('wallet_android', tokenAcc2, 'send,receive')).result
        expect(result.created).not.to.equal(undefined)
        expect(result.updated).to.equal(undefined)

        global.log('Subscribe accounts to queues (for test mode only)...')

        global.session = sessionAcc
        const sidAcc = await global.subscribe(ACC, 'send')

        global.session = sessionAcc2
        const sidAcc2 = await global.subscribe(ACC2, 'receive')

        global.log('Do transfer', ACC, 'to', ACC2, '...')

        await golos.broadcast.transferAsync(
            ACC_ACTIVE,
            ACC, ACC2, '0.001 GOLOS', '');

        global.log('Take', ACC2, ' (normal queue task)...')

        global.session = sessionAcc2

        var tasks = await global.take(ACC2, sidAcc2)
        expect(tasks[0]).not.to.equal(undefined)
        var task = tasks[0]
        expect(task.scope).to.equal('receive')
        expect(task.data[1]._fire).to.equal(undefined)

        global.log('Now take firebase debug queue task...')

        var tasks = await global.take(ACC2, sidAcc2, task.id)
        expect(tasks[0]).not.to.equal(undefined)
        var task = tasks[0]
        expect(task.scope).to.equal('receive')
        expect(task.data[0]).to.equal('transfer')
        expect(task.data[1].amount).to.equal('0.001 GOLOS')
        global.log(task)
        var _fire = task.data[1]._fire
        expect(_fire.app).to.equal('wallet_android')
        expect(_fire.body).to.equal('@cyberfounder перевел вам 0.001 GOLOS')
        expect(_fire.title).to.equal('GOLOS Кошелек')

        global.log('Take', ACC, ' (normal queue task)...')

        global.session = sessionAcc

        var tasks = await global.take(ACC, sidAcc)
        expect(tasks[0]).not.to.equal(undefined)
        var task = tasks[0]
        expect(task.scope).to.equal('send')
        expect(task.data[1]._fire).to.equal(undefined)

        global.log('Now take firebase debug queue task...')

        var tasks = await global.take(ACC, sidAcc, task.id)
        expect(tasks[0]).not.to.equal(undefined)
        var task = tasks[0]
        expect(task.scope).to.equal('send')
        expect(task.data[0]).to.equal('transfer')
        expect(task.data[1].amount).to.equal('0.001 GOLOS')
        global.log(task)
        var _fire = task.data[1]._fire
        expect(_fire.app).to.equal('wallet_android')
        expect(_fire.body).to.equal('Вы перевели 0.001 GOLOS @cyberfounder100')
        expect(_fire.title).to.equal('GOLOS Кошелек')
    })

    it('/firebase - register-cleanup', async function() {
        global.log('--- /firebase - register-cleanup')

        global.log('Login...')

        var login_challenge = await AuthClient.obtainLoginChallenge(ACC)

        var json = await AuthClient.signAndAuth(login_challenge, ACC, ACC_POSTING)
        expect(json.error).to.equal(undefined)
        expect(json.status).to.equal('ok')

        var json = await global.login(ACC, AuthClient.session);
        expect(json.error).to.equal(undefined)
        expect(json.status).to.equal('ok')

        global.log('Test register...')

        const token = 'firebase-test' + Math.random()

        var result = (await registerToken('wallet_android', token, 'send,receive')).result
        expect(result.created).not.to.equal(undefined)
        expect(result.updated).to.equal(undefined)

        global.log('Test register again (token exists, not cleaned)...')

        var result = (await registerToken('wallet_android', token, 'send,receive')).result
        expect(result.created).to.equal(0)
        expect(result.updated).not.to.equal(undefined)

        global.log('Try after 3000 ms...')

        await delay(3000)

        var result = (await registerToken('wallet_android', token, 'send,receive')).result
        expect(result.created).to.equal(0)
        expect(result.updated).not.to.equal(undefined)

        global.log('Try after 9000 ms (6000 timeout + 1 block interval)...')

        await delay(9000)

        var result = (await unregisterToken(token)).result
        expect(result.unregistered).to.equal(0)
    })

    it('/firebase - register-trigger (message)', async function() {
        global.log('--- /firebase - register-trigger (message)')

        global.log('Login', ACC, 'and preserve session...')

        var login_challenge = await AuthClient.obtainLoginChallenge(ACC)

        var json = await AuthClient.signAndAuth(login_challenge, ACC, ACC_POSTING)
        expect(json.error).to.equal(undefined)
        expect(json.status).to.equal('ok')

        var json = await global.login(ACC, AuthClient.session);
        expect(json.error).to.equal(undefined)
        expect(json.status).to.equal('ok')

        const sessionAcc = global.session

        const RECEIVER = 'notify'

        global.log('Login' + RECEIVER + 'and preserve session...')

        delete AuthClient.session

        var login_challenge = await AuthClient.obtainLoginChallenge(RECEIVER)

        var json = await AuthClient.signAndAuth(login_challenge, RECEIVER, ACC_POSTING)
        expect(json.error).to.equal(undefined)
        expect(json.status).to.equal('ok')

        var json = await global.login(RECEIVER, AuthClient.session);
        expect(json.error).to.equal(undefined)
        expect(json.status).to.equal('ok')

        const sessionRec = global.session

        global.log('Test register', ACC, '...')

        global.session = sessionAcc

        var tokenAcc = 'firebase-test-acc1-' + Math.random()

        var result = (await registerToken('msg_android', tokenAcc, 'message')).result
        expect(result.created).not.to.equal(undefined)
        expect(result.updated).to.equal(undefined)

        global.log('Test register', RECEIVER, '...')

        global.session = sessionRec

        var tokenRec = 'firebase-test-receiver-' + Math.random()

        var result = (await registerToken('msg_android', tokenRec, 'message')).result
        expect(result.created).not.to.equal(undefined)
        expect(result.updated).to.equal(undefined)

        global.log('Subscribe accounts to queues (for test mode only)...')

        global.session = sessionAcc
        const sidAcc = await global.subscribe(ACC, 'message')

        global.session = sessionRec
        const sidRec = await global.subscribe(RECEIVER, 'message')

        global.log('Do message', ACC, 'to', RECEIVER, '...')

        const makeMsg = async () => {
            const receiver = (await golos.api.getAccounts([RECEIVER]))[0]

            const data = await golos.messages.encodeMsg({
                private_memo: ACC_ACTIVE,
                to_public_memo: receiver.memo_key,
                msg: golos.messages.newTextMsg('Привет, как дела?', 'golos-messenger', 1)
            })

            const json = JSON.stringify(['private_message', {
                from: ACC,
                to: RECEIVER,
                nonce: data.nonce,
                from_memo_key: data.from_memo_key,
                to_memo_key: data.to_memo_key,
                checksum: data.checksum,
                update: false,
                encrypted_message: data.encrypted_message,
            }]);
            const res = await golos.broadcast.customJsonAsync(ACC_POSTING, [], [ACC], 'private_message', json)
            return res
        }

        await makeMsg()

        global.log('Take', RECEIVER, ' (normal queue task)...')

        global.session = sessionRec

        var tasks = await global.take(RECEIVER, sidRec)
        expect(tasks[0]).not.to.equal(undefined)
        var task = tasks[0]
        expect(task.scope).to.equal('message')
        expect(task.data[1]._fire).to.equal(undefined)

        global.log('Now take firebase debug queue task...')

        var tasks = await global.take(RECEIVER, sidRec, task.id)
        expect(tasks[0]).not.to.equal(undefined)
        var task = tasks[0]
        expect(task.scope).to.equal('message')
        expect(task.data[0]).to.equal('private_message')
        global.log(task)
        var _fire = task.data[1]._fire
        expect(_fire.app).to.equal('msg_android')
        expect(_fire.body).to.equal('Новое сообщение от @cyberfounder')
        expect(_fire.title).to.equal('GOLOS Мессенджер')
    })

    it('/firebase - delete-on-fail', async function() {
        global.log('--- /firebase - delete-on-fail')

        global.log('Login', ACC, 'and preserve session...')

        var login_challenge = await AuthClient.obtainLoginChallenge(ACC)

        var json = await AuthClient.signAndAuth(login_challenge, ACC, ACC_POSTING)
        expect(json.error).to.equal(undefined)
        expect(json.status).to.equal('ok')

        var json = await global.login(ACC, AuthClient.session);
        expect(json.error).to.equal(undefined)
        expect(json.status).to.equal('ok')

        const sessionAcc = global.session

        global.log('Login' + ACC2 + 'and preserve session...')

        delete AuthClient.session

        var login_challenge = await AuthClient.obtainLoginChallenge(ACC2)

        var json = await AuthClient.signAndAuth(login_challenge, ACC2, ACC_POSTING)
        expect(json.error).to.equal(undefined)
        expect(json.status).to.equal('ok')

        var json = await global.login(ACC2, AuthClient.session);
        expect(json.error).to.equal(undefined)
        expect(json.status).to.equal('ok')

        const sessionAcc2 = global.session

        global.log('Test register', ACC, ' (it will be test token = all ok, notification will be sent to queue)...')

        global.session = sessionAcc

        var tokenAcc = 'firebase-test-acc1-' + Math.random()

        var result = (await registerToken('wallet_android', tokenAcc, 'send,receive')).result
        expect(result.created).not.to.equal(undefined)
        expect(result.updated).to.equal(undefined)

        global.log('Test register', ACC2, ' (it will be not test token = should fail...')

        global.session = sessionAcc2

        var tokenAcc2 = 'real-broken-token-' + Math.random()

        var result = (await registerToken('wallet_android', tokenAcc2, 'send,receive')).result
        expect(result.created).not.to.equal(undefined)
        expect(result.updated).to.equal(undefined)

        global.log('Subscribe accounts to queues (for test mode only)...')

        global.session = sessionAcc
        const sidAcc = await global.subscribe(ACC, 'send')

        global.session = sessionAcc2
        const sidAcc2 = await global.subscribe(ACC2, 'receive')

        global.log('Do transfer', ACC, 'to', ACC2, '...')

        await golos.broadcast.transferAsync(
            ACC_ACTIVE,
            ACC, ACC2, '0.001 GOLOS', '');

        global.log('Take', ACC, ' (normal queue task)...')

        global.session = sessionAcc

        var tasks = await global.take(ACC, sidAcc)
        expect(tasks[0]).not.to.equal(undefined)
        var task = tasks[0]
        expect(task.scope).to.equal('send')
        expect(task.data[1]._fire).to.equal(undefined)

        global.log('Take', ACC, 'firebase debug queue task...')

        var tasks = await global.take(ACC, sidAcc, task.id)
        expect(tasks[0]).not.to.equal(undefined)
        var task = tasks[0]
        expect(task.scope).to.equal('send')
        expect(task.data[0]).to.equal('transfer')
        expect(task.data[1].amount).to.equal('0.001 GOLOS')
        global.log(task)
        var _fire = task.data[1]._fire
        expect(_fire.app).to.equal('wallet_android')
        expect(_fire.body).to.equal('Вы перевели 0.001 GOLOS @cyberfounder100')
        expect(_fire.title).to.equal('GOLOS Кошелек')

        global.log('Waiting 1000ms, because take is before delete...')

        await delay(1000)

        global.log('And', ACC2, ' should have deleted token, so we cannot unregister it...')

        global.session = sessionAcc2

        var result = (await unregisterToken(tokenAcc2)).result
        expect(result.unregistered).to.equal(0)

        global.log('And', ACC, ' should NOT have deleted token...')

        global.session = sessionAcc

        var result = (await unregisterToken(tokenAcc)).result
        expect(result.unregistered).not.to.equal(0)
    })
})
