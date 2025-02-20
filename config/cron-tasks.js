const Crisp = require("crisp-api");

module.exports = {
    morningMessage: {
        task: async ({ strapi }) => {
            const reminderMessage = await strapi.db.query('api::option.option').findOne({
                where: {
                    key: 'morningMessage'
                }
            })
    
            if (!reminderMessage) return console.error('Morning message not found');
    
            const customers = await strapi.db.query('api::customer.customer').find();
    
            for (const customer of customers) {
                if (customer.id_crisp) {
    
                    const CrispClient = new Crisp();
                    
                    CrispClient.authenticateTier("plugin", process.env.CRISP_IDENTIFIER, process.env.CRISP_KEY);
    
                    try {
                        await CrispClient.website.sendMessageInConversation(process.env.CRISP_WEBSITE_ID, customer.id_crisp, {
                            type: 'text',
                            content: reminderMessage.value,
                            from: 'operator',
                            origin: 'chat'
                        });
                    } catch (error) {
                        console.error('Error sending reminder message:', error);
                    }
                }
            }
        },
        options: {
            rule: "0 30 8 * * *",
            tz: "Europe/Paris"
        }
    },
    eveningMessage: {
        task: async ({ strapi }) => {
            const reminderMessage = await strapi.db.query('api::option.option').findOne({
                where: {
                    key: 'eveningMessage'
                }
            })
    
            if (!reminderMessage) return console.error('Evening message not found');
    
            const customers = await strapi.db.query('api::customer.customer').find();
    
            for (const customer of customers) {
                if (customer.id_crisp) {
    
                    const CrispClient = new Crisp();
                    
                    CrispClient.authenticateTier("plugin", process.env.CRISP_IDENTIFIER, process.env.CRISP_KEY);
    
                    try {
                        await CrispClient.website.sendMessageInConversation(process.env.CRISP_WEBSITE_ID, customer.id_crisp, {
                            type: 'text',
                            content: reminderMessage.value,
                            from: 'operator',
                            origin: 'chat'
                        });
                    } catch (error) {
                        console.error('Error sending reminder message:', error);
                    }
                }
            }
        },
        options: {
            rule: "0 30 18 * * *",
            tz: "Europe/Paris"
        }
    }
}