'use-strict';

module.exports = {
    routes: [
        {
            method: 'POST',
            path: '/crisp/message',
            handler: 'crisp.processMessage',
            config: {
                auth: false
            }
        }
    ]
}