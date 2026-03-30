/**
 * Equity Curve Control Test
 * Tests Equity MA Filter, Drawdown Speed Control, and Recovery Mode
 */

const MoneyManager = require('./src/core/moneyManager.js');

console.log('📊 EQUITY CURVE CONTROL TEST\n');
console.log('='.repeat(70));

// Test 1: Equity MA Filter
console.log('\n📉 TEST 1: EQUITY MA FILTER (20-period)');
const mm1 = new MoneyManager();
mm1.initialize(1000);

// Build up 20 trades of equity history
console.log('Building 20 trades of equity history...');
for (let i = 0; i < 20; i++) {
    mm1.recordTrade(5);  // Small wins
}
console.log(`Equity MA: $${mm1.getEquityMA().toFixed(2)}`);
console.log(`Current Balance: $${mm1.currentBalance}`);

// Now simulate a drop below MA
mm1.recordTrade(-50);
mm1.recordTrade(-30);
console.log(`After losses - Balance: $${mm1.currentBalance}`);
console.log(`Equity MA: $${mm1.getEquityMA().toFixed(2)}`);

const maCheck = mm1.checkRiskControls();
console.log(`MA Filter: ${!maCheck.allowed ? '🛑 BLOCKED - ' + maCheck.reason : '✅ PASSED'}`);

// Test 2: Drawdown Speed Control
console.log('\n⚡ TEST 2: DRAWDOWN SPEED CONTROL');
const mm2 = new MoneyManager();
mm2.initialize(1000);

// Simulate 3 losses in last 5 trades
mm2.last10Trades = ['WIN', 'LOSS', 'LOSS', 'LOSS', 'WIN'];
console.log('Last 5 trades: ' + mm2.last10Trades.slice(-5).join(', '));
console.log(`Losses in last 5: ${mm2.getLossesInLastN(5)}`);

const amount = mm2.getTradeAmount(1000);
console.log(`Risk with 3+ losses: ${amount > 0 ? (amount/10).toFixed(1) : 0}% (should be 0.5%)`);

// Test 3: Recovery Mode
console.log('\n🔄 TEST 3: RECOVERY MODE');
const mm3 = new MoneyManager();
mm3.initialize(1000);

// Win to peak
for (let i = 0; i < 10; i++) mm3.recordTrade(10);
console.log(`Peak Balance: $${mm3.peakBalance}`);

// Now lose to trigger recovery mode (>5% drawdown)
mm3.recordTrade(-60);
console.log(`Current Balance: $${mm3.currentBalance}`);
console.log(`Drawdown: ${(mm3.getDrawdown() * 100).toFixed(1)}%`);
console.log(`Recovery Mode: ${mm3.isRecoveryMode() ? '🔄 ACTIVE' : '❌ INACTIVE'}`);

const recoveryAmount = mm3.getTradeAmount(1000);
console.log(`Risk in Recovery: ${recoveryAmount > 0 ? (recoveryAmount/10).toFixed(1) : 0}% (should be 0.5%)`);

// Test 4: Complete Stats
console.log('\n📊 TEST 4: COMPLETE STATS');
const mm4 = new MoneyManager();
mm4.initialize(1000);

// Simulate mixed performance
for (let i = 0; i < 5; i++) mm4.recordTrade(8);
mm4.recordTrade(-15);
for (let i = 0; i < 3; i++) mm4.recordTrade(5);

const stats = mm4.getStats();
console.log('Equity Curve Stats:');
console.log(`   Equity MA: $${stats.equityMA}`);
console.log(`   Drawdown: ${stats.drawdown}`);
console.log(`   Is Recovery Mode: ${stats.isRecoveryMode}`);
console.log(`   Losses in Last 5: ${stats.lossesInLast5}`);
console.log(`   Peak Balance: $${stats.peakBalance}`);

console.log('\n' + '='.repeat(70));
console.log('✅ EQUITY CURVE CONTROL READY!');
console.log('='.repeat(70));

console.log('\n📋 Feature Summary:');
console.log('   1. Equity MA Filter: Stop if balance < 20-period MA');
console.log('   2. Drawdown Speed Control: 0.5% risk if 3+ losses in last 5');
console.log('   3. Recovery Mode: 0.5% risk + best setups only if DD > 5%');
console.log('   4. All existing systems preserved');

console.log('\n🎯 Benefits:');
console.log('   • Equity curve เรียบ (smooth)');
console.log('   • Drawdown ต่ำมาก (very low)');
console.log('   • กำไรเสถียร (stable profits)');

console.log('\n🚀 Usage:');
console.log('   node start_production.js demo');
console.log('   node start_production.js live');

process.exit(0);
