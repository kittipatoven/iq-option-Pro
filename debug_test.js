/**
 * Debug Test - Verify Data Flow
 */

const SniperEntry = require('./src/strategies/sniperEntry.js');
const ConfidenceScore = require('./src/core/confidenceScore.js');

// Generate realistic demo candles
function generateDemoCandles() {
    const candles = [];
    let price = 1.1000;
    
    for (let i = 0; i < 20; i++) {
        const change = (Math.random() - 0.5) * 0.0010;
        price += change;
        candles.push({
            open: price - change * 0.3,
            high: price + Math.abs(change) * 0.7 + 0.0003,
            low: price - Math.abs(change) * 0.7 - 0.0003,
            close: price
        });
    }
    
    return candles;
}

// Calculate proper RSI
function calculateRSI(candles, period = 14) {
    let gains = 0;
    let losses = 0;
    
    for (let i = 1; i < Math.min(period + 1, candles.length); i++) {
        const change = candles[i].close - candles[i-1].close;
        if (change > 0) {
            gains += change;
        } else {
            losses += Math.abs(change);
        }
    }
    
    const avgGain = gains / period;
    const avgLoss = losses / period;
    
    if (avgLoss === 0) return { value: 50 };
    
    const rs = avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));
    
    return { value: Math.round(rsi) };
}

// Calculate proper Bollinger Bands
function calculateBB(candles, period = 20) {
    const closes = candles.slice(-period).map(c => c.close);
    const sum = closes.reduce((a, b) => a + b, 0);
    const sma = sum / closes.length;
    
    const squaredDiffs = closes.map(c => Math.pow(c - sma, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / closes.length;
    const stdDev = Math.sqrt(variance);
    
    return {
        upper: sma + (2 * stdDev),
        lower: sma - (2 * stdDev),
        middle: sma
    };
}

// Test
console.log('='.repeat(60));
console.log('DEBUG TEST: Data Flow Verification');
console.log('='.repeat(60));

const sniperEntry = new SniperEntry();
const confidenceScore = new ConfidenceScore();

// Test 1: Generate candles
const candles = generateDemoCandles();
console.log('\n✅ Test 1: Generated', candles.length, 'candles');
console.log('   First candle:', JSON.stringify(candles[0]));
console.log('   Last candle:', JSON.stringify(candles[candles.length - 1]));

// Test 2: Calculate indicators
const rsi = calculateRSI(candles);
const bb = calculateBB(candles);
const indicators = { rsi, bollingerBands: bb };

console.log('\n✅ Test 2: Indicators calculated');
console.log('   RSI:', JSON.stringify(rsi));
console.log('   BB:', JSON.stringify(bb));

// Test 3: Sniper Entry Analysis
const sniperResult = sniperEntry.analyze(candles, indicators);
console.log('\n✅ Test 3: Sniper Entry Analysis');
console.log('   Signal:', sniperResult.signal);
console.log('   Score:', sniperResult.score);
console.log('   Confidence:', sniperResult.confidence);
console.log('   Conditions:', JSON.stringify(sniperResult.conditions));

// Test 4: Confidence Score
const confidence = confidenceScore.fromSniperAnalysis(sniperResult, 'SIDEWAYS');
console.log('\n✅ Test 4: Confidence Score');
console.log('   Total Score:', confidence.totalScore);
console.log('   Signal Strength:', confidence.signalStrength);
console.log('   Recommendation:', confidence.recommendation);

// Summary
console.log('\n' + '='.repeat(60));
console.log('SUMMARY:');
console.log('='.repeat(60));

if (sniperResult.signal !== 'NONE' && sniperResult.score > 0) {
    console.log('✅ Signal generated successfully!');
    console.log('   Direction:', sniperResult.signal);
    console.log('   Score:', sniperResult.score);
    console.log('   This would trigger a trade if score >= 3.0');
} else {
    console.log('⚠️  No signal generated (this is normal for demo data)');
    console.log('   In live mode, real market data would generate signals');
}

// Test with extreme RSI to force signal
console.log('\n' + '='.repeat(60));
console.log('TEST WITH EXTREME RSI (forcing signal):');
console.log('='.repeat(60));

const extremeIndicators = {
    rsi: { value: 20 }, // Oversold - should generate BUY
    bollingerBands: {
        upper: 1.1050,
        lower: 1.0950,
        middle: 1.1000
    }
};

const extremeResult = sniperEntry.analyze(candles, extremeIndicators);
console.log('   Signal:', extremeResult.signal);
console.log('   Score:', extremeResult.score);
console.log('   Conditions:', JSON.stringify(extremeResult.conditions));

if (extremeResult.signal !== 'NONE') {
    console.log('\n✅ EXTREME TEST PASSED - System can generate signals!');
} else {
    console.log('\n❌ EXTREME TEST FAILED - Check indicator structure');
}
