/**
 * Configuration
 */

require('dotenv').config();

module.exports = {
    IQ_OPTION_EMAIL: process.env.IQ_OPTION_EMAIL || process.env.IQ_EMAIL,
    IQ_OPTION_PASSWORD: process.env.IQ_OPTION_PASSWORD || process.env.IQ_PASSWORD,
    ACCOUNT_TYPE: process.env.ACCOUNT_TYPE || 'PRACTICE',
    TRADING_PAIRS: (process.env.TRADING_PAIRS || process.env.PAIRS || 'EURUSD,GBPUSD').split(','),
    TIMEFRAME: parseInt(process.env.TIMEFRAME || process.env.TIME_FRAME) || 5,
    TRADE_AMOUNT: parseFloat(process.env.TRADE_AMOUNT || process.env.BASE_AMOUNT) || 1,
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
    NEWS_MODE: process.env.NEWS_MODE || 'OFFLINE'
};
