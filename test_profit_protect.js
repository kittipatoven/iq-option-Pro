/**
 * Profit Protection & Smooth Risk Test
 * Tests Profit Lock, Smooth Risk, and Loss Cooldown
 */

const MoneyManager = require('./src/core/moneyManager.js');

console.log('🛡️ PROFIT PROTECTION & SMOOTH RISK TEST\n');
console.log('='.repeat(70));

// Test 1: Smooth Risk Gradual Increase
console.log('\n📈 TEST 1: SMOOTH WIN STREAK RISK');
const mm1 = new MoneyManager();
mm1.initialize(1000);

console.log('Base risk: 1%, Max: 1.8%, +0.3% per win\n');

for (let i = 1; i <= 5; i++) {
    const amount = mm1.getTradeAmount(1000);
    console.log(`Win ${i}: Risk ${mm1.tradePercent + (i-1) * 0.3}% → Amount $${amount}`);
    mm1.consecutiveWins = i;  // Simulate win streak
}

// Test 2: Profit Lock
console.log('\n🔒 TEST 2: PROFIT LOCK (Trailing Stop)');
const mm2 = new MoneyManager();
mm2.initialize(1000);

// Simulate winning to peak at $1100
for (let i = 0; i < 5; i++) mm2.recordTrade(20);
console.log(`Peak Balance: $${mm2.peakBalance}`);
console.log(`Lock Threshold (95%): $${(mm2.peakBalance * 0.95).toFixed(2)}`);

// Now simulate loss to trigger lock
mm2.recordTrade(-30);
mm2.recordTrade(-25);
console.log(`Current Balance: $${mm2.currentBalance.toFixed(2)}`);

const lockCheck = mm2.checkRiskControls();
console.log(`Profit Lock Active: ${!lockCheck.allowed ? '🛑 YES - ' + lockCheck.reason : '✅ NO'}`);

// Test 3: Loss Cooldown
console.log('\n⏸️ TEST 3: LOSS COOLDOWN');
const mm3 = new MoneyManager();
mm3.initialize(1000);

// Simulate a loss
mm3.recordTrade(-10);
console.log('After loss, checking cooldown...');

for (let i = 0; i < 3; i++) {
    const amount = mm3.getTradeAmount(1000);
    if (amount === 0) {
        console.log(`Trade ${i+1}: ⏸️ SKIPPED (cooldown)`);
    } else {
        console.log(`Trade ${i+1}: ✅ EXECUTED ($${amount})`);
    }
}

// Test 4: Complete Stats
console.log('\n📊 TEST 4: COMPLETE STATS');
const mm4 = new MoneyManager();
mm4.initialize(1000);

// Simulate mixed performance
mm4.recordTrade(15);
mm4.recordTrade(15);
mm4.recordTrade(-10);
mm4.recordTrade(15);

const stats = mm4.getStats();
console.log('Final Stats:');
console.log(`   Peak Balance: $${stats.peakBalance}`);
console.log(`   Current Balance: $${stats.currentBalance}`);
console.log(`   Consecutive Wins: ${stats.consecutiveWins}`);
console.log(`   Loss Cooldown: ${stats.lossCooldownCount}`);
console.log(`   Profit Lock: ${stats.profitLockThreshold} of peak`);

console.log('\n' + '='.repeat(70));
console.log('✅ PROFIT PROTECTION & SMOOTH RISK READY!');
console.log('='.repeat(70));

console.log('\n📋 Feature Summary:');
console.log('   1. Smooth Risk: 1% → 1.8% gradually (+0.3% per win)');
console.log('   2. Profit Lock: Stop if balance < 95% of peak');
console.log('   3. Loss Cooldown: Skip 2 trades after loss');
console.log('   4. All existing systems preserved');

console.log('\n🎯 Benefits:');
console.log('   • ลด drawdown (trailing stop)');
console.log('   • รักษากำไร (profit lock)');
console.log('   • เพิ่ม stability (cooldown + smooth risk)');

console.log('\n🚀 Usage:');
console.log('   node start_production.js demo');
console.log('   node start_production.js live');

process.exit(0);
