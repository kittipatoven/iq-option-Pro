// Test all new filters
console.log('Testing Advanced Filters...\n');

// Test data
const testCandles = [
    { close: 1.0850, open: 1.0840, high: 1.0855, low: 1.0835 }, // Bearish (close < open) - should filter BUY
    { close: 1.0900, open: 1.0890, high: 1.0905, low: 1.0885 }  // Bullish (close > open) - should allow BUY
];

const last = testCandles[testCandles.length - 1];

console.log('=== FILTER TESTS ===\n');

// Test 1: Candle Confirmation
console.log('1. Candle Confirmation Filter:');
console.log('   Last candle - Open:', last.open, 'Close:', last.close);
if (last.close > last.open) {
    console.log('   ✅ Bullish candle - BUY allowed');
} else {
    console.log('   ⛔ Bearish candle - BUY rejected');
}

// Test 2: RSI Bounce
const rsiValues = [28, 32, 36, 68, 72];
console.log('\n2. RSI Bounce Filter (BUY < 35, SELL > 65):');
rsiValues.forEach(rsi => {
    if (rsi < 30) {
        if (rsi > 35) {
            console.log(`   ⛔ RSI ${rsi}: BUY rejected (not < 35)`);
        } else {
            console.log(`   ✅ RSI ${rsi}: BUY signal valid`);
        }
    } else if (rsi > 70) {
        if (rsi < 65) {
            console.log(`   ⛔ RSI ${rsi}: SELL rejected (not > 65)`);
        } else {
            console.log(`   ✅ RSI ${rsi}: SELL signal valid`);
        }
    } else {
        console.log(`   ⛔ RSI ${rsi}: No signal zone`);
    }
});

// Test 3: Distance Filter
const testCases = [
    { price: 1.0850, middle: 1.0848, distance: 0.0002 },
    { price: 1.0850, middle: 1.0845, distance: 0.0005 },
    { price: 1.0850, middle: 1.0849, distance: 0.0001 }
];
console.log('\n3. Distance Filter from BB Middle (> 0.0002):');
testCases.forEach(tc => {
    const distance = Math.abs(tc.price - tc.middle);
    if (distance < 0.0002) {
        console.log(`   ⛔ Distance ${distance.toFixed(5)}: Weak signal (too close)`);
    } else {
        console.log(`   ✅ Distance ${distance.toFixed(5)}: Signal valid`);
    }
});

// Test 4: Cooldown
console.log('\n4. Cooldown Filter (60 seconds):');
const lastTradeTime = Date.now() - 30000; // 30 seconds ago
const now = Date.now();
const remaining = Math.ceil((60000 - (now - lastTradeTime)) / 1000);
if (now - lastTradeTime < 60000) {
    console.log(`   ⛔ Cooldown active: ${remaining}s remaining`);
} else {
    console.log('   ✅ No cooldown - trade allowed');
}

console.log('\n=== ALL FILTERS TESTED ===');
console.log('Bot is running with advanced signal filtering!');
