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

    it('/firebase - register-trigger', async function() {
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

        global.log('Do transfer', ACC, 'to', ACC2, '...')

        await golos.broadcast.transferAsync(
            ACC_ACTIVE,
            ACC, ACC2, '0.001 GOLOS', '');
    })

    it('/firebase - register-cleanup', async function() {
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
})
