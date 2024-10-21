'use strict';

module.exports = {
    async incomingMessage(ctx) {
        console.log(true)
        const { body } = ctx.request;

        try {
            console.log('Incoming message:', body);

            ctx.send({ message: 'Message received' }, 200);
        } catch (error) {
            console.error('Error processing the message', error);
            ctx.throw(500, 'Internal server error');
        }
    }    
}