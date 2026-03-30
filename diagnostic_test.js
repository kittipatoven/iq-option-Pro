/**
 * DIAGNOSTIC TEST - IQ Option Trading Bot
 * Tests all critical components before running live trading
 * 
 * Usage: node diagnostic_test.js
 */

const fs = require('fs');
const path = require('path');

console.log('\n' + '='.repeat(80));
console.log('     IQ OPTION TRADING BOT - DIAGNOSTIC TEST');
console.log('='.repeat(80) + '\n');

const results = {
    passed: 0,
    failed: 0,
    warnings: 0,
    tests: []
};

function test(name, fn) {
    try {
        fn();
        results.passed++;
        results.tests.push({ name, status: 'PASS', error: null });
        console.log(`✅ ${name}`);
        return true;
    } catch (error) {
        results.failed++;
        results.tests.push({ name, status: 'FAIL', error: error.message });
        console.log(`❌ ${name}`);
        console.log(`   Error: ${error.message}`);
        return false;
    }
}

function warn(name, message) {
    results.warnings++;
    results.tests.push({ name, status: 'WARN', error: message });
    console.log(`⚠️  ${name}: ${message}`);
}

// ============================================
// TEST 1: Module Imports
// ============================================
console.log('\n📦 TESTING MODULE IMPORTS\n' + '-'.repeat(40));

let MoneyManager, MarketDetector, SniperEntry, ConfidenceScore, IQOptionAPI, logger;

test('Import MoneyManager', () => {
    MoneyManager = require('./src/core/moneyManager.js');
    if (!MoneyManager) throw new Error('Module not loaded');
});

test('Import MarketDetector', () => {
    MarketDetector = require('./src/core/marketDetector.js');
    if (!MarketDetector) throw new Error('Module not loaded');
});

test('Import SniperEntry', () => {
    SniperEntry = require('./src/strategies/sniperEntry.js');
    if (!SniperEntry) throw new Error('Module not loaded');
});

test('Import ConfidenceScore', () => {
    ConfidenceScore = require('./src/core/confidenceScore.js');
    if (!ConfidenceScore) throw new Error('Module not loaded');
});

test('Import IQOptionAPI', () => {
    IQOptionAPI = require('./src/api/iqoption.js');
    if (!IQOptionAPI) throw new Error('Module not loaded');
});

test('Import logger', () => {
    logger = require('./src/utils/logger.js');
    if (!logger) throw new Error('Module not loaded');
});

test('Import ExecutionEngine', () => {
    const execution = require('./src/core/execution.js');
    if (!execution) throw new Error('Module not loaded');
});

test('Import ScoreEngine', () => {
    const ScoreEngine = require('./src/core/scoreEngine.js');
    if (!ScoreEngine) throw new Error('Module not loaded');
});

// ============================================
// TEST 2: Module Initialization
// ============================================
console.log('\n🔧 TESTING MODULE INITIALIZATION\n' + '-'.repeat(40));

let moneyManager, sniperEntry, confidenceScore;

test('Initialize MoneyManager', () => {
    moneyManager = new MoneyManager();
    moneyManager.initialize(1000);
    if (moneyManager.currentBalance !== 1000) throw new Error('Balance not set correctly');
});

test('Initialize SniperEntry', () => {
    sniperEntry = new SniperEntry();
    if (!sniperEntry.analyze) throw new Error('analyze method not found');
});

test('Initialize ConfidenceScore', () => {
    confidenceScore = new ConfidenceScore();
    if (!confidenceScore.calculate) throw new Error('calculate method not found');
    if (!confidenceScore.fromSniperAnalysis) throw new Error('fromSniperAnalysis method not found');
});

// ============================================
// TEST 3: Candle Data Format
// ============================================
console.log('\n📊 TESTING CANDLE DATA FORMAT\n' + '-'.repeat(40));

const sampleCandles = [
    { open: 1.1000, high: 1.1005, low: 1.0998, close: 1.1002 },
    { open: 1.1002, high: 1.1008, low: 1.1000, close: 1.1005 },
    { open: 1.1005, high: 1.1010, low: 1.1003, close: 1.1008 },
    { open: 1.1008, high: 1.1012, low: 1.1005, close: 1.1010 },
    { open: 1.1010, high: 1.1015, low: 1.1008, close: 1.1012 },
    { open: 1.1012, high: 1.1018, low: 1.1010, close: 1.1015 },
    { open: 1.1015, high: 1.1020, low: 1.1012, close: 1.1018 },
    { open: 1.1018, high: 1.1022, low: 1.1015, close: 1.1020 },
    { open: 1.1020, high: 1.1025, low: 1.1018, close: 1.1022 },
    { open: 1.1022, high: 1.1028, low: 1.1020, close: 1.1025 },
    { open: 1.1025, high: 1.1030, low: 1.1022, close: 1.1028 },
    { open: 1.1028, high: 1.1032, low: 1.1025, close: 1.1030 },
    { open: 1.1030, high: 1.1035, low: 1.1028, close: 1.1032 },
    { open: 1.1032, high: 1.1038, low: 1.1030, close: 1.1035 },
    { open: 1.1035, high: 1.1040, low: 1.1032, close: 1.1038 },
    { open: 1.1038, high: 1.1042, low: 1.1035, close: 1.1040 },
    { open: 1.1040, high: 1.1045, low: 1.1038, close: 1.1042 },
    { open: 1.1042, high: 1.1048, low: 1.1040, close: 1.1045 },
    { open: 1.1045, high: 1.1050, low: 1.1042, close: 1.1048 },
    { open: 1.1048, high: 1.1052, low: 1.1045, close: 1.1050 }
];

test('Validate candle structure', () => {
    const candle = sampleCandles[0];
    if (!candle.open || !candle.high || !candle.low || !candle.close) {
        throw new Error('Candle missing required properties');
    }
});

test('Candle data integrity', () => {
    for (const candle of sampleCandles) {
        if (candle.high < Math.max(candle.open, candle.close, candle.low)) {
            throw new Error('High is not the maximum');
        }
        if (candle.low > Math.min(candle.open, candle.close, candle.high)) {
            throw new Error('Low is not the minimum');
        }
    }
});

// ============================================
// TEST 4: Market Detection
// ============================================
console.log('\n🎯 TESTING MARKET DETECTION\n' + '-'.repeat(40));

test('MarketDetector returns object', () => {
    const ma = sampleCandles.reduce((sum, c) => sum + c.close, 0) / sampleCandles.length;
    const result = MarketDetector.detect(sampleCandles, ma);
    if (typeof result !== 'object') throw new Error('Expected object, got ' + typeof result);
});

test('MarketDetector returns required properties', () => {
    const ma = sampleCandles.reduce((sum, c) => sum + c.close, 0) / sampleCandles.length;
    const result = MarketDetector.detect(sampleCandles, ma);
    if (!result.trend) throw new Error('Missing trend property');
    if (!result.volatility) throw new Error('Missing volatility property');
    if (!result.momentum) throw new Error('Missing momentum property');
    if (!result.overall) throw new Error('Missing overall property');
});

// ============================================
// TEST 5: Indicator Calculations
// ============================================
console.log('\n📈 TESTING INDICATOR CALCULATIONS\n' + '-'.repeat(40));

test('RSI Calculation', () => {
    const RSI = require('./src/indicators/rsi.js');
    const rsi = new RSI();
    const result = rsi.calculate(sampleCandles);
    if (!result || typeof result.current !== 'number') {
        throw new Error('RSI calculation failed');
    }
    if (result.current < 0 || result.current > 100) {
        throw new Error(`RSI value ${result.current} out of range (0-100)`);
    }
    console.log(`   RSI Value: ${result.current.toFixed(2)}`);
});

test('Bollinger Bands Calculation', () => {
    const BB = require('./src/indicators/bb.js');
    const bb = new BB();
    const result = bb.calculate(sampleCandles);
    if (!result || !result.current) {
        throw new Error('BB calculation failed');
    }
    if (typeof result.current.upper !== 'number') throw new Error('Missing upper band');
    if (typeof result.current.lower !== 'number') throw new Error('Missing lower band');
    if (typeof result.current.middle !== 'number') throw new Error('Missing middle band');
    console.log(`   BB Upper: ${result.current.upper.toFixed(5)}, Lower: ${result.current.lower.toFixed(5)}`);
});

// ============================================
// TEST 6: Sniper Strategy
// ============================================
console.log('\n🎯 TESTING SNIPER STRATEGY\n' + '-'.repeat(40));

test('SniperEntry analyze method', () => {
    const RSI = require('./src/indicators/rsi.js');
    const BB = require('./src/indicators/bb.js');
    
    const rsi = new RSI().calculate(sampleCandles);
    const bb = new BB().calculate(sampleCandles);
    
    const indicators = {
        rsi: rsi,
        bollingerBands: bb.current
    };
    
    const result = sniperEntry.analyze(sampleCandles, indicators);
    if (!result) throw new Error('Sniper analysis returned null');
    if (!result.signal) throw new Error('Missing signal property');
    console.log(`   Signal: ${result.signal}, Score: ${result.score}, Confidence: ${result.confidence}`);
});

// ============================================
// TEST 7: Confidence Score
// ============================================
console.log('\n💯 TESTING CONFIDENCE SCORE\n' + '-'.repeat(40));

test('ConfidenceScore fromSniperAnalysis', () => {
    const RSI = require('./src/indicators/rsi.js');
    const BB = require('./src/indicators/bb.js');
    
    const rsi = new RSI().calculate(sampleCandles);
    const bb = new BB().calculate(sampleCandles);
    
    const indicators = {
        rsi: rsi,
        bollingerBands: bb.current
    };
    
    const sniperResult = sniperEntry.analyze(sampleCandles, indicators);
    const market = { overall: 'TRENDING' };
    
    const confidence = confidenceScore.fromSniperAnalysis(sniperResult, market.overall);
    if (!confidence) throw new Error('Confidence calculation failed');
    if (typeof confidence.totalScore !== 'number') throw new Error('Missing totalScore');
    if (typeof confidence.shouldTrade !== 'boolean') throw new Error('Missing shouldTrade');
    console.log(`   Score: ${confidence.totalScore.toFixed(2)}, Should Trade: ${confidence.shouldTrade}`);
});

// ============================================
// TEST 8: API Methods
// ============================================
console.log('\n🔌 TESTING API METHODS\n' + '-'.repeat(40));

test('IQOptionAPI has connect method', () => {
    if (typeof IQOptionAPI.connect !== 'function') {
        throw new Error('connect method not found');
    }
});

test('IQOptionAPI has buy method', () => {
    if (typeof IQOptionAPI.buy !== 'function') {
        throw new Error('buy method not found');
    }
});

test('IQOptionAPI has placeTrade method', () => {
    if (typeof IQOptionAPI.placeTrade !== 'function') {
        throw new Error('placeTrade method not found');
    }
});

test('IQOptionAPI has getCandles method', () => {
    if (typeof IQOptionAPI.getCandles !== 'function') {
        throw new Error('getCandles method not found');
    }
});

test('IQOptionAPI has getBalance method', () => {
    if (typeof IQOptionAPI.getBalance !== 'function') {
        throw new Error('getBalance method not found');
    }
});

// ============================================
// TEST 9: Money Management
// ============================================
console.log('\n💰 TESTING MONEY MANAGEMENT\n' + '-'.repeat(40));

test('MoneyManager canTrade', () => {
    const canTrade = moneyManager.canTrade();
    if (typeof canTrade !== 'boolean') throw new Error('canTrade should return boolean');
});

test('MoneyManager getTradeAmount', () => {
    const amount = moneyManager.getTradeAmount(1000);
    if (typeof amount !== 'number') throw new Error('getTradeAmount should return number');
    if (amount <= 0) throw new Error('Trade amount should be positive');
    console.log(`   Trade Amount: $${amount}`);
});

test('MoneyManager recordTrade', () => {
    const result = moneyManager.recordTrade(10);
    if (typeof result !== 'boolean') throw new Error('recordTrade should return boolean');
});

// ============================================
// TEST 10: ScoreEngine
// ============================================
console.log('\n🏆 TESTING SCORE ENGINE\n' + '-'.repeat(40));

const ScoreEngine = require('./src/core/scoreEngine.js');
const scoreEngine = new ScoreEngine();

test('ScoreEngine calculateScore', () => {
    const RSI = require('./src/indicators/rsi.js');
    const BB = require('./src/indicators/bb.js');
    
    const rsi = new RSI();
    const bb = new BB();
    
    const indicators = {
        rsi: rsi,
        bollingerBands: bb
    };
    
    rsi.calculate(sampleCandles);
    bb.calculate(sampleCandles);
    
    const marketCondition = {
        trend: 'STRONG_UP',
        volatility: 'NORMAL',
        momentum: 'BULLISH',
        overall: 'TRENDING'
    };
    
    const strategyAnalysis = {
        recommended: 'BUY',
        confidence: 75
    };
    
    const score = scoreEngine.calculateScore(indicators, marketCondition, strategyAnalysis);
    if (!score) throw new Error('Score calculation failed');
    if (typeof score.totalScore !== 'number') throw new Error('Missing totalScore');
    console.log(`   Total Score: ${score.totalScore.toFixed(2)}, Passes Threshold: ${score.passesThreshold}`);
});

// ============================================
// FINAL SUMMARY
// ============================================
console.log('\n' + '='.repeat(80));
console.log('     DIAGNOSTIC TEST SUMMARY');
console.log('='.repeat(80));

const total = results.passed + results.failed;
const passRate = total > 0 ? (results.passed / total * 100).toFixed(1) : 0;

console.log(`\n📊 RESULTS:`);
console.log(`   ✅ Passed: ${results.passed}/${total} (${passRate}%)`);
console.log(`   ❌ Failed: ${results.failed}/${total}`);
console.log(`   ⚠️  Warnings: ${results.warnings}`);

if (results.failed === 0) {
    console.log('\n🎉 ALL TESTS PASSED! System is ready for trading.\n');
    process.exit(0);
} else {
    console.log('\n⚠️  SOME TESTS FAILED! Please fix issues before trading.\n');
    console.log('Failed tests:');
    results.tests.filter(t => t.status === 'FAIL').forEach(t => {
        console.log(`   - ${t.name}: ${t.error}`);
    });
    process.exit(1);
}
