global.golos = require('golos-lib-js');

let { NODE_URL, CHAIN_ID } = Cypress.env();
golos.config.set('websocket', NODE_URL);
if (CHAIN_ID) {
    golos.config.set('chain_id', CHAIN_ID);
}

global.HOST = 'http://localhost:8805';

global.log = (msg, ...args) => {
    console.log(msg, ...args)
    cy.log(msg, ...args)
}

global.random = (length = 10) => {
    return Cypress._.random(1000000, 9000000);
};

global.getRequestBase = function() {
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

import AuthClient from './AuthClient';
global.AuthClient = AuthClient;

beforeEach(function() {
    delete global.session;
});

// Import commands.js using ES2015 syntax:
import './commands'

// Alternatively you can use CommonJS syntax:
// require('./commands')


global.subscribe = async function(acc, types) {
    global.log(`Subscribe to ${types}...`)

    var request = {...getRequestBase(),
        method: 'get',
    };
    var resp = await fetch(global.HOST + `/subscribe/@${acc}/${types}`, request);
    var json = await resp.json();

    expect(json.error).to.equal(undefined);
    expect(typeof json.subscriber_id).to.equal('number');
    expect(json.status).to.equal('ok');

    global.log('subscriber_id' + json.subscriber_id);
    return json.subscriber_id;
};

global.login = async (acc, authSession) =>{
    var body = {
        account: acc,
        authSession,
    };
    var request = {...global.getRequestBase(),
        body: JSON.stringify(body),
        headers: {
        },
    };

    var resp = await fetch(global.HOST + '/login_account', request);

    global.session = resp.headers.get('X-Session');

    var json = await resp.json();
    return json;
}

global.take = async (acc, subscriber_id, task_ids = undefined) => {
    var request = {...global.getRequestBase(),
        method: 'get',
    }
    var url = global.HOST + `/take/@${acc}/${subscriber_id}`
    if (task_ids) url += '/' + task_ids
    var resp = await fetch(url, request)
    var json = await resp.json()

    expect(json.error).to.equal(undefined)
    expect(json.status).to.equal('ok')
    expect(json.tasks).to.be.an('array')
    return json.tasks
}
