const { golos } = global

let { ACC, ACC2, ACC_POSTING, ACC_ACTIVE } = Cypress.env()

let { NODE_URL, CHAIN_ID } = Cypress.env();
golos.config.set('websocket', NODE_URL)
if (CHAIN_ID) {
    golos.config.set('chain_id', CHAIN_ID)
}

const postFirebase = async (path, body = {}) => {
    var request = {...getRequestBase(),
        method: 'post',
        body: JSON.stringify(body),
    }
    var resp = await fetch(global.HOST + path, request)
    var json = await resp.json()
    expect(json.error).to.equal(undefined)
    expect(json.status).to.equal('ok')
    expect(json.result).not.to.equal(undefined)
    return { result: json.result }
}

const registerToken = async (app, token, scopes) => {
    return await postFirebase(`/firebase/register/${app}/${token}/${scopes}`)
}

const unregisterToken = async (token) => {
    return await postFirebase(`/firebase/unregister/${token}`)
}

const delay = async (msec) => {
    return new Promise(resolve => setTimeout(resolve, msec))
}

describe('firebase - lifecycle tests', function () {
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
