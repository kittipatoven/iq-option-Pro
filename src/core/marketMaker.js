/**
 * Market Maker Strategy - Spread Capture
 * Micro-scalping strategy for sideways markets
 */

const logger = require('../utils/logger');

class MarketMakerStrategy {
    constructor() {
        this.name = 'MarketMakerStrategy';
        
        // ═══════════════════════════════════════════════════════════════
        // 💰 CONFIGURATION
        // ═══════════════════════════════════════════════════════════════
        this.config = {
            maxSpread: 0.0005,      // 0.05% max spread
            minVolatility: 0.0002,  // Minimum volatility
            maxVolatility: 0.002,   // Maximum volatility
            positionHoldTime: 2,    // Minutes to hold position
            profitTarget: 0.0003,   // 0.03% profit target
            stopLoss: 0.0005,       // 0.05% stop loss
            
            // Risk limits
            maxPositions: 2,        // Max concurrent positions
            maxExposure: 5         // Max total exposure
        };
        
        // ═══════════════════════════════════════════════════════════════
        // 📊 ACTIVE POSITIONS
        // ═══════════════════════════════════════════════════════════════
        this.positions = new Map();  // pair -> position data
        
        // ═══════════════════════════════════════════════════════════════
        // 📈 MARKET STATE
        // ═══════════════════════════════════════════════════════════════
        this.marketState = new Map();  // pair -> { volatility, spread, regime }
        
        // ═══════════════════════════════════════════════════════════════
        // 💸 PERFORMANCE
        // ═══════════════════════════════════════════════════════════════
        this.performance = {
            totalTrades: 0,
            wins: 0,
            losses: 0,
            totalProfit: 0,
            avgHoldTime: 0
        };
    }
    
    /**
     * ═══════════════════════════════════════════════════════════════
     * 🎯 ANALYZE MARKET CONDITIONS
     * ═══════════════════════════════════════════════════════════════
     */
    analyzeMarket(pair, candles) {
        if (!candles || candles.length < 10) return null;
        
        const recent = candles.slice(-20);
        
        // Calculate volatility
        const prices = recent.map(c => c.close);
        const returns = [];
        for (let i = 1; i < prices.length; i++) {
            returns.push((prices[i] - prices[i-1]) / prices[i-1]);
        }
        
        const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
        const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
        const volatility = Math.sqrt(variance);
        
        // Estimate spread from high-low range
        const avgRange = recent.reduce((sum, c) => sum + (c.high - c.low), 0) / recent.length;
        const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
        const spread = avgRange / avgPrice;
        
        // Determine regime
        let regime = 'UNKNOWN';
        if (volatility < this.config.minVolatility) {
            regime = 'LOW_VOL';
        } else if (volatility > this.config.maxVolatility) {
            regime = 'HIGH_VOL';
        } else {
            regime = 'NORMAL';
        }
        
        // Check if market is sideways (mean-reverting)
        const sma = prices.reduce((a, b) => a + b, 0) / prices.length;
        const deviations = prices.map(p => Math.abs(p - sma));
        const avgDeviation = deviations.reduce((a, b) => a + b, 0) / deviations.length;
        const isSideways = avgDeviation < (sma * 0.002);  // Within 0.2% of SMA
        
        const state = {
            volatility,
            spread,
            regime,
            isSideways,
            sma,
            timestamp: Date.now()
        };
        
        this.marketState.set(pair, state);
        return state;
    }
    
    /**
     * ═══════════════════════════════════════════════════════════════
     * 💡 GENERATE SIGNAL
     * ═══════════════════════════════════════════════════════════════
     */
    generateSignal(pair, currentPrice, indicators) {
        const state = this.marketState.get(pair);
        if (!state) return null;
        
        // Check if market conditions are suitable
        if (!this.isMarketSuitable(state)) {
            return {
                shouldTrade: false,
                reason: 'Market conditions not suitable',
                state
            };
        }
        
        // Check position limits
        if (this.positions.size >= this.config.maxPositions) {
            return {
                shouldTrade: false,
                reason: 'Max positions reached',
                state
            };
        }
        
        // Check if we already have a position
        if (this.positions.has(pair)) {
            return this.managePosition(pair, currentPrice);
        }
        
        // Determine entry direction based on deviation from SMA
        const deviation = (currentPrice - state.sma) / state.sma;
        const threshold = state.volatility * 2;
        
        let signal = null;
        let direction = null;
        
        // Mean reversion: buy below SMA, sell above SMA
        if (deviation < -threshold) {
            // Price below SMA - expect bounce up
            signal = 'BUY';
            direction = 'CALL';
        } else if (deviation > threshold) {
            // Price above SMA - expect pull back
            signal = 'SELL';
            direction = 'PUT';
        }
        
        if (signal) {
            return {
                shouldTrade: true,
                signal,
                direction,
                entryPrice: currentPrice,
                targetPrice: signal === 'BUY' 
                    ? currentPrice * (1 + this.config.profitTarget)
                    : currentPrice * (1 - this.config.profitTarget),
                stopPrice: signal === 'BUY'
                    ? currentPrice * (1 - this.config.stopLoss)
                    : currentPrice * (1 + this.config.stopLoss),
                state,
                deviation,
                expectedReturn: this.config.profitTarget,
                confidence: Math.min(10, Math.abs(deviation) / threshold * 5 + 5)
            };
        }
        
        return {
            shouldTrade: false,
            reason: 'No clear entry signal',
            state,
            deviation
        };
    }
    
    /**
     * Check if market conditions are suitable for market making
     */
    isMarketSuitable(state) {
        // Need sideways market with reasonable volatility
        return state.isSideways && 
               state.volatility >= this.config.minVolatility &&
               state.volatility <= this.config.maxVolatility &&
               state.spread <= this.config.maxSpread;
    }
    
    /**
     * Manage existing position
     */
    managePosition(pair, currentPrice) {
        const position = this.positions.get(pair);
        if (!position) return null;
        
        const holdingTime = (Date.now() - position.entryTime) / 60000;  // minutes
        const pnl = position.direction === 'CALL'
            ? (currentPrice - position.entryPrice) / position.entryPrice
            : (position.entryPrice - currentPrice) / position.entryPrice;
        
        // Check take profit
        if (pnl >= this.config.profitTarget) {
            this.closePosition(pair, 'TP', pnl, holdingTime);
            return { action: 'CLOSE', reason: 'Take Profit', pnl };
        }
        
        // Check stop loss
        if (pnl <= -this.config.stopLoss) {
            this.closePosition(pair, 'SL', pnl, holdingTime);
            return { action: 'CLOSE', reason: 'Stop Loss', pnl };
        }
        
        // Check time limit
        if (holdingTime >= this.config.positionHoldTime) {
            this.closePosition(pair, 'TIME', pnl, holdingTime);
            return { action: 'CLOSE', reason: 'Time Limit', pnl };
        }
        
        return {
            action: 'HOLD',
            pnl,
            holdingTime: holdingTime.toFixed(1) + 'm',
            targetPnl: this.config.profitTarget,
            stopPnl: -this.config.stopLoss
        };
    }
    
    /**
     * Open new position
     */
    openPosition(pair, signal, amount) {
        const position = {
            pair,
            direction: signal.direction,
            entryPrice: signal.entryPrice,
            targetPrice: signal.targetPrice,
            stopPrice: signal.stopPrice,
            amount,
            entryTime: Date.now(),
            state: signal.state
        };
        
        this.positions.set(pair, position);
        
        console.log(`\n💰 MARKET MAKER OPEN:`);
        console.log(`   Pair: ${pair}`);
        console.log(`   Direction: ${position.direction}`);
        console.log(`   Entry: ${position.entryPrice.toFixed(5)}`);
        console.log(`   Target: ${position.targetPrice.toFixed(5)}`);
        console.log(`   Stop: ${position.stopPrice.toFixed(5)}`);
        console.log(`   Amount: $${amount}`);
        
        return position;
    }
    
    /**
     * Close position
     */
    closePosition(pair, reason, pnl, holdingTime) {
        const position = this.positions.get(pair);
        if (!position) return null;
        
        // Update performance
        this.performance.totalTrades++;
        this.performance.totalProfit += pnl;
        
        if (pnl > 0) {
            this.performance.wins++;
        } else {
            this.performance.losses++;
        }
        
        // Update avg hold time
        this.performance.avgHoldTime = 
            (this.performance.avgHoldTime * (this.performance.totalTrades - 1) + holdingTime) 
            / this.performance.totalTrades;
        
        console.log(`\n💰 MARKET MAKER CLOSE:`);
        console.log(`   Pair: ${pair}`);
        console.log(`   Reason: ${reason}`);
        console.log(`   PnL: ${(pnl * 100).toFixed(3)}%`);
        console.log(`   Hold Time: ${holdingTime.toFixed(1)}m`);
        
        this.positions.delete(pair);
        
        return {
            pair,
            reason,
            pnl,
            holdingTime,
            performance: { ...this.performance }
        };
    }
    
    /**
     * Get current positions
     */
    getPositions() {
        return Array.from(this.positions.entries()).map(([pair, pos]) => ({
            pair,
            ...pos,
            holdingTime: ((Date.now() - pos.entryTime) / 60000).toFixed(1) + 'm'
        }));
    }
    
    /**
     * Get performance stats
     */
    getStats() {
        const total = this.performance.totalTrades;
        return {
            ...this.performance,
            winRate: total > 0 ? (this.performance.wins / total * 100).toFixed(1) : 0,
            avgPnl: total > 0 ? (this.performance.totalProfit / total * 100).toFixed(3) : 0,
            activePositions: this.positions.size
        };
    }
    
    /**
     * Generate report
     */
    generateReport() {
        const stats = this.getStats();
        
        console.log(`\n╔══════════════════════════════════════════════════════════╗`);
        console.log(`║          💰 MARKET MAKER REPORT                            ║`);
        console.log(`╠══════════════════════════════════════════════════════════╣`);
        console.log(`║ Total Trades: ${stats.totalTrades} | Win Rate: ${stats.winRate}%`);
        console.log(`║ Wins: ${stats.wins} | Losses: ${stats.losses}`);
        console.log(`║ Total Profit: ${(stats.totalProfit * 100).toFixed(3)}%`);
        console.log(`║ Avg PnL: ${stats.avgPnl}%`);
        console.log(`║ Avg Hold Time: ${stats.avgHoldTime.toFixed(1)}m`);
        console.log(`║ Active Positions: ${stats.activePositions}`);
        console.log(`╚══════════════════════════════════════════════════════════╝\n`);
        
        return stats;
    }
}

module.exports = new MarketMakerStrategy();
