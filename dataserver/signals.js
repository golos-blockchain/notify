let signals = {};

function signal_create(id) {
    if (signals[id]) {
        return false;
    }
    signals[id] = true;
    return true;
}

function signal_fire(id) {
    delete signals[id];
}

function signal_check(id) {
    return !!signals[id];
}

module.exports = {
    signal_create, signal_fire, signal_check,
};
