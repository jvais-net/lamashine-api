'use-strict';

module.exports = {
    async processMessage(ctx) {
        try {
            const message = ctx.request.body;


            if (!message) {
                return ctx.badRequest('incomingMessage is required');
            }

            switch (message.event) {
                case 'message:send':
                    await strapi.service('api::crisp.crisp').processMessage(message);
                    break;
                case 'message:received':
                    await strapi.service('api::crisp.crisp').processMessage(message);
                    break;
                case 'message:removed':
                    await strapi.service('api::crisp.crisp').removeMessage(message);
                    break;
                case 'message:updated':
                    await strapi.service('api::crisp.crisp').updateMessage(message);
                    break;
            }

            return ctx.send({ message: 'Message processed' }, 200);
        } catch (err) {
            return ctx.send(err, 500);
        }
    }
}