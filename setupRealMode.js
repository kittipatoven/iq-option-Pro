const fs = require('fs');
const path = require('path');
const logger = require('./src/utils/logger');

class RealModeSetup {
    constructor() {
        this.envPath = path.join(__dirname, '.env');
        this.templatePath = path.join(__dirname, '.env.template');
    }

    async setupRealMode() {
        try {
            console.log('🚀 IQ OPTION TRADING BOT - REAL MODE SETUP');
            console.log('==========================================\n');
            
            // Step 1: Check current configuration
            await this.checkCurrentConfig();
            
            // Step 2: Guide user through setup
            await this.guidedSetup();
            
            // Step 3: Validate configuration
            await this.validateConfiguration();
            
            // Step 4: Test real connection
            await this.testRealConnection();
            
            console.log('\n✅ REAL MODE SETUP COMPLETE!');
            console.log('Your bot is now ready for real trading.\n');
            
        } catch (error) {
            console.error('❌ Setup failed:', error.message);
            process.exit(1);
        }
    }

    async checkCurrentConfig() {
        console.log('📋 Step 1: Checking Current Configuration...');
        
        if (!fs.existsSync(this.envPath)) {
            console.log('❌ .env file not found');
            console.log('📝 Creating .env file from template...');
            
            if (fs.existsSync(this.templatePath)) {
                fs.copyFileSync(this.templatePath, this.envPath);
                console.log('✅ .env file created from template');
            } else {
                throw new Error('Template file not found');
            }
        }
        
        // Load current config
        require('dotenv').config();
        
        const config = {
            IQ_EMAIL: process.env.IQ_EMAIL,
            IQ_PASSWORD: process.env.IQ_PASSWORD,
            ACCOUNT_TYPE: process.env.ACCOUNT_TYPE,
            NEWS_API_KEY: process.env.NEWS_API_KEY,
            BASE_AMOUNT: process.env.BASE_AMOUNT,
            ENABLE_REAL_TRADING: process.env.ENABLE_REAL_TRADING
        };
        
        console.log('\nCurrent Configuration:');
        Object.entries(config).forEach(([key, value]) => {
            const status = this.getConfigStatus(key, value);
            console.log(`   ${key}: ${status}`);
        });
        
        console.log('');
    }

    getConfigStatus(key, value) {
        if (!value) return '❌ NOT_SET';
        if (value.includes('placeholder') || value.includes('your_')) return '❌ PLACEHOLDER';
        if (value.includes('demo_')) return '❌ DEMO';
        if (key === 'ENABLE_REAL_TRADING' && value !== 'true') return '⚠️  DISABLED';
        return '✅ SET';
    }

    async guidedSetup() {
        console.log('🔧 Step 2: Guided Setup');
        console.log('========================\n');
        
        const readline = require('readline');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        
        const question = (prompt) => new Promise(resolve => rl.question(prompt, resolve));
        
        console.log('Please enter your configuration:\n');
        
        // Get IQ Option credentials
        const email = await question('IQ Option Email: ');
        const password = await question('IQ Option Password: ');
        const accountType = await question('Account Type (PRACTICE/REAL) [PRACTICE]: ') || 'PRACTICE';
        
        // Get News API key
        console.log('\nNews API Key (Financial Modeling Prep):');
        console.log('Get your free key from: https://site.financialmodelingprep.com/');
        const newsApiKey = await question('News API Key: ');
        
        // Get trading settings
        const baseAmount = await question('Base Amount (1-100) [1]: ') || '1';
        const enableRealTrading = await question('Enable Real Trading? (yes/no) [no]: ') || 'no';
        
        rl.close();
        
        // Update .env file
        await this.updateEnvFile({
            IQ_EMAIL: email,
            IQ_PASSWORD: password,
            ACCOUNT_TYPE: accountType.toUpperCase(),
            NEWS_API_KEY: newsApiKey,
            BASE_AMOUNT: baseAmount,
            ENABLE_REAL_TRADING: enableRealTrading.toLowerCase() === 'yes' ? 'true' : 'false'
        });
        
        console.log('✅ Configuration updated\n');
    }

    async updateEnvFile(config) {
        let envContent = '';
        
        if (fs.existsSync(this.envPath)) {
            envContent = fs.readFileSync(this.envPath, 'utf8');
        }
        
        // Update each configuration value
        Object.entries(config).forEach(([key, value]) => {
            const regex = new RegExp(`^${key}=.*$`, 'm');
            if (regex.test(envContent)) {
                envContent = envContent.replace(regex, `${key}=${value}`);
            } else {
                envContent += `\n${key}=${value}`;
            }
        });
        
        fs.writeFileSync(this.envPath, envContent);
        
        // Reload environment variables
        require('dotenv').config();
    }

    async validateConfiguration() {
        console.log('🔍 Step 3: Validating Configuration...');
        
        const ConfigValidator = require('./src/config/validator');
        const validation = ConfigValidator.validateRealModeConfig();
        
        if (!validation.isValid) {
            console.log('❌ Configuration validation failed:');
            validation.errors.forEach(error => console.log(`   - ${error}`));
            throw new Error('Configuration validation failed');
        }
        
        console.log('✅ Configuration is valid');
        
        if (validation.warnings.length > 0) {
            console.log('⚠️  Warnings:');
            validation.warnings.forEach(warning => console.log(`   - ${warning}`));
        }
        
        console.log('');
    }

    async testRealConnection() {
        console.log('🌐 Step 4: Testing Real Connection...');
        
        try {
            // Test IQ Option connection
            console.log('Testing IQ Option API...');
            const iqoptionAPI = require('./src/api/iqoption');
            
            const connected = await iqoptionAPI.connect();
            if (!connected) {
                throw new Error('Failed to connect to IQ Option API');
            }
            
            const balance = await iqoptionAPI.getBalance();
            console.log(`✅ IQ Option connected - Balance: ${balance}`);
            
            // Test News API
            console.log('Testing News API...');
            const newsFilter = require('./src/filters/newsFilter');
            
            await newsFilter.initialize();
            const apiStatus = newsFilter.getApiStatus();
            
            if (!apiStatus.hasApiKey) {
                throw new Error('News API key is invalid');
            }
            
            console.log(`✅ News API connected - Events: ${apiStatus.newsEventsCount}`);
            
            // Test order execution (small amount)
            console.log('Testing order execution...');
            const executionEngine = require('./src/core/execution');
            
            const testSignal = {
                pair: 'EURUSD',
                direction: 'CALL',
                amount: 1,
                confidence: 75,
                score: 3.5,
                strategy: 'SETUP_TEST'
            };
            
            const result = await executionEngine.executeTrade(testSignal);
            
            if (!result.success) {
                throw new Error('Test trade execution failed');
            }
            
            console.log(`✅ Order executed - ID: ${result.orderId}`);
            
            // Wait a moment then check order
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            const orderInfo = await iqoptionAPI.getOrderInfo(result.orderId);
            if (!orderInfo.success) {
                throw new Error('Failed to get order info');
            }
            
            console.log(`✅ Order verified - Status: ${orderInfo.status}`);
            
        } catch (error) {
            console.log('❌ Connection test failed:', error.message);
            throw error;
        }
    }
}

// Run setup if called directly
if (require.main === module) {
    const setup = new RealModeSetup();
    setup.setupRealMode().catch(error => {
        console.error('Setup failed:', error);
        process.exit(1);
    });
}

module.exports = RealModeSetup;
