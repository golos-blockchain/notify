const golos = require('golos-lib-js')
const max = require('lodash/max')

const toMiniAccount = (acc, member_type = undefined) => {
    const dates = [
        acc.last_bandwidth_update, // all operations
        acc.created,
    ]
    const macc = {
        name: acc.name,
        json_metadata: acc.json_metadata,
        last_seen: max(dates),
        memo_key: acc.memo_key,
    }
    if (member_type !== undefined) {
        macc.member_type = member_type
    }
    return macc
}

const fillOpMiniAccounts = async (opData, group) => {
    if (opData[0] === 'private_message') {
        const op = opData[1]
        const fillAccount = async () => {
            const fromAcc = await golos.api.getAccountsAsync([op.from])
            if (fromAcc && fromAcc[0]) {
                op.from_account = toMiniAccount(fromAcc[0])
            }
        }
        if (group) {
            let mems = await golos.api.getGroupMembersAsync({
                group,
                start_member: op.from,
                limit: 1,
                accounts: true,
            })
            if (mems && mems[0]) {
                op.from_account = mems[0].account_data
            } else {
                await fillAccount()
            }
        } else {
            await fillAccount()
        }
    }
    return opData
}

module.exports = {
    fillOpMiniAccounts
}
