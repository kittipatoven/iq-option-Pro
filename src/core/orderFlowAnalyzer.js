/**
 * Order Flow Analyzer - Smart Money Detection
 * Analyzes tick-level order flow to detect institutional activity
 */

const logger = require('../utils/logger');

class OrderFlowAnalyzer {
    constructor() {
        this.name = 'OrderFlowAnalyzer';
        
        // ═══════════════════════════════════════════════════════════════
        // 📊 CONFIGURATION
        // ═══════════════════════════════════════════════════════════════
        this.config = {
            windowSize: 20,           // Number of ticks to analyze
            deltaThreshold: 15,       // Minimum delta for signal
            imbalanceThreshold: 2.0,  // Buy/Sell pressure ratio threshold
            velocityThreshold: 0.02,  // Price change velocity threshold
            
            // Weights for composite score
            weights: {
                delta: 0.35,
                imbalance: 0.30,
                velocity: 0.25,
                absorption: 0.10
            }
        };
        
        // ═══════════════════════════════════════════════════════════════
        // 📈 TICK DATA BUFFERS
        // ═══════════════════════════════════════════════════════════════
        this.tickBuffers = new Map();  // pair -> Array of tick data
        
        // ═══════════════════════════════════════════════════════════════
        // 🎯 FLOW STATE
        // ═══════════════════════════════════════════════════════════════
        this.flowState = new Map();    // pair -> current flow state
        
        // ═══════════════════════════════════════════════════════════════
        // 📊 PERFORMANCE TRACKING
        // ═══════════════════════════════════════════════════════════════
        this.stats = {
            totalAnalyses: 0,
            buySignals: 0,
            sellSignals: 0,
            neutralSignals: 0,
            accuracy: { buy: 0, sell: 0 }
        };
    }
    
    /**
     * ═══════════════════════════════════════════════════════════════
     * 📥 PROCESS TICK DATA
     * ═══════════════════════════════════════════════════════════════
     */
    processTick(pair, tick) {
        // Initialize buffer for pair
        if (!this.tickBuffers.has(pair)) {
            this.tickBuffers.set(pair, []);
            this.flowState.set(pair, {
                cumulativeDelta: 0,
                buyVolume: 0,
                sellVolume: 0,
                lastPrice: tick.price,
                trend: 'NEUTRAL'
            });
        }
        
        const buffer = this.tickBuffers.get(pair);
        const state = this.flowState.get(pair);
        
        // Determine if tick is buy or sell (based on price movement)
        const priceChange = tick.price - state.lastPrice;
        const isBuyTick = priceChange >= 0;  // Simplified assumption
        
        // Estimate volume (if not provided)
        const volume = tick.volume || 1;
        
        // Update state
        if (isBuyTick) {
            state.buyVolume += volume;
            state.cumulativeDelta += volume;
        } else {
            state.sellVolume += volume;
            state.cumulativeDelta -= volume;
        }
        
        state.lastPrice = tick.price;
        
        // Add to buffer
        buffer.push({
            price: tick.price,
            volume: volume,
            isBuy: isBuyTick,
            timestamp: tick.timestamp || Date.now(),
            delta: state.cumulativeDelta
        });
        
        // Maintain window size
        if (buffer.length > this.config.windowSize) {
            buffer.shift();
        }
        
        return this.analyzeFlow(pair);
    }
    
    /**
     * ═══════════════════════════════════════════════════════════════
     * 🔍 ANALYZE ORDER FLOW
     * ═══════════════════════════════════════════════════════════════
     */
    analyzeFlow(pair) {
        const buffer = this.tickBuffers.get(pair);
        if (!buffer || buffer.length < 5) {
            return {
                direction: 'NEUTRAL',
                strength: 0,
                delta: 0,
                imbalance: 1,
                velocity: 0,
                signal: 'HOLD'
            };
        }
        
        this.stats.totalAnalyses++;
        
        // Calculate metrics
        const delta = this.calculateDelta(buffer);
        const imbalance = this.calculateImbalance(buffer);
        const velocity = this.calculateVelocity(buffer);
        const absorption = this.detectAbsorption(buffer);
        
        // Calculate composite strength score
        const strength = this.calculateStrength({
            delta,
            imbalance,
            velocity,
            absorption
        });
        
        // Determine direction and signal
        let direction = 'NEUTRAL';
        let signal = 'HOLD';
        
        // Strong buy pressure
        if (delta > this.config.deltaThreshold && 
            imbalance > this.config.imbalanceThreshold &&
            velocity > 0) {
            direction = 'UP';
            signal = 'STRONG_BUY';
            this.stats.buySignals++;
        }
        // Moderate buy
        else if (delta > this.config.deltaThreshold * 0.5 && 
                 imbalance > 1.5 && 
                 velocity > 0) {
            direction = 'UP';
            signal = 'BUY';
            this.stats.buySignals++;
        }
        // Strong sell pressure
        else if (delta < -this.config.deltaThreshold && 
                 imbalance < 1 / this.config.imbalanceThreshold &&
                 velocity < 0) {
            direction = 'DOWN';
            signal = 'STRONG_SELL';
            this.stats.sellSignals++;
        }
        // Moderate sell
        else if (delta < -this.config.deltaThreshold * 0.5 && 
                 imbalance < 1 / 1.5 && 
                 velocity < 0) {
            direction = 'DOWN';
            signal = 'SELL';
            this.stats.sellSignals++;
        }
        else {
            this.stats.neutralSignals++;
        }
        
        // Update flow state
        const state = this.flowState.get(pair);
        state.trend = direction;
        
        return {
            direction,
            strength,
            delta,
            imbalance,
            velocity,
            absorption,
            signal,
            confidence: Math.min(10, strength * 10)
        };
    }
    
    /**
     * Calculate cumulative delta
     */
    calculateDelta(buffer) {
        if (buffer.length === 0) return 0;
        return buffer[buffer.length - 1].delta;
    }
    
    /**
     * Calculate buy/sell imbalance ratio
     */
    calculateImbalance(buffer) {
        let buyVolume = 0;
        let sellVolume = 0;
        
        for (const tick of buffer) {
            if (tick.isBuy) {
                buyVolume += tick.volume;
            } else {
                sellVolume += tick.volume;
            }
        }
        
        if (sellVolume === 0) return buyVolume > 0 ? 999 : 1;
        return buyVolume / sellVolume;
    }
    
    /**
     * Calculate price velocity
     */
    calculateVelocity(buffer) {
        if (buffer.length < 2) return 0;
        
        const firstPrice = buffer[0].price;
        const lastPrice = buffer[buffer.length - 1].price;
        const timeSpan = (buffer[buffer.length - 1].timestamp - buffer[0].timestamp) / 1000;
        
        if (timeSpan === 0) return 0;
        
        return (lastPrice - firstPrice) / firstPrice / timeSpan;
    }
    
    /**
     * Detect absorption (large orders being absorbed)
     */
    detectAbsorption(buffer) {
        // Absorption detected when:
        // - Large volume comes in
        // - Price doesn't move much (stays in range)
        
        if (buffer.length < 5) return false;
        
        const recent = buffer.slice(-5);
        const totalVolume = recent.reduce((sum, t) => sum + t.volume, 0);
        const prices = recent.map(t => t.price);
        const priceRange = Math.max(...prices) - Math.min(...prices);
        const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
        
        // High volume with small price range = absorption
        const volumeThreshold = 10;  // Minimum volume
        const rangeThreshold = avgPrice * 0.001;  // 0.1% of price
        
        return totalVolume > volumeThreshold && priceRange < rangeThreshold;
    }
    
    /**
     * Calculate composite strength score
     */
    calculateStrength(metrics) {
        const weights = this.config.weights;
        
        // Normalize metrics to 0-1 range
        const normalizedDelta = Math.min(1, Math.abs(metrics.delta) / 50);
        const normalizedImbalance = metrics.imbalance > 1 
            ? Math.min(1, (metrics.imbalance - 1) / 2)
            : Math.min(1, (1 / metrics.imbalance - 1) / 2);
        const normalizedVelocity = Math.min(1, Math.abs(metrics.velocity) / 0.05);
        
        // Weighted sum
        let strength = 0;
        strength += normalizedDelta * weights.delta;
        strength += normalizedImbalance * weights.imbalance;
        strength += normalizedVelocity * weights.velocity;
        strength += (metrics.absorption ? 1 : 0) * weights.absorption;
        
        return strength;
    }
    
    /**
     * ═══════════════════════════════════════════════════════════════
     * 🎯 GET CURRENT FLOW STATE
     * ═══════════════════════════════════════════════════════════════
     */
    getFlowState(pair) {
        return this.flowState.get(pair) || {
            cumulativeDelta: 0,
            buyVolume: 0,
            sellVolume: 0,
            trend: 'NEUTRAL'
        };
    }
    
    /**
     * ═══════════════════════════════════════════════════════════════
     * 📊 GET STATISTICS
     * ═══════════════════════════════════════════════════════════════
     */
    getStats() {
        const total = this.stats.totalAnalyses;
        return {
            ...this.stats,
            buyRatio: total > 0 ? (this.stats.buySignals / total * 100).toFixed(1) : 0,
            sellRatio: total > 0 ? (this.stats.sellSignals / total * 100).toFixed(1) : 0,
            activePairs: this.tickBuffers.size
        };
    }
    
    /**
     * Reset buffer for a pair
     */
    reset(pair) {
        this.tickBuffers.delete(pair);
        this.flowState.delete(pair);
    }
    
    /**
     * Generate analysis report
     */
    generateReport() {
        const stats = this.getStats();
        
        console.log(`\n╔══════════════════════════════════════════════════════════╗`);
        console.log(`║          📊 ORDER FLOW ANALYZER REPORT                     ║`);
        console.log(`╠══════════════════════════════════════════════════════════╣`);
        console.log(`║ Total Analyses: ${stats.totalAnalyses}`);
        console.log(`║ Buy Signals: ${stats.buySignals} (${stats.buyRatio}%)`);
        console.log(`║ Sell Signals: ${stats.sellSignals} (${stats.sellRatio}%)`);
        console.log(`║ Neutral: ${stats.neutralSignals}`);
        console.log(`║ Active Pairs: ${stats.activePairs}`);
        console.log(`╚══════════════════════════════════════════════════════════╝\n`);
        
        return stats;
    }
}

module.exports = new OrderFlowAnalyzer();
