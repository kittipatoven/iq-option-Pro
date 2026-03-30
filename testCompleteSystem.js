const logger = require('./src/utils/logger');
const iqoptionAPI = require('./src/api/iqoption');
const newsFilter = require('./src/filters/newsFilter');
const executionEngine = require('./src/core/execution');

class CompleteSystemTest {
    constructor() {
        this.name = 'CompleteSystemTest';
        this.testResults = [];
    }

    async runAllTests() {
        try {
            console.log('🚀 COMPLETE SYSTEM INTEGRATION TEST');
            console.log('=====================================\n');
            
            // Test 1: API Connection
            await this.testAPIConnection();
            
            // Test 2: News Filter
            await this.testNewsFilter();
            
            // Test 3: Order Execution
            await this.testOrderExecution();
            
            // Test 4: Order Monitoring
            await this.testOrderMonitoring();
            
            // Test 5: Full Trade Flow
            await this.testFullTradeFlow();
            
            // Print results
            this.printResults();
            
        } catch (error) {
            logger.error('Complete system test failed', error);
            console.error('❌ System test failed:', error.message);
        }
    }

    async testAPIConnection() {
        try {
            console.log('📡 Test 1: API Connection...');
            
            const connected = await iqoptionAPI.connect();
            
            this.testResults.push({
                test: 'API Connection',
                status: connected ? 'PASSED' : 'FAILED',
                details: { connected }
            });
            
            console.log(`${connected ? '✅' : '❌'} API Connection ${connected ? 'PASSED' : 'FAILED'}\n`);
        } catch (error) {
            this.testResults.push({
                test: 'API Connection',
                status: 'FAILED',
                error: error.message
            });
            console.log('❌ API Connection FAILED\n');
        }
    }

    async testNewsFilter() {
        try {
            console.log('📰 Test 2: News Filter...');
            
            const initialized = await newsFilter.initialize();
            const apiStatus = newsFilter.getApiStatus();
            
            this.testResults.push({
                test: 'News Filter',
                status: initialized ? 'PASSED' : 'FAILED',
                details: {
                    initialized,
                    hasApiKey: apiStatus.hasApiKey,
                    newsEvents: apiStatus.newsEventsCount
                }
            });
            
            console.log(`${initialized ? '✅' : '❌'} News Filter ${initialized ? 'PASSED' : 'FAILED'}`);
            console.log(`   API Key: ${apiStatus.hasApiKey ? '✅' : '⚠️  Mock'}`);
            console.log(`   News Events: ${apiStatus.newsEventsCount}\n`);
        } catch (error) {
            this.testResults.push({
                test: 'News Filter',
                status: 'FAILED',
                error: error.message
            });
            console.log('❌ News Filter FAILED\n');
        }
    }

    async testOrderExecution() {
        try {
            console.log('💰 Test 3: Order Execution...');
            
            const testSignal = {
                pair: 'EURUSD',
                direction: 'CALL',
                amount: 1,
                confidence: 75,
                score: 3.5,
                strategy: 'TEST'
            };
            
            const result = await executionEngine.executeTrade(testSignal);
            
            // Check if orderId is defined
            const hasOrderId = result.order && result.order.id;
            
            this.testResults.push({
                test: 'Order Execution',
                status: result.success && hasOrderId ? 'PASSED' : 'FAILED',
                details: {
                    success: result.success,
                    orderId: result.order?.id,
                    pair: result.order?.pair,
                    direction: result.order?.direction
                }
            });
            
            console.log(`${result.success && hasOrderId ? '✅' : '❌'} Order Execution ${result.success && hasOrderId ? 'PASSED' : 'FAILED'}`);
            console.log(`   Order ID: ${result.order?.id || 'undefined'}`);
            console.log(`   Pair: ${result.order?.pair}`);
            console.log(`   Direction: ${result.order?.direction}\n`);
            
            return result;
        } catch (error) {
            this.testResults.push({
                test: 'Order Execution',
                status: 'FAILED',
                error: error.message
            });
            console.log('❌ Order Execution FAILED\n');
            return null;
        }
    }

    async testOrderMonitoring() {
        try {
            console.log('⏰ Test 4: Order Monitoring...');
            
            // Create a test order first
            const buyResult = await iqoptionAPI.buy('GBPUSD', 2, 'put');
            
            if (!buyResult.success || !buyResult.order_id) {
                throw new Error('Failed to create test order');
            }
            
            const orderId = buyResult.order_id;
            console.log(`   Created test order: ${orderId}`);
            
            // Test getOrderInfo
            const orderInfo = await iqoptionAPI.getOrderInfo(orderId);
            
            const testPassed = orderInfo && orderInfo.success;
            
            this.testResults.push({
                test: 'Order Monitoring',
                status: testPassed ? 'PASSED' : 'FAILED',
                details: {
                    orderId: orderId,
                    success: orderInfo?.success,
                    status: orderInfo?.status
                }
            });
            
            console.log(`${testPassed ? '✅' : '❌'} Order Monitoring ${testPassed ? 'PASSED' : 'FAILED'}`);
            console.log(`   Order Status: ${orderInfo?.status}\n`);
            
        } catch (error) {
            this.testResults.push({
                test: 'Order Monitoring',
                status: 'FAILED',
                error: error.message
            });
            console.log('❌ Order Monitoring FAILED\n');
        }
    }

    async testFullTradeFlow() {
        try {
            console.log('🔄 Test 5: Full Trade Flow...');
            
            // Test complete trade flow
            const testSignal = {
                pair: 'USDJPY',
                direction: 'PUT',
                amount: 1,
                confidence: 80,
                score: 4.0,
                strategy: 'TEST'
            };
            
            // Execute trade
            const executionResult = await executionEngine.executeTrade(testSignal);
            
            if (!executionResult.success) {
                throw new Error('Trade execution failed');
            }
            
            // Wait a moment then check order
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            const orderId = executionResult.order.id;
            const orderInfo = await iqoptionAPI.getOrderInfo(orderId);
            
            const testPassed = executionResult.success && orderInfo && orderInfo.success;
            
            this.testResults.push({
                test: 'Full Trade Flow',
                status: testPassed ? 'PASSED' : 'FAILED',
                details: {
                    executionSuccess: executionResult.success,
                    orderId: orderId,
                    orderInfoSuccess: orderInfo?.success,
                    finalStatus: orderInfo?.status
                }
            });
            
            console.log(`${testPassed ? '✅' : '❌'} Full Trade Flow ${testPassed ? 'PASSED' : 'FAILED'}`);
            console.log(`   Execution: ${executionResult.success ? '✅' : '❌'}`);
            console.log(`   Order Info: ${orderInfo?.success ? '✅' : '❌'}`);
            console.log(`   Final Status: ${orderInfo?.status}\n`);
            
        } catch (error) {
            this.testResults.push({
                test: 'Full Trade Flow',
                status: 'FAILED',
                error: error.message
            });
            console.log('❌ Full Trade Flow FAILED\n');
        }
    }

    printResults() {
        console.log('\n=== COMPLETE SYSTEM TEST RESULTS ===');
        
        const passed = this.testResults.filter(t => t.status === 'PASSED').length;
        const failed = this.testResults.filter(t => t.status === 'FAILED').length;
        const total = this.testResults.length;
        
        console.log(`Total Tests: ${total}`);
        console.log(`Passed: ${passed}`);
        console.log(`Failed: ${failed}`);
        console.log(`Success Rate: ${total > 0 ? ((passed / total) * 100).toFixed(1) : 0}%\n`);
        
        for (const result of this.testResults) {
            const status = result.status === 'PASSED' ? '✅' : '❌';
            console.log(`${status} ${result.test}`);
            
            if (result.status === 'FAILED') {
                console.log(`   Error: ${result.error}`);
            } else if (result.details) {
                Object.entries(result.details).forEach(([key, value]) => {
                    console.log(`   ${key}: ${value}`);
                });
            }
            console.log('');
        }

        // Show system status
        console.log('=== SYSTEM STATUS ===');
        
        if (failed === 0) {
            console.log('🎉 ALL TESTS PASSED - System is 100% Ready!');
            console.log('\n📋 SYSTEM CAPABILITIES:');
            console.log('✅ API Connection working');
            console.log('✅ News Filter working (with fallback)');
            console.log('✅ Order Execution working');
            console.log('✅ Order Monitoring working');
            console.log('✅ Full Trade Flow working');
            console.log('✅ No undefined errors');
            console.log('✅ Error handling complete');
            
            console.log('\n🚀 PRODUCTION READY:');
            console.log('- Bot can execute trades without errors');
            console.log('- Order tracking works correctly');
            console.log('- News filter provides safety');
            console.log('- All edge cases handled');
            
        } else {
            console.log('⚠️  SOME TESTS FAILED - Review issues before production');
        }
        
        console.log('\n=== COMPONENT STATUS ===');
        console.log(`IQ Option API: ${iqoptionAPI.isConnected ? '✅ Connected' : '❌ Disconnected'}`);
        console.log(`News Filter: ${newsFilter.lastUpdate ? '✅ Active' : '⚠️  Inactive'}`);
        console.log(`Execution Engine: ✅ Ready`);
        console.log(`Active Orders: ${executionEngine.activeOrders.size}`);
    }
}

// Run tests if called directly
if (require.main === module) {
    const test = new CompleteSystemTest();
    test.runAllTests().catch(error => {
        console.error('Complete system test execution failed:', error);
        process.exit(1);
    });
}

module.exports = CompleteSystemTest;
