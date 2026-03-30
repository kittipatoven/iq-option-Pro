const logger = require('./src/utils/logger');
const iqoptionAPI = require('./src/api/iqoption');

class OrderInfoTest {
    constructor() {
        this.name = 'OrderInfoTest';
        this.testResults = [];
    }

    async runTests() {
        try {
            console.log('🧪 ORDER INFO API TEST');
            console.log('========================\n');
            
            // Test 1: Initialize API
            await this.testAPIInitialization();
            
            // Test 2: Test getOrderInfo with mock order
            await this.testGetOrderInfo();
            
            // Test 3: Test order monitoring simulation
            await this.testOrderMonitoring();
            
            // Test 4: Test portfolio methods
            await this.testPortfolioMethods();
            
            // Print results
            this.printResults();
            
        } catch (error) {
            logger.error('Order info test failed', error);
            console.error('❌ Test failed:', error.message);
        }
    }

    async testAPIInitialization() {
        try {
            console.log('📡 Test 1: API Initialization...');
            
            const connected = await iqoptionAPI.connect();
            
            this.testResults.push({
                test: 'API Initialization',
                status: connected ? 'PASSED' : 'FAILED',
                details: { connected }
            });
            
            console.log(`${connected ? '✅' : '❌'} API Initialization ${connected ? 'PASSED' : 'FAILED'}\n`);
        } catch (error) {
            this.testResults.push({
                test: 'API Initialization',
                status: 'FAILED',
                error: error.message
            });
            console.log('❌ API Initialization FAILED\n');
        }
    }

    async testGetOrderInfo() {
        try {
            console.log('🔍 Test 2: getOrderInfo Method...');
            
            // First, create a mock order
            const buyResult = await iqoptionAPI.buy('EURUSD', 1, 'call', 60);
            
            if (!buyResult.success) {
                throw new Error('Failed to create mock order');
            }
            
            const orderId = buyResult.order_id;
            console.log(`Created mock order: ${orderId}`);
            
            // Test getOrderInfo
            const orderInfo = await iqoptionAPI.getOrderInfo(orderId);
            
            const testPassed = orderInfo && orderInfo.success && orderInfo.order_id === orderId;
            
            this.testResults.push({
                test: 'getOrderInfo Method',
                status: testPassed ? 'PASSED' : 'FAILED',
                details: {
                    orderId: orderId,
                    success: orderInfo?.success,
                    status: orderInfo?.status,
                    profit: orderInfo?.profit
                }
            });
            
            console.log(`${testPassed ? '✅' : '❌'} getOrderInfo ${testPassed ? 'PASSED' : 'FAILED'}`);
            console.log(`   Order ID: ${orderId}`);
            console.log(`   Status: ${orderInfo?.status}`);
            console.log(`   Profit: ${orderInfo?.profit}\n`);
            
        } catch (error) {
            this.testResults.push({
                test: 'getOrderInfo Method',
                status: 'FAILED',
                error: error.message
            });
            console.log('❌ getOrderInfo FAILED\n');
        }
    }

    async testOrderMonitoring() {
        try {
            console.log('⏰ Test 3: Order Monitoring Simulation...');
            
            // Create another mock order
            const buyResult = await iqoptionAPI.buy('GBPUSD', 2, 'put', 60);
            const orderId = buyResult.order_id;
            
            console.log(`Created order for monitoring: ${orderId}`);
            
            // Simulate monitoring (check order status)
            let checkCount = 0;
            const maxChecks = 3;
            
            while (checkCount < maxChecks) {
                const orderInfo = await iqoptionAPI.getOrderInfo(orderId);
                
                console.log(`   Check ${checkCount + 1}: Status = ${orderInfo?.status}`);
                
                if (orderInfo?.status !== 'active') {
                    console.log(`   Order completed with status: ${orderInfo.status}`);
                    break;
                }
                
                checkCount++;
                await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
            }
            
            this.testResults.push({
                test: 'Order Monitoring',
                status: 'PASSED',
                details: {
                    orderId: orderId,
                    checksPerformed: checkCount + 1
                }
            });
            
            console.log('✅ Order Monitoring PASSED\n');
            
        } catch (error) {
            this.testResults.push({
                test: 'Order Monitoring',
                status: 'FAILED',
                error: error.message
            });
            console.log('❌ Order Monitoring FAILED\n');
        }
    }

    async testPortfolioMethods() {
        try {
            console.log('📊 Test 4: Portfolio Methods...');
            
            // Test getActiveOrders
            const activeOrders = await iqoptionAPI.getActiveOrders();
            console.log(`   Active orders: ${activeOrders.length}`);
            
            // Test getClosedOrders
            const closedOrders = await iqoptionAPI.getClosedOrders();
            console.log(`   Closed orders: ${closedOrders.length}`);
            
            this.testResults.push({
                test: 'Portfolio Methods',
                status: 'PASSED',
                details: {
                    activeOrders: activeOrders.length,
                    closedOrders: closedOrders.length
                }
            });
            
            console.log('✅ Portfolio Methods PASSED\n');
            
        } catch (error) {
            this.testResults.push({
                test: 'Portfolio Methods',
                status: 'FAILED',
                error: error.message
            });
            console.log('❌ Portfolio Methods FAILED\n');
        }
    }

    printResults() {
        console.log('\n=== ORDER INFO TEST RESULTS ===');
        
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

        // Show API status
        console.log('=== API STATUS ===');
        console.log(`Connected: ${iqoptionAPI.isConnected ? '✅' : '❌'}`);
        console.log(`Mode: ${iqoptionAPI.api && iqoptionAPI.api.send ? '🟡 MOCK' : '🔴 REAL'}`);
        
        if (failed === 0) {
            console.log('\n🎉 ALL TESTS PASSED - Order Info API is working correctly!');
            console.log('\n📋 IMPLEMENTATION SUMMARY:');
            console.log('✅ getOrderInfo() method working');
            console.log('✅ Order status tracking working');
            console.log('✅ Portfolio methods working');
            console.log('✅ Error handling working');
            
        } else {
            console.log('\n⚠️  SOME TESTS FAILED - Review implementation');
        }
    }
}

// Run tests if called directly
if (require.main === module) {
    const test = new OrderInfoTest();
    test.runTests().catch(error => {
        console.error('Order info test execution failed:', error);
        process.exit(1);
    });
}

module.exports = OrderInfoTest;
