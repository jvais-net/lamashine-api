'use-strict';

require('dotenv').config();

const brevo = require('sib-api-v3-sdk');
const Crisp = require('crisp-api');

const defaultClient = brevo.ApiClient.instance;
const apiKey = defaultClient.authentications['api-key'];

apiKey.apiKey = process.env.BREVO_API_KEY;

const CrispClient = new Crisp();
const brevoInstance = new brevo.TransactionalEmailsApi();

const Mailer = new brevo.SendSmtpEmail();

CrispClient.authenticateTier("plugin", process.env.CRISP_IDENTIFIER, process.env.CRISP_KEY);

const isEmail = (email) => new RegExp(/^[^\s@]+@[^\s@]+\.[^\s@]+$/).test(email);

module.exports = {
    processMessage: async (incomingMessage) => {
        console.log('Processing incoming message', incomingMessage);

        const { type, origin, content, from, fingerprint, session_id, user } = incomingMessage.data;
        const { nickname, user_id } = user;

        if (!user_id || !nickname) {
            console.error('User ID or nickname is missing');
            return;
        }

        if (from === 'user') {
            const isContentEmail = isEmail(content);

            if (!isContentEmail) {
                try {
                    await CrispClient.website.sendMessageInConversation(process.env.CRISP_WEBSITE_ID, session_id, {
                        type: 'text',
                        content: "Veuillez renseigner votre adresse email pour continuer la conversation.",
                        from: "operator",
                        origin: "chat"
                    });
                } catch (error) {
                    console.error('Error sending message in conversation:', error);
                }
            } else if (isContentEmail) {
                try {
                    const customerAccountExists = await CrispClient.website.checkPeopleProfileExists(process.env.CRISP_WEBSITE_ID, content);

                    if (customerAccountExists.status !== 200) {
                        try {
                            const newProfile = await CrispClient.website.addNewPeopleProfile(process.env.CRISP_WEBSITE_ID, {
                                email: content,
                                person: {
                                    nickname: nickname,
                                }
                            });

                            await strapi.entityService.create('api::customer.customer', {
                                id_crisp: newProfile.people_id,
                                email: content,
                                nickname: nickname
                            });
                        } catch (error) {
                            console.error('Error adding new people profile:', error);
                        }
                    } else {
                        try {
                            const customerInDb = await strapi.entityService.findOne('api::customer.customer', {
                                id_crisp: customerAccountExists.data.people_id
                            });

                            if (!customerInDb) {
                                await strapi.entityService.create('api::customer.customer', {
                                    id_crisp: customerAccountExists.data.people_id,
                                    email: content,
                                    nickname: nickname
                                });
                            }
                        } catch (error) {
                            console.error('Error finding customer in database:', error);
                        }
                    }

                    try {
                        console.log('Creating new conversation');
                        const newConversation = await CrispClient.website.createNewConversation(process.env.CRISP_WEBSITE_ID);

                        console.log('Adding participants to conversation');
                        await CrispClient.website.saveConversationParticipants(process.env.CRISP_WEBSITE_ID, newConversation.session_id, {
                            participants: [
                                {
                                    type: 'email',
                                    target: content
                                }
                            ]
                        });

                        //envoie mail brevo avec template
                        await brevoInstance.sendTransacEmail({
                            to: [{
                                email: content,
                                name: nickname
                            }],
                            templateId: 1,
                            params: {
                                chatlink: `https://chat.lamashine.com?crisp_sid=${newConversation.id}`
                            }
                        });

                        await CrispClient.website.sendMessageInConversation(process.env.CRISP_WEBSITE_ID, session_id, {
                            type: 'text',
                            content: "Un email vous a été envoyé pour continuer la conversation.",
                            from: "operator",
                            origin: "chat"
                        });
                    } catch (error) {
                        console.error('Error creating new conversation or sending email:', error);
                    }
                } catch (error) {
                    console.error('Error processing email content:', error);
                }
            }
        }
    },

    removeMessage: async (incomingMessage) => {
        console.log('Processing removed message', incomingMessage);

        const { session_id } = incomingMessage.data;

        try {
            await strapi.entityService.delete('api::message.message', {
                where: {
                    id_crisp: session_id
                }
            });
        } catch (error) {
            console.error('Error removing message:', error);
        }
    },

    updateMessage: async (incomingMessage) => {
        console.log('Processing updated message', incomingMessage);

        const { session_id, content } = incomingMessage.data;

        try {
            await strapi.entityService.update('api::message.message', {
                where: {
                    id_crisp: session_id
                },
                data: {
                    content: content
                }
            });
        } catch (error) {
            console.error('Error updating message:', error);
        }
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
                                "Authorization": `Basic ${process.env.CRISP_IDENTIFIER}:${process.env.CRISP_KEY}`,
                                "X-Crisp-Tier": "plugin"
                            }
                        })).status === 200;

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
                                    });
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
                                    });
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
