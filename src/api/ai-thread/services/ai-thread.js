'use strict';

/**
 * ai-thread service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::ai-thread.ai-thread');
