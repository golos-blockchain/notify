module.exports =function errorHandler() {
    return async function (ctx, next) {
        if (parseInt(ctx.status) == 404) {
            ctx.body = {
                status: 'err',
                error: 'Not Found',
            };
        }
        else if (parseInt(ctx.status) == 405) {
            ctx.body = {
                status: 'err',
                error: 'Method Not Allowed',
            };
        }
        else if (parseInt(ctx.status) == 500) {
            ctx.body = {
                status: 'err',
                error: 'Internal Server Error',
            };
        }

        await next();
    };
}
