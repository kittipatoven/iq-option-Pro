const logger = require('../utils/logger');

class ConfigValidator {
    static validateRealModeConfig() {
        const errors = [];
        const warnings = [];
        
        // Required environment variables
        const required = [
            'IQ_EMAIL',
            'IQ_PASSWORD', 
            'ACCOUNT_TYPE',
            'NEWS_API_KEY'
        ];
        
        for (const key of required) {
            const value = process.env[key];
            if (!value) {
                errors.push(`Missing required environment variable: ${key}`);
            } else if (value.includes('placeholder') || value.includes('your_') || value.includes('demo_')) {
                errors.push(`Environment variable ${key} is using placeholder value`);
            }
        }
        
        // Validate account type
        const accountType = process.env.ACCOUNT_TYPE;
        if (accountType && !['PRACTICE', 'REAL'].includes(accountType)) {
            errors.push(`Invalid ACCOUNT_TYPE: ${accountType}. Must be PRACTICE or REAL`);
        }
        
        // Safety checks
        const baseAmount = parseInt(process.env.BASE_AMOUNT) || 1;
        if (baseAmount < 1) {
            warnings.push('BASE_AMOUNT is less than 1, setting to minimum 1');
            process.env.BASE_AMOUNT = '1';
        }
        
        const maxDailyLoss = parseInt(process.env.MAX_DAILY_LOSS) || 50;
        if (maxDailyLoss < 10) {
            warnings.push('MAX_DAILY_LOSS is very low, consider increasing');
        }
        
        // News API validation
        const newsApiKey = process.env.NEWS_API_KEY;
        if (newsApiKey && (newsApiKey.length < 20 || newsApiKey.includes('demo'))) {
            errors.push('NEWS_API_KEY appears to be invalid or demo key');
        }
        
        return {
            isValid: errors.length === 0,
            errors: errors,
            warnings: warnings,
            config: {
                hasIQCredentials: !!(process.env.IQ_EMAIL && process.env.IQ_PASSWORD),
                accountType: accountType || 'NOT_SET',
                hasNewsApiKey: !!(newsApiKey && newsApiKey.length > 20),
                baseAmount: baseAmount,
                maxDailyLoss: maxDailyLoss
            }
        };
    }
    
    static validateBeforeRealTrading() {
        const validation = this.validateRealModeConfig();
        
        if (!validation.isValid) {
            logger.error('Configuration validation failed for REAL mode');
            validation.errors.forEach(error => logger.error(`Config Error: ${error}`));
            return false;
        }
        
        if (validation.warnings.length > 0) {
            logger.warn('Configuration warnings detected');
            validation.warnings.forEach(warning => logger.warn(`Config Warning: ${warning}`));
        }
        
        logger.info('Configuration validation passed for REAL mode');
        return true;
    }
    
    static getSafetyConfig() {
        return {
            minTradeAmount: parseInt(process.env.MIN_TRADE_AMOUNT) || 1,
            maxTradesPerSession: parseInt(process.env.MAX_TRADES_PER_SESSION) || 10,
            enableRealTrading: process.env.ENABLE_REAL_TRADING === 'true',
            accountType: process.env.ACCOUNT_TYPE || 'PRACTICE'
        };
    }
}

module.exports = ConfigValidator;
