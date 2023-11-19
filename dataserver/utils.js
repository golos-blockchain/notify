const SCOPES = [
/*  0 */    'total',
/*  1 */    'feed',
/*  2 */    'delegate_vs',
/*  3 */    'send',
/*  4 */    'mention',
/*  5 */    'new_sponsor',
/*  6 */    'sponsor_inactive',
/*  7 */    'comment_reply',
/*  8 */    'subscriptions',
/*  9 */    'nft_token_sold',
/* 10 */    'message',
/* 11 */    'receive',
/* 12 */    'donate',
/* 13 */    'fill_order',
/* 14 */    'donate_msgs',
/* 15 */    'nft_receive',
/* 16 */    'referral',
/* 17 */    'reserved2',
/* 18 */    'reserved3',
/* 19 */    'reserved4',
/* 20 */    'reserved5',
/* 21 */    'reserved6',
/* 22 */    'reserved7',
/* 23 */    'reserved8',
/* 24 */    'reserved9',
/* 25 */    'reserved10',
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
