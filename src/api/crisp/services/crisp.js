'use-strict';

require('dotenv').config();

const brevo = require('sib-api-v3-sdk');
const Crisp = require('crisp-api');

const { v4: uuidv4 } = require('uuid');
const crisp = require('../controllers/crisp');

const defaultClient = brevo.ApiClient.instance;
const apiKey = defaultClient.authentications['api-key'];

apiKey.apiKey = process.env.BREVO_API_KEY;

const CrispClient = new Crisp();

const brevoInstance = new brevo.TransactionalEmailsApi();

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

        const isAuthenticated = (await CrispClient.website.getConversationMetas(process.env.CRISP_WEBSITE_ID, session_id)).segments.includes('authentifié');

        if (from === 'user') {
            const isContentEmail = isEmail(content);

            if (!isContentEmail && !isAuthenticated) {
                try {
                    await CrispClient.website.sendMessageInConversation(process.env.CRISP_WEBSITE_ID, session_id, {
                        type: 'text',
                        content: "Pour continuer la conversation, peux-tu m'indiquer ton adresse e-mail ?",
                        from: "operator",
                        origin: "chat"
                    });
                } catch (error) {
                    console.error('Error sending message in conversation:', error);
                }
            } else if (isContentEmail && !isAuthenticated) {
                try {
                    const peoplesList = await CrispClient.website.listPeopleProfiles(process.env.CRISP_WEBSITE_ID, 1, 'email', null, null, null, content);

                    const customerAccountExists = peoplesList.length > 0 ? peoplesList[0] : null;

                    if (!customerAccountExists) {
                        try {
                            const newProfile = await CrispClient.website.addNewPeopleProfile(process.env.CRISP_WEBSITE_ID, {
                                email: content,
                                person: {
                                    nickname: nickname,
                                }
                            });
                            
                        } catch (error) {
                            console.error('Error adding new people profile:', error);
                        }
                    }

                    const uuid = uuidv4();

                    try {
                        const mailer = new brevo.SendSmtpEmail();
                        mailer.to = [{
                            email: content,
                            name: nickname
                        }];
                        mailer.templateId = 1;
                        mailer.params = {
                            chatlink: `https://chat.lamashine.com?token=${uuid}&email=${encodeURIComponent(content)}`
                        }

                        try {
                            await brevoInstance.sendTransacEmail(mailer);

                            console.log(`Email sent to ${content} with chat link: https://chat.lamashine.com?token=${uuid}&email=${encodeURIComponent(content)}`);
                        } catch (error) {
                            console.error('Error sending email:', error);
                        }

                        await CrispClient.website.sendMessageInConversation(process.env.CRISP_WEBSITE_ID, session_id, {
                            type: 'text',
                            content: "Merci ! Tu vas recevoir un e-mail avec un lien te permettant de continuer la conversation. Pense à vérifier tes spams.",
                            from: "operator",
                            origin: "chat"
                        });

                        await CrispClient.website.removeConversation(process.env.CRISP_WEBSITE_ID, session_id);
                    } catch (error) {
                        console.error('Error creating new conversation or sending email:', error);
                    }
                } catch (error) {
                    console.error('Error processing email content:', error);
                }
            } else if (isAuthenticated) {
                try {
                    const customerExists = await strapi.db.query('api::customer.customer').findOne({
                        where: {
                            id_crisp: user_id
                        }
                    });

                    if (!customerExists) {

                        const email = CrispClient.website.getConversationMetas(process.env.CRISP_WEBSITE_ID, session_id).email;

                        try {
                            await strapi.entityService.create('api::customer.customer', {
                                data: {
                                    id_crisp: user_id,
                                    email: email,
                                    nickname: nickname,
                                    ai_context: 1
                                }
                            });
                        } catch (error) {
                            console.error('Error creating customer:', error);
                        }
                    }

                    const customer = await strapi.db.query('api::customer.customer').findOne({
                        where: {
                            id_crisp: user_id
                        }
                    });

                    if (customer) {

                        if(!customer.email) {
                            const email = CrispClient.website.getConversationMetas(process.env.CRISP_WEBSITE_ID, session_id).email;

                            try {
                                await strapi.entityService.update('api::customer.customer', {
                                    where: {
                                        id_crisp: user_id
                                    },
                                    data: {
                                        email: email
                                    }
                                });
                            } catch (error) {
                                console.error('Error updating customer email:', error);
                            }
                        }

                        try {
                            await strapi.entityService.create('api::message.message', {
                                data: {
                                    type: type,
                                    from: from,
                                    id_customer: customer.id,
                                    content: content,
                                    crisp_fingerprint: fingerprint.toString(),
                                    crisp_session_id: session_id,
                                    origin: origin,
                                }
                            });
                        } catch (error) {
                            console.error('Error creating message:', error);
                        }

                        // @ts-ignore
                        const { OpenAI } = await import('openai');

                        const GPTClient = new OpenAI({
                            apiKey: process.env.GPT_API_KEY
                        });

                        const threadInDb = await strapi.db.query('api::ai-thread.ai-thread').findOne({
                            where: {
                                crisp_session_id: session_id
                            }
                        });

                        console.log("Thread in DB", threadInDb);

                        if (!threadInDb) {
                            try {
                                const thread = await GPTClient.beta.threads.create();

                                if (customer.ai_context) {
                                    console.log("Context exists in customer", customer.ai_context);
                                    const context = await strapi.db.query('api::ai-context.ai-context').findOne({
                                        where: {
                                            id: customer.ai_context
                                        }
                                    });

                                    if (context) {
                                        console.log("Context exists in DB", context);
                                        const assistant = await GPTClient.beta.assistants.create({
                                            model: 'gpt-4',
                                            instructions: context.content,
                                        });

                                        await strapi.entityService.create('api::ai-thread.ai-thread', {
                                            data: {
                                                openai_thread_id: thread.id,
                                                crisp_session_id: session_id,
                                                openai_assistant_id: assistant.id
                                            }
                                        });

                                        await GPTClient.beta.threads.messages.create(thread.id, {
                                            role: 'user',
                                            content: content
                                        });

                                        let run = await GPTClient.beta.threads.runs.create(thread.id, {
                                            assistant_id: assistant.id,
                                        });

                                        while (run.status !== "completed") {
                                            run = await GPTClient.beta.threads.runs.retrieve(thread.id, run.id);
                                        }

                                        const messages = await GPTClient.beta.threads.messages.list(thread.id);
                                        const resMessage = messages.data[0].content[0];

                                        await CrispClient.website.sendMessageInConversation(process.env.CRISP_WEBSITE_ID, session_id, {
                                            type: 'text',
                                            content: resMessage,
                                            from: 'operator',
                                            origin: 'chat'
                                        });
                                    }
                                }
                            } catch (error) {
                                console.error('Error creating thread or assistant:', error);
                            }
                        } else {
                            try {
                                const thread = await GPTClient.beta.threads.retrieve(threadInDb.openai_thread_id);

                                await GPTClient.beta.threads.messages.create(thread.id, {
                                    role: 'user',
                                    content: content
                                });

                                let run = await GPTClient.beta.threads.runs.create(thread.id, {
                                    assistant_id: threadInDb.openai_assistant_id,
                                });

                                while (run.status !== "completed") {
                                    run = await GPTClient.beta.threads.runs.retrieve(thread.id, run.id);
                                }

                                const messages = await GPTClient.beta.threads.messages.list(thread.id);
                                const resMessage = messages.data[0].content[0];

                                await CrispClient.website.sendMessageInConversation(process.env.CRISP_WEBSITE_ID, session_id, {
                                    type: 'text',
                                    content: resMessage,
                                    from: 'operator',
                                    origin: 'chat'
                                });
                            } catch (error) {
                                console.error('Error processing existing thread:', error);
                            }
                        }
                    }
                } catch (error) {
                    console.error('Error processing authenticated message:', error);
                }
            }
        } else {
            if(!isAuthenticated) return;
            try {
                const customer = await strapi.db.query('api::customer.customer').findOne({
                    where: {
                        id_crisp: user_id
                    }
                });

                if (customer) {
                    await strapi.entityService.create('api::message.message', {
                        data: {
                            type: type,
                            from: from,
                            id_customer: customer.id,
                            content: content,
                            crisp_fingerprint: fingerprint.toString(),
                            crisp_session_id: session_id,
                            origin: origin,
                        }
                    });
                }
            } catch (error) {
                console.error('Error processing operator message:', error);
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
                                    model: 'gpt-4',

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
