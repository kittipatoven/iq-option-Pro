const logger = require('./src/utils/logger');
const ConfigValidator = require('./src/config/validator');
const iqoptionAPI = require('./src/api/iqoption');
const newsFilter = require('./src/filters/newsFilter');
const executionEngine = require('./src/core/execution');

class RealModeTester {
    constructor() {
        this.testResults = [];
    }

    async testRealMode() {
        try {
            console.log('🧪 REAL MODE TESTING');
            console.log('====================\n');
            
            // Test 1: Configuration Validation
            await this.testConfiguration();
            
            // Test 2: IQ Option Real Connection
            await this.testIQOptionConnection();
            
            // Test 3: News API Real Connection
            await this.testNewsAPI();
            
            // Test 4: Real Order Execution
            await this.testRealOrderExecution();
            
            // Test 5: Real Order Monitoring
            await this.testRealOrderMonitoring();
            
            // Generate Report
            this.generateReport();
            
        } catch (error) {
            logger.error('Real mode test failed', error);
            console.error('❌ Test failed:', error.message);
        }
    }

    async testConfiguration() {
        try {
            console.log('📋 Test 1: Configuration Validation...');
            
            const validation = ConfigValidator.validateRealModeConfig();
            
            this.testResults.push({
                test: 'Configuration Validation',
                status: validation.isValid ? 'PASSED' : 'FAILED',
                details: validation
            });
            
            console.log(`${validation.isValid ? '✅' : '❌'} Configuration Validation: ${validation.isValid ? 'PASSED' : 'FAILED'}`);
            
            if (!validation.isValid) {
                console.log('   Errors:');
                validation.errors.forEach(error => console.log(`   - ${error}`));
            }
            
            console.log('');
        } catch (error) {
            this.testResults.push({
                test: 'Configuration Validation',
                status: 'ERROR',
                error: error.message
            });
            console.log('❌ Configuration Validation: ERROR\n');
        }
    }

    async testIQOptionConnection() {
        try {
            console.log('🔌 Test 2: IQ Option Real Connection...');
            
            const connected = await iqoptionAPI.connect();
            
            // Test balance
            const balance = await iqoptionAPI.getBalance();
            
            // Test account info
            const accountType = process.env.ACCOUNT_TYPE;
            
            const isRealConnection = connected && balance > 0;
            
            this.testResults.push({
                test: 'IQ Option Connection',
                status: isRealConnection ? 'PASSED' : 'FAILED',
                details: {
                    connected: connected,
                    balance: balance,
                    accountType: accountType,
                    isReal: balance > 0 && balance !== 1000 // Mock balance is exactly 1000
                }
            });
            
            console.log(`${isRealConnection ? '✅' : '❌'} IQ Option Connection: ${isRealConnection ? 'PASSED' : 'FAILED'}`);
            console.log(`   Connected: ${connected ? '✅' : '❌'}`);
            console.log(`   Balance: ${balance} (${balance === 1000 ? 'LIKELY MOCK' : 'REAL'})`);
            console.log(`   Account Type: ${accountType}`);
            console.log('');
            
        } catch (error) {
            this.testResults.push({
                test: 'IQ Option Connection',
                status: 'ERROR',
                error: error.message
            });
            console.log('❌ IQ Option Connection: ERROR\n');
        }
    }

    async testNewsAPI() {
        try {
            console.log('📰 Test 3: News API Real Connection...');
            
            await newsFilter.initialize();
            
            // Test economic calendar
            const calendar = await newsFilter.getEconomicCalendar();
            
            // Test forex news
            const forexNews = await newsFilter.getForexNews();
            
            const apiStatus = newsFilter.getApiStatus();
            
            const isRealNews = apiStatus.hasApiKey && calendar.length > 0 && forexNews.length > 0;
            
            this.testResults.push({
                test: 'News API Connection',
                status: isRealNews ? 'PASSED' : 'FAILED',
                details: {
                    hasApiKey: apiStatus.hasApiKey,
                    calendarEvents: calendar.length,
                    forexNews: forexNews.length,
                    lastUpdate: apiStatus.lastUpdate
                }
            });
            
            console.log(`${isRealNews ? '✅' : '❌'} News API Connection: ${isRealNews ? 'PASSED' : 'FAILED'}`);
            console.log(`   API Key: ${apiStatus.hasApiKey ? '✅' : '❌'}`);
            console.log(`   Calendar Events: ${calendar.length}`);
            console.log(`   Forex News: ${forexNews.length}`);
            console.log('');
            
        } catch (error) {
            this.testResults.push({
                test: 'News API Connection',
                status: 'ERROR',
                error: error.message
            });
            console.log('❌ News API Connection: ERROR\n');
        }
    }

    async testRealOrderExecution() {
        try {
            console.log('💰 Test 4: Real Order Execution...');
            
            const testSignal = {
                pair: 'EURUSD',
                direction: 'CALL',
                amount: 1,
                confidence: 75,
                score: 3.5,
                strategy: 'REAL_MODE_TEST'
            };
            
            const result = await executionEngine.executeTrade(testSignal);
            
            // Analyze order ID to determine if real
            const orderId = result.orderId;
            let orderIdType = 'UNKNOWN';
            
            if (orderId) {
                if (orderId.startsWith('order_') && /^\d+$/.test(orderId.replace('order_', ''))) {
                    orderIdType = 'MOCK';
                } else if (orderId.length > 10 && !orderId.startsWith('order_')) {
                    orderIdType = 'REAL';
                } else {
                    orderIdType = 'SUSPICIOUS';
                }
            }
            
            const isRealOrder = result.success && orderIdType === 'REAL';
            
            this.testResults.push({
                test: 'Real Order Execution',
                status: isRealOrder ? 'PASSED' : 'FAILED',
                details: {
                    success: result.success,
                    orderId: orderId,
                    orderIdType: orderIdType,
                    pair: result.order?.pair,
                    amount: result.order?.amount
                }
            });
            
            console.log(`${isRealOrder ? '✅' : '❌'} Real Order Execution: ${isRealOrder ? 'PASSED' : 'FAILED'}`);
            console.log(`   Success: ${result.success ? '✅' : '❌'}`);
            console.log(`   Order ID: ${orderId || 'MISSING'}`);
            console.log(`   ID Type: ${orderIdType}`);
            console.log(`   Pair: ${result.order?.pair}`);
            console.log('');
            
            return result;
            
        } catch (error) {
            this.testResults.push({
                test: 'Real Order Execution',
                status: 'ERROR',
                error: error.message
            });
            console.log('❌ Real Order Execution: ERROR\n');
            return null;
        }
    }

    async testRealOrderMonitoring() {
        try {
            console.log('⏰ Test 5: Real Order Monitoring...');
            
            // Get active orders
            const activeOrders = await iqoptionAPI.getActiveOrders();
            
            // Test order info on first active order
            let orderInfoTest = 'PASSED';
            let testOrderId = null;
            
            if (activeOrders.length > 0) {
                testOrderId = activeOrders[0].id;
                const orderInfo = await iqoptionAPI.getOrderInfo(testOrderId);
                
                if (!orderInfo.success) {
                    orderInfoTest = 'FAILED';
                }
            } else {
                // Create a test order to monitor
                const buyResult = await iqoptionAPI.buy('GBPUSD', 1, 'put');
                
                if (buyResult.success) {
                    testOrderId = buyResult.order_id;
                    
                    // Wait a moment then check
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    
                    const orderInfo = await iqoptionAPI.getOrderInfo(testOrderId);
                    
                    if (!orderInfo.success) {
                        orderInfoTest = 'FAILED';
                    }
                } else {
                    orderInfoTest = 'FAILED';
                }
            }
            
            const isRealMonitoring = orderInfoTest === 'PASSED';
            
            this.testResults.push({
                test: 'Real Order Monitoring',
                status: isRealMonitoring ? 'PASSED' : 'FAILED',
                details: {
                    activeOrders: activeOrders.length,
                    testOrderId: testOrderId,
                    orderInfoTest: orderInfoTest
                }
            });
            
            console.log(`${isRealMonitoring ? '✅' : '❌'} Real Order Monitoring: ${isRealMonitoring ? 'PASSED' : 'FAILED'}`);
            console.log(`   Active Orders: ${activeOrders.length}`);
            console.log(`   Order Info Test: ${orderInfoTest}`);
            console.log('');
            
        } catch (error) {
            this.testResults.push({
                test: 'Real Order Monitoring',
                status: 'ERROR',
                error: error.message
            });
            console.log('❌ Real Order Monitoring: ERROR\n');
        }
    }

    generateReport() {
        console.log('\n=== REAL MODE TEST REPORT ===');
        
        const passed = this.testResults.filter(t => t.status === 'PASSED').length;
        const failed = this.testResults.filter(t => t.status === 'FAILED').length;
        const errors = this.testResults.filter(t => t.status === 'ERROR').length;
        const total = this.testResults.length;
        
        console.log(`Total Tests: ${total}`);
        console.log(`Passed: ${passed}`);
        console.log(`Failed: ${failed}`);
        console.log(`Errors: ${errors}`);
        console.log(`Success Rate: ${total > 0 ? ((passed / total) * 100).toFixed(1) : 0}%`);
        
        const isFullyReal = passed === total && errors === 0;
        
        console.log(`\n🎯 SYSTEM MODE: ${isFullyReal ? '✅ REAL MODE' : '❌ NOT REAL MODE'}`);
        
        console.log('\n=== DETAILED RESULTS ===');
        for (const result of this.testResults) {
            const status = result.status === 'PASSED' ? '✅' : result.status === 'FAILED' ? '❌' : '⚠️';
            console.log(`${status} ${result.test}: ${result.status}`);
            
            if (result.status === 'ERROR') {
                console.log(`   Error: ${result.error}`);
            } else if (result.details) {
                Object.entries(result.details).forEach(([key, value]) => {
                    console.log(`   ${key}: ${value}`);
                });
            }
            console.log('');
        }
        
        console.log('=== RECOMMENDATIONS ===');
        
        if (isFullyReal) {
            console.log('🎉 SYSTEM IS READY FOR REAL TRADING!');
            console.log('✅ All components are using real APIs');
            console.log('✅ Order execution is working');
            console.log('✅ Order monitoring is working');
            console.log('\n⚠️  SAFETY REMINDERS:');
            console.log('   - Start with small amounts');
            console.log('   - Monitor trades closely');
            console.log('   - Set stop-loss limits');
            console.log('   - Keep logs for analysis');
            
        } else {
            console.log('🔧 SYSTEM NEEDS CONFIGURATION:');
            
            const configTest = this.testResults.find(t => t.test === 'Configuration Validation');
            if (configTest && configTest.status === 'FAILED') {
                console.log('\n1. Fix Configuration:');
                console.log('   - Run: node setupRealMode.js');
                console.log('   - Update .env file with real credentials');
            }
            
            const iqOptionTest = this.testResults.find(t => t.test === 'IQ Option Connection');
            if (iqOptionTest && iqOptionTest.status === 'FAILED') {
                console.log('\n2. Fix IQ Option Connection:');
                console.log('   - Check credentials');
                console.log('   - Verify account is active');
                console.log('   - Check network connection');
            }
            
            const newsTest = this.testResults.find(t => t.test === 'News API Connection');
            if (newsTest && newsTest.status === 'FAILED') {
                console.log('\n3. Fix News API:');
                console.log('   - Get valid API key from financialmodelingprep.com');
                console.log('   - Update NEWS_API_KEY in .env');
            }
            
            const orderTest = this.testResults.find(t => t.test === 'Real Order Execution');
            if (orderTest && orderTest.status === 'FAILED') {
                console.log('\n4. Fix Order Execution:');
                console.log('   - Check account balance');
                console.log('   - Verify account type');
                console.log('   - Check trading permissions');
            }
        }
        
        console.log('\n=== SECURITY STATUS ===');
        if (isFullyReal) {
            console.log('⚠️  WARNING: Real trading mode is active');
            console.log('⚠️  Real money will be used');
            console.log('⚠️  Proceed with caution');
        } else {
            console.log('✅ Safe: Not in real trading mode');
            console.log('✅ No real money at risk');
        }
    }
}

// Run test if called directly
if (require.main === module) {
    const tester = new RealModeTester();
    tester.testRealMode().catch(error => {
        console.error('Real mode test failed:', error);
        process.exit(1);
    });
}

module.exports = RealModeTester;
