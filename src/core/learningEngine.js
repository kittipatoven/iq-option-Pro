// Learning Engine - Tracks and analyzes trade history to improve performance
class LearningEngine {
    constructor() {
        this.history = [];
        this.strategies = {};
        this.pairs = {};
    }

    record(trade) {
        this.history.push({
            ...trade,
            timestamp: new Date()
        });

        // Track by strategy
        if (trade.strategy) {
            if (!this.strategies[trade.strategy]) {
                this.strategies[trade.strategy] = { wins: 0, losses: 0, total: 0 };
            }
            this.strategies[trade.strategy].total++;
            if (trade.result === 'win') {
                this.strategies[trade.strategy].wins++;
            } else if (trade.result === 'loss') {
                this.strategies[trade.strategy].losses++;
            }
        }

        // Track by pair
        if (trade.pair) {
            if (!this.pairs[trade.pair]) {
                this.pairs[trade.pair] = { wins: 0, losses: 0, total: 0 };
            }
            this.pairs[trade.pair].total++;
            if (trade.result === 'win') {
                this.pairs[trade.pair].wins++;
            } else if (trade.result === 'loss') {
                this.pairs[trade.pair].losses++;
            }
        }
    }

    analyze() {
        let wins = this.history.filter(t => t.result === 'win').length;
        let losses = this.history.filter(t => t.result === 'loss').length;
        let total = wins + losses;

        let winrate = total ? (wins / total) * 100 : 0;

        console.log(`\n📊 Learning Analysis:`);
        console.log(`Total Trades: ${this.history.length}`);
        console.log(`Completed: ${total} (Wins: ${wins}, Losses: ${losses})`);
        console.log(`Winrate: ${winrate.toFixed(2)}%`);

        // Analyze by strategy
        if (Object.keys(this.strategies).length > 0) {
            console.log(`\n📈 Strategy Performance:`);
            Object.entries(this.strategies).forEach(([name, stats]) => {
                const rate = stats.total ? ((stats.wins / stats.total) * 100).toFixed(1) : 0;
                console.log(`  ${name}: ${rate}% (${stats.wins}/${stats.total})`);
            });
        }

        // Analyze by pair
        if (Object.keys(this.pairs).length > 0) {
            console.log(`\n📉 Pair Performance:`);
            Object.entries(this.pairs).forEach(([name, stats]) => {
                const rate = stats.total ? ((stats.wins / stats.total) * 100).toFixed(1) : 0;
                console.log(`  ${name}: ${rate}% (${stats.wins}/${stats.total})`);
            });
        }

        return winrate;
    }

    getBestStrategy() {
        let bestStrategy = null;
        let bestRate = 0;

        Object.entries(this.strategies).forEach(([name, stats]) => {
            if (stats.total >= 5) { // Minimum 5 trades
                const rate = stats.wins / stats.total;
                if (rate > bestRate) {
                    bestRate = rate;
                    bestStrategy = name;
                }
            }
        });

        return bestStrategy;
    }

    getBestPair() {
        let bestPair = null;
        let bestRate = 0;

        Object.entries(this.pairs).forEach(([name, stats]) => {
            if (stats.total >= 5) { // Minimum 5 trades
                const rate = stats.wins / stats.total;
                if (rate > bestRate) {
                    bestRate = rate;
                    bestPair = name;
                }
            }
        });

        return bestPair;
    }

    getRecentTrades(count = 10) {
        return this.history.slice(-count);
    }

    clear() {
        this.history = [];
        this.strategies = {};
        this.pairs = {};
    }
}

module.exports = LearningEngine;
