// Market-Condition Aware Optimizer - Different params per market state
class Optimizer {
    constructor() {
        this.defaultParams = {
            rsiBuy: 30,
            rsiSell: 70,
            bbTolerance: 0.0002,
            scoreThreshold: 4
        };
        
        this.params = { ...this.defaultParams };
        
        // STEP 1: Store performance with market condition and parameters
        this.history = [];
        
        // Best params per market condition
        this.bestParams = {
            SIDEWAY: null,
            TREND_UP: null,
            TREND_DOWN: null,
            VOLATILE: null
        };
        
        // Candidate parameter validation system
        this.candidateParams = null;
        this.candidateResults = [];
        this.previousParams = null;
        this.isTestingCandidate = false;
        
        this.lastAdjustment = Date.now();
        this.adjustmentCount = 0;
        this.explorationRate = 0.2;
    }

    // STEP 1: Record trade result with current market condition and profit
    record(result, market = 'SIDEWAY', profit = 0, metadata = {}) {
        const entry = {
            rsiBuy: this.params.rsiBuy,
            rsiSell: this.params.rsiSell,
            scoreThreshold: this.params.scoreThreshold,
            market: market,
            result: result,
            profit: profit, // STEP 1: Store profit per trade
            timestamp: Date.now(),
            ...metadata
        };
        
        this.history.push(entry);
        console.log(`📊 Recorded: ${result} $${profit} | Market: ${market} | RSI ${entry.rsiBuy}/${entry.rsiSell}`);
        
        // STEP 2: Track candidate results if testing new params
        if (this.isTestingCandidate) {
            this.candidateResults.push({ result, profit }); // STEP 1: Store profit
            console.log(`🔍 Candidate test: ${this.candidateResults.length}/5 trades recorded`);
            
            // STEP 3: Evaluate after 5 trades
            if (this.candidateResults.length >= 5) {
                this.evaluateCandidate();
            }
        }
    }

    // STEP 2: Group by market condition + parameter combination
    groupByMarketAndParameters() {
        const groups = {};
        
        this.history.forEach(t => {
            // STEP 2: Key includes market condition
            const key = `${t.market}-${t.rsiBuy}-${t.rsiSell}-${t.scoreThreshold}`;
            
            if (!groups[key]) {
                groups[key] = { 
                    wins: 0, 
                    total: 0,
                    market: t.market,
                    rsiBuy: t.rsiBuy,
                    rsiSell: t.rsiSell,
                    scoreThreshold: t.scoreThreshold
                };
            }
            
            groups[key].total++;
            if (t.result === 'win') groups[key].wins++;
        });
        
        return groups;
    }

    // STEP 3: Find best parameters per market condition
    findBestPerMarket() {
        const groups = this.groupByMarketAndParameters();
        
        // STEP 3: Track best per market
        const best = {};
        
        for (let key in groups) {
            const g = groups[key];
            const winrate = g.wins / g.total;
            
            // Only consider if at least 5 trades for statistical significance
            if (g.total >= 5) {
                if (!best[g.market] || winrate > best[g.market].winrate) {
                    best[g.market] = {
                        winrate: winrate,
                        params: {
                            rsiBuy: g.rsiBuy,
                            rsiSell: g.rsiSell,
                            scoreThreshold: g.scoreThreshold
                        },
                        wins: g.wins,
                        total: g.total
                    };
                }
            }
        }
        
        return best;
    }

    // STEP 4: Get params based on current market condition
    getParams(market = 'SIDEWAY') {
        // If we have best params for this market, use them
        if (this.bestParams[market]) {
            const p = this.bestParams[market];
            console.log(`🎯 Using ${market} params: RSI ${p.rsiBuy}/${p.rsiSell}`);
            return { ...this.defaultParams, ...p };
        }
        
        // STEP 5: Fallback to default if no data for this market
        console.log(`⚠️ No data for ${market}, using default params`);
        return this.params;
    }

    // STEP 4: Apply best per market
    applyBestPerMarket(bestPerMarket) {
        for (let market in bestPerMarket) {
            const data = bestPerMarket[market];
            this.bestParams[market] = data.params;
            
            console.log(`🏆 ${market}: Best params found`);
            console.log(`   Winrate: ${(data.winrate * 100).toFixed(1)}% (${data.wins}/${data.total})`);
            console.log(`   Params:`, data.params);
        }
    }

    // STEP 5: Smart Exploration mode - only when losing
    explore(winrate) {
        // STEP 4: Disable exploration when performance is good
        if (winrate > 65) {
            console.log("✅ Performance good (winrate > 65%), skipping exploration");
            return false;
        }
        
        // STEP 1: Only explore when winrate is low
        if (winrate < 50 && Math.random() < this.explorationRate) {
            // STEP 2: Limit parameter ranges
            const variation = () => (Math.random() * 4 - 2); // -2 to +2
            
            // Save previous params before exploring
            this.previousParams = { ...this.params };
            
            // Set candidate params
            this.candidateParams = {
                rsiBuy: Math.max(20, Math.min(40, this.params.rsiBuy + variation())),
                rsiSell: Math.max(60, Math.min(80, this.params.rsiSell + variation())),
                scoreThreshold: Math.max(2, Math.min(6, this.params.scoreThreshold + variation()))
            };
            
            // Apply candidate params temporarily for testing
            this.params = { ...this.candidateParams };
            this.isTestingCandidate = true;
            this.candidateResults = [];
            
            // STEP 3: Clear logging
            console.log("🔍 SMART EXPLORATION (winrate < 50%): testing new params");
            console.log("   Candidate:", this.candidateParams);
            console.log("   Previous:", this.previousParams);
            return true;
        }
        
        return false;
    }

    // STEP 3 & 4: Evaluate candidate parameters after 5 trades - PROFIT BASED
    evaluateCandidate() {
        // VALIDATION: Must have at least 5 trades
        if (!this.candidateResults || this.candidateResults.length < 5) {
            console.log(`⏳ Waiting for more trades: ${this.candidateResults?.length || 0}/5`);
            return null; // Not enough data yet
        }
        
        // STEP 2: Calculate total profit
        const totalProfit = this.candidateResults.reduce((sum, t) => sum + (t.profit || 0), 0);
        
        // STEP 3: Calculate profit factor
        const wins = this.candidateResults.filter(t => (t.profit || 0) > 0);
        const losses = this.candidateResults.filter(t => (t.profit || 0) < 0);
        
        const grossProfit = wins.reduce((s, t) => s + (t.profit || 0), 0);
        const grossLoss = Math.abs(losses.reduce((s, t) => s + (t.profit || 0), 0));
        
        const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? 999 : 0);
        
        // Calculate drawdown
        const maxDrawdown = this.calculateDrawdown(this.candidateResults);
        
        // STEP 5: Log profit metrics
        console.log(`\n📊 Profit: $${totalProfit.toFixed(2)}`);
        console.log(`📊 Profit Factor: ${profitFactor.toFixed(2)}`);
        console.log(`📊 Max Drawdown: $${maxDrawdown.toFixed(2)}`);
        console.log(`   Wins: ${wins.length}, Losses: ${losses.length}`);
        
        // STEP 4: Approve if profitFactor > 1.2 AND totalProfit > 0 AND drawdown < 10%
        const maxDrawdownPercent = 10; // 10% max drawdown
        const totalAtRisk = Math.abs(grossLoss) || 1; // Avoid division by zero
        const drawdownPercent = (maxDrawdown / totalAtRisk) * 100;
        
        if (profitFactor > 1.2 && totalProfit > 0 && drawdownPercent < maxDrawdownPercent) {
            console.log("✅ NEW PARAM APPROVED");
            console.log("   New params applied:", this.candidateParams);
            // Params already set, just clear candidate state
            this.isTestingCandidate = false;
            this.candidateResults = [];
            this.previousParams = null;
            return true;
        } else {
            // STEP 4: Fallback to previous params if rejected
            console.log("❌ NEW PARAM REJECTED");
            if (profitFactor <= 1.2) console.log("   Reason: Profit factor too low");
            if (totalProfit <= 0) console.log("   Reason: Not profitable");
            if (drawdownPercent >= maxDrawdownPercent) console.log("   Reason: Drawdown too high (" + drawdownPercent.toFixed(1) + "%)");
            console.log("   Falling back to previous params:", this.previousParams);
            this.params = { ...this.previousParams };
            this.isTestingCandidate = false;
            this.candidateResults = [];
            this.candidateParams = null;
            this.previousParams = null;
            return false;
        }
    }
    
    // NEW: Calculate max drawdown
    calculateDrawdown(trades) {
        let maxDrawdown = 0;
        let peak = 0;
        let current = 0;
        
        for (const trade of trades) {
            current += trade.profit || 0;
            if (current > peak) peak = current;
            const drawdown = peak - current;
            if (drawdown > maxDrawdown) maxDrawdown = drawdown;
        }
        
        return maxDrawdown;
    }

    // Main adjustment method
    adjust(winrate) {
        const now = Date.now();
        if (now - this.lastAdjustment < 5 * 60 * 1000) return this.params;
        
        console.log(`\n⚙️ Optimizing (Winrate: ${winrate.toFixed(1)}%, Trades: ${this.history.length})`);
        
        // Find best params per market
        const bestPerMarket = this.findBestPerMarket();
        this.applyBestPerMarket(bestPerMarket);
        
        // Exploration
        if (!this.explore(winrate)) {
            if (Object.keys(bestPerMarket).length > 0) {
                console.log("✅ Using optimized params per market condition");
            }
        }
        
        this.lastAdjustment = now;
        this.adjustmentCount++;
        
        return this.params;
    }

    // Get detailed stats
    getStats() {
        const groups = this.groupByMarketAndParameters();
        const currentKey = `${this.params.rsiBuy}-${this.params.rsiSell}-${this.params.scoreThreshold}`;
        const current = groups[currentKey];
        
        return {
            totalTrades: this.history.length,
            currentParams: this.params,
            bestPerMarket: this.bestParams,
            uniqueConfigs: Object.keys(groups).length,
            markets: Object.keys(this.bestParams).filter(m => this.bestParams[m] !== null)
        };
    }

    getParams(market = 'SIDEWAY') {
        // Return best params for this market if available, otherwise current params
        if (this.bestParams && this.bestParams[market]) {
            return this.bestParams[market];
        }
        return this.params;
    }

    reset() {
        this.params = { ...this.defaultParams };
        this.history = [];
        this.bestParams = {
            SIDEWAY: null,
            TREND_UP: null,
            TREND_DOWN: null,
            VOLATILE: null
        };
        this.adjustmentCount = 0;
        this.lastAdjustment = Date.now();
    }
}

module.exports = Optimizer;
