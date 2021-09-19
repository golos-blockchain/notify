const { validateAccountName } = require('golos-lib-js/lib/utils');

function GOLOS_CHECK_PARAM_ACCOUNT(op, field) {
    const res = validateAccountName(op[field]);
    if (res.msg) {
        throw new Error(`Account name ${field} is invalid - ` + res.msg);
    }
}

function GOLOS_CHECK_VALUE(cond, msg) {
    if (!cond) {
        throw new Error(msg);
    }
}

module.exports = {
    GOLOS_CHECK_VALUE,
    GOLOS_CHECK_PARAM_ACCOUNT,
}
