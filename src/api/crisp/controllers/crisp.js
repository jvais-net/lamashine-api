'use-strict';

module.exports = {
    async incomingMessage(ctx) {
        try {
            const incomingMessage = ctx.request.body;

            if(!incomingMessage) {
                return ctx.badRequest('incomingMessage is required');
            }

            await strapi.service('api::crisp.crisp').processIncomingMessage(incomingMessage);

            return ctx.send({ message: 'Message processed' }, 200);
        } catch(err) {
            return ctx.send({ error: 'An error occurred' }, 500);
        }
    }
}