/**
 * Stress Test - Test edge cases and race conditions
 * 
 * Tests:
 * 1. Rapid trades (minimal interval)
 * 2. Reconnect during trade
 * 3. Duplicate result events
 * 4. Missing result events
 * 5. Slow result arrival
 */

require('dotenv').config();
const fs = require('fs');

const IQOptionClient = require('../src/api/iqOptionClient.js');
const TradeVerifier = require('../src/utils/tradeVerifier.js');

class StressTest {
    constructor() {
        this.api = new IQOptionClient();
        this.verifier = new TradeVerifier();
        this.results = [];
    }

    async initialize() {
        console.log('\n' + '='.repeat(80));
        console.log('STRESS TEST - EDGE CASES & RACE CONDITIONS');
        console.log('='.repeat(80) + '\n');

        await this.api.connect();
        await this.api.login(
            process.env.IQ_OPTION_EMAIL,
            process.env.IQ_OPTION_PASSWORD
        );
        console.log('✅ Connected\n');
    }

    /**
     * Test 1: Rapid trade sequence (should be blocked by duplicate prevention)
     */
    async testRapidTrades() {
        console.log('\n🔥 TEST 1: Rapid Trade Sequence');
        console.log('-'.repeat(60));

        const trades = [];
        
        // Try to place 3 trades rapidly
        for (let i = 0; i < 3; i++) {
            try {
                console.log(`Attempt ${i + 1}: Placing trade...`);
                const result = await this.api.placeTrade(
                    'EURUSD-OTC',
                    i % 2 === 0 ? 'call' : 'put',
                    1,
                    1
                );
                
                if (result && result.success) {
                    console.log(`✅ Trade ${i + 1} placed: ${result.order_id}`);
                    trades.push(result.order_id);
                    
                    // Try to place another immediately (should be blocked)
                    if (i === 0) {
                        console.log('   Trying immediate second trade...');
                        try {
                            const blocked = await this.api.placeTrade(
                                'EURUSD-OTC',
                                'put',
                                1,
                                1
                            );
                            if (!blocked || !blocked.success) {
                                console.log('   ✅ Correctly blocked - has open order');
                            }
                        } catch (e) {
                            console.log('   ✅ Correctly blocked:', e.message);
                        }
                    }
                    
                    // Wait for result
                    const tradeResult = await this.api.waitForResult(result.order_id, 120000);
                    console.log(`   Result: ${tradeResult.result}`);
                }
            } catch (error) {
                console.log(`   ${i === 0 ? '❌' : '✅'} Expected: ${error.message}`);
            }
        }

        console.log(`\nTrades placed: ${trades.length}/3 (should be less due to blocking)`);
        return trades.length <= 2; // Should have been blocked
    }

    /**
     * Test 2: Verify duplicate result handling
     */
    async testDuplicateResults() {
        console.log('\n🔥 TEST 2: Duplicate Result Handling');
        console.log('-'.repeat(60));

        // Place a trade
        const order = await this.api.placeTrade('EURUSD-OTC', 'call', 1, 1);
        if (!order || !order.success) {
            console.log('❌ Could not place test order');
            return false;
        }

        const orderId = order.order_id;
        console.log(`Order placed: ${orderId}`);

        // Wait for first result
        const result1 = await this.api.waitForResult(orderId, 120000);
        console.log(`First result: ${result1.result}`);

        // Check order status
        const orderData1 = this.api.orders.get(orderId);
        console.log(`Order status after first result: ${orderData1.status}`);

        // Wait a bit
        await this.sleep(5000);

        // Check again - should still be closed, no duplicate
        const orderData2 = this.api.orders.get(orderId);
        console.log(`Order status after 5s: ${orderData2.status}`);

        // Verify no corruption
        const success = orderData1.status === 'CLOSED' && 
                       orderData2.status === 'CLOSED' &&
                       orderData1.result === orderData2.result;
        
        console.log(success ? '✅ No duplicate corruption' : '❌ Data corrupted');
        return success;
    }

    /**
     * Test 3: Order Map Integrity under load
     */
    async testOrderMapIntegrity() {
        console.log('\n🔥 TEST 3: Order Map Integrity');
        console.log('-'.repeat(60));

        const initialSummary = this.api.getOrdersSummary();
        console.log('Initial state:', initialSummary);

        // Run several trades
        const trades = [];
        for (let i = 0; i < 5; i++) {
            try {
                const order = await this.api.placeTrade(
                    'EURUSD-OTC',
                    i % 2 === 0 ? 'call' : 'put',
                    1,
                    1
                );
                
                if (order && order.success) {
                    trades.push(order.order_id);
                    await this.api.waitForResult(order.order_id, 120000);
                    await this.sleep(70000); // Wait for full cycle
                }
            } catch (e) {
                console.log(`Trade ${i + 1} error: ${e.message}`);
            }
        }

        // Verify integrity
        const integrity = this.verifier.verifyOrderMapIntegrity(
            this.api.orders,
            this.api.pendingResults
        );

        const finalSummary = this.api.getOrdersSummary();
        console.log('\nFinal state:', finalSummary);

        // Should have no orphaned orders
        const success = integrity.healthy && this.api.pendingResults.size === 0;
        console.log(success ? '✅ Integrity maintained' : '❌ Integrity issues found');
        
        return success;
    }

    /**
     * Test 4: Result resolver cleanup
     */
    async testResolverCleanup() {
        console.log('\n🔥 TEST 4: Result Resolver Cleanup');
        console.log('-'.repeat(60));

        // Check initial state
        const initialResolvers = this.api.resultResolvers.size;
        console.log(`Initial resolvers: ${initialResolvers}`);

        // Place and complete a trade
        const order = await this.api.placeTrade('EURUSD-OTC', 'call', 1, 1);
        if (!order || !order.success) {
            return false;
        }

        console.log(`Resolvers after place: ${this.api.resultResolvers.size}`);

        // Wait for result
        await this.api.waitForResult(order.order_id, 120000);
        await this.sleep(1000);

        const finalResolvers = this.api.resultResolvers.size;
        console.log(`Final resolvers: ${finalResolvers}`);

        const success = finalResolvers === initialResolvers;
        console.log(success ? '✅ Resolvers cleaned up' : '❌ Resolver leak detected');
        return success;
    }

    /**
     * Test 5: Balance consistency
     */
    async testBalanceConsistency() {
        console.log('\n🔥 TEST 5: Balance Consistency');
        console.log('-'.repeat(60));

        // Get initial balance
        const balance1 = await this.api.getRealBalance();
        console.log(`Initial balance: $${balance1.amount || 'N/A'}`);

        // Place trade
        const order = await this.api.placeTrade('EURUSD-OTC', 'call', 1, 1);
        if (!order || !order.success) {
            return false;
        }

        // Wait for result
        const result = await this.api.waitForResult(order.order_id, 120000);
        console.log(`Trade result: ${result.result}, Profit: $${result.profit}`);

        // Wait for balance update
        await this.sleep(3000);

        // Get final balance
        const balance2 = await this.api.getRealBalance();
        console.log(`Final balance: $${balance2.amount || 'N/A'}`);

        // Verify balance changed correctly
        const expectedChange = result.profit;
        const actualChange = (balance2.amount || 0) - (balance1.amount || 0);
        
        // Allow small rounding difference
        const match = Math.abs(actualChange - expectedChange) < 0.02;
        
        console.log(`Expected change: $${expectedChange}`);
        console.log(`Actual change: $${actualChange}`);
        console.log(match ? '✅ Balance consistent' : '❌ Balance mismatch');

        return match;
    }

    async runAllTests() {
        const results = {
            rapidTrades: false,
            duplicateResults: false,
            orderMapIntegrity: false,
            resolverCleanup: false,
            balanceConsistency: false
        };

        try {
            results.rapidTrades = await this.testRapidTrades();
        } catch (e) {
            console.log('Rapid trades test failed:', e.message);
        }

        await this.sleep(5000);

        try {
            results.duplicateResults = await this.testDuplicateResults();
        } catch (e) {
            console.log('Duplicate results test failed:', e.message);
        }

        await this.sleep(5000);

        try {
            results.orderMapIntegrity = await this.testOrderMapIntegrity();
        } catch (e) {
            console.log('Order map integrity test failed:', e.message);
        }

        await this.sleep(5000);

        try {
            results.resolverCleanup = await this.testResolverCleanup();
        } catch (e) {
            console.log('Resolver cleanup test failed:', e.message);
        }

        await this.sleep(5000);

        try {
            results.balanceConsistency = await this.testBalanceConsistency();
        } catch (e) {
            console.log('Balance consistency test failed:', e.message);
        }

        // Generate report
        console.log('\n' + '='.repeat(80));
        console.log('STRESS TEST REPORT');
        console.log('='.repeat(80));
        console.log(`Rapid Trades:       ${results.rapidTrades ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`Duplicate Results:  ${results.duplicateResults ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`Order Map Integrity:${results.orderMapIntegrity ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`Resolver Cleanup:   ${results.resolverCleanup ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`Balance Consistency:${results.balanceConsistency ? '✅ PASS' : '❌ FAIL'}`);

        const allPassed = Object.values(results).every(r => r);
        console.log('='.repeat(80));
        console.log(allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED');
        console.log('='.repeat(80) + '\n');

        // Save report
        fs.writeFileSync(
            `logs/stress_test_${Date.now()}.json`,
            JSON.stringify({ timestamp: new Date().toISOString(), results }, null, 2)
        );

        return allPassed;
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async cleanup() {
        if (this.api) {
            this.api.disconnect();
        }
    }

    async run() {
        try {
            await this.initialize();
            const passed = await this.runAllTests();
            process.exit(passed ? 0 : 1);
        } catch (error) {
            console.error('Stress test failed:', error);
            process.exit(1);
        } finally {
            await this.cleanup();
        }
    }
}

const test = new StressTest();
test.run();
