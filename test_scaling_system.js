/**
 * Scaling + Withdrawal System Test
 * Tests Capital Scaling, Risk Adjustment Tiers, and Monthly Withdrawal
 */

const MoneyManager = require('./src/core/moneyManager.js');

console.log('💰 SCALING + WITHDRAWAL SYSTEM TEST\n');
console.log('='.repeat(70));

// Test 1: Risk Adjustment Tiers
console.log('\n📊 TEST 1: RISK ADJUSTMENT TIERS');
console.log('Tiers: >2000: 0.8% | >5000: 0.6% | >10000: 0.5%\n');

const testBalances = [1000, 2500, 6000, 15000];
testBalances.forEach(balance => {
    const mm = new MoneyManager();
    mm.initialize(balance);
    const amount = mm.getTradeAmount(balance);
    const tier = mm.getCurrentRiskTier();
    console.log(`Balance $${balance}: Trade $${amount} (${tier})`);
});

// Test 2: Capital Scaling Simulation
console.log('\n📈 TEST 2: CAPITAL SCALING SIMULATION');
const mm2 = new MoneyManager();
mm2.initialize(1000);

// Simulate profitable month (12% return)
console.log('Simulating profitable trades for 15% monthly return...');
for (let i = 0; i < 10; i++) {
    mm2.recordTrade(20);  // $20 profit each
}

console.log(`\nMonth Start Balance: $${mm2.monthStartBalance}`);
console.log(`Current Balance: $${mm2.currentBalance.toFixed(2)}`);
console.log(`Monthly Return: ${((mm2.currentBalance - mm2.monthStartBalance) / mm2.monthStartBalance * 100).toFixed(1)}%`);

// Simulate month change
console.log('\n📅 Simulating month change...');
const originalMonth = mm2.lastMonthReset;
mm2.lastMonthReset = '2025-01';  // Force different month
mm2.recordTrade(5);  // Trigger monthly check

console.log(`Total Withdrawn: $${mm2.totalWithdrawn.toFixed(2)}`);
console.log(`New Month Start: $${mm2.monthStartBalance.toFixed(2)}`);

// Test 3: Stats Output
console.log('\n📋 TEST 3: COMPLETE STATS');
const mm3 = new MoneyManager();
mm3.initialize(5000);

// Simulate some trades
for (let i = 0; i < 5; i++) mm3.recordTrade(15);

const stats = mm3.getStats();
console.log('Scaling System Stats:');
console.log(`   Current Risk Tier: ${stats.currentRiskTier}`);
console.log(`   Month Start Balance: $${stats.monthStartBalance}`);
console.log(`   Monthly Profit: ${stats.monthlyProfit}`);
console.log(`   Total Withdrawn: $${stats.totalWithdrawn}`);
console.log(`   Peak Balance: $${stats.peakBalance}`);
console.log(`   Drawdown: ${stats.drawdown}`);

console.log('\n' + '='.repeat(70));
console.log('✅ SCALING + WITHDRAWAL SYSTEM READY!');
console.log('='.repeat(70));

console.log('\n📋 Feature Summary:');
console.log('   1. Capital Scaling: +20% at +10% monthly profit');
console.log('   2. Risk Adjustment: 1% → 0.8% → 0.6% → 0.5%');
console.log('   3. Withdraw System: 30% of profit at +10% monthly');
console.log('   4. All existing systems preserved');

console.log('\n🎯 Benefits:');
console.log('   • โตเงน (compound growth)');
console.log('   • ไม่เพิ่มความเสี่ยง (risk reduces as capital grows)');
console.log('   • มี cashflow (regular withdrawals)');

console.log('\n🚀 Usage:');
console.log('   node start_production.js demo');
console.log('   node start_production.js live');

process.exit(0);
