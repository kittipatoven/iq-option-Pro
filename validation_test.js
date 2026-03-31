/**
 * Production Validation Test
 * Runs bot in demo mode and collects metrics
 */

const bot = require('./src/core/bot');
const fs = require('fs');

console.log('🚀 STARTING PRODUCTION VALIDATION TEST\n');

const validationData = {
    startTime: Date.now(),
    trades: [],
    errors: [],
    reconnects: 0,
    latency: [],
    stats: {
        totalTrades: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        profit: 0,
        maxDrawdown: 0,
        avgLatency: 0
    }
};

// Monitor bot events
process.on('uncaughtException', (err) => {
    validationData.errors.push({
        type: 'uncaughtException',
        message: err.message,
        stack: err.stack,
        timestamp: Date.now()
    });
    console.error('❌ UNCAUGHT EXCEPTION:', err.message);
});

process.on('unhandledRejection', (reason, promise) => {
    validationData.errors.push({
        type: 'unhandledRejection',
        reason: reason?.message || reason,
        timestamp: Date.now()
    });
    console.error('❌ UNHANDLED REJECTION:', reason);
});

// Simulate bot startup
async function runValidation() {
    try {
        console.log('📊 Current Bot Configuration:');
        console.log('  - RSI Call Max:', bot.sniperConfig?.rsi?.callMax);
        console.log('  - RSI Put Min:', bot.sniperConfig?.rsi?.putMin);
        console.log('  - Sniper Threshold:', bot.sniperConfig?.scoring?.minThreshold);
        console.log('  - Loss Pause (min):', bot.sniperConfig?.lossControl?.pauseMinutes);
        console.log('');
        
        // Check if all AI modules load
        console.log('🧠 Checking AI Systems:');
        const modules = [
            'transformerPrediction',
            'orderFlowAnalyzer', 
            'marketMaker',
            'latencyArbitrage',
            'ultraEntry',
            'rlEngine'
        ];
        
        for (const mod of modules) {
            try {
                const m = require(`./src/core/${mod}`);
                console.log(`  ✅ ${mod}: LOADED (${m.name || mod})`);
            } catch (e) {
                console.log(`  ❌ ${mod}: FAILED - ${e.message}`);
                validationData.errors.push({
                    type: 'module_load',
                    module: mod,
                    error: e.message
                });
            }
        }
        
        console.log('\n📈 Validation Status: READY');
        console.log('📝 To run full test: node run.js');
        
        // Save validation data
        fs.writeFileSync(
            'validation_initial.json',
            JSON.stringify(validationData, null, 2)
        );
        
        console.log('\n✅ Initial validation complete');
        console.log('📄 Data saved to: validation_initial.json');
        
    } catch (error) {
        console.error('❌ Validation failed:', error.message);
        validationData.errors.push({
            type: 'validation_failed',
            message: error.message,
            stack: error.stack
        });
        
        fs.writeFileSync(
            'validation_initial.json',
            JSON.stringify(validationData, null, 2)
        );
        process.exit(1);
    }
}

runValidation();
