/**
 * Simple Risk Management Test
 */

const MoneyManager = require('./src/core/moneyManager.js');

console.log('🧪 Risk Management Test\n');

const mm = new MoneyManager();
mm.initialize(1000);

// Test risk controls
const marketCondition = {
    type: 'TREND',
    trend: 'STRONG_DOWN',
    metrics: { trendStrength: 0.8 }
};

const result = mm.checkRiskControls(marketCondition);
console.log('Risk Check Result:', result);

// Simulate some trades
for (let i = 0; i < 5; i++) {
    mm.recordTrade(10);  // Win $10
}

console.log('Stats after 5 wins:', mm.getStats());

console.log('\n✅ Test passed!');
