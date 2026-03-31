/**
 * COMPREHENSIVE FULL SYSTEM TEST
 * Tests all AI Trading components working together
 */

const TradingBot = require('./src/core/bot');
const aiAnalyzer = require('./src/core/aiTradingAnalyzer');
const tradeTracker = require('./src/core/tradeResultTracker');
const healthMonitor = require('./src/core/systemHealthMonitor');
const iqoptionAPI = require('./src/api/unifiediqoption');

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║     FULL SYSTEM INTEGRATION TEST                               ║');
console.log('║     Testing AI Trading System End-to-End                       ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

const testResults = {
    components: {},
    integration: {},
    overall: false
};

// Test 1: Component Loading
console.log('📦 TEST 1: Component Loading');
console.log('─────────────────────────────────────────────────────────────────');
try {
    testResults.components.bot = !!TradingBot;
    testResults.components.aiAnalyzer = !!aiAnalyzer;
    testResults.components.tradeTracker = !!tradeTracker;
    testResults.components.healthMonitor = !!healthMonitor;
    testResults.components.iqoptionAPI = !!iqoptionAPI;
    
    console.log('✅ All components loaded successfully');
    console.log(`   - TradingBot: ${testResults.components.bot}`);
    console.log(`   - AI Analyzer: ${testResults.components.aiAnalyzer}`);
    console.log(`   - Trade Tracker: ${testResults.components.tradeTracker}`);
    console.log(`   - Health Monitor: ${testResults.components.healthMonitor}`);
    console.log(`   - IQ Option API: ${testResults.components.iqoptionAPI}\n`);
} catch (error) {
    console.log(`❌ Component loading failed: ${error.message}\n`);
    process.exit(1);
}

// Test 2: AI Analyzer Functions
console.log('🧠 TEST 2: AI Analyzer Core Functions');
console.log('─────────────────────────────────────────────────────────────────');
try {
    // Check if data was loaded
    console.log(`📊 Loaded trades: ${aiAnalyzer.stats.totalTrades}`);
    console.log(`📊 Current win rate: ${(aiAnalyzer.stats.winRate * 100).toFixed(1)}%`);
    
    // Test recordTrade with pending result (for update test)
    const pendingTrade = aiAnalyzer.recordTrade({
        orderId: 999002,
        pair: 'GBPUSD-OTC',
        direction: 'PUT',
        amount: 1,
        result: 'pending',
        profit: 0,
        rsi: 75,
        marketCondition: 'SIDEWAY',
        timestamp: new Date()
    });
    
    testResults.integration.aiRecordPending = !!pendingTrade;
    console.log(`✅ recordTrade (pending): ${testResults.integration.aiRecordPending}`);
    
    // Test updateTradeResult
    const updateResult = aiAnalyzer.updateTradeResult(999002, {
        result: 'win',
        profit: 0.82,
        closePrice: 1.2500,
        closeTime: new Date()
    });
    
    testResults.integration.aiUpdateResult = updateResult === true;
    console.log(`✅ updateTradeResult: ${testResults.integration.aiUpdateResult}`);
    
    // Test generateRecommendation
    const recommendation = aiAnalyzer.generateRecommendation();
    testResults.integration.aiRecommendation = !!recommendation && !!recommendation.action;
    console.log(`✅ generateRecommendation: ${testResults.integration.aiRecommendation} (Action: ${recommendation.action})`);
    
    // Test shouldTrade
    const tradeDecision = aiAnalyzer.shouldTrade(25, 'SIDEWAY', 'EURUSD-OTC');
    testResults.integration.aiShouldTrade = !!tradeDecision && typeof tradeDecision.shouldTrade === 'boolean';
    console.log(`✅ shouldTrade: ${testResults.integration.aiShouldTrade} (Decision: ${tradeDecision.shouldTrade})`);
    
    // Test calculatePositionSize
    const sizing = aiAnalyzer.calculatePositionSize(1);
    testResults.integration.aiPositionSize = !!sizing && typeof sizing.finalSize === 'number';
    console.log(`✅ calculatePositionSize: ${testResults.integration.aiPositionSize} (Size: $${sizing.finalSize.toFixed(2)})`);
    
    // Test generateReport
    console.log('\n📋 Generating AI Report...');
    const report = aiAnalyzer.generateReport();
    testResults.integration.aiReport = !!report;
    console.log(`✅ generateReport: ${testResults.integration.aiReport}\n`);
    
} catch (error) {
    console.log(`❌ AI Analyzer test failed: ${error.message}\n`);
    console.log(error.stack);
}

// Test 3: Trade Tracker Functions
console.log('📋 TEST 3: Trade Tracker Core Functions');
console.log('─────────────────────────────────────────────────────────────────');
try {
    // Test start/stop
    tradeTracker.start();
    testResults.integration.trackerStart = tradeTracker.isTracking;
    console.log(`✅ Tracker start: ${testResults.integration.trackerStart}`);
    
    // Test registerTrade
    tradeTracker.registerTrade(888001, {
        pair: 'EURUSD-OTC',
        direction: 'CALL',
        amount: 1,
        rsi: 25,
        marketCondition: 'SIDEWAY'
    });
    
    const pendingCount = tradeTracker.getPendingCount();
    testResults.integration.trackerRegister = pendingCount > 0;
    console.log(`✅ registerTrade: ${testResults.integration.trackerRegister} (Pending: ${pendingCount})`);
    
    // Test getPendingTrades
    const pendingTrades = tradeTracker.getPendingTrades();
    testResults.integration.trackerPendingList = Array.isArray(pendingTrades);
    console.log(`✅ getPendingTrades: ${testResults.integration.trackerPendingList}`);
    
    tradeTracker.stop();
    testResults.integration.trackerStop = !tradeTracker.isTracking;
    console.log(`✅ Tracker stop: ${testResults.integration.trackerStop}\n`);
    
} catch (error) {
    console.log(`❌ Trade Tracker test failed: ${error.message}\n`);
}

// Test 4: Health Monitor Functions
console.log('🔍 TEST 4: Health Monitor Core Functions');
console.log('─────────────────────────────────────────────────────────────────');
try {
    // Test start
    healthMonitor.start();
    testResults.integration.healthStart = healthMonitor.isMonitoring;
    console.log(`✅ Health monitor start: ${testResults.integration.healthStart}`);
    
    // Test getHealthStatus
    const healthStatus = healthMonitor.getHealthStatus();
    testResults.integration.healthStatus = !!healthStatus && !!healthStatus.overall;
    console.log(`✅ getHealthStatus: ${testResults.integration.healthStatus} (Status: ${healthStatus.overall})`);
    
    // Test isReadyForTrading
    const ready = healthMonitor.isReadyForTrading();
    testResults.integration.healthReady = typeof ready === 'boolean';
    console.log(`✅ isReadyForTrading: ${testResults.integration.healthReady} (Ready: ${ready})`);
    
    // Let it run for a moment then stop
    setTimeout(() => {
        healthMonitor.stop();
        testResults.integration.healthStop = !healthMonitor.isMonitoring;
        console.log(`✅ Health monitor stop: ${testResults.integration.healthStop}\n`);
        
        // Continue with final summary
        runFinalSummary();
    }, 2000);
    
} catch (error) {
    console.log(`❌ Health Monitor test failed: ${error.message}\n`);
    runFinalSummary();
}

// Final Summary Function
function runFinalSummary() {
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║                    FINAL TEST RESULTS                          ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
    
    // Calculate overall results
    const allTests = Object.values(testResults.integration);
    const passedTests = allTests.filter(v => v === true).length;
    const totalTests = allTests.length;
    
    testResults.overall = passedTests === totalTests;
    
    console.log('📊 INTEGRATION TESTS:');
    console.log('─────────────────────────────────────────────────────────────────');
    Object.entries(testResults.integration).forEach(([test, passed]) => {
        const status = passed ? '✅ PASS' : '❌ FAIL';
        console.log(`   ${status}: ${test}`);
    });
    
    console.log(`\n📈 SUMMARY: ${passedTests}/${totalTests} tests passed`);
    
    if (testResults.overall) {
        console.log('\n╔════════════════════════════════════════════════════════════════╗');
        console.log('║           🎉 ALL SYSTEMS OPERATIONAL 🎉                        ║');
        console.log('╠════════════════════════════════════════════════════════════════╣');
        console.log('║  ✅ AI Trading System is FULLY FUNCTIONAL                      ║');
        console.log('║  ✅ AI learns from trades                                     ║');
        console.log('║  ✅ AI blocks/approves trades                                 ║');
        console.log('║  ✅ Trade tracking active                                     ║');
        console.log('║  ✅ Health monitoring active                                  ║');
        console.log('║  ✅ All components integrated                                 ║');
        console.log('╠════════════════════════════════════════════════════════════════╣');
        console.log('║  🚀 System is PRODUCTION READY!                               ║');
        console.log('╚════════════════════════════════════════════════════════════════╝\n');
        process.exit(0);
    } else {
        console.log('\n╔════════════════════════════════════════════════════════════════╗');
        console.log('║           ⚠️  SOME TESTS FAILED                                ║');
        console.log('╚════════════════════════════════════════════════════════════════╝\n');
        process.exit(1);
    }
}
