/**
 * Portfolio Manager - Multi-Pair Trading System
 * Manages capital allocation across multiple currency pairs
 * 
 * Features:
 * - Dynamic capital allocation based on performance
 * - Risk distribution across pairs
 * - Sharpe ratio tracking
 * - Drawdown monitoring
 * - Auto rebalancing
 */

const logger = require('../utils/logger');

class PortfolioManager {
    constructor() {
        // ═══════════════════════════════════════════════════════════════
        // 💰 PORTFOLIO CONFIGURATION
        // ═══════════════════════════════════════════════════════════════
        this.config = {
            pairs: [
                'EURUSD', 'EURUSD-OTC',
                'GBPUSD', 'GBPUSD-OTC', 
                'USDJPY', 'USDJPY-OTC',
                'AUDUSD', 'USDCAD',
                'EURJPY', 'GBPJPY'
            ],
            
            // Allocation limits
            maxAllocationPerPair: 0.30,     // Max 30% per pair
            minAllocationPerPair: 0.05,     // Min 5% per pair
            
            // Risk settings
            maxTotalRisk: 0.10,              // Max 10% portfolio risk
            targetRiskPerTrade: 0.02,        // 2% per trade
            
            // Rebalancing
            rebalanceThreshold: 0.05,        // Rebalance if drift > 5%
            rebalanceInterval: 24 * 60 * 60 * 1000, // Daily
            
            // Performance thresholds
            minTradesForAdjustment: 10,      // Min trades before adjusting
            winRateThreshold: 0.55           // Minimum acceptable win rate
        };
        
        // ═══════════════════════════════════════════════════════════════
        // 📊 PORTFOLIO STATE
        // ═══════════════════════════════════════════════════════════════
        this.portfolio = {
            totalCapital: 1000,              // Total available capital
            allocatedCapital: 0,             // Currently allocated
            freeCapital: 1000,               // Unallocated capital
            totalProfit: 0,                  // Total P&L
            peakValue: 1000,                 // Peak portfolio value
            maxDrawdown: 0                   // Current drawdown
        };
        
        // ═══════════════════════════════════════════════════════════════
        // 📈 PAIR PERFORMANCE TRACKING
        // ═══════════════════════════════════════════════════════════════
        this.pairData = new Map();          // pair -> PairData
        
        // Initialize pairs
        this.initializePairs();
        
        // ═══════════════════════════════════════════════════════════════
        // ⏰ REBALANCING STATE
        // ═══════════════════════════════════════════════════════════════
        this.lastRebalance = Date.now();
        this.rebalanceHistory = [];
    }
    
    /**
     * Initialize pair data structures
     */
    initializePairs() {
        for (const pair of this.config.pairs) {
            this.pairData.set(pair, {
                // Capital allocation
                targetAllocation: 1 / this.config.pairs.length, // Equal initially
                currentAllocation: 0,
                availableCapital: 0,
                
                // Performance metrics
                trades: [],
                wins: 0,
                losses: 0,
                totalProfit: 0,
                winRate: 0,
                profitFactor: 0,
                sharpeRatio: 0,
                maxDrawdown: 0,
                
                // Risk metrics
                avgTradeSize: 0,
                avgProfit: 0,
                avgLoss: 0,
                volatility: 0,
                
                // Status
                active: true,
                lastTrade: null,
                consecutiveLosses: 0
            });
        }
    }
    
    /**
     * Set total portfolio capital
     */
    setCapital(amount) {
        this.portfolio.totalCapital = amount;
        this.portfolio.freeCapital = amount - this.portfolio.allocatedCapital;
        this.portfolio.peakValue = Math.max(this.portfolio.peakValue, amount);
        
        // Recalculate allocations
        this.calculateAllocations();
    }
    
    /**
     * Calculate target allocations based on performance
     */
    calculateAllocations() {
        // Calculate performance scores
        const scores = [];
        let totalScore = 0;
        
        for (const [pair, data] of this.pairData.entries()) {
            const score = this.calculatePerformanceScore(data);
            scores.push({ pair, score, data });
            totalScore += score;
        }
        
        // Normalize to get allocations
        for (const item of scores) {
            let allocation = totalScore > 0 ? item.score / totalScore : 1 / this.config.pairs.length;
            
            // Apply limits
            allocation = Math.max(
                this.config.minAllocationPerPair,
                Math.min(this.config.maxAllocationPerPair, allocation)
            );
            
            item.data.targetAllocation = allocation;
            item.data.availableCapital = this.portfolio.totalCapital * allocation;
        }
    }
    
    /**
     * Calculate performance score for a pair
     */
    calculatePerformanceScore(data) {
        const trades = data.trades.length;
        
        // Minimum trades required
        if (trades < this.config.minTradesForAdjustment) {
            return 1; // Neutral score
        }
        
        const winRate = data.winRate;
        const profitFactor = data.profitFactor;
        const sharpe = data.sharpeRatio;
        
        // Penalize poor performers
        if (winRate < 0.45 || profitFactor < 0.8) {
            return 0.5; // Reduce allocation
        }
        
        if (winRate < 0.40 || data.consecutiveLosses >= 3) {
            return 0; // Pause trading
        }
        
        // Score calculation
        let score = 1;
        
        // Win rate contribution (40%)
        score += (winRate - 0.5) * 4;
        
        // Profit factor contribution (30%)
        score += (profitFactor - 1) * 2;
        
        // Sharpe ratio contribution (30%)
        score += sharpe * 0.5;
        
        return Math.max(0.1, score);
    }
    
    /**
     * Request capital for a trade
     */
    requestCapital(pair, baseAmount, confidence) {
        const data = this.pairData.get(pair);
        if (!data) return { allowed: false, reason: 'Unknown pair' };
        
        // Check if pair is active
        if (!data.active) {
            return { allowed: false, reason: 'Pair paused due to poor performance' };
        }
        
        // Check available capital
        if (data.availableCapital < baseAmount) {
            return { allowed: false, reason: 'Insufficient capital for pair' };
        }
        
        // Calculate position size based on confidence and allocation
        const maxSize = Math.min(
            data.availableCapital * 0.3,  // Max 30% of pair allocation per trade
            this.portfolio.totalCapital * this.config.targetRiskPerTrade
        );
        
        const size = baseAmount * confidence;
        const finalSize = Math.min(size, maxSize);
        
        // Reserve capital
        data.availableCapital -= finalSize;
        this.portfolio.allocatedCapital += finalSize;
        this.portfolio.freeCapital -= finalSize;
        
        return {
            allowed: true,
            size: finalSize,
            maxSize: maxSize,
            remainingAllocation: data.availableCapital
        };
    }
    
    /**
     * Release capital after trade completion
     */
    releaseCapital(pair, amount, profit) {
        const data = this.pairData.get(pair);
        if (!data) return;
        
        // Return capital to pool
        data.availableCapital += amount;
        this.portfolio.allocatedCapital -= amount;
        this.portfolio.freeCapital += amount;
        
        // Record trade
        const trade = {
            timestamp: Date.now(),
            amount: amount,
            profit: profit,
            result: profit > 0 ? 'win' : profit < 0 ? 'loss' : 'breakeven'
        };
        
        data.trades.push(trade);
        data.lastTrade = trade;
        
        // Update metrics
        this.updatePairMetrics(pair, profit);
        
        // Update portfolio
        this.portfolio.totalProfit += profit;
        this.portfolio.totalCapital += profit;
        
        // Check drawdown
        const currentValue = this.portfolio.totalCapital;
        this.portfolio.peakValue = Math.max(this.portfolio.peakValue, currentValue);
        this.portfolio.maxDrawdown = (this.portfolio.peakValue - currentValue) / this.portfolio.peakValue;
    }
    
    /**
     * Update pair performance metrics
     */
    updatePairMetrics(pair, profit) {
        const data = this.pairData.get(pair);
        const trades = data.trades.slice(-50); // Last 50 trades
        
        // Count wins/losses
        data.wins = trades.filter(t => t.profit > 0).length;
        data.losses = trades.filter(t => t.profit < 0).length;
        
        // Win rate
        const total = data.wins + data.losses;
        data.winRate = total > 0 ? data.wins / total : 0;
        
        // Profit factor
        const grossProfit = trades.filter(t => t.profit > 0).reduce((sum, t) => sum + t.profit, 0);
        const grossLoss = Math.abs(trades.filter(t => t.profit < 0).reduce((sum, t) => sum + t.profit, 0));
        data.profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;
        
        // Average metrics
        data.avgProfit = data.wins > 0 ? grossProfit / data.wins : 0;
        data.avgLoss = data.losses > 0 ? grossLoss / data.losses : 0;
        data.avgTradeSize = trades.reduce((sum, t) => sum + t.amount, 0) / trades.length;
        
        // Volatility (standard deviation of returns)
        const returns = trades.map(t => t.profit / t.amount);
        const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
        const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
        data.volatility = Math.sqrt(variance);
        
        // Sharpe ratio (simplified, assuming risk-free rate = 0)
        data.sharpeRatio = data.volatility > 0 ? mean / data.volatility : 0;
        
        // Consecutive losses tracking
        if (profit < 0) {
            data.consecutiveLosses++;
        } else {
            data.consecutiveLosses = 0;
        }
        
        // Auto-pause if performance is poor
        if (data.consecutiveLosses >= 3 || data.winRate < 0.35 && total > 10) {
            data.active = false;
            logger.warn(`[Portfolio] Paused ${pair} due to poor performance`);
        }
        
        // Reactivate if performance improves
        if (!data.active && data.winRate > 0.55 && data.consecutiveLosses === 0) {
            data.active = true;
            logger.info(`[Portfolio] Reactivated ${pair}`);
        }
    }
    
    /**
     * Check if rebalancing is needed
     */
    checkRebalance() {
        const timeSinceLast = Date.now() - this.lastRebalance;
        
        // Time-based rebalance
        if (timeSinceLast >= this.config.rebalanceInterval) {
            return true;
        }
        
        // Drift-based rebalance
        for (const [pair, data] of this.pairData.entries()) {
            const drift = Math.abs(data.currentAllocation - data.targetAllocation);
            if (drift > this.config.rebalanceThreshold) {
                return true;
            }
        }
        
        return false;
    }
    
    /**
     * Perform portfolio rebalancing
     */
    rebalance() {
        console.log(`\n💰 PORTFOLIO REBALANCING:`);
        
        // Recalculate allocations
        this.calculateAllocations();
        
        // Apply new allocations
        for (const [pair, data] of this.pairData.entries()) {
            const oldAllocation = data.currentAllocation;
            data.currentAllocation = data.targetAllocation;
            data.availableCapital = this.portfolio.totalCapital * data.targetAllocation;
            
            console.log(`   ${pair}: ${(oldAllocation * 100).toFixed(1)}% → ${(data.targetAllocation * 100).toFixed(1)}%`);
        }
        
        this.lastRebalance = Date.now();
        
        this.rebalanceHistory.push({
            timestamp: Date.now(),
            portfolioValue: this.portfolio.totalCapital,
            allocations: Array.from(this.pairData.entries()).map(([p, d]) => ({ pair: p, allocation: d.targetAllocation }))
        });
        
        return {
            timestamp: this.lastRebalance,
            portfolioValue: this.portfolio.totalCapital
        };
    }
    
    /**
     * Get portfolio statistics
     */
    getPortfolioStats() {
        const pairStats = [];
        
        for (const [pair, data] of this.pairData.entries()) {
            if (data.trades.length > 0) {
                pairStats.push({
                    pair,
                    allocation: (data.targetAllocation * 100).toFixed(1) + '%',
                    trades: data.trades.length,
                    winRate: (data.winRate * 100).toFixed(1) + '%',
                    profitFactor: data.profitFactor.toFixed(2),
                    sharpe: data.sharpeRatio.toFixed(2),
                    profit: data.totalProfit.toFixed(2),
                    active: data.active
                });
            }
        }
        
        return {
            totalCapital: this.portfolio.totalCapital.toFixed(2),
            totalProfit: this.portfolio.totalProfit.toFixed(2),
            maxDrawdown: (this.portfolio.maxDrawdown * 100).toFixed(1) + '%',
            freeCapital: this.portfolio.freeCapital.toFixed(2),
            allocatedCapital: this.portfolio.allocatedCapital.toFixed(2),
            pairs: pairStats,
            lastRebalance: new Date(this.lastRebalance).toLocaleString()
        };
    }
    
    /**
     * Get best performing pairs
     */
    getBestPairs(count = 3) {
        const sorted = Array.from(this.pairData.entries())
            .filter(([_, d]) => d.trades.length >= this.config.minTradesForAdjustment)
            .sort((a, b) => {
                const scoreA = this.calculatePerformanceScore(a[1]);
                const scoreB = this.calculatePerformanceScore(b[1]);
                return scoreB - scoreA;
            });
        
        return sorted.slice(0, count).map(([pair, _]) => pair);
    }
    
    /**
     * Get worst performing pairs
     */
    getWorstPairs(count = 3) {
        const sorted = Array.from(this.pairData.entries())
            .filter(([_, d]) => d.trades.length >= 5)
            .sort((a, b) => {
                const scoreA = this.calculatePerformanceScore(a[1]);
                const scoreB = this.calculatePerformanceScore(b[1]);
                return scoreA - scoreB;
            });
        
        return sorted.slice(0, count).map(([pair, _]) => pair);
    }
    
    /**
     * Display portfolio report
     */
    generateReport() {
        const stats = this.getPortfolioStats();
        
        console.log(`\n╔══════════════════════════════════════════════════════════╗`);
        console.log(`║          💰 PORTFOLIO REPORT                              ║`);
        console.log(`╠══════════════════════════════════════════════════════════╣`);
        console.log(`║ Capital: $${stats.totalCapital} | Profit: $${stats.totalProfit} | DD: ${stats.maxDrawdown}`);
        console.log(`║ Free: $${stats.freeCapital} | Allocated: $${stats.allocatedCapital}`);
        console.log(`╠══════════════════════════════════════════════════════════╣`);
        console.log(`║ PAIR PERFORMANCE:`);
        stats.pairs.forEach(p => {
            const status = p.active ? '✅' : '⏸️';
            console.log(`║ ${status} ${p.pair.padEnd(12)} ${p.allocation} | WR:${p.winRate} | PF:${p.profitFactor} | S:${p.sharpe}`);
        });
        console.log(`╚══════════════════════════════════════════════════════════╝\n`);
        
        return stats;
    }
}

// Export singleton
module.exports = new PortfolioManager();
