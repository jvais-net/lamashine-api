'use-strict';

module.exports = {
    processMessage: async (incomingMessage) => {
        console.log('Processing incoming message', incomingMessage);

        const { type, origin, content, from, fingerprint, user } = incomingMessage.data;
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

        const existMessage = await strapi.db.query('api::message.message').findOne({
            where: {
                id_crisp: fingerprint.toString()
            }
        })

        if (existMessage) return;

        await strapi.entityService.create('api::message.message', {
            data: {
                type: type,
                customer: dbUser.id,
                id_crisp: fingerprint.toString(),
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
    const tag = content.match(/#(\w+)/g).join('');

    console.log(tag, userId)

    if (tag) {

        if (!['#tips', '#nextsteps', '#warnings'].includes(tag)) return;

        await strapi.entityService.create('api::memory.memory', {
            data: {
                key: tag.replace('#', ''),
                content: content.replace(tag, ''),
                customer: userId
            }
        })

    }
}