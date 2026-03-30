/**
 * AUDIT: Multi-Pair Trading Bot + News Filter
 * Verifies all components work correctly without mock data
 */

const logger = require('./src/utils/logger');
const newsFilter = require('./src/filters/newsFilter');

console.log('🔍 AUDIT: Multi-Pair Trading Bot + News Filter');
console.log('==============================================\n');

// Test 1: Verify setupMockNews is removed
console.log('Test 1: Checking for mock functions...');
const hasMockFunction = typeof newsFilter.setupMockNews === 'function';
console.log(`  setupMockNews removed: ${!hasMockFunction ? '✅ PASS' : '❌ FAIL'}`);

// Test 2: Currency Mapping
console.log('\nTest 2: Currency Mapping...');
const testCases = [
    { pair: 'EURUSD', expected: ['EUR', 'USD'] },
    { pair: 'GBPUSD', expected: ['GBP', 'USD'] },
    { pair: 'USDJPY', expected: ['USD', 'JPY'] },
    { pair: 'AUDUSD', expected: ['AUD', 'USD'] },
    { pair: 'EURGBP', expected: ['EUR', 'GBP'] },
    { pair: 'EURJPY', expected: ['EUR', 'JPY'] },
    { pair: 'GBPJPY', expected: ['GBP', 'JPY'] }
];

let mappingPassed = 0;
testCases.forEach(test => {
    const result = newsFilter.getPairCurrencies(test.pair);
    const pass = JSON.stringify(result) === JSON.stringify(test.expected);
    console.log(`  ${test.pair}: ${pass ? '✅' : '❌'} ${result.join(', ')}`);
    if (pass) mappingPassed++;
});
console.log(`  Result: ${mappingPassed}/${testCases.length} passed`);

// Test 3: Time Window Logic
console.log('\nTest 3: Time Window Logic (10 min)...');
const now = new Date();
const in5Min = new Date(now.getTime() + 5 * 60 * 1000);
const in15Min = new Date(now.getTime() + 15 * 60 * 1000);

const testEventSoon = { time: in5Min };
const testEventLater = { time: in15Min };

const shouldBeInWindow = newsFilter.isNewsTime(testEventSoon.time);
const shouldBeOutOfWindow = !newsFilter.isNewsTime(testEventLater.time);

console.log(`  Event in 5 min in window: ${shouldBeInWindow ? '✅ PASS' : '❌ FAIL'}`);
console.log(`  Event in 15 min out of window: ${shouldBeOutOfWindow ? '✅ PASS' : '❌ FAIL'}`);

// Test 4: Check for mock/fallback in code
console.log('\nTest 4: Checking for mock/fallback references...');
const fs = require('fs');
const newsFilterCode = fs.readFileSync('./src/filters/newsFilter.js', 'utf8');
const hasMockRef = newsFilterCode.includes('setupMockNews') || 
                   newsFilterCode.includes('using mock') ||
                   newsFilterCode.includes('mock data');
console.log(`  No mock references: ${!hasMockRef ? '✅ PASS' : '❌ FAIL'}`);

// Test 5: API Endpoints
console.log('\nTest 5: API Endpoints...');
const apiStatus = newsFilter.getApiStatus ? newsFilter.getApiStatus() : {};
console.log(`  Economic Calendar: ${apiStatus.endpoints?.economicCalendar ? '✅ Set' : '❌ Missing'}`);
console.log(`  Forex News: ${apiStatus.endpoints?.forexNews ? '✅ Set' : '❌ Missing'}`);

// Summary
console.log('\n==============================================');
console.log('AUDIT COMPLETE');
console.log('==============================================');

const allPassed = !hasMockFunction && 
                  mappingPassed === testCases.length && 
                  shouldBeInWindow && 
                  shouldBeOutOfWindow && 
                  !hasMockRef;

if (allPassed) {
    console.log('✅ ALL CHECKS PASSED - System is clean!');
} else {
    console.log('❌ SOME CHECKS FAILED - Review above');
}

process.exit(allPassed ? 0 : 1);
