const logger = require('./src/utils/logger');
const iqoptionAPI = require('./src/api/iqoption');
const newsFilter = require('./src/filters/newsFilter');
const executionEngine = require('./src/core/execution');

class RealModeAuditor {
    constructor() {
        this.name = 'RealModeAuditor';
        this.auditResults = [];
        this.isRealMode = false;
        this.issues = [];
    }

    async auditSystem() {
        try {
            console.log('🔍 TRADING SYSTEM AUDIT - REAL vs MOCK');
            console.log('==========================================\n');
            
            // Test 1: Check Environment Configuration
            await this.checkEnvironmentConfig();
            
            // Test 2: Check IQ Option Connection
            await this.checkIQOptionConnection();
            
            // Test 3: Check News API
            await this.checkNewsAPI();
            
            // Test 4: Check Order Generation
            await this.checkOrderGeneration();
            
            // Test 5: Test Real Trade
            await this.testRealTrade();
            
            // Generate Audit Report
            this.generateAuditReport();
            
        } catch (error) {
            logger.error('System audit failed', error);
            console.error('❌ Audit failed:', error.message);
        }
    }

    async checkEnvironmentConfig() {
        try {
            console.log('📋 Test 1: Environment Configuration...');
            
            const email = process.env.IQ_EMAIL;
            const password = process.env.IQ_PASSWORD;
            const accountType = process.env.ACCOUNT_TYPE;
            const newsApiKey = process.env.NEWS_API_KEY;
            
            const configIssues = [];
            
            // Check IQ Option credentials
            if (!email || email === 'your_email@example.com') {
                configIssues.push('IQ_EMAIL not set or using placeholder');
            }
            
            if (!password || password === 'your_password') {
                configIssues.push('IQ_PASSWORD not set or using placeholder');
            }
            
            // Check account type
            if (!accountType || accountType === 'PRACTICE') {
                configIssues.push('ACCOUNT_TYPE set to PRACTICE (not REAL)');
            }
            
            // Check News API key
            if (!newsApiKey || newsApiKey === 'demo_key_for_testing' || newsApiKey === 'YOUR_FMP_API_KEY_HERE') {
                configIssues.push('NEWS_API_KEY using demo/placeholder');
            }
            
            const isConfigReal = configIssues.length === 0;
            
            this.auditResults.push({
                test: 'Environment Configuration',
                status: isConfigReal ? 'REAL' : 'MOCK',
                issues: configIssues,
                details: {
                    email: email ? (email === 'your_email@example.com' ? 'PLACEHOLDER' : 'SET') : 'NOT_SET',
                    password: password ? (password === 'your_password' ? 'PLACEHOLDER' : 'SET') : 'NOT_SET',
                    accountType: accountType || 'NOT_SET',
                    newsApiKey: newsApiKey ? (newsApiKey.includes('demo') || newsApiKey.includes('YOUR_') ? 'DEMO/PLACEHOLDER' : 'REAL') : 'NOT_SET'
                }
            });
            
            console.log(`${isConfigReal ? '✅' : '❌'} Environment Configuration: ${isConfigReal ? 'REAL' : 'MOCK'}`);
            if (configIssues.length > 0) {
                console.log('   Issues:');
                configIssues.forEach(issue => console.log(`   - ${issue}`));
            }
            console.log('');
            
        } catch (error) {
            this.auditResults.push({
                test: 'Environment Configuration',
                status: 'ERROR',
                error: error.message
            });
            console.log('❌ Environment Configuration: ERROR\n');
        }
    }

    async checkIQOptionConnection() {
        try {
            console.log('🔌 Test 2: IQ Option Connection...');
            
            const connected = await iqoptionAPI.connect();
            
            // Check if using mock API
            const isUsingMock = !!(iqoptionAPI.api && typeof iqoptionAPI.api.getOrderInfo === 'function' && 
                                  iqoptionAPI.api.balances && iqoptionAPI.api.balances[0] && 
                                  iqoptionAPI.api.balances[0].amount === 1000);
            
            // Get balance to check if real
            let balance = 0;
            let balanceSource = 'UNKNOWN';
            
            try {
                balance = await iqoptionAPI.getBalance();
                balanceSource = isUsingMock ? 'MOCK' : 'REAL';
            } catch (error) {
                balanceSource = 'ERROR';
            }
            
            const isRealConnection = connected && !isUsingMock;
            
            this.auditResults.push({
                test: 'IQ Option Connection',
                status: isRealConnection ? 'REAL' : 'MOCK',
                details: {
                    connected: connected,
                    usingMock: isUsingMock,
                    balance: balance,
                    balanceSource: balanceSource,
                    apiType: iqoptionAPI.api && iqoptionAPI.api.send ? 'REAL' : 'MOCK'
                }
            });
            
            console.log(`${isRealConnection ? '✅' : '❌'} IQ Option Connection: ${isRealConnection ? 'REAL' : 'MOCK'}`);
            console.log(`   Connected: ${connected ? '✅' : '❌'}`);
            console.log(`   Balance: ${balance} (${balanceSource})`);
            console.log(`   API Type: ${iqoptionAPI.api && iqoptionAPI.api.send ? 'REAL' : 'MOCK'}`);
            console.log('');
            
        } catch (error) {
            this.auditResults.push({
                test: 'IQ Option Connection',
                status: 'ERROR',
                error: error.message
            });
            console.log('❌ IQ Option Connection: ERROR\n');
        }
    }

    async checkNewsAPI() {
        try {
            console.log('📰 Test 3: News API...');
            
            await newsFilter.initialize();
            const apiStatus = newsFilter.getApiStatus();
            
            // Test if we can get real news
            let newsData = null;
            let newsSource = 'UNKNOWN';
            
            try {
                newsData = await newsFilter.getEconomicCalendar();
                
                // Check if it's mock data (look for mock indicators)
                const isMockData = newsData.some(event => 
                    event.name && event.name.includes('Fed Interest Rate Decision') &&
                    event.date && event.date.includes(moment().format('YYYY-MM-DD'))
                );
                
                newsSource = isMockData ? 'MOCK' : 'REAL';
            } catch (error) {
                newsSource = 'ERROR';
            }
            
            const isRealNews = apiStatus.hasApiKey && newsSource === 'REAL';
            
            this.auditResults.push({
                test: 'News API',
                status: isRealNews ? 'REAL' : 'MOCK',
                details: {
                    hasApiKey: apiStatus.hasApiKey,
                    newsEvents: apiStatus.newsEventsCount,
                    newsSource: newsSource,
                    lastUpdate: apiStatus.lastUpdate
                }
            });
            
            console.log(`${isRealNews ? '✅' : '❌'} News API: ${isRealNews ? 'REAL' : 'MOCK'}`);
            console.log(`   API Key: ${apiStatus.hasApiKey ? '✅' : '❌'}`);
            console.log(`   News Source: ${newsSource}`);
            console.log(`   Events: ${apiStatus.newsEventsCount}`);
            console.log('');
            
        } catch (error) {
            this.auditResults.push({
                test: 'News API',
                status: 'ERROR',
                error: error.message
            });
            console.log('❌ News API: ERROR\n');
        }
    }

    async checkOrderGeneration() {
        try {
            console.log('💰 Test 4: Order Generation...');
            
            // Test order generation
            const buyResult = await iqoptionAPI.buy('EURUSD', 1, 'call');
            
            // Analyze order ID
            const orderId = buyResult.order_id;
            let orderIdType = 'UNKNOWN';
            
            if (orderId) {
                // Check if it's mock pattern (order_1000, order_1001, etc.)
                if (orderId.startsWith('order_') && /^\d+$/.test(orderId.replace('order_', ''))) {
                    orderIdType = 'MOCK';
                } else if (orderId.includes('failed_')) {
                    orderIdType = 'FAILED';
                } else if (orderId.length > 10 && !orderId.startsWith('order_')) {
                    orderIdType = 'REAL';
                } else {
                    orderIdType = 'SUSPICIOUS';
                }
            } else {
                orderIdType = 'MISSING';
            }
            
            const isRealOrder = buyResult.success && orderIdType === 'REAL';
            
            this.auditResults.push({
                test: 'Order Generation',
                status: isRealOrder ? 'REAL' : 'MOCK',
                details: {
                    success: buyResult.success,
                    orderId: orderId,
                    orderIdType: orderIdType,
                    orderLength: orderId ? orderId.length : 0
                }
            });
            
            console.log(`${isRealOrder ? '✅' : '❌'} Order Generation: ${isRealOrder ? 'REAL' : 'MOCK'}`);
            console.log(`   Success: ${buyResult.success ? '✅' : '❌'}`);
            console.log(`   Order ID: ${orderId || 'MISSING'}`);
            console.log(`   ID Type: ${orderIdType}`);
            console.log('');
            
        } catch (error) {
            this.auditResults.push({
                test: 'Order Generation',
                status: 'ERROR',
                error: error.message
            });
            console.log('❌ Order Generation: ERROR\n');
        }
    }

    async testRealTrade() {
        try {
            console.log('🔄 Test 5: Real Trade Execution...');
            
            const testSignal = {
                pair: 'EURUSD',
                direction: 'CALL',
                amount: 1,
                confidence: 75,
                score: 3.5,
                strategy: 'AUDIT_TEST'
            };
            
            // Execute trade
            const executionResult = await executionEngine.executeTrade(testSignal);
            
            // Analyze the execution
            let tradeType = 'UNKNOWN';
            let orderIdType = 'UNKNOWN';
            
            if (executionResult.success && executionResult.order) {
                const orderId = executionResult.order.id;
                
                if (orderId.startsWith('order_') && /^\d+$/.test(orderId.replace('order_', ''))) {
                    orderIdType = 'MOCK';
                    tradeType = 'MOCK';
                } else if (orderId.length > 10 && !orderId.startsWith('order_')) {
                    orderIdType = 'REAL';
                    tradeType = 'REAL';
                } else {
                    orderIdType = 'SUSPICIOUS';
                    tradeType = 'SUSPICIOUS';
                }
            } else {
                tradeType = 'FAILED';
            }
            
            const isRealTrade = executionResult.success && tradeType === 'REAL';
            
            this.auditResults.push({
                test: 'Real Trade Execution',
                status: isRealTrade ? 'REAL' : 'MOCK',
                details: {
                    success: executionResult.success,
                    orderId: executionResult.order?.id,
                    orderIdType: orderIdType,
                    tradeType: tradeType,
                    pair: executionResult.order?.pair
                }
            });
            
            console.log(`${isRealTrade ? '✅' : '❌'} Real Trade Execution: ${isRealTrade ? 'REAL' : 'MOCK'}`);
            console.log(`   Success: ${executionResult.success ? '✅' : '❌'}`);
            console.log(`   Order ID: ${executionResult.order?.id || 'MISSING'}`);
            console.log(`   Trade Type: ${tradeType}`);
            console.log('');
            
        } catch (error) {
            this.auditResults.push({
                test: 'Real Trade Execution',
                status: 'ERROR',
                error: error.message
            });
            console.log('❌ Real Trade Execution: ERROR\n');
        }
    }

    generateAuditReport() {
        console.log('\n=== AUDIT REPORT ===');
        
        const realTests = this.auditResults.filter(t => t.status === 'REAL').length;
        const mockTests = this.auditResults.filter(t => t.status === 'MOCK').length;
        const errorTests = this.auditResults.filter(t => t.status === 'ERROR').length;
        const totalTests = this.auditResults.length;
        
        console.log(`Total Tests: ${totalTests}`);
        console.log(`Real: ${realTests}`);
        console.log(`Mock: ${mockTests}`);
        console.log(`Errors: ${errorTests}`);
        
        // Determine overall system mode
        this.isRealMode = realTests === totalTests && errorTests === 0;
        
        console.log(`\n🎯 SYSTEM MODE: ${this.isRealMode ? '✅ REAL' : '❌ MOCK/DEMO'}`);
        
        console.log('\n=== DETAILED RESULTS ===');
        for (const result of this.auditResults) {
            const status = result.status === 'REAL' ? '✅' : result.status === 'MOCK' ? '❌' : '⚠️';
            console.log(`${status} ${result.test}: ${result.status}`);
            
            if (result.issues && result.issues.length > 0) {
                console.log('   Issues:');
                result.issues.forEach(issue => console.log(`   - ${issue}`));
            }
            
            if (result.details) {
                Object.entries(result.details).forEach(([key, value]) => {
                    console.log(`   ${key}: ${value}`);
                });
            }
            console.log('');
        }
        
        console.log('=== RECOMMENDATIONS ===');
        
        if (!this.isRealMode) {
            console.log('🔧 TO SWITCH TO REAL MODE:');
            
            // Check specific issues
            const envConfig = this.auditResults.find(r => r.test === 'Environment Configuration');
            if (envConfig && envConfig.issues) {
                console.log('\n1. Fix Environment Configuration:');
                envConfig.issues.forEach(issue => {
                    if (issue.includes('EMAIL')) console.log('   - Set real IQ_EMAIL in .env');
                    if (issue.includes('PASSWORD')) console.log('   - Set real IQ_PASSWORD in .env');
                    if (issue.includes('PRACTICE')) console.log('   - Change ACCOUNT_TYPE to REAL');
                    if (issue.includes('NEWS_API_KEY')) console.log('   - Set real NEWS_API_KEY from financialmodelingprep.com');
                });
            }
            
            const iqOption = this.auditResults.find(r => r.test === 'IQ Option Connection');
            if (iqOption && iqOption.details.usingMock) {
                console.log('\n2. Fix IQ Option Connection:');
                console.log('   - Update credentials to real IQ Option account');
                console.log('   - Ensure account is verified');
                console.log('   - Check network connection');
            }
            
            const newsAPI = this.auditResults.find(r => r.test === 'News API');
            if (newsAPI && newsAPI.details.newsSource === 'MOCK') {
                console.log('\n3. Fix News API:');
                console.log('   - Get real API key from https://site.financialmodelingprep.com/');
                console.log('   - Update NEWS_API_KEY in .env');
            }
            
        } else {
            console.log('✅ System is running in REAL mode');
            console.log('✅ All components are using real APIs');
            console.log('✅ Ready for live trading');
        }
        
        console.log('\n=== SECURITY CHECK ===');
        if (this.isRealMode) {
            console.log('⚠️  WARNING: System is in REAL mode');
            console.log('⚠️  Real money will be used for trading');
            console.log('⚠️  Start with small amounts');
            console.log('⚠️  Monitor trades closely');
        } else {
            console.log('✅ Safe: System is in MOCK/DEMO mode');
            console.log('✅ No real money at risk');
        }
    }
}

// Run audit if called directly
if (require.main === module) {
    const auditor = new RealModeAuditor();
    auditor.auditSystem().catch(error => {
        console.error('Real mode audit failed:', error);
        process.exit(1);
    });
}

module.exports = RealModeAuditor;
