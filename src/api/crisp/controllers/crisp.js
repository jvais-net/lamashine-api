'use-strict';

module.exports = {
    processMessage: async (ctx) => {
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
    },

    // processReminder: async (ctx) => {
    //     try {
    //         await strapi.service('api::crisp.crisp').processReminder();

    //         return ctx.send({ message: 'Reminder processed' }, 200);
    //     } catch (err) {
    //         return ctx.send(err, 500);
    //     }
    // }
}