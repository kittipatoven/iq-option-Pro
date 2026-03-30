// Backtest System - Measure winrate from trade history
module.exports = {
    run: (history) => {
        let wins = 0;
        let losses = 0;

        history.forEach(trade => {
            if (trade.result === 'win') wins++;
            else if (trade.result === 'loss') losses++;
        });

        const total = wins + losses;
        const winrate = total ? (wins / total) * 100 : 0;

        console.log(`\n📊 Backtest Result:`);
        console.log(`Trades: ${total}`);
        console.log(`Wins: ${wins}`);
        console.log(`Losses: ${losses}`);
        console.log(`Winrate: ${winrate.toFixed(2)}%`);
        
        return {
            total,
            wins,
            losses,
            winrate: winrate.toFixed(2)
        };
    }
};
