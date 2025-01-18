'use-strict';

require('dotenv').config();

const brevo = require('sib-api-v3-sdk');
const App = require('crisp-api');
const crypto = require('crypto');

const defaultClient = brevo.ApiClient.instance;
const apiKey = defaultClient.authentications['api-key'];

apiKey.apiKey = process.env.BREVO_API_KEY;

const brevoInstance = new brevo.TransactionalEmailsApi();

const generateToken = (email) => {
    const salt = process.env.API_TOKEN_SALT;

    return crypto.createHash('sha256').update(email + salt).digest('hex');
}

const generateOtp = () => {
    return Math.floor(100000 + Math.random() * 900000);
}

module.exports = {
    processEmail: async (email) => {
        try {
            const otp = generateOtp();

            console.log(otp);

            const existingUser = await strapi.db.query('api::otp.otp').findOne({
                where: {
                    email: email
                }
            })

            console.log(existingUser);

            if (existingUser) {
                await strapi.db.query('api::otp.otp').update({
                    where: {
                        email: email
                    },
                    data: {
                        code: otp,
                        isAlreadyUsed: false
                    }
                })

                console.log('updated');
            } else {
                await strapi.entityService.create('api::otp.otp', {
                    data: {
                        email: email,
                        code: otp,
                        isAlreadyUsed: false
                    }
                })

                console.log('created');
            }

            const emailData = new brevo.SendSmtpEmail();

            emailData.to = [{
                email: email
            }];
            emailData.templateId = 3;
            emailData.params = {
                OTP_CODE: otp
            };

            await brevoInstance.sendTransacEmail(emailData);
        } catch (error) {
            console.error(error);
        }
    },

    proccessOtp: async (email, otp) => {
        const existingUser = await strapi.db.query('api::otp.otp').findOne({
            where: {
                email: email
            }
        })

        if (!existingUser) {
            throw new Error('User not found');
        }

        if (existingUser.isAlreadyUsed) {
            throw new Error('OTP already used');
        }

        console.log(existingUser.code, otp);

        if (existingUser.code !== otp) {
            throw new Error('Invalid OTP');
        }

        await strapi.db.query('api::otp.otp').update({
            where: {
                email: email
            },
            data: {
                isAlreadyUsed: true
            }
        })

        return generateToken(email)
    }
};
