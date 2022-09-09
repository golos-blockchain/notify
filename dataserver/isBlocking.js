const { api } = require('golos-lib-js')

async function isBlocking(blocker, blocking) {
    const rels = await api.getAccountRelationsAsync({
        my_account: blocker.name,
        with_accounts: [blocking.name],
    })
    if (rels[blocking.name] && rels[blocking.name].blocking) {
        return 1
    }
    if (blocker.do_not_bother && blocking.reputation < 27800000000000) {
        return 2
    }
    return 0
}

module.exports = isBlocking