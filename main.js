/**
 * IQ Option Trading Bot - Main Entry Point
 * Production Ready
 */

require('dotenv').config();

const logger = require('./src/utils/logger');
const config = require('./src/config/config');

class TradingBotMain {
    constructor() {
        this.logger = logger;
        this.config = config;
    }

    async initialize() {
        // Debug: Check if .env is loaded
        console.log('DEBUG - EMAIL from env:', process.env.IQ_OPTION_EMAIL || 'NOT LOADED');
        console.log('DEBUG - Config EMAIL:', config.IQ_OPTION_EMAIL || 'NOT IN CONFIG');
        
        this.logger.info('========================================');
        this.logger.info('  IQ Option Trading Bot Starting...');
        this.logger.info('========================================');

        try {
            // Initialize News Filter
            this.logger.info('[1/4] Initializing News Filter...');
            const newsFilter = require('./src/filters/newsFilter');
            await newsFilter.initialize();
            const newsStatus = newsFilter.getStatus();
            this.logger.info('News Filter Status:', newsStatus);

            // Validate Configuration
            this.logger.info('[2/4] Validating Configuration...');
            this.logger.debug('Config values:', { 
                email: config.IQ_OPTION_EMAIL ? 'set' : 'missing', 
                password: config.IQ_OPTION_PASSWORD ? 'set' : 'missing',
                pairs: config.TRADING_PAIRS
            });
            if (!config.IQ_OPTION_EMAIL || !config.IQ_OPTION_PASSWORD) {
                throw new Error('Missing IQ Option credentials. Please check .env file');
            }
            this.logger.info('Configuration validated');

            // Initialize Trading Bot
            this.logger.info('[3/4] Initializing Trading Bot...');
            const bot = require('./src/core/bot');
            this.bot = bot;
            await this.bot.initialize({
                email: config.IQ_OPTION_EMAIL,
                password: config.IQ_OPTION_PASSWORD,
                accountType: config.ACCOUNT_TYPE
            });
            this.logger.info('Trading Bot initialized');

            // Start Trading
            this.logger.info('[4/4] Starting Trading...');
            this.logger.info('========================================');
            this.logger.info('  BOT IS RUNNING');
            this.logger.info('========================================');
            this.logger.info('Pairs:', config.TRADING_PAIRS);
            this.logger.info('Timeframe:', config.TIMEFRAME);
            this.logger.info('News Mode:', newsStatus.mode);
            this.logger.info('Press Ctrl+C to stop');
            this.logger.info('========================================');

            await this.bot.start();

        } catch (error) {
            this.logger.error('Fatal error starting bot:', error);
            process.exit(1);
        }
    }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    logger.info('\n========================================');
    logger.info('  Shutting down gracefully...');
    logger.info('========================================');
    process.exit(0);
});

process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// Start the bot
const main = new TradingBotMain();
main.initialize();
