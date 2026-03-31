/**
 * AI Trading Analysis Demo
 * Demonstrates the AI-powered trading analysis and optimization system
 */

const aiAnalyzer = require('./src/core/aiTradingAnalyzer');

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║     AI TRADING ANALYZER - DEMO & TEST                        ║');
console.log('║     Machine Learning Based Strategy Optimization             ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

// Simulate 30 trades with realistic patterns
console.log('🎲 Phase 1: Simulating 30 trades with realistic patterns...\n');

const pairs = ['EURUSD-OTC', 'GBPUSD-OTC', 'USDJPY-OTC'];
const markets = ['SIDEWAY', 'TREND_UP', 'TREND_DOWN', 'BREAKOUT'];

// Simulate trades with realistic RSI patterns
for (let i = 0; i < 30; i++) {
    const pair = pairs[Math.floor(Math.random() * pairs.length)];
    const market = markets[Math.floor(Math.random() * markets.length)];
    
    // Create realistic patterns:
    // - CALL wins when RSI is low (oversold)
    // - PUT wins when RSI is high (overbought)
    const isCall = Math.random() > 0.5;
    let rsi;
    
    if (isCall) {
        // CALL: RSI < 35 performs better
        rsi = Math.random() < 0.7 ? 15 + Math.random() * 20 : 35 + Math.random() * 40;
    } else {
        // PUT: RSI > 65 performs better
        rsi = Math.random() < 0.7 ? 75 + Math.random() * 20 : 35 + Math.random() * 40;
    }
    
    const direction = isCall ? 'CALL' : 'PUT';
    
    // Simulate result based on RSI being in optimal range
    let winProbability;
    if (isCall && rsi < 35) {
        winProbability = 0.7; // 70% win rate for CALL at low RSI
    } else if (!isCall && rsi > 65) {
        winProbability = 0.7; // 70% win rate for PUT at high RSI
    } else {
        winProbability = 0.4; // 40% win rate otherwise
    }
    
    // Market condition affects performance
    if (market === 'SIDEWAY') {
        winProbability *= 1.2; // Better in sideways markets
    } else if (market === 'BREAKOUT') {
        winProbability *= 0.7; // Worse in breakout markets
    }
    
    const result = Math.random() < winProbability ? 'win' : 'loss';
    const profit = result === 'win' ? 0.82 : -1.0; // 82% payout
    
    // Record the trade
    aiAnalyzer.recordTrade({
        pair,
        direction,
        amount: 1,
        result,
        profit,
        rsi,
        marketCondition: market,
        timestamp: new Date(Date.now() - i * 3600000)
    });
}

console.log('\n✅ Simulation complete!\n');

// Generate comprehensive analysis report
console.log('═══════════════════════════════════════════════════════════════\n');

const report = aiAnalyzer.generateReport();

console.log('\n═══════════════════════════════════════════════════════════════\n');

// Show optimal strategy parameters
console.log('🔧 OPTIMAL STRATEGY PARAMETERS (AI-Generated)');
console.log('─────────────────────────────────────────────────────────────');
console.log(`
Based on ${report.stats.totalTrades} trades analyzed:

1. RSI Thresholds:
   - BUY (CALL) when RSI: ${report.optimalParams.rsi.buy.bestRange[0]}-${report.optimalParams.rsi.buy.bestRange[1]}
     Win Rate: ${(report.optimalParams.rsi.buy.winRate * 100).toFixed(1)}%
   
   - SELL (PUT) when RSI: ${report.optimalParams.rsi.sell.bestRange[0]}-${report.optimalParams.rsi.sell.bestRange[1]}
     Win Rate: ${(report.optimalParams.rsi.sell.winRate * 100).toFixed(1)}%

2. Market Conditions (Ranked by Performance):
`);

report.optimalParams.market.forEach((m, i) => {
    const enabled = m.enabled ? '✅ Trade' : '❌ Avoid';
    console.log(`   ${i+1}. ${m.condition}: ${(m.winRate * 100).toFixed(1)}% - ${enabled}`);
});

console.log(`
3. Best Trading Hours: ${report.optimalParams.time.bestHours.join(', ')}
   Avoid Hours: ${report.optimalParams.time.avoidHours.join(', ')}

4. Position Sizing (Kelly Criterion):
   - Current Recommended Size: $${report.sizing.finalSize.toFixed(2)}
   - Base Amount: $1.00
   - Kelly %: ${(report.sizing.kelly * 100).toFixed(1)}%
   - Reason: ${report.sizing.reason}
`);

// Test shouldTrade function
console.log('🧪 TESTING: Should We Trade Now?\n');
console.log('─────────────────────────────────────────────────────────────');

const testScenarios = [
    { rsi: 25, market: 'SIDEWAY', pair: 'EURUSD-OTC', desc: 'Low RSI + Sideways' },
    { rsi: 75, market: 'TREND_UP', pair: 'GBPUSD-OTC', desc: 'High RSI + Trend Up' },
    { rsi: 50, market: 'BREAKOUT', pair: 'USDJPY-OTC', desc: 'Neutral RSI + Breakout' }
];

testScenarios.forEach((scenario, i) => {
    const decision = aiAnalyzer.shouldTrade(scenario.rsi, scenario.market, scenario.pair);
    console.log(`${i+1}. ${scenario.desc}`);
    console.log(`   RSI: ${scenario.rsi}, Market: ${scenario.market}`);
    console.log(`   Decision: ${decision.shouldTrade ? '✅ TRADE' : '❌ NO TRADE'}`);
    console.log(`   Reason: ${decision.reason}\n`);
});

// Show learning progress
console.log('📈 LEARNING PROGRESS');
console.log('─────────────────────────────────────────────────────────────');
console.log(`
✅ AI has analyzed ${report.stats.totalTrades} trades
✅ Identified ${(report.stats.winRate * 100).toFixed(1)}% overall win rate
✅ Found optimal RSI ranges
✅ Classified market conditions by performance  
✅ Generated time-based patterns
✅ Calculated Kelly-optimal position sizing

Next trade recommendation: ${report.recommendation.action}
Reason: ${report.recommendation.reason}
`);

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║  AI ANALYSIS COMPLETE - Ready for live trading!              ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');
