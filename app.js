require('dotenv').config();
const tradingBot = require('./src/core/bot');
const logger = require('./src/utils/logger');
const cliInput = require('./src/utils/cliInput');

// Global error handlers
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection', { reason, promise });
    process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', async () => {
    logger.info('Received SIGINT, shutting down gracefully...');
    await shutdown();
});

process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, shutting down gracefully...');
    await shutdown();
});

async function shutdown() {
    try {
        if (tradingBot.isRunning) {
            await tradingBot.stop();
        }
        logger.info('Application shutdown complete');
        process.exit(0);
    } catch (error) {
        logger.error('Error during shutdown', error);
        process.exit(1);
    }
}

// CLI commands
async function handleCommand(command, args) {
    try {
        switch (command) {
            case 'start':
                await startBot();
                break;
            case 'stop':
                await stopBot();
                break;
            case 'status':
                await showStatus();
                break;
            case 'test':
                await testBot();
                break;
            case 'config':
                await showConfig();
                break;
            case 'pairs':
                await showPairs();
                break;
            case 'help':
                showHelp();
                break;
            default:
                logger.error(`Unknown command: ${command}`);
                showHelp();
        }
    } catch (error) {
        logger.error(`Command execution failed: ${command}`, error);
    }
}

async function startBot() {
    try {
        logger.info('Starting IQ Option Trading Bot...');
        
        // Get user credentials via CLI
        const credentials = await cliInput.getUserCredentials();
        
        if (!credentials.email || !credentials.password) {
            logger.error('Email and password are required');
            console.log('❌ Email and password are required');
            return;
        }
        
        // Initialize bot with user credentials
        const initialized = await tradingBot.initialize(credentials);
        if (!initialized) {
            logger.error('Bot initialization failed');
            console.log('❌ Bot initialization failed - check your credentials');
            return;
        }
        
        // Close CLI input after initialization
        cliInput.close();
        
        // Start bot
        const started = await tradingBot.start();
        if (started) {
            logger.info('Bot started successfully!');
            logger.info('Press Ctrl+C to stop the bot');
            console.log('✅ Bot started successfully!');
            console.log('Press Ctrl+C to stop');
        } else {
            logger.error('Bot start failed');
            console.log('❌ Bot start failed');
        }
    } catch (error) {
        logger.error('Bot start error', error);
        console.log('❌ Bot start error:', error.message);
        cliInput.close();
    }
}

async function stopBot() {
    try {
        logger.info('Stopping bot...');
        const stopped = await tradingBot.stop();
        if (stopped) {
            logger.info('Bot stopped successfully');
        } else {
            logger.warn('Bot was not running');
        }
    } catch (error) {
        logger.error('Bot stop error', error);
    }
}

async function showStatus() {
    try {
        const status = tradingBot.getBotStatus();
        if (!status) {
            logger.error('Unable to get bot status');
            return;
        }
        
        console.log('\n=== BOT STATUS ===');
        console.log(`Running: ${status.isRunning ? 'YES' : 'NO'}`);
        console.log(`Version: ${status.version}`);
        console.log(`Start Time: ${status.startTime || 'N/A'}`);
        console.log(`Last Analysis: ${status.lastAnalysisTime || 'N/A'}`);
        console.log(`Total Analyses: ${status.stats.totalAnalyses}`);
        console.log(`Total Trades: ${status.stats.totalTrades}`);
        console.log(`Pairs Traded: ${status.stats.pairsTraded.size}`);
        console.log(`Active Pairs: ${status.activePairs}`);
        
        if (status.riskMetrics) {
            console.log('\n=== RISK METRICS ===');
            console.log(`Current Balance: $${status.riskMetrics.currentBalance}`);
            console.log(`Daily Profit: $${status.riskMetrics.netProfit}`);
            console.log(`Win Rate: ${status.riskMetrics.winRate}%`);
            console.log(`Risk Level: ${status.riskMetrics.riskLevel}`);
        }
        
        if (status.executionStats) {
            console.log('\n=== EXECUTION STATS ===');
            console.log(`Active Orders: ${status.executionStats.activeOrders}`);
            console.log(`Completed Orders: ${status.executionStats.completedOrders}`);
            console.log(`Total Profit: $${status.executionStats.totalProfit}`);
        }
        
        console.log('\n');
    } catch (error) {
        logger.error('Status display error', error);
    }
}

async function testBot() {
    try {
        logger.info('Running bot test...');
        
        // Get user credentials via CLI
        const credentials = await cliInput.getUserCredentials();
        
        if (!credentials.email || !credentials.password) {
            logger.error('Email and password are required');
            console.log('❌ Email and password are required');
            return;
        }
        
        // Initialize with credentials
        const initialized = await tradingBot.initialize(credentials);
        if (!initialized) {
            logger.error('Bot initialization failed during test');
            console.log('❌ Bot initialization failed - check your credentials');
            cliInput.close();
            return;
        }
        
        // Close CLI input after initialization
        cliInput.close();
        
        // Test execution engine
        const executionEngine = require('./src/core/execution');
        const testResult = await executionEngine.testExecution();
        
        logger.info('Test completed', testResult);
        console.log('✅ Test completed successfully');
    } catch (error) {
        logger.error('Bot test error', error);
        console.log('❌ Bot test error:', error.message);
        cliInput.close();
    }
}

async function showConfig() {
    try {
        const pairsConfig = require('./src/pairs/pairsConfig');
        const config = pairsConfig.exportConfig();
        
        console.log('\n=== BOT CONFIGURATION ===');
        console.log(`Total Pairs: ${Object.keys(config.pairs).length}`);
        console.log(`Active Pairs: ${Object.values(config.pairs).filter(p => p.active).length}`);
        
        console.log('\n=== ACTIVE PAIRS ===');
        Object.entries(config.pairs)
            .filter(([pair, config]) => config.active)
            .sort(([,a], [,b]) => a.priority - b.priority)
            .forEach(([pair, config]) => {
                console.log(`${pair}: ${config.name} (${config.category}) - Priority: ${config.priority}`);
            });
        
        console.log('\n=== SETTINGS ===');
        Object.entries(config.settings).forEach(([key, value]) => {
            console.log(`${key}: ${value}`);
        });
        
        console.log('\n');
    } catch (error) {
        logger.error('Config display error', error);
    }
}

async function showPairs() {
    try {
        const pairsConfig = require('./src/pairs/pairsConfig');
        const summary = pairsConfig.getPairsSummary();
        
        console.log('\n=== PAIRS SUMMARY ===');
        console.log(`Total Pairs: ${summary.totalPairs}`);
        console.log(`Active Pairs: ${summary.activePairs}`);
        console.log(`Average Spread: ${summary.averageSpread.toFixed(2)}`);
        
        console.log('\n=== BY CATEGORY ===');
        Object.entries(summary.categories).forEach(([category, count]) => {
            console.log(`${category}: ${count}`);
        });
        
        console.log('\n=== BY VOLATILITY ===');
        Object.entries(summary.volatilities).forEach(([volatility, count]) => {
            console.log(`${volatility}: ${count}`);
        });
        
        console.log('\n');
    } catch (error) {
        logger.error('Pairs display error', error);
    }
}

function showHelp() {
    console.log(`
=== IQ OPTION TRADING BOT ===

Usage: node app.js [command]

Commands:
  start     - Start the trading bot (will prompt for credentials)
  stop      - Stop the trading bot
  status    - Show current bot status
  test      - Run bot tests (will prompt for credentials)
  config    - Show configuration
  pairs     - Show pairs summary
  help      - Show this help message

Interactive Mode:
  When starting the bot, you will be prompted for:
    - IQ Option Email
    - IQ Option Password (hidden)
    - Account Type (PRACTICE/REAL)

Environment Variables (Optional):
  ACCOUNT_TYPE       - Account type (PRACTICE/REAL)
  BASE_AMOUNT        - Base trade amount (default: 1)
  MAX_DAILY_LOSS     - Maximum daily loss (default: 50)
  MAX_DAILY_PROFIT_PERCENT - Maximum daily profit percentage (default: 10)
  RISK_PERCENTAGE    - Risk percentage per trade (default: 2)
  NEWS_API_KEY       - News API key (optional)
  LOG_LEVEL          - Log level (INFO, DEBUG, WARN, ERROR)

Examples:
  node app.js start
  node app.js status
  node app.js config
`);
}

// Main execution
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    
    if (!command) {
        logger.error('No command provided');
        showHelp();
        process.exit(1);
    }
    
    await handleCommand(command, args.slice(1));
}

// Run main function
if (require.main === module) {
    main().catch(error => {
        logger.error('Application error', error);
        process.exit(1);
    });
}

module.exports = tradingBot;
