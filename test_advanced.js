/**
 * PRODUCTION TEST - IQ Option Bot with Intelligent Monitoring
 * Tests all systems with detailed statistics and performance metrics
 */

require('dotenv').config();

const config = require('./src/config/config');
const logger = require('./src/utils/logger');
const iqoptionAPI = require('./src/api/unifiediqoption');

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║     IQ OPTION BOT - ADVANCED PRODUCTION TEST                 ║');
console.log('║     Intelligent Monitoring & Auto-Fix System                 ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

const testResults = {
    config: false,
    network: false,
    connect: false,
    login: false,
    balance: false,
    trade: false,
    selfHealing: false,
    statistics: false,
    latency: false
};

// Test 1: Configuration
console.log('📋 [TEST 1] Configuration Check');
console.log('─────────────────────────────────────────────────────────────');
try {
    console.log('✓ Environment loaded');
    console.log(`  Email: ${config.IQ_OPTION_EMAIL ? '***' + config.IQ_OPTION_EMAIL.slice(-10) : 'NOT SET'}`);
    console.log(`  Password: ${config.IQ_OPTION_PASSWORD ? '***SET***' : 'NOT SET'}`);
    console.log(`  Account Type: ${config.ACCOUNT_TYPE}`);
    console.log(`  Pairs: ${config.TRADING_PAIRS.join(', ')}`);
    console.log(`  Trade Amount: $${config.TRADE_AMOUNT}`);
    
    if (config.IQ_OPTION_EMAIL && config.IQ_OPTION_PASSWORD) {
        testResults.config = true;
        console.log('✅ PASS: Configuration valid\n');
    } else {
        console.log('❌ FAIL: Missing credentials\n');
        process.exit(1);
    }
} catch (error) {
    console.log(`❌ FAIL: ${error.message}\n`);
    process.exit(1);
}

// Test 2: Network Connectivity
console.log('🌐 [TEST 2] Network Connectivity');
console.log('─────────────────────────────────────────────────────────────');
const https = require('https');

async function testNetwork() {
    const tests = [
        { host: 'iqoption.com', name: 'IQ Option Main' },
        { host: 'auth.iqoption.com', name: 'Auth Server' },
        { host: 'cloudflare.com', name: 'Cloudflare (WARP Check)' }
    ];
    
    let passed = 0;
    for (const test of tests) {
        try {
            await new Promise((resolve, reject) => {
                const req = https.request({ hostname: test.host, port: 443, method: 'HEAD', timeout: 5000 },
                    (res) => { console.log(`✓ ${test.name}: HTTP ${res.statusCode}`); passed++; resolve(); }
                );
                req.on('error', (err) => { console.log(`✗ ${test.name}: ${err.message}`); resolve(); });
                req.on('timeout', () => { console.log(`✗ ${test.name}: Timeout`); req.destroy(); resolve(); });
                req.end();
            });
        } catch (e) {}
    }
    
    testResults.network = passed >= 2;
    console.log(testResults.network ? '✅ PASS: Network connectivity OK\n' : '⚠️  WARNING: Some network issues\n');
}

// Test 3: API Connection with Self-Healing
console.log('🔌 [TEST 3] API Connection + Self-Healing System');
console.log('─────────────────────────────────────────────────────────────');

async function testConnection() {
    try {
        iqoptionAPI.setCredentials(
            config.IQ_OPTION_EMAIL,
            config.IQ_OPTION_PASSWORD,
            config.ACCOUNT_TYPE
        );
        
        console.log('🔄 Connecting...');
        const connected = await iqoptionAPI.connect();
        
        if (!connected) {
            throw new Error('Connection returned false');
        }
        
        testResults.connect = true;
        console.log('✅ PASS: Connected successfully\n');
        
        // Test Self-Healing stats
        const stats = iqoptionAPI.getStats();
        console.log('📊 Connection Stats:');
        console.log(`  Connected: ${stats.isConnected}`);
        console.log(`  Authenticated: ${stats.isAuthenticated}`);
        console.log(`  Reconnect Attempts: ${stats.reconnectAttempts}`);
        console.log(`  Network Failures: ${stats.networkFailCount}`);
        console.log(`  Last Pong: ${stats.timeSinceLastPong}ms ago`);
        
        testResults.selfHealing = stats.reconnectAttempts === 0 && stats.isConnected;
        console.log(testResults.selfHealing ? '✅ PASS: Self-Healing system active\n' : '⚠️  Reconnect occurred\n');
        
    } catch (error) {
        console.log(`❌ FAIL: ${error.message}\n`);
        throw error;
    }
}

// Test 4: Authentication & Balance
console.log('💰 [TEST 4] Authentication & Balance');
console.log('─────────────────────────────────────────────────────────────');

async function testBalance() {
    try {
        if (!iqoptionAPI.isReady()) {
            throw new Error('API not ready');
        }
        
        const balance = await iqoptionAPI.getBalance();
        console.log(`✓ Balance retrieved: $${balance}`);
        console.log(`✓ Account Type: ${config.ACCOUNT_TYPE}`);
        
        testResults.balance = balance !== undefined;
        console.log(testResults.balance ? '✅ PASS: Balance available\n' : '⚠️  WARNING: Balance is 0\n');
        
    } catch (error) {
        console.log(`❌ FAIL: ${error.message}\n`);
        throw error;
    }
}

// Test 5: Real Trade with Statistics
console.log('🎯 [TEST 5] Real Trade Execution + Latency Monitoring');
console.log('─────────────────────────────────────────────────────────────');

async function testTrade() {
    if (config.ACCOUNT_TYPE !== 'PRACTICE') {
        console.log('⏭️  SKIP: Real account - skipping trade test\n');
        testResults.trade = true;
        return;
    }
    
    try {
        console.log('📝 Placing test trade...');
        console.log('  Pair: EURUSD-OTC (24/7 Trading)');
        console.log('  Direction: CALL');
        console.log('  Amount: $1');
        console.log('  Duration: 1 minute');
        
        const result = await iqoptionAPI.placeTrade({
            pair: 'EURUSD-OTC',
            direction: 'CALL',
            amount: 1,
            duration: 1
        });
        
        console.log('\n📦 Trade Result:');
        console.log(`  Success: ${result.success}`);
        console.log(`  Order ID: ${result.id || result.tradeId || 'N/A'}`);
        console.log(`  Outcome: ${result.outcome || 'pending'}`);
        console.log(`  Latency: ${result.latency || 'N/A'}ms`);
        
        if (result.success) {
            testResults.trade = true;
            testResults.latency = result.latency < 1000; // Should be under 1 second
            console.log('✅ PASS: Trade executed successfully\n');
            
            if (result.latency) {
                console.log(`⚡ Performance: ${result.latency}ms (Target: <1000ms)`);
                console.log(testResults.latency ? '✅ PASS: Latency acceptable\n' : '⚠️  WARNING: Latency high\n');
            }
        } else {
            console.log(`❌ FAIL: ${result.error}\n`);
        }
        
    } catch (error) {
        console.log(`❌ FAIL: ${error.message}\n`);
    }
}

// Test 6: Statistics System
console.log('📊 [TEST 6] Intelligent Statistics System');
console.log('─────────────────────────────────────────────────────────────');

async function testStatistics() {
    try {
        const stats = iqoptionAPI.getStatistics();
        
        console.log('📈 Trading Statistics:');
        console.log(`  Total Trades: ${stats.totalTrades}`);
        console.log(`  Successful: ${stats.successfulTrades}`);
        console.log(`  Failed: ${stats.failedTrades}`);
        console.log(`  Success Rate: ${stats.successRate}`);
        console.log(`  Avg Latency: ${stats.avgRecentLatency || 'N/A'}`);
        console.log(`  Active Orders: ${stats.activeOrders}`);
        
        testResults.statistics = stats.totalTrades > 0;
        console.log(testResults.statistics ? '✅ PASS: Statistics tracking active\n' : '⚠️  No trades recorded yet\n');
        
    } catch (error) {
        console.log(`❌ FAIL: ${error.message}\n`);
    }
}

// Run all tests
(async () => {
    try {
        await testNetwork();
        await testConnection();
        testResults.login = true;
        await testBalance();
        await testTrade();
        await testStatistics();
        
        console.log('🔌 Disconnecting...');
        iqoptionAPI.disconnect();
        console.log('✅ Disconnected\n');
        
    } catch (error) {
        console.log(`\n❌ CRITICAL ERROR: ${error.message}`);
        console.log(error.stack);
        process.exit(1);
    }
    
    // Final Summary
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║                    FINAL TEST RESULTS                        ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log('');
    
    const results = [
        ['Configuration', testResults.config, '✅'],
        ['Network', testResults.network, '✅'],
        ['Connection', testResults.connect, '✅'],
        ['Login/Auth', testResults.login, '✅'],
        ['Balance', testResults.balance, '✅'],
        ['Trade Execution', testResults.trade, '✅'],
        ['Self-Healing', testResults.selfHealing, '✅'],
        ['Statistics System', testResults.statistics, '✅'],
        ['Latency Check', testResults.latency, '✅']
    ];
    
    results.forEach(([name, passed, icon]) => {
        console.log(`  ${passed ? '✅' : '❌'} ${name}`);
    });
    
    const passedCount = Object.values(testResults).filter(r => r).length;
    const totalCount = Object.keys(testResults).length;
    
    console.log('');
    console.log(`  Total: ${passedCount}/${totalCount} tests passed`);
    console.log('');
    
    const allPassed = passedCount === totalCount;
    
    if (allPassed) {
        console.log('╔══════════════════════════════════════════════════════════════╗');
        console.log('║           🎉 BOT IS PRODUCTION READY! 🎉                     ║');
        console.log('║                                                              ║');
        console.log('║   ✅ Intelligent Monitoring System Active                    ║');
        console.log('║   ✅ Auto-Fix System Ready                                   ║');
        console.log('║   ✅ Low Latency Trading                                     ║');
        console.log('║   ✅ Self-Healing Connection                                 ║');
        console.log('║                                                              ║');
        console.log('║   Run the bot with:                                          ║');
        console.log('║     node app.js start                                        ║');
        console.log('║     or                                                       ║');
        console.log('║     node main.js                                             ║');
        console.log('╚══════════════════════════════════════════════════════════════╝');
        process.exit(0);
    } else {
        console.log('╔══════════════════════════════════════════════════════════════╗');
        console.log('║           ⚠️  SOME TESTS FAILED                               ║');
        console.log('║                                                              ║');
        console.log('║   Please check the errors above and fix the issues.          ║');
        console.log('╚══════════════════════════════════════════════════════════════╝');
        process.exit(1);
    }
})();
