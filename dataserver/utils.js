let allowedClients = process.env.ALLOWED_CLIENTS || '';
allowedClients = allowedClients.split(' ').filter(el => {
    el = el.trim();
    return el.length !== 0;
});

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
    returnError,
    checkOrigin,
};
