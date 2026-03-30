/**
 * Production Ready Test Suite
 * Tests all core modules for stability and correctness
 */

const Optimizer = require('./src/core/optimizer.js');
const api = require('./src/services/iqoption.api.js');

console.log('========================================');
console.log('  IQ OPTION BOT - PRODUCTION TEST');
console.log('========================================\n');

let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`✅ ${name}`);
        testsPassed++;
    } catch (e) {
        console.log(`❌ ${name}: ${e.message}`);
        testsFailed++;
    }
}

// Test 1: Optimizer Initialization
test('Optimizer initializes correctly', () => {
    const opt = new Optimizer();
    if (!opt.params) throw new Error('Params not initialized');
    if (!opt.history) throw new Error('History not initialized');
});

// Test 2: Record Trade with Profit
test('Record trade with profit tracking', () => {
    const opt = new Optimizer();
    opt.record('win', 'SIDEWAY', 10);
    opt.record('loss', 'SIDEWAY', -5);
    if (opt.history.length !== 2) throw new Error('History not recorded');
    if (opt.history[0].profit !== 10) throw new Error('Profit not stored');
});

// Test 3: Candidate Validation (Min 5 Trades)
test('Candidate validation requires 5 trades', () => {
    const opt = new Optimizer();
    opt.isTestingCandidate = true;
    opt.candidateResults = [{ profit: 10 }, { profit: -5 }]; // Only 2 trades
    opt.candidateParams = { rsiBuy: 28, rsiSell: 72, scoreThreshold: 5 };
    opt.previousParams = { rsiBuy: 30, rsiSell: 70, scoreThreshold: 4 };
    
    const result = opt.evaluateCandidate();
    if (result !== null) throw new Error('Should return null for < 5 trades');
});

// Test 4: Profit Factor Calculation
test('Profit factor calculation works', () => {
    const opt = new Optimizer();
    opt.isTestingCandidate = true;
    opt.candidateResults = [
        { profit: 10 },
        { profit: -5 },
        { profit: 8 },
        { profit: 12 },
        { profit: -3 }
    ];
    opt.candidateParams = { rsiBuy: 28, rsiSell: 72, scoreThreshold: 5 };
    opt.previousParams = { rsiBuy: 30, rsiSell: 70, scoreThreshold: 4 };
    
    const result = opt.evaluateCandidate();
    // Total profit: 22, should be approved (profitFactor > 1.2)
    if (result !== true) throw new Error('Should approve profitable params');
});

// Test 5: Drawdown Calculation
test('Drawdown calculation works', () => {
    const opt = new Optimizer();
    const trades = [
        { profit: 10 },
        { profit: -15 },  // Peak: 10, Current: -5, Drawdown: 15
        { profit: 5 },    // Peak: 10, Current: 0, Drawdown: 10
        { profit: 20 }   // Peak: 20, Current: 20, Drawdown: 0
    ];
    const dd = opt.calculateDrawdown(trades);
    if (dd !== 15) throw new Error(`Expected drawdown 15, got ${dd}`);
});

// Test 6: Fallback to Previous Params
test('Rejects unprofitable params and falls back', () => {
    const opt = new Optimizer();
    opt.isTestingCandidate = true;
    opt.candidateResults = [
        { profit: 5 },
        { profit: -10 },
        { profit: 3 },
        { profit: -8 },
        { profit: -5 }
    ];
    opt.candidateParams = { rsiBuy: 20, rsiSell: 80, scoreThreshold: 2 };
    const originalParams = { rsiBuy: 30, rsiSell: 70, scoreThreshold: 4 };
    opt.previousParams = { ...originalParams };
    
    const result = opt.evaluateCandidate();
    if (result !== false) throw new Error('Should reject unprofitable params');
    if (opt.params.rsiBuy !== 30) throw new Error('Should fallback to previous params');
});

// Test 7: API Connection
test('API connects and returns balance', () => {
    api.connect();
    const balance = api.getBalance();
    if (typeof balance !== 'number') throw new Error('Balance should be a number');
    if (balance <= 0) throw new Error('Balance should be positive');
});

// Test 8: Candle Data
test('API returns candle data', () => {
    const candles = api.getCandles('EURUSD', 60, 100);
    if (!Array.isArray(candles)) throw new Error('Should return array');
    if (candles.length !== 100) throw new Error(`Expected 100 candles, got ${candles.length}`);
    if (!candles[0].open || !candles[0].close) throw new Error('Candles missing OHLC data');
});

// Test 9: Trade Execution
test('API executes trade and returns result', () => {
    const result = api.placeTrade({
        pair: 'EURUSD',
        direction: 'CALL',
        amount: 10,
        duration: 1
    });
    if (!result.success) throw new Error('Trade should succeed');
    if (!result.id) throw new Error('Trade should have ID');
    if (!result.outcome) throw new Error('Trade should have outcome');
});

// Summary
console.log('\n========================================');
console.log(`  TESTS PASSED: ${testsPassed}/${testsPassed + testsFailed}`);
console.log('========================================');

if (testsFailed === 0) {
    console.log('\n🎉 SYSTEM IS PRODUCTION READY! 🎉\n');
    process.exit(0);
} else {
    console.log(`\n⚠️  ${testsFailed} TESTS FAILED - REVIEW REQUIRED\n`);
    process.exit(1);
}
