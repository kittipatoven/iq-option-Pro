// Performance Dashboard - Real-time trading statistics display
module.exports = {
    display: (stats) => {
        const now = new Date().toLocaleTimeString();
        
        console.log("\n========== 📊 TRADING DASHBOARD ==========");
        console.log(`Time: ${now}`);
        console.log("-------------------------------------------");
        console.log(`💰 Balance: $${stats.balance?.toFixed(2) || '0.00'}`);
        console.log(`📈 Initial: $${stats.initialBalance?.toFixed(2) || '0.00'}`);
        console.log(`💵 Profit: $${(stats.profit || 0).toFixed(2)} (${stats.profitPercent?.toFixed(2) || '0.00'}%)`);
        console.log("-------------------------------------------");
        console.log(`🎯 Winrate: ${stats.winrate?.toFixed(2) || '0.00'}%`);
        console.log(`🔄 Total Trades: ${stats.trades || 0}`);
        console.log(`✅ Wins: ${stats.wins || 0} | ❌ Losses: ${stats.losses || 0}`);
        console.log("-------------------------------------------");
        
        if (stats.tier) {
            console.log(`💎 Tier: ${stats.tier}`);
        }
        if (stats.currentStrategy) {
            console.log(`🧠 Strategy: ${stats.currentStrategy}`);
        }
        if (stats.bestStrategy) {
            console.log(`⭐ Best Strategy: ${stats.bestStrategy}`);
        }
        if (stats.bestPair) {
            console.log(`⭐ Best Pair: ${stats.bestPair}`);
        }
        
        console.log("===========================================\n");
    },

    displayCompact: (stats) => {
        const profit = stats.profit || 0;
        const profitSymbol = profit >= 0 ? '+' : '';
        
        console.log(`📊 [${new Date().toLocaleTimeString()}] Balance: $${stats.balance?.toFixed(2)} | Winrate: ${stats.winrate?.toFixed(1)}% | Trades: ${stats.trades} | Profit: ${profitSymbol}$${profit.toFixed(2)}`);
    },

    displayOptimization: (params, winrate) => {
        console.log("\n⚙️ OPTIMIZATION UPDATE");
        console.log(`Current Winrate: ${winrate?.toFixed(2) || 'N/A'}%`);
        console.log("Adjusted Parameters:");
        console.log(`  RSI Buy: ${params.rsiBuy}`);
        console.log(`  RSI Sell: ${params.rsiSell}`);
        console.log(`  BB Tolerance: ${params.bbTolerance}`);
        console.log(`  Score Threshold: ${params.scoreThreshold}`);
    }
};
