'use-strict';

require('dotenv').config();

const brevo = require('sib-api-v3-sdk');

const defaultClient = brevo.ApiClient.instance;
const apiKey = defaultClient.authentications['api-key'];

apiKey.apiKey = process.env.BREVO_API_KEY;

const Mailer = new brevo.EmailCampaignsApi();

const isEmail = (email) => new RegExp(/^[^\s@]+@[^\s@]+\.[^\s@]+$/).test(email);
const sendMessage = async (message, session_id) => {
    const messageReq = await fetch(`https://api.crisp.chat/v1/website/${process.env.CRISP_WEBSITE_ID}/conversation/${session_id}/message`, {
        method: 'POST',
        headers: {
            "Autorization": `Basic ${process.env.CRISP_IDENTIFIER}:${process.env.CRISP_KEY}`,
            "X-Crisp-Tier": "plugin"
        },
        body: JSON.stringify({
            type: 'text',
            from: 'operator',
            origin: 'chat',
            content: message
        })
    });

    console.log(`Message sent and get status code: ${messageReq.status} with message ${messageReq.statusText}`);
}

module.exports = {
    processMessage: async (incomingMessage) => {
        try {
            console.log('Processing incoming message', incomingMessage);

            const { type, origin, content, from, fingerprint, session_id, user } = incomingMessage.data;
            const { nickname, user_id } = user;

            if (from === 'user') {
                const isContentEmail = isEmail(content);

                if (!isContentEmail) {
                    await sendMessage("Veuillez renseigner votre adresse email pour continuer la conversation.", session_id);
                } else if (isContentEmail) {
                    const customerAccountExists = await fetch(`https://api.crisp.chat/v1/website/${process.env.CRISP_WEBSITE_ID}/people/profile/${content}`, {
                        method: 'GET'
                    })

                    if (customerAccountExists.status === 200) {
                        await sendMessage("Votre compte a bien été trouvé. Comment puis-je vous aider ?", session_id);
                    } else {
                        await sendMessage("Votre compte n'a pas été trouvé. Création en cours", session_id);
                    }
                }
            }


        } catch (error) {
            console.error('Error processing incoming message:', error);
        }
    },

    removeMessage: async (incomingMessage) => {
        console.log('Processing removed message', incomingMessage);

        const { session_id } = incomingMessage.data;

        // @ts-ignore
        await strapi.entityService.delete('api::message.message', {
            where: {
                id_crisp: session_id
            }
        })
    },

    updateMessage: async (incomingMessage) => {
        console.log('Processing updated message', incomingMessage);

        const { session_id, content } = incomingMessage.data;

        // @ts-ignore
        await strapi.entityService.update('api::message.message', {
            where: {
                id_crisp: session_id
            },
            data: {
                content: content
            }
        })
    },

    processReminder: async () => {
        try {
            const customers = await strapi.db.query('api::customer.customer').find();

            for (const customer of customers) {
                const customerId = customer.id;

                const messages = await strapi.entityService.findMany('api::message.message', {
                    filters: {
                        id_customer: customerId,
                        from: 'user'
                    },
                    sort: { createdAt: 'desc' },
                    fields: ['createdAt'],
                    populate: { customer: true }
                });

                if (messages.length > 0) {
                    const lastMessage = messages[0];
                    const lastMessageDate = new Date(lastMessage.createdAt);
                    const currentDate = new Date();

                    const differenceInTime = currentDate.getTime() - lastMessageDate.getTime();
                    const differenceInDays = differenceInTime / (1000 * 3600 * 24);

                    if (differenceInDays >= 3) {
                        // @ts-ignore
                        const { OpenAI } = await import('openai');

                        const GPTClient = new OpenAI({
                            apiKey: process.env.GPT_API_KEY
                        });

                        const conversationExists = (await fetch(`https://api.crisp.chat/v1/website/${process.env.CRISP_WEBSITE_ID}/conversation/${lastMessage.conversation_id}`, {
                            headers: {
                                "Autorization": `Basic ${process.env.CRISP_IDENTIFIER}:${process.env.CRISP_KEY}`,
                                "X-Crisp-Tier": "plugin"
                            }
                        }
                        )).status === 200;

                        if (conversationExists) {

                            const nextstep = await strapi.db.query('memory.memory').findOne({
                                where: {
                                    key: 'nextsteps',
                                    id_customer: customerId
                                },

                                orderBy: {
                                    createdAt: 'desc'
                                }
                            });

                            if (nextstep) {
                                const response = (await GPTClient.chat.completions.create({
                                    messages: [
                                        { role: 'user', content: `Écris un SMS simple, sans mention de noms, pour relancer un client et lui demander s'il a appliqué nos instructions : "${nextstep.content}"` }
                                    ],
                                    model: 'gpt-4'
                                })).choices[0].message.content;

                                try {
                                    await fetch(`https://api.crisp.chat/v1/website/${process.env.CRISP_WEBSITE_ID}/conversation/${lastMessage.conversation_id}/message`, {
                                        method: 'POST',
                                        headers: {
                                            "Content-Type": "application/json",
                                            "Authorization": `Basic ${process.env.CRISP_IDENTIFIER}:${process.env.CRISP_KEY}`,
                                            "X-Crisp-Tier": "plugin"
                                        },
                                        body: JSON.stringify({
                                            type: 'text',
                                            from: 'operator',
                                            origin: 'chat',
                                            content: response
                                        })
                                    })
                                } catch (error) {
                                    console.error('Error sending message:', error);
                                }
                            } else {
                                try {
                                    await fetch(`https://api.crisp.chat/v1/website/${process.env.CRISP_WEBSITE_ID}/conversation/${lastMessage.conversation_id}/message`, {
                                        method: 'POST',
                                        headers: {
                                            "Content-Type": "application/json",
                                            "Authorization": `Basic ${process.env.CRISP_IDENTIFIER}:${process.env.CRISP_KEY}`,
                                            "X-Crisp-Tier": "plugin"
                                        },
                                        body: JSON.stringify({
                                            type: 'text',
                                            from: 'operator',
                                            origin: 'chat',
                                            content: "Bonjour ! Je voulais savoir si vous aviez eu le temps d'avancer sur notre projet. N'hésitez pas à me dire si vous avez besoin de quoi que ce soit. Bonne journée !"
                                        })
                                    })
                                } catch (error) {
                                    console.error('Error sending message:', error);
                                }
                            }
                        }
                    }
                }
            }
        } catch (error) {
            console.log(error);
        }
    },
};