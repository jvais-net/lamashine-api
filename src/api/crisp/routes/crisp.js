'use strict';

module.exports = {
    routes: [
        {
            method: 'POST',
            path: '/crisp/incoming/message',
            handler: 'api::crisp.crisp.incomingMessage',
            config: {
                policies: [],
                middlewares: []
            }
        }
    ]
}