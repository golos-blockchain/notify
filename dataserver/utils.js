const SCOPES = [
/*  0 */    'total',
/*  1 */    'feed',
/*  2 */    'delegate_vs', // not used
/*  3 */    'send',
/*  4 */    'mention',
/*  5 */    'follow', // not used
/*  6 */    'vote', // not used
/*  7 */    'comment_reply',
/*  8 */    'subscriptions',
/*  9 */    'account_update', // not used
/* 10 */    'message',
/* 11 */    'receive',
/* 12 */    'donate',
/* 13 */    'fill_order',
/* 14 */    'donate_msgs',
];

const returnError = (ctx, error) => {
    ctx.status = 400;
    ctx.body = {status: 'err', error: error};
    return error
};

const sleep = (msecs) => {
    return new Promise((resolve) => setTimeout(resolve, msecs));
};

module.exports = {
    SCOPES,
    returnError,
    sleep,
};
