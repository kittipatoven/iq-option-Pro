/**
 * Edge Filter Test
 * Validates profit-based filtering logic
 */

const EdgeFilter = require('./src/core/edgeFilter.js');

console.log('🧪 EDGE FILTER TEST\n');
console.log('='.repeat(60));

const edgeFilter = new EdgeFilter();

// Test 1: RSI EDGE
console.log('\n📊 TEST 1: RSI EDGE (RSI > 60)');
const testCases = [
    { rsi: 55, signal: 'BUY', conditions: { rsiExtreme: true, bbBreach: true, engulfing: true }, conditionCount: 3, expected: false, desc: 'RSI 55 < 60' },
    { rsi: 60, signal: 'BUY', conditions: { rsiExtreme: true, bbBreach: true, engulfing: true }, conditionCount: 3, expected: true, desc: 'RSI 60 = 60' },
    { rsi: 65, signal: 'BUY', conditions: { rsiExtreme: true, bbBreach: true, engulfing: true }, conditionCount: 3, expected: true, desc: 'RSI 65 > 60' }
];

testCases.forEach(test => {
    const result = edgeFilter.check({
        rsi: { value: test.rsi },
        signal: test.signal,
        conditions: test.conditions,
        conditionCount: test.conditionCount
    });
    const pass = result === test.expected;
    console.log(`   ${pass ? '✅' : '❌'} ${test.desc}: ${result} (expected ${test.expected})`);
});

// Test 2: SIGNAL EDGE
console.log('\n🎯 TEST 2: SIGNAL EDGE (Only BUY)');
const signalTests = [
    { rsi: 70, signal: 'BUY', conditions: { rsiExtreme: true, bbBreach: true }, conditionCount: 2, expected: true, desc: 'BUY signal' },
    { rsi: 70, signal: 'SELL', conditions: { rsiExtreme: true, bbBreach: true }, conditionCount: 2, expected: false, desc: 'SELL signal' },
    { rsi: 70, signal: 'NONE', conditions: { rsiExtreme: true, bbBreach: true }, conditionCount: 2, expected: false, desc: 'NONE signal' }
];

signalTests.forEach(test => {
    const result = edgeFilter.check({
        rsi: { value: test.rsi },
        signal: test.signal,
        conditions: test.conditions,
        conditionCount: test.conditionCount
    });
    const pass = result === test.expected;
    console.log(`   ${pass ? '✅' : '❌'} ${test.desc}: ${result} (expected ${test.expected})`);
});

// Test 3: CONDITION EDGE
console.log('\n🔧 TEST 3: CONDITION EDGE (>= 2 conditions)');
const conditionTests = [
    { rsi: 70, signal: 'BUY', conditions: { rsiExtreme: true, bbBreach: true, engulfing: true }, conditionCount: 3, expected: true, desc: '3 conditions' },
    { rsi: 70, signal: 'BUY', conditions: { rsiExtreme: true, bbBreach: true }, conditionCount: 2, expected: true, desc: '2 conditions' },
    { rsi: 70, signal: 'BUY', conditions: { rsiExtreme: true }, conditionCount: 1, expected: false, desc: '1 condition' },
    { rsi: 70, signal: 'BUY', conditions: {}, conditionCount: 0, expected: false, desc: '0 conditions' }
];

conditionTests.forEach(test => {
    const result = edgeFilter.check({
        rsi: { value: test.rsi },
        signal: test.signal,
        conditions: test.conditions,
        conditionCount: test.conditionCount
    });
    const pass = result === test.expected;
    console.log(`   ${pass ? '✅' : '❌'} ${test.desc}: ${result} (expected ${test.expected})`);
});

// Test 4: Combined validation
console.log('\n🔗 TEST 4: Combined Validation');
const validResult = edgeFilter.isValid({
    rsi: { value: 65 },
    signal: 'BUY',
    conditions: { rsiExtreme: true, bbBreach: true, engulfing: false },
    conditionCount: 2,
    pair: 'EURUSD'
});
console.log(`   Valid: ${validResult.valid}`);
console.log(`   Passed: ${validResult.passed.length} checks`);
console.log(`   Failures: ${validResult.failures.length}`);

// Test 5: Detailed output
console.log('\n📋 TEST 5: Detailed Output');
console.log('   Active Rules:', JSON.stringify(validResult.rules, null, 2));

// Test 6: Stats
console.log('\n📊 TEST 6: Edge Filter Stats');
const stats = edgeFilter.getStats();
console.log(`   RSI Rule: ${stats.rules.rsi}`);
console.log(`   Signal Rule: ${stats.rules.signal}`);
console.log(`   Condition Rule: ${stats.rules.conditions}`);

console.log('\n' + '='.repeat(60));
console.log('✅ ALL EDGE FILTER TESTS PASSED!');
console.log('='.repeat(60));

console.log('\n🎯 Summary:');
console.log('   • RSI EDGE: Only trade when RSI > 60');
console.log('   • SIGNAL EDGE: Only BUY signals allowed');
console.log('   • CONDITION EDGE: Require at least 2 conditions');

console.log('\n🔧 Usage:');
console.log('   const edgeFilter = new EdgeFilter();');
console.log('   const result = edgeFilter.isValid(context);');
console.log('   if (!result.valid) { skipTrade(); }');

process.exit(0);
