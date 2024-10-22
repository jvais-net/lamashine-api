'use-strict';

const customer = require("../../customer/controllers/customer");

module.exports = {
    processMessage: async (incomingMessage) => {
        console.log('Processing incoming message', incomingMessage);

        const { type, origin, content, from, timestamp, user } = incomingMessage.data;
        const { nickname, user_id } = user;

        const userExist = await strapi.db.query('api::customer.customer').findOne({
            where: {
                id_crisp: user_id
            }
        })

        if (!userExist) {
            await strapi.entityService.create('api::customer.customer', {
                data: {
                    id_crisp: user_id,
                    nickname: nickname
                }
            })
        }

        const dbUser = await strapi.db.query('api::customer.customer').findOne({
            where: {
                id_crisp: user_id,
            }
        })

        await strapi.entityService.create('api::message.message', {
            data: {
                type: type,
                customer: dbUser.id,
                from: from,
                origin: origin,
                content: content,
            }
        })

        await checkForTags(content, dbUser.id)
    },

    removeMessage: async (incomingMessage) => {
        console.log('Processing removed message', incomingMessage);

        const { session_id } = incomingMessage.data;

        await strapi.entityService.delete('api::message.message', {
            where: {
                id_crisp: session_id
            }
        })
    },

    updateMessage: async (incomingMessage) => {
        console.log('Processing updated message', incomingMessage);

        const { session_id, content } = incomingMessage.data;

        await strapi.entityService.update('api::message.message', {
            where: {
                id_crisp: session_id
            },
            data: {
                content: content
            }
        })
    }
}

const checkForTags = async (content, userId) => {
    const tag = content.match(/#(\w+)/g);

    if (tag) {

        if (!['tips', 'nextsteps', 'warnings'].includes(tag)) return;

        const tagExist = await strapi.db.query('api::memory.memory').findOne({
            where: {
                customer: userId
            }
        })

        if (!tagExist) {
            await strapi.entityService.create('api::memory.memory', {
                data: {
                    key: tag,
                    content: content.replace(tag, ''),
                    customer: userId
                }
            })
        } else {
            await strapi.entityService.update('api::memory.memory', {
                where: {
                    key: tag,
                    customer: userId
                },
                data: {
                    content: content.replace(tag, '')
                }
            })
        }
    }
}