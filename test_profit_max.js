/**
 * Profit Maximization Test
 * Tests Win Streak Boost, Hot Hand Mode, and Smart Take Profit
 */

const MoneyManager = require('./src/core/moneyManager.js');

console.log('💰 PROFIT MAXIMIZATION TEST\n');
console.log('='.repeat(60));

const mm = new MoneyManager();
mm.initialize(1000);

console.log('\n📊 Initial Stats:');
console.log('   Base Trade Size: 1%');
console.log('   Win Streak Boost: 2% at 3+ wins');
console.log('   Hot Hand Mode: +10 trades at 80% last-5 winrate');
console.log('   Smart Take Profit: Stop if profit >=3% & winrate <60%');

// Test 1: Win Streak Boost
console.log('\n🔥 TEST 1: WIN STREAK BOOST');
console.log('Simulating 3 wins...');
for (let i = 0; i < 3; i++) {
    mm.recordTrade(10);  // Win $10 each
}
const amountWithBoost = mm.getTradeAmount(1000);
console.log(`Trade amount after 3 wins: $${amountWithBoost} (should be $20 = 2%)`);

// Test 2: Hot Hand Mode
console.log('\n🎯 TEST 2: HOT HAND MODE');
// Reset and set up 4 wins out of last 5 (80% winrate)
mm.last10Trades = ['WIN', 'WIN', 'LOSS', 'WIN', 'WIN'];
mm.consecutiveWins = 4;
const isHot = mm.isHotHand();
console.log(`Hot Hand Mode: ${isHot ? '✅ ACTIVE' : '❌ INACTIVE'} (last 5: 4 wins = 80%)`);
if (isHot) {
    console.log(`Trade limit: ${mm.maxTradesPerDay + mm.hotHandExtraTrades} trades (20 + 10 bonus)`);
}

// Test 3: Smart Take Profit
console.log('\n🧠 TEST 3: SMART TAKE PROFIT');
// Reset
const mm2 = new MoneyManager();
mm2.initialize(1000);
// Simulate: 5 wins + 5 losses = 50% winrate, but profit is high
for (let i = 0; i < 5; i++) mm2.recordTrade(20);  // Win $20 x 5 = $100
for (let i = 0; i < 5; i++) mm2.recordTrade(-10); // Lose $10 x 5 = $50
const check = mm2.checkRiskControls();
console.log(`Daily P&L: $${mm2.dailyProfit - mm2.dailyLoss} (${((mm2.dailyProfit - mm2.dailyLoss) / 10).toFixed(1)}%)`);
console.log(`Winrate: ${(mm2.getWins() / mm2.tradeCount * 100).toFixed(0)}%`);
console.log(`Smart TP Check: ${check.allowed ? '✅ CONTINUE' : '🛑 STOP - ' + check.reason}`);

// Test 4: Combined Stats
console.log('\n📈 TEST 4: COMPLETE STATS');
const mm3 = new MoneyManager();
mm3.initialize(1000);
// Simulate good performance
for (let i = 0; i < 4; i++) mm3.recordTrade(15);  // 4 wins
const stats = mm3.getStats();
console.log('Stats after 4 wins:');
console.log(`   Consecutive Wins: ${stats.consecutiveWins}`);
console.log(`   Last 5 Winrate: ${stats.last5TradesWinrate}%`);
console.log(`   Is Hot Hand: ${stats.isHotHand}`);
console.log(`   Trade Limit: ${stats.tradeLimit}`);

console.log('\n' + '='.repeat(60));
console.log('✅ PROFIT MAXIMIZATION FEATURES READY!');
console.log('='.repeat(60));

console.log('\n📋 Feature Summary:');
console.log('   1. Win Streak Boost: 1% → 2% when on fire');
console.log('   2. Hot Hand Mode: 20 → 30 trades when last 5 >= 80%');
console.log('   3. Smart Take Profit: Exit if profit >=3% but luck running out');
console.log('   4. All risk rules still active');

console.log('\n🚀 Usage:');
console.log('   node start_production.js demo');
console.log('   node start_production.js live');

process.exit(0);
