'use-strict';

module.exports = {
    processEmail: async (ctx) => {
        try {
            const message = ctx.request.body;


            if (!message) {
                return ctx.badRequest('incomingMessage is required');
            }

            if(!message.email) {
                return ctx.badRequest('email is required');
            }

            await strapi.service('api::app.app').processEmail(message.email);

            return ctx.send({ message: 'email processed' }, 200);
        } catch (err) {
            console.log(err);
            return ctx.send(err, 500);
        }
    },

    processOtp: async (ctx) => {
        try {
            const message = ctx.request.body;

            if (!message) {
                return ctx.badRequest('incomingMessage is required');
            }

            if(!message.otp || !message.email) {
                return ctx.badRequest('otp and email are required');
            }

            const token = await strapi.service('api::app.app').proccessOtp(message.email, message.otp);

            return ctx.send({ message: 'Reminder processed', token }, 200);
        } catch (err) {
            console.log(err);
            return ctx.send(err, 500);
        }
    }
}