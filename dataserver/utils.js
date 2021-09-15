const SCOPES = [
/*  0 */    'total',
/*  1 */    'feed', // not used
/*  2 */    'reward', // not used
/*  3 */    'send',
/*  4 */    'mention',
/*  5 */    'follow', // not used
/*  6 */    'vote', // not used
/*  7 */    'comment_reply',
/*  8 */    'post_reply', // not used, use comment_reply
/*  9 */    'account_update', // not used
/* 10 */    'message',
/* 11 */    'receive',
/* 12 */    'donate',
];

const returnError = (ctx, error) => {
    ctx.status = 400;
    ctx.body = {status: 'err', error: error};
};

const sleep = (msecs) => {
    return new Promise((resolve) => setTimeout(resolve, msecs));
};

module.exports = {
    SCOPES,
    returnError,
    sleep,
};
