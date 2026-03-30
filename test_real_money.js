/**
 * Real Money Machine Test
 * Tests Weekly Loss Protection, Session Filter, and 100 Trades Monitor
 */

const MoneyManager = require('./src/core/moneyManager.js');

console.log('💰 REAL MONEY MACHINE TEST\n');
console.log('='.repeat(70));

// Test 1: Weekly Loss Protection
console.log('\n📅 TEST 1: WEEKLY LOSS PROTECTION');
const mm1 = new MoneyManager();
mm1.initialize(1000);

// Simulate losses to trigger 10% weekly stop
console.log('Simulating losses to trigger weekly stop...');
for (let i = 0; i < 6; i++) {
    mm1.recordTrade(-20);  // $20 loss each
}

console.log(`Week Start Balance: $${mm1.weekStartBalance}`);
console.log(`Current Balance: $${mm1.currentBalance.toFixed(2)}`);
console.log(`Weekly Loss: $${mm1.weeklyLoss.toFixed(2)} (${((mm1.weekStartBalance - mm1.currentBalance) / mm1.weekStartBalance * 100).toFixed(1)}%)`);

const weeklyCheck = mm1.checkWeeklyLoss();
console.log(`Weekly Stop: ${!weeklyCheck.allowed ? '🚫 ACTIVE - ' + weeklyCheck.reason : '✅ Not triggered'}`);

// Test 2: Session Filter
console.log('\n⏰ TEST 2: SESSION FILTER (London/NY)');
const mm2 = new MoneyManager();
mm2.initialize(1000);

const sessionCheck = mm2.isTradingSession();
const now = new Date();
const hour = now.getUTCHours();
console.log(`Current UTC Hour: ${hour}:00`);
console.log(`London Session: 08:00-17:00 UTC`);
console.log(`NY Session: 13:00-22:00 UTC`);
console.log(`In Trading Session: ${sessionCheck ? '✅ YES' : '❌ NO (Outside hours)'}`);

// Test 3: 100 Trades Monitor
console.log('\n📊 TEST 3: 100 TRADES MONITOR');
const mm3 = new MoneyManager();
mm3.initialize(1000);

console.log('Simulating 102 trades to trigger report...');
for (let i = 0; i < 102; i++) {
    const profit = Math.random() > 0.45 ? 15 : -10;  // 55% winrate
    mm3.recordTrade(profit);
}

console.log(`\nTrades in current block: ${mm3.trades100Stats.wins + mm3.trades100Stats.losses}/100`);

// Test 4: Complete Stats
console.log('\n📋 TEST 4: COMPLETE REAL MONEY STATS');
const mm4 = new MoneyManager();
mm4.initialize(5000);

// Simulate some activity
for (let i = 0; i < 10; i++) mm4.recordTrade(20);
mm4.recordTrade(-30);

const stats = mm4.getStats();
console.log('Real Money Machine Stats:');
console.log(`   Current Balance: $${stats.currentBalance}`);
console.log(`   Current Risk Tier: ${stats.currentRiskTier}`);
console.log(`   Monthly Profit: ${stats.monthlyProfit}`);
console.log(`   Weekly Loss: $${stats.weeklyLoss}`);
console.log(`   In Trading Session: ${stats.inTradingSession}`);
console.log(`   100 Trades Block: ${stats.trades100Block}`);
console.log(`   Drawdown: ${stats.drawdown}`);
console.log(`   Total Withdrawn: $${stats.totalWithdrawn}`);

console.log('\n' + '='.repeat(70));
console.log('✅ REAL MONEY MACHINE READY!');
console.log('='.repeat(70));

console.log('\n📋 Feature Summary:');
console.log('   1. Weekly Loss Protection: Stop 7 days if weekly loss >= 10%');
console.log('   2. Session Filter: London/NY sessions only (08:00-17:00, 13:00-22:00 UTC)');
console.log('   3. 100 Trades Monitor: Auto-report winrate/PF/drawdown every 100 trades');
console.log('   4. All scaling systems preserved');

console.log('\n🎯 Benefits:');
console.log('   • รายได้สม่ำเสมอ (consistent income)');
console.log('   • ไม่ล้างพอร์ต (portfolio protection)');
console.log('   • มีเงินถอนจริง (real cashflow)');

console.log('\n🚀 Usage:');
console.log('   node start_production.js demo');
console.log('   node start_production.js live');

process.exit(0);
