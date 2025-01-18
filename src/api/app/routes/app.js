'use-strict';

module.exports = {
    routes: [
        {
            method: 'POST',
            path: '/auth/email',
            handler: 'app.processEmail',
            config: {
                auth: false
            }
        },
        {
            method: 'POST',
            path: '/auth/otp',
            handler: 'app.processOtp',
            config: {
                auth: false
            }
        }
    ]
}