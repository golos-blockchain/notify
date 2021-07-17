let allowedClients = process.env.ALLOWED_CLIENTS || '';
allowedClients = allowedClients.split(' ').filter(el => {
    el = el.trim();
    return el.length !== 0;
});

const NTYPES = [
/*  0 */    'total',
/*  1 */    'feed',
/*  2 */    'reward',
/*  3 */    'send',
/*  4 */    'mention',
/*  5 */    'follow',
/*  6 */    'vote',
/*  7 */    'comment_reply',
/*  8 */    'post_reply',
/*  9 */    'account_update',
/* 10 */    'message',
/* 11 */    'receive',
/* 12 */    'donate',
];

const returnError = (ctx, error) => {
    ctx.body = {status: 'err', error: error};
};

const checkOrigin = (ctx) => {
    if (!allowedClients.length) {
        console.error(`ALLOWED_CLIENTS not set, service is unavailable`);

        return `ALLOWED_CLIENTS not set, service is unavailable`;
    }
    let origin = ctx.get('origin');
    if (!origin) {
        console.warn(`Request without origin! User-Agent: ${ctx.get('user-agent')}`);

        return 'Origin header required';
    }
    let originHost = null;
    try {
        originHost = new URL(origin);
    } catch (err) {
        console.warn(`Wrong origin! User-Agent: ${ctx.get('user-agent')}, Origin: ${origin}`);

        return 'Origin cannot be parsed: ' + origin;
    }
    originHost = originHost.hostname;
    if (!originHost) {
        console.warn(`Wrong origin! User-Agent: ${ctx.get('user-agent')}, Origin: ${origin}`);

        return 'Origin is wrong: ' + origin;
    }
    if (!allowedClients.includes(originHost))  {
        console.error(`Origin forbidden, Origin: ${originHost}, Allowed: ${JSON.stringify(allowedClients)}, User-Agent: ${ctx.get('user-agent')}`)

        return 'Notify service doesn\'t trust your client and not allows your Origin to use service';
    }
    return null;
};

module.exports = {
    NTYPES,
    returnError,
    checkOrigin,
};
