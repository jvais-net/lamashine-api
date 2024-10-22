'use-strict';

module.exports = {
    routes: [
        {
            method: 'POST',
            path: '/crisp/incoming/message',
            handler: 'crisp.incomingMessage',
            config: {
                auth: false
            }
        }
    ]
}