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
        },
        {
            method: 'GET',
            path: '/crisp/reminder',
            handler: 'crisp.processReminder',
            config: {
                auth: false
            }
        }
    ]
}