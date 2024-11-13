'use-strict';

require('dotenv').config();

const brevo = require('sib-api-v3-sdk');

const defaultClient = brevo.ApiClient.instance;
const apiKey = defaultClient.authentications['api-key'];

apiKey.apiKey = process.env.BREVO_API_KEY;

const Mailer = new brevo.EmailCampaignsApi();

module.exports = {
    processMessage: async (incomingMessage) => {
        try {
            console.log('Processing incoming message', incomingMessage);

            const { type, origin, content, from, fingerprint, session_id, user } = incomingMessage.data;
            const { nickname, user_id } = user;

            // Vérifier que les champs requis sont présents
            if (!user_id || !nickname) {
                console.error('User ID or nickname is missing');
                return;
            }

            // Vérifier si le client existe déjà
            let dbUser = await strapi.db.query('api::customer.customer').findOne({
                where: {
                    id_crisp: user_id
                }
            });

            // Si le client n'existe pas, le créer
            if (!dbUser && !String(user_id).startsWith('session')) {
                dbUser = await strapi.entityService.create('api::customer.customer', {
                    data: {
                        id_crisp: user_id,
                        nickname: nickname
                    }
                });
            } else if (String(user_id).startsWith('session') && !String(user_id).match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
                fetch(`https://api.crisp.chat/v1/website/${process.env.CRISP_WEBSITE_ID}/conversation/${session_id}/message`, {
                    method: 'POST',
                    headers: {
                        "Autorization": `Basic ${process.env.CRISP_IDENTIFIER}:${process.env.CRISP_KEY}`,
                        "X-Crisp-Tier": "plugin"
                    },
                    body: JSON.stringify({
                        type: 'text',
                        from: 'operator',
                        origin: 'chat',
                        content: "Veuillez renseigner votre adresse email pour continuer la conversation."
                    })
                })
            } else if (String(user_id).startsWith('session') && String(user_id).match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
                const customerAccountExists = await fetch(`https://api.crisp.chat/v1/website/${process.env.CRISP_WEBSITE_ID}/people/profile/${content}`, {
                    method: 'GET'
                })

                if (customerAccountExists.status === 200) {

                    const newConversation = await fetch(`https://api.crisp.chat/v1/website/${process.env.CRISP_WEBSITE_ID}/conversation`, {
                        method: 'POST',
                        headers: {
                            "Autorization": `Basic ${process.env.CRISP_IDENTIFIER}:${process.env.CRISP_KEY}`,
                            "X-Crisp-Tier": "plugin"
                        }
                    })

                    if (newConversation.status === 201) {
                        const MailCampaign = new brevo.CreateEmailCampaign();
                        const conversationId = (await newConversation.json()).data.session_id;

                        const email = content;

                        MailCampaign.name = "LaMashine";
                        MailCampaign.subject = "LaMashine - Discussion";
                        MailCampaign.sender = {
                            "name": "LaMashine",
                            "email": "chat@lamashine.com"
                        }
                        MailCampaign.type = "classic";
                        MailCampaign.htmlContent = `<p>Bonjour, <br>Vous avez commencé une discussion avec nous sur notre site. Pour continuer la discussion, veuillez cliquer sur le lien suivant : <a href="https://chat.lamashine.com?crisp_sid=${conversationId}">Continuer la discussion</a></p>`;

                        MailCampaign.recipients = [{
                            "email": email
                        }];

                        try {
                            const response = await Mailer.createEmailCampaign(MailCampaign);
                            console.log(response);
                        } catch (error) {
                            console.error('Error sending email:', error);
                        }
                    }

                } else {
                    const customerAccountCreated = await fetch(`https://api.crisp.chat/v1/website/${process.env.CRISP_WEBSITE_ID}/people/profile`, {
                        method: 'POST',
                        headers: {
                            "Autorization": `Basic ${process.env.CRISP_IDENTIFIER}:${process.env.CRISP_KEY}`,
                            "X-Crisp-Tier": "plugin"
                        },
                        body: JSON.stringify({
                            email: content,
                            nickname: nickname
                        })
                    })

                    if (customerAccountCreated.status === 200) {
                        const newConversation = await fetch(`https://api.crisp.chat/v1/website/${process.env.CRISP_WEBSITE_ID}/conversation`, {
                            method: 'POST',
                            headers: {
                                "Autorization": `Basic ${process.env.CRISP_IDENTIFIER}:${process.env.CRISP_KEY}`,
                                "X-Crisp-Tier": "plugin"
                            }
                        })

                        if (newConversation.status === 201) {
                            const MailCampaign = new brevo.CreateEmailCampaign();
                            const conversationId = (await newConversation.json()).data.session_id;

                            const email = content;

                            MailCampaign.name = "LaMashine";
                            MailCampaign.subject = "LaMashine - Discussion";
                            MailCampaign.sender = {
                                "name": "LaMashine",
                                "email": "chat@lamashine.com"
                            }
                            MailCampaign.type = "classic";
                            MailCampaign.htmlContent = `<p>Bonjour, <br>Vous avez commencé une discussion avec nous sur notre site. Pour continuer la discussion, veuillez cliquer sur le lien suivant : <a href="https://chat.lamashine.com?crisp_sid=${conversationId}">Continuer la discussion</a></p>`;

                            MailCampaign.recipients = [{
                                "email": email
                            }];

                            try {
                                const response = await Mailer.createEmailCampaign(MailCampaign);
                                console.log(response);
                            } catch (error) {
                                console.error('Error sending email:', error);
                            }
                        }
                    }
                }
            }

            // Vérifier si le message existe déjà
            const existMessage = await strapi.db.query('api::message.message').findOne({
                where: {
                    crisp_fingerprint: fingerprint.toString()
                }
            });

            if (existMessage) return;

            // Créer le message
            await strapi.entityService.create('api::message.message', {
                data: {
                    type: type,
                    id_customer: dbUser.id ?? user_id,
                    crisp_fingerprint: fingerprint.toString(),
                    crisp_session_id: session_id,
                    from: from,
                    origin: origin,
                    content: content,
                }
            });

            // Extraire le tag du contenu du message
            const matches = content.match(/#(\w+)/g);
            const tag = matches ? matches.join('') : null;

            if (tag) {
                if (['#tips', '#nextsteps', '#warnings'].includes(tag)) {

                    // @ts-ignore
                    const { OpenAI } = await import('openai');

                    const GPTClient = new OpenAI({
                        apiKey: process.env.GPT_API_KEY
                    });

                    const response = (await GPTClient.chat.completions.create({
                        messages: [
                            { role: 'user', content: `Résume ça d'une manière simple à comprendre, courte et précise : ${content.replace(tag, '')}` }
                        ],
                        model: 'gpt-4'
                    })).choices[0].message.content;

                    await strapi.entityService.create('api::memory.memory', {
                        data: {
                            key: tag.replace('#', ''),
                            content: response,
                            id_customer: dbUser.id ?? user_id
                        }
                    });
                }
            }
        } catch (error) {
            console.error('Error processing message:', error);
            // Vous pouvez également renvoyer une réponse d'erreur appropriée si nécessaire
            throw error;
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
    }
};