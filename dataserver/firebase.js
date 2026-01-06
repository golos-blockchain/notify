const config = require('config')
const admin = require('firebase-admin')

const fireApps = {};

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

module.exports = {
	initFirebase,
	fireApps,
};
