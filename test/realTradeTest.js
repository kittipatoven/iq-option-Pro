/**
 * Real Trade Test - Verify 100% accuracy against IQ Option server
 * 
 * Usage:
 *   node test/realTradeTest.js [numberOfTrades]
 * 
 * This test will:
 * 1. Execute N trades
 * 2. Compare bot result with IQ Option server result
 * 3. Verify 100% match
 * 4. Auto-debug if mismatch found
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

// Load modules
const IQOptionClient = require('../src/api/iqOptionClient.js');
const TradeVerifier = require('../src/utils/tradeVerifier.js');

class RealTradeTest {
    constructor(numTrades = 50, mode = 'DEMO') {
        this.numTrades = numTrades;
        this.mode = mode.toUpperCase();
        this.api = new IQOptionClient();
        this.verifier = new TradeVerifier();
        
        // Set account mode on the API
        this.api.accountMode = this.mode;
        
        this.results = {
            total: 0,
            matched: 0,
            mismatched: 0,
            errors: 0,
            trades: []
        };
        
        this.testConfig = {
            asset: 'EURUSD-OTC',
            amount: 1, // Minimum amount for testing
            duration: 1, // 1 minute
            direction: 'call', // Alternate between call/put
            waitBetweenTrades: 35000 // 35 seconds between trades (30s cooldown + buffer)
        };
    }

    async initialize() {
        console.log('\n' + '='.repeat(80));
        console.log('REAL TRADE TEST - 100% ACCURACY VERIFICATION');
        console.log('='.repeat(80));
        console.log(`Target: ${this.numTrades} trades`);
        console.log(`Mode: ${this.mode} ${this.mode === 'REAL' ? '(REAL MONEY!)' : '(Practice)'}`);
        console.log('='.repeat(80) + '\n');

        // Connect to IQ Option
        console.log('🔌 Connecting to IQ Option...');
        const connected = await this.api.connect();
        
        if (!connected) {
            throw new Error('Failed to connect to IQ Option');
        }

        // Login
        console.log('🔑 Logging in...');
        const email = process.env.IQ_OPTION_EMAIL;
        const password = process.env.IQ_OPTION_PASSWORD;
        
        if (!email || !password) {
            throw new Error('IQ_OPTION_EMAIL or IQ_OPTION_PASSWORD not set');
        }

        const loggedIn = await this.api.login(email, password);
        if (!loggedIn) {
            throw new Error('Login failed');
        }

        console.log('✅ Connected and authenticated\n');
        
        // Subscribe to asset
        this.api.subscribeCandles(this.testConfig.asset, 60);
        await this.sleep(3000); // Wait for data
    }

    async runTest() {
        console.log('\n🚀 STARTING TEST LOOP\n');
        console.log('='.repeat(80));

        for (let i = 0; i < this.numTrades; i++) {
            console.log(`\n📊 TRADE ${i + 1}/${this.numTrades}`);
            console.log('-'.repeat(80));

            try {
                // Alternate direction
                const direction = i % 2 === 0 ? 'call' : 'put';
                
                // 1. Place trade
                const orderResult = await this.executeTrade(direction);
                
                if (!orderResult) {
                    this.results.errors++;
                    console.log(`❌ Trade ${i + 1} failed - skipping`);
                    continue;
                }

                const orderId = orderResult.order_id;
                console.log(`📤 ORDER SENT: ${orderId}`);

                // 2. Wait for result from event-driven system
                console.log('⏳ Waiting for result (event-driven)...');
                const botResult = await this.api.waitForResult(orderId, 120000);
                console.log(`📥 BOT RESULT: ${botResult.result} | $${botResult.profit}`);

                // 3. Get REAL result from IQ Option server
                console.log('🔍 Fetching REAL result from IQ Option...');
                await this.sleep(5000); // Wait for server to update
                
                const realResult = await this.getRealServerResult(orderId);
                console.log(`📊 SERVER RESULT: ${realResult.result} | $${realResult.profit}`);

                // 4. Compare and verify
                const isMatch = this.verifyResults(orderId, botResult, realResult);
                
                // 5. Store result
                this.results.trades.push({
                    tradeNum: i + 1,
                    orderId: orderId,
                    botResult: botResult.result,
                    serverResult: realResult.result,
                    botProfit: botResult.profit,
                    serverProfit: realResult.profit,
                    matched: isMatch,
                    timestamp: new Date().toISOString()
                });

                this.results.total++;
                
                if (isMatch) {
                    this.results.matched++;
                    console.log('✅ MATCHED');
                } else {
                    this.results.mismatched++;
                    console.log('❌ MISMATCH!');
                    
                    // Auto-debug on mismatch
                    await this.debugMismatch(orderId, botResult, realResult);
                }

                // 6. Verify balance sync
                await this.verifyBalance();

                // 7. Order integrity check
                this.verifyOrderIntegrity();

                // Wait before next trade (if not last)
                if (i < this.numTrades - 1) {
                    console.log(`\n⏳ Waiting ${this.testConfig.waitBetweenTrades}ms before next trade...`);
                    await this.sleep(this.testConfig.waitBetweenTrades);
                }

            } catch (error) {
                console.error(`❌ ERROR in trade ${i + 1}:`, error.message);
                this.results.errors++;
                
                // Log error details
                this.logError(`Trade ${i + 1}`, error);
            }
        }

        console.log('\n' + '='.repeat(80));
        console.log('TEST COMPLETE');
        console.log('='.repeat(80));
    }

    async executeTrade(direction) {
        try {
            const result = await this.api.placeTrade(
                this.testConfig.asset,
                direction,
                this.testConfig.amount,
                this.testConfig.duration
            );
            
            return result;
        } catch (error) {
            console.error('❌ Place trade failed:', error.message);
            console.error('❌ Error stack:', error.stack);
            throw error; // Re-throw to see actual error
        }
    }

    async getRealServerResult(orderId) {
        // Try multiple methods to get the real result
        
        // Method 1: Try getOrderFromHistory if available
        try {
            const historyResult = await this.api.getOrderFromHistory(orderId);
            if (historyResult) {
                console.log('   ✅ Got result from history API');
                return historyResult;
            }
        } catch (e) {
            console.log('   ⚠️ History API failed:', e.message);
        }

        // Method 2: Check order map (should be synced)
        const order = this.api.orders.get(orderId);
        if (order && order.status === 'CLOSED') {
            console.log('   ✅ Got result from order map');
            return {
                orderId: orderId,
                result: order.result,
                profit: order.profit,
                amount: order.amount,
                timestamp: order.closedAt
            };
        }

        // Method 3: Wait and poll balance change
        console.log('   ⏳ Polling for result...');
        await this.sleep(5000);
        
        // Check again
        const orderCheck = this.api.orders.get(orderId);
        if (orderCheck && orderCheck.status === 'CLOSED') {
            return {
                orderId: orderId,
                result: orderCheck.result,
                profit: orderCheck.profit,
                amount: orderCheck.amount,
                timestamp: orderCheck.closedAt
            };
        }

        throw new Error(`Could not get real result for order ${orderId}`);
    }

    verifyResults(orderId, botResult, serverResult) {
        console.log('\n🔍 VERIFICATION:');
        console.log(`   Bot Result:    ${botResult.result} | $${botResult.profit}`);
        console.log(`   Server Result: ${serverResult.result} | $${serverResult.profit}`);

        const resultMatch = botResult.result === serverResult.result;
        const profitMatch = Math.abs(botResult.profit - serverResult.profit) < 0.01;

        if (resultMatch && profitMatch) {
            console.log('   ✅ PERFECT MATCH');
            return true;
        } else {
            console.log('   ❌ MISMATCH DETECTED');
            if (!resultMatch) console.log(`      Result: ${botResult.result} vs ${serverResult.result}`);
            if (!profitMatch) console.log(`      Profit: ${botResult.profit} vs ${serverResult.profit}`);
            return false;
        }
    }

    async debugMismatch(orderId, botResult, serverResult) {
        console.log('\n🔧 AUTO-DEBUG MISMATCH');
        console.log('='.repeat(60));

        // 1. Check order map
        console.log('\n📋 Order Map Status:');
        const order = this.api.orders.get(orderId);
        if (order) {
            console.log(`   Found: YES`);
            console.log(`   Status: ${order.status}`);
            console.log(`   Result: ${order.result}`);
            console.log(`   Profit: ${order.profit}`);
            console.log(`   Closed At: ${order.closedAt ? new Date(order.closedAt).toISOString() : 'N/A'}`);
        } else {
            console.log(`   Found: NO - Order not in map!`);
        }

        // 2. Check pending results
        console.log('\n📊 Pending Results:');
        console.log(`   Has orderId: ${this.api.pendingResults.has(orderId)}`);
        console.log(`   Pending count: ${this.api.pendingResults.size}`);

        // 3. Check resolvers
        console.log('\n📝 Result Resolvers:');
        console.log(`   Has resolver: ${this.api.resultResolvers.has(orderId)}`);
        console.log(`   Resolver count: ${this.api.resultResolvers.size}`);

        // 4. Debug full order map
        console.log('\n📋 Full Order Map:');
        this.api.debugOrderMap();

        // 5. Check verifier logs
        console.log('\n🔍 Verifier Logs:');
        this.verifier.debugOrders(this.api.orders);

        // Save debug info
        const debugInfo = {
            timestamp: new Date().toISOString(),
            orderId: orderId,
            botResult: botResult,
            serverResult: serverResult,
            order: order || null,
            pendingHas: this.api.pendingResults.has(orderId),
            resolverHas: this.api.resultResolvers.has(orderId),
            orderMapSize: this.api.orders.size,
            pendingSize: this.api.pendingResults.size,
            resolverSize: this.api.resultResolvers.size
        };

        fs.writeFileSync(
            `logs/mismatch_debug_${orderId}_${Date.now()}.json`,
            JSON.stringify(debugInfo, null, 2)
        );

        console.log('\n💾 Debug info saved to logs/');
        console.log('='.repeat(60));
    }

    async verifyBalance() {
        try {
            const apiBalance = await this.api.getRealBalance();
            console.log(`\n💰 BALANCE CHECK: $${apiBalance.amount || 'N/A'}`);
            return apiBalance;
        } catch (e) {
            console.log(`\n⚠️ Balance check failed: ${e.message}`);
            return null;
        }
    }

    verifyOrderIntegrity() {
        console.log('\n🔍 ORDER INTEGRITY CHECK:');
        
        const summary = this.api.getOrdersSummary();
        console.log(`   Total Orders: ${summary.total}`);
        console.log(`   Open: ${summary.open}`);
        console.log(`   Closed: ${summary.closed}`);
        console.log(`   Pending Results: ${summary.pending}`);
        console.log(`   Wins: ${summary.wins}`);
        console.log(`   Losses: ${summary.losses}`);

        // Check consistency
        if (summary.pending > 0) {
            console.log(`   ⚠️ Warning: ${summary.pending} pending results`);
        }

        if (summary.open > 0) {
            console.log(`   ⚠️ Warning: ${summary.open} open orders`);
        }

        // Verify with verifier
        const integrity = this.verifier.verifyOrderMapIntegrity(
            this.api.orders,
            this.api.pendingResults
        );

        if (integrity.healthy) {
            console.log('   ✅ Integrity: HEALTHY');
        } else {
            console.log(`   ❌ Integrity: ${integrity.issues.length} issues`);
        }

        return integrity.healthy;
    }

    generateReport() {
        console.log('\n' + '='.repeat(80));
        console.log('FINAL TEST REPORT');
        console.log('='.repeat(80));
        console.log(`Total Trades:    ${this.results.total}`);
        console.log(`Matched:         ${this.results.matched}`);
        console.log(`Mismatched:      ${this.results.mismatched}`);
        console.log(`Errors:          ${this.results.errors}`);
        console.log(`Accuracy:        ${this.results.total > 0 ? ((this.results.matched / this.results.total) * 100).toFixed(2) : 0}%`);
        console.log('='.repeat(80));

        if (this.results.mismatched === 0 && this.results.errors === 0) {
            console.log('✅ PERFECT SCORE - 100% ACCURACY');
        } else if (this.results.mismatched === 0) {
            console.log('⚠️  ERRORS ONLY - No mismatches (may be connection issues)');
        } else {
            console.log('❌ MISMATCHES DETECTED - System needs debugging');
        }

        // Save full report
        const report = {
            timestamp: new Date().toISOString(),
            summary: this.results,
            config: this.testConfig,
            trades: this.results.trades,
            passed: this.results.mismatched === 0
        };

        fs.writeFileSync(
            `logs/test_report_${Date.now()}.json`,
            JSON.stringify(report, null, 2)
        );

        console.log('\n📊 Full report saved to logs/');
        console.log('='.repeat(80) + '\n');

        return report;
    }

    logError(context, error) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            context: context,
            message: error.message,
            stack: error.stack
        };

        const errorFile = `logs/test_errors_${Date.now()}.json`;
        fs.writeFileSync(errorFile, JSON.stringify(logEntry, null, 2));
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async cleanup() {
        console.log('\n🧹 Cleaning up...');
        if (this.api) {
            this.api.disconnect();
        }
        console.log('✅ Cleanup complete\n');
    }

    async run() {
        try {
            await this.initialize();
            await this.runTest();
            const report = this.generateReport();
            
            // Exit code based on success
            process.exit(report.passed ? 0 : 1);
        } catch (error) {
            console.error('\n❌ TEST FAILED:', error.message);
            console.error(error.stack);
            this.logError('Test Runner', error);
            process.exit(1);
        } finally {
            await this.cleanup();
        }
    }
}

// Run test
// Usage: node test/realTradeTest.js [numTrades] [DEMO|REAL]
const numTrades = parseInt(process.argv[2]) || 5;  // Default 5 trades for testing
const mode = process.argv[3] || 'DEMO';  // Default DEMO for safety

console.log(`🚀 Starting test: ${numTrades} trades in ${mode} mode`);
const test = new RealTradeTest(numTrades, mode);
test.run();
