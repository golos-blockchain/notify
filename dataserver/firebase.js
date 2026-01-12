const config = require('config')
const admin = require('firebase-admin')

const fireApps = {}

const titles = {
    'msg_android': 'GOLOS Мессенджер',
    'wallet_android': 'GOLOS Кошелек',
    'blogs_android': 'GOLOS Блоги',
}

async function initFirebase() {
    const fcKey = 'firebase_clients'
    const clients = config.has(fcKey) && config.get(fcKey)
    if (!clients || !Object.entries(clients).length) {
        console.error('-----------------------------------------------------------')
        console.error('WARNING! Not initializing Firebase clients because no firebase_clients in dataserver/config/default.json. So Android application notifications will no work!')
        console.error('-----------------------------------------------------------')
        return
    }
    console.log('Initializing Firebase...')
    for (const [key, serviceAcc] of Object.entries(clients)) {
        console.log('> Firebase for', key, '...')
        const copy = {...serviceAcc};
        fireApps[key] = admin.initializeApp({
          credential: admin.credential.cert(copy),
          //databaseURL: 'https://project-id-1.firebaseio.com'
        }, key)

    }
    console.log('Firebase initializing done.')
}

function getBody(opType, op, myAcc) {
    let body

    if (opType === 'comment_reply') {
        if (op.depth > 1) {
            body = '@' + author + " ответил на ваш комментарий."
        } else {
            body = '@' + op.author + " прокомментировал ваш пост."
        }
    } else if (opType === 'comment_mention') {
        if (op.parent_author !== "") {
            body = "@" + op.author + " упомянул вас в комментарии."
        } else {
            body = "@" + op.author + " упомянул вас в своем посте."
        }
    }

    else if (opType === 'donate' || opType === 'donate_msgs') {
        body = "@" + op.from + " отблагодарил вас " + op.amount
    } else if (opType === "transfer" && op.from !== myAcc) {
        body = "@" + op.from + " перевел вам " + op.amount
    } else if (opType === "fill_order") {
        body = "Ордер на сумму " + op.current_pays + " в обмен на " + op.open_pays + " выполнен"
    }

    if (opType === "private_message") {
        body = "Новое сообщение от @" + op.from
    }

    return body
}

async function pushToFirebase(app, token, opData, myAcc) {
    const [ opType, op ] = opData

    if (!fireApps[app]) {
        throw new Error('No firebase app', app, 'for operation:', opType)
    }

    const title = titles[app]
    const body = getBody(opType, op, myAcc)
    if (!body) {
        return
    }

    if (token.startsWith('firebase-test')) {
        await putToQueues(myAcc, 'message')
        return
    }

    const message = {
        token: token, 
        notification: {
            title,
            body,
        },
        android: {
            priority: 'high',
        },
        apns: {
            payload: {
                aps: {
                  priority: 10
                }
            }
        },
        webpush: {
            headers: {
                Urgency: 'high'
            }
        }
    }

    await admin.messaging(fireApps[app]).send(message)
}

module.exports = {
    initFirebase,
    fireApps,
    pushToFirebase,
};
