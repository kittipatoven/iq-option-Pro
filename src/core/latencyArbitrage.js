/**
 * Latency Arbitrage Module
 * Ultra-fast execution based on momentum spikes
 * Optimized for <100ms entry times
 */

const logger = require('../utils/logger');

class LatencyArbitrage {
    constructor() {
        this.name = 'LatencyArbitrage';
        
        // ═══════════════════════════════════════════════════════════════
        // ⚡ CONFIGURATION
        // ═══════════════════════════════════════════════════════════════
        this.config = {
            // Timing
            maxEntryDelay: 100,      // Maximum 100ms to enter
            preCalculate: true,        // Pre-calculate indicators
            
            // Momentum thresholds
            velocityThreshold: 0.05,  // 5% velocity spike
            accelerationThreshold: 0.02, // Acceleration threshold
            
            // Execution
            immediateExecution: true,  // No confirmation needed
            
            // Risk
            maxDailyTrades: 50,        // Limit to prevent overtrading
            cooldownAfterLoss: 30,       // 30 second cooldown
            
            // Position sizing
            baseSize: 1,
            sizeMultiplier: 1.5        // Larger size on strong signals
        };
        
        // ═══════════════════════════════════════════════════════════════
        // ⚡ LATENCY OPTIMIZATION
        // ═══════════════════════════════════════════════════════════════
        this.optimization = {
            indicatorCache: new Map(),  // Pre-calculated indicators
            priceBuffer: new Map(),     // Last known prices
            momentumBuffer: new Map(), // Momentum calculations
            
            // Execution tracking
            lastExecution: 0,
            executionTimes: []
        };
        
        // ═══════════════════════════════════════════════════════════════
        // 📊 STATE
        // ═══════════════════════════════════════════════════════════════
        this.state = {
            dailyTrades: 0,
            lastTradeTime: 0,
            cooldownUntil: 0,
            isActive: true
        };
        
        // ═══════════════════════════════════════════════════════════════
        // 📈 PERFORMANCE
        // ═══════════════════════════════════════════════════════════════
        this.performance = {
            totalTrades: 0,
            wins: 0,
            losses: 0,
            totalProfit: 0,
            avgExecutionTime: 0,
            bestExecutionTime: Infinity,
            worstExecutionTime: 0
        };
    }
    
    /**
     * ═══════════════════════════════════════════════════════════════
     * ⚡ PRE-CALCULATE INDICATORS (Optimization)
     * ═══════════════════════════════════════════════════════════════
     */
    preCalculateIndicators(pair, candles) {
        if (!candles || candles.length < 5) return null;
        
        const recent = candles.slice(-10);
        const prices = recent.map(c => c.close);
        
        // Calculate velocity
        const velocity = this.calculateVelocity(prices);
        
        // Calculate acceleration
        const acceleration = this.calculateAcceleration(prices);
        
        // Calculate momentum
        const momentum = this.calculateMomentum(prices);
        
        // Store in cache
        const indicators = {
            velocity,
            acceleration,
            momentum,
            timestamp: Date.now(),
            prices
        };
        
        this.optimization.indicatorCache.set(pair, indicators);
        
        return indicators;
    }
    
    /**
     * Calculate velocity
     */
    calculateVelocity(prices) {
        if (prices.length < 2) return 0;
        
        const first = prices[0];
        const last = prices[prices.length - 1];
        
        return (last - first) / first;
    }
    
    /**
     * Calculate acceleration (change in velocity)
     */
    calculateAcceleration(prices) {
        if (prices.length < 3) return 0;
        
        // First half velocity
        const mid = Math.floor(prices.length / 2);
        const v1 = (prices[mid] - prices[0]) / prices[0];
        
        // Second half velocity
        const v2 = (prices[prices.length - 1] - prices[mid]) / prices[mid];
        
        return v2 - v1;
    }
    
    /**
     * Calculate momentum strength
     */
    calculateMomentum(prices) {
        if (prices.length < 3) return 0;
        
        let upMoves = 0;
        let downMoves = 0;
        
        for (let i = 1; i < prices.length; i++) {
            if (prices[i] > prices[i-1]) upMoves++;
            else if (prices[i] < prices[i-1]) downMoves++;
        }
        
        const total = upMoves + downMoves;
        if (total === 0) return 0;
        
        return (upMoves - downMoves) / total;
    }
    
    /**
     * ═══════════════════════════════════════════════════════════════
     * 🎯 DETECT MOMENTUM SPIKE
     * ═══════════════════════════════════════════════════════════════
     */
    detectMomentumSpike(pair, currentPrice, tickData) {
        const now = Date.now();
        
        // Check cooldown
        if (now < this.state.cooldownUntil) {
            return {
                shouldTrade: false,
                reason: 'In cooldown period',
                timeRemaining: Math.ceil((this.state.cooldownUntil - now) / 1000)
            };
        }
        
        // Check daily trade limit
        if (this.state.dailyTrades >= this.config.maxDailyTrades) {
            return {
                shouldTrade: false,
                reason: 'Daily trade limit reached'
            };
        }
        
        // Get cached indicators
        let indicators = this.optimization.indicatorCache.get(pair);
        
        // If cache is stale (>5 seconds), we can't trade
        if (!indicators || (now - indicators.timestamp > 5000)) {
            return {
                shouldTrade: false,
                reason: 'Indicators stale'
            };
        }
        
        // Update price buffer
        this.optimization.priceBuffer.set(pair, {
            price: currentPrice,
            timestamp: now
        });
        
        // Calculate real-time velocity from tick data
        const tickVelocity = tickData?.velocity || 0;
        const tickStrength = tickData?.strength || 0;
        
        // Combined velocity
        const combinedVelocity = Math.abs(indicators.velocity) + Math.abs(tickVelocity);
        const combinedAcceleration = Math.abs(indicators.acceleration) + 
            (tickData?.acceleration || 0);
        
        // Check for momentum spike
        const velocitySpike = combinedVelocity > this.config.velocityThreshold;
        const accelerationSpike = combinedAcceleration > this.config.accelerationThreshold;
        
        // Direction from momentum
        const direction = indicators.momentum > 0 ? 'UP' : 'DOWN';
        const tickDirection = tickData?.direction || 'neutral';
        
        // Confirm direction alignment
        const directionAligned = (
            (direction === 'UP' && (tickDirection === 'up' || tickDirection === 'neutral')) ||
            (direction === 'DOWN' && (tickDirection === 'down' || tickDirection === 'neutral'))
        );
        
        // Generate signal if conditions met
        if (velocitySpike && accelerationSpike && directionAligned) {
            const strength = Math.min(10, 
                (combinedVelocity / this.config.velocityThreshold) * 5 +
                (combinedAcceleration / this.config.accelerationThreshold) * 5
            );
            
            return {
                shouldTrade: true,
                signal: direction === 'UP' ? 'BUY' : 'SELL',
                direction: direction === 'UP' ? 'CALL' : 'PUT',
                strength,
                velocity: combinedVelocity,
                acceleration: combinedAcceleration,
                momentum: indicators.momentum,
                expectedProfit: combinedVelocity * 0.8,  // Conservative estimate
                urgency: 'IMMEDIATE',
                maxDelay: this.config.maxEntryDelay
            };
        }
        
        return {
            shouldTrade: false,
            reason: 'No momentum spike detected',
            velocity: combinedVelocity,
            acceleration: combinedAcceleration,
            threshold: this.config.velocityThreshold
        };
    }
    
    /**
     * ═══════════════════════════════════════════════════════════════
     * ⚡ EXECUTE TRADE (Track timing)
     * ═══════════════════════════════════════════════════════════════
     */
    async execute(signal, executeFn) {
        const startTime = Date.now();
        
        // Check if we can execute
        if (!this.state.isActive) {
            return { success: false, error: 'Arbitrage module inactive' };
        }
        
        try {
            // Execute immediately
            const result = await executeFn();
            
            const executionTime = Date.now() - startTime;
            
            // Track performance
            this.trackExecution(executionTime);
            
            // Update state
            this.state.lastTradeTime = Date.now();
            this.state.dailyTrades++;
            
            console.log(`\n⚡ LATENCY ARBITRAGE EXECUTED:`);
            console.log(`   Signal: ${signal.signal}`);
            console.log(`   Execution Time: ${executionTime}ms`);
            console.log(`   Strength: ${signal.strength.toFixed(1)}/10`);
            
            return {
                success: true,
                executionTime,
                result
            };
            
        } catch (error) {
            return {
                success: false,
                error: error.message,
                executionTime: Date.now() - startTime
            };
        }
    }
    
    /**
     * Track execution time
     */
    trackExecution(time) {
        this.optimization.executionTimes.push(time);
        
        // Keep only last 100
        if (this.optimization.executionTimes.length > 100) {
            this.optimization.executionTimes.shift();
        }
        
        // Update stats
        this.performance.avgExecutionTime = 
            this.optimization.executionTimes.reduce((a, b) => a + b, 0) / 
            this.optimization.executionTimes.length;
        
        if (time < this.performance.bestExecutionTime) {
            this.performance.bestExecutionTime = time;
        }
        if (time > this.performance.worstExecutionTime) {
            this.performance.worstExecutionTime = time;
        }
        
        // Check if execution is too slow
        if (time > this.config.maxEntryDelay) {
            console.warn(`⚠️ Slow execution detected: ${time}ms > ${this.config.maxEntryDelay}ms`);
        }
    }
    
    /**
     * Record trade result
     */
    recordResult(result, profit) {
        this.performance.totalTrades++;
        this.performance.totalProfit += profit;
        
        if (result === 'win') {
            this.performance.wins++;
        } else if (result === 'loss') {
            this.performance.losses++;
            // Start cooldown after loss
            this.state.cooldownUntil = Date.now() + (this.config.cooldownAfterLoss * 1000);
        }
        
        // Reset daily counter if it's a new day
        const now = new Date();
        const lastTrade = new Date(this.state.lastTradeTime);
        if (now.getDate() !== lastTrade.getDate()) {
            this.state.dailyTrades = 0;
        }
    }
    
    /**
     * Get execution stats
     */
    getExecutionStats() {
        const times = this.optimization.executionTimes;
        return {
            avgExecutionTime: times.length > 0 
                ? (times.reduce((a, b) => a + b, 0) / times.length).toFixed(1)
                : 0,
            bestExecutionTime: this.performance.bestExecutionTime === Infinity 
                ? 0 
                : this.performance.bestExecutionTime,
            worstExecutionTime: this.performance.worstExecutionTime,
            totalExecutions: times.length,
            underThreshold: times.filter(t => t <= this.config.maxEntryDelay).length,
            cacheSize: this.optimization.indicatorCache.size
        };
    }
    
    /**
     * Get performance stats
     */
    getStats() {
        const total = this.performance.totalTrades;
        return {
            ...this.performance,
            winRate: total > 0 ? (this.performance.wins / total * 100).toFixed(1) : 0,
            avgProfit: total > 0 ? (this.performance.totalProfit / total).toFixed(4) : 0,
            dailyTrades: this.state.dailyTrades,
            maxDailyTrades: this.config.maxDailyTrades,
            inCooldown: Date.now() < this.state.cooldownUntil,
            executionStats: this.getExecutionStats()
        };
    }
    
    /**
     * Reset state
     */
    reset() {
        this.state.dailyTrades = 0;
        this.state.cooldownUntil = 0;
        this.optimization.indicatorCache.clear();
        this.optimization.executionTimes = [];
    }
    
    /**
     * Generate report
     */
    generateReport() {
        const stats = this.getStats();
        const execStats = stats.executionStats;
        
        console.log(`\n╔══════════════════════════════════════════════════════════╗`);
        console.log(`║          ⚡ LATENCY ARBITRAGE REPORT                       ║`);
        console.log(`╠══════════════════════════════════════════════════════════╣`);
        console.log(`║ Total Trades: ${stats.totalTrades} | Win Rate: ${stats.winRate}%`);
        console.log(`║ Total Profit: ${stats.totalProfit.toFixed(4)} | Avg: ${stats.avgProfit}`);
        console.log(`║ Daily Trades: ${stats.dailyTrades}/${stats.maxDailyTrades}`);
        console.log(`║ In Cooldown: ${stats.inCooldown ? 'YES' : 'NO'}`);
        console.log(`╠══════════════════════════════════════════════════════════╣`);
        console.log(`║ EXECUTION PERFORMANCE:`);
        console.log(`║   Avg Time: ${execStats.avgExecutionTime}ms`);
        console.log(`║   Best: ${execStats.bestExecutionTime}ms | Worst: ${execStats.worstExecutionTime}ms`);
        console.log(`║   Under Threshold: ${execStats.underThreshold}/${execStats.totalExecutions}`);
        console.log(`╚══════════════════════════════════════════════════════════╝\n`);
        
        return stats;
    }
}

module.exports = new LatencyArbitrage();
