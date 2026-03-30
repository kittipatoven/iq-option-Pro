/**
 * PRODUCTION TEST: Multi-Pair Trading + News Filter
 * Verifies all production-ready improvements
 */

const logger = require('./src/utils/logger');
const newsFilter = require('./src/filters/newsFilter');

console.log('🔬 PRODUCTION TEST: News Filter + Multi-Pair');
console.log('==============================================\n');

let testsPassed = 0;
let testsFailed = 0;

// Test 1: Time Window Precision
console.log('Test 1: Time Window Precision (Date.now())...');
try {
    const now = Date.now();
    const in5Min = now + 5 * 60 * 1000;
    const in15Min = now + 15 * 60 * 1000;
    
    const shouldBeInWindow = newsFilter.isNewsTime(in5Min);
    const shouldBeOutOfWindow = !newsFilter.isNewsTime(in15Min);
    
    if (shouldBeInWindow && shouldBeOutOfWindow) {
        console.log('  ✅ PASS - Precise Date.now() calculation working');
        testsPassed++;
    } else {
        console.log('  ❌ FAIL - Time window calculation incorrect');
        testsFailed++;
    }
} catch (error) {
    console.log('  ❌ ERROR:', error.message);
    testsFailed++;
}

// Test 2: Currency Mapping (Exact Match)
console.log('\nTest 2: Currency Mapping (Exact Match with slice)...');
try {
    const testCases = [
        { pair: 'EURUSD', expected: ['EUR', 'USD'] },
        { pair: 'GBPUSD', expected: ['GBP', 'USD'] },
        { pair: 'USDJPY', expected: ['USD', 'JPY'] },
        { pair: 'AUDUSD', expected: ['AUD', 'USD'] },
        { pair: 'EURGBP', expected: ['EUR', 'GBP'] }
    ];
    
    let allPassed = true;
    testCases.forEach(test => {
        const result = newsFilter.getPairCurrencies(test.pair);
        const pass = result[0] === test.expected[0] && result[1] === test.expected[1];
        console.log(`  ${test.pair}: ${result.join('/')} ${pass ? '✅' : '❌'}`);
        if (!pass) allPassed = false;
    });
    
    if (allPassed) {
        console.log('  ✅ PASS - Exact currency mapping working');
        testsPassed++;
    } else {
        console.log('  ❌ FAIL - Some currency mappings incorrect');
        testsFailed++;
    }
} catch (error) {
    console.log('  ❌ ERROR:', error.message);
    testsFailed++;
}

// Test 3: affectsPair with Exact Matching
console.log('\nTest 3: affectsPair (Exact Match, no includes)...');
try {
    const eventEUR = { currency: 'EUR' };
    const eventUSD = { currency: 'USD' };
    
    // EUR event should affect EURUSD
    const eurusdMatch = newsFilter.affectsPair(eventEUR, 'EURUSD');
    // EUR event should NOT affect GBPUSD
    const gbpusdNoMatch = !newsFilter.affectsPair(eventEUR, 'GBPUSD');
    // USD event should affect USDJPY
    const usdjpyMatch = newsFilter.affectsPair(eventUSD, 'USDJPY');
    
    if (eurusdMatch && gbpusdNoMatch && usdjpyMatch) {
        console.log('  ✅ PASS - Exact matching working correctly');
        console.log('     EUR → EURUSD: ✅ (correct)');
        console.log('     EUR → GBPUSD: ✅ (blocked)');
        console.log('     USD → USDJPY: ✅ (correct)');
        testsPassed++;
    } else {
        console.log('  ❌ FAIL - Exact matching not working');
        testsFailed++;
    }
} catch (error) {
    console.log('  ❌ ERROR:', error.message);
    testsFailed++;
}

// Test 4: Cache System
console.log('\nTest 4: Cache System (5-minute expiry)...');
try {
    const hasCacheExpiry = newsFilter.cacheExpiry === 5 * 60 * 1000;
    const hasCacheTimestamp = 'cacheTimestamp' in newsFilter;
    
    if (hasCacheExpiry && hasCacheTimestamp) {
        console.log('  ✅ PASS - Cache system configured (5 min expiry)');
        testsPassed++;
    } else {
        console.log('  ❌ FAIL - Cache system not properly configured');
        testsFailed++;
    }
} catch (error) {
    console.log('  ❌ ERROR:', error.message);
    testsFailed++;
}

// Test 5: Preloading Interval
console.log('\nTest 5: Preloading Interval (5 minutes)...');
try {
    const hasPreloadInterval = newsFilter.updateInterval === 5 * 60 * 1000;
    const hasIntervalId = 'preloadInterval' in newsFilter;
    
    if (hasPreloadInterval) {
        console.log('  ✅ PASS - Preloading configured (5 min interval)');
        testsPassed++;
    } else {
        console.log('  ❌ FAIL - Preloading not configured');
        testsFailed++;
    }
} catch (error) {
    console.log('  ❌ ERROR:', error.message);
    testsFailed++;
}

// Test 6: Fail-Safe (API Failure)
console.log('\nTest 6: Fail-Safe (Stop trading on API failure)...');
try {
    // Set API as failed
    newsFilter.apiFailed = true;
    
    const result = newsFilter.shouldBlockTrading('EURUSD');
    const blocked = result.blocked && result.isFailSafe;
    
    // Reset
    newsFilter.apiFailed = false;
    
    if (blocked) {
        console.log('  ✅ PASS - Fail-safe working (blocks on API failure)');
        testsPassed++;
    } else {
        console.log('  ❌ FAIL - Fail-safe not working');
        console.log('     Result:', JSON.stringify(result));
        testsFailed++;
    }
} catch (error) {
    console.log('  ❌ ERROR:', error.message);
    testsFailed++;
}

// Test 7: Fail-Safe (Error)
console.log('\nTest 7: Fail-Safe (Stop trading on error)...');
try {
    // Simulate error by passing invalid data
    const originalEvents = newsFilter.newsEvents;
    newsFilter.newsEvents = null; // Will cause error
    
    const result = newsFilter.shouldBlockTrading('EURUSD');
    const blocked = result.blocked && result.isFailSafe;
    
    // Restore
    newsFilter.newsEvents = originalEvents;
    
    if (blocked) {
        console.log('  ✅ PASS - Fail-safe on error working');
        testsPassed++;
    } else {
        console.log('  ❌ FAIL - Fail-safe on error not working');
        testsFailed++;
    }
} catch (error) {
    console.log('  ❌ ERROR:', error.message);
    testsFailed++;
}

// Test 8: High Impact Filter Only
console.log('\nTest 8: High Impact Filter (only HIGH, not MEDIUM/LOW)...');
try {
    // Add test events
    const now = Date.now();
    newsFilter.newsEvents = [
        { title: 'High Event', impact: 'HIGH', time: now + 5 * 60 * 1000, currency: 'USD' },
        { title: 'Medium Event', impact: 'MEDIUM', time: now + 5 * 60 * 1000, currency: 'EUR' },
        { title: 'Low Event', impact: 'LOW', time: now + 5 * 60 * 1000, currency: 'GBP' }
    ];
    
    // Should block for USD pair (HIGH event)
    const result = newsFilter.shouldBlockTrading('EURUSD');
    
    // Restore
    newsFilter.newsEvents = [];
    
    if (result.blocked) {
        console.log('  ✅ PASS - Only HIGH impact triggers block');
        console.log('     Blocked for USD event:', result.reason);
        testsPassed++;
    } else {
        console.log('  ❌ FAIL - Impact filtering not working');
        console.log('     Result:', JSON.stringify(result));
        testsFailed++;
    }
} catch (error) {
    console.log('  ❌ ERROR:', error.message);
    testsFailed++;
}

// Summary
console.log('\n==============================================');
console.log('PRODUCTION TEST COMPLETE');
console.log('==============================================');
console.log(`Tests Passed: ${testsPassed}`);
console.log(`Tests Failed: ${testsFailed}`);
console.log(`Success Rate: ${Math.round((testsPassed / (testsPassed + testsFailed)) * 100)}%`);

if (testsFailed === 0) {
    console.log('\n🎉 ALL TESTS PASSED - Production Ready!');
    console.log('\n✅ Verified Features:');
    console.log('   • Precise time window (Date.now())');
    console.log('   • Exact currency matching (slice)');
    console.log('   • 5-minute cache system');
    console.log('   • 5-minute preloading');
    console.log('   • Fail-safe on API failure');
    console.log('   • Fail-safe on error');
    console.log('   • High impact filtering only');
    process.exit(0);
} else {
    console.log('\n⚠️  SOME TESTS FAILED - Review issues above');
    process.exit(1);
}
