/**
 * AI Prediction Engine for High-Frequency Trading
 * Predicts market direction in advance using micro-structure analysis
 * 
 * Features:
 * - RSI Slope calculation (rate of change, not just value)
 * - Price Velocity (speed of price movement)
 * - Micro Momentum System (tick buffer with momentum + acceleration)
 * - Confidence Score (0-10 weighted scoring)
 * - Smart Position Management
 * - Entry Filters (sideway, volatility, news)
 * - AI Learning Loop
 */

const logger = require('../utils/logger');

class AIPredictionEngine {
    constructor() {
        // ═══════════════════════════════════════════════════════════════
        // 🔮 PREDICTION CONFIGURATION
        // ═══════════════════════════════════════════════════════════════
        this.config = {
            // RSI Prediction Thresholds
            rsi: {
                callZone: 35,         // RSI < 35 = potential CALL
                putZone: 65,          // RSI > 65 = potential PUT
                slopeThreshold: 0.5,  // Minimum slope for prediction
                extremeSlope: 1.0     // Strong prediction slope
            },
            
            // Velocity Thresholds
            velocity: {
                minForTrade: 0.0001,  // Minimum velocity to consider
                strong: 0.0003,       // Strong velocity threshold
                extreme: 0.0005       // Extreme velocity
            },
            
            // Momentum Thresholds
            momentum: {
                threshold: 0.3,       // Minimum momentum strength
                strong: 0.6,          // Strong momentum
                confirmation: 0.4     // For tick confirmation
            },
            
            // Acceleration Thresholds
            acceleration: {
                minForTrade: 0.00001, // Minimum acceleration
                strong: 0.00005,      // Strong acceleration
                extreme: 0.0001       // Extreme acceleration
            },
            
            // Confidence Score Thresholds
            confidence: {
                high: 8,      // 8-10 = Full position
                medium: 6,    // 6-7 = Reduced position
                low: 4,       // 4-5 = Minimal position
                skip: 4       // < 4 = Skip trade
            },
            
            // Position Sizing based on confidence
            positionSizing: {
                high: 1.0,      // 100% of base amount
                medium: 0.6,    // 60% of base amount
                low: 0.3,       // 30% of base amount
                skip: 0         // No trade
            }
        };
        
        // ═══════════════════════════════════════════════════════════════
        // ⚡ MICRO MOMENTUM SYSTEM - Tick Buffer
        // ═══════════════════════════════════════════════════════════════
        this.tickBuffer = new Map();     // pair -> { prices[], timestamps[] }
        this.momentumHistory = new Map();  // pair -> { momentum[], acceleration[] }
        this.maxTickBuffer = 20;         // Keep last 20 ticks
        this.maxMomentumHistory = 10;    // Keep last 10 momentum calculations
        
        // ═══════════════════════════════════════════════════════════════
        // 📊 PREDICTION HISTORY - For learning
        // ═══════════════════════════════════════════════════════════════
        this.predictionHistory = [];     // All predictions for analysis
        this.learningData = new Map();   // pair -> { patterns[], accuracy }
        this.maxHistorySize = 1000;      // Max predictions to keep
        
        // ═══════════════════════════════════════════════════════════════
        // 🧠 RSI HISTORY - For slope calculation
        // ═══════════════════════════════════════════════════════════════
        this.rsiHistory = new Map();     // pair -> { values[], timestamps[] }
        this.maxRsiHistory = 10;         // Keep last 10 RSI values
        
        // ═══════════════════════════════════════════════════════════════
        // 📈 PERFORMANCE TRACKING
        // ═══════════════════════════════════════════════════════════════
        this.performance = {
            totalPredictions: 0,
            correctPredictions: 0,
            falsePositives: 0,
            falseNegatives: 0,
            avgConfidence: 0,
            lastOptimization: Date.now()
        };
    }
    
    // ═══════════════════════════════════════════════════════════════
    // 🔮 CORE PREDICTION METHOD - Main entry point
    // ═══════════════════════════════════════════════════════════════
    
    /**
     * Predict market direction in advance
     * @param {Object} data - { candles, pair, currentPrice, tickData }
     * @returns {Object} Prediction result with direction, confidence, and score breakdown
     */
    predict(data) {
        const { candles, pair, currentPrice, tickData } = data;
        
        try {
            // 1. Calculate RSI and its slope
            const rsiAnalysis = this.calculateRSISlope(candles, pair);
            
            // 2. Calculate Price Velocity
            const velocity = this.calculateVelocity(candles);
            
            // 3. Calculate Micro Momentum (from tick data if available)
            const momentum = this.calculateMicroMomentum(pair, tickData, candles);
            
            // 4. Calculate Acceleration
            const acceleration = this.calculateAcceleration(pair, momentum);
            
            // 5. Calculate Candle Pressure (bull vs bear)
            const pressure = this.calculateCandlePressure(candles);
            
            // 6. Build Prediction
            const prediction = this.buildPrediction({
                rsiAnalysis,
                velocity,
                momentum,
                acceleration,
                pressure,
                pair,
                currentPrice
            });
            
            // 7. Calculate Confidence Score
            const confidence = this.calculateConfidenceScore(prediction);
            
            // 8. Store for learning
            this.storePrediction(prediction, confidence);
            
            return {
                direction: prediction.direction,
                confidence: confidence.total,
                confidenceLevel: confidence.level,
                shouldTrade: confidence.total >= this.config.confidence.skip,
                positionSize: this.getPositionSize(confidence.level),
                breakdown: confidence.breakdown,
                prediction: {
                    rsiSlope: rsiAnalysis.slope,
                    rsiValue: rsiAnalysis.value,
                    velocity: velocity.value,
                    momentum: momentum.strength,
                    acceleration: acceleration.value,
                    pressure: pressure.direction
                },
                timestamp: Date.now()
            };
            
        } catch (error) {
            logger.error('[AI-PREDICT] Prediction error:', error);
            return {
                direction: 'NEUTRAL',
                confidence: 0,
                confidenceLevel: 'skip',
                shouldTrade: false,
                error: error.message
            };
        }
    }
    
    // ═══════════════════════════════════════════════════════════════
    // 📊 RSI SLOPE CALCULATION - Rate of change, not just value
    // ═══════════════════════════════════════════════════════════════
    
    /**
     * Calculate RSI and its slope (rate of change)
     */
    calculateRSISlope(candles, pair) {
        // Calculate current RSI
        const rsi = this.calculateRSI(candles, 14);
        
        // Update RSI history
        if (!this.rsiHistory.has(pair)) {
            this.rsiHistory.set(pair, { values: [], timestamps: [] });
        }
        const history = this.rsiHistory.get(pair);
        
        history.values.push(rsi);
        history.timestamps.push(Date.now());
        
        // Maintain max size
        if (history.values.length > this.maxRsiHistory) {
            history.values.shift();
            history.timestamps.shift();
        }
        
        // Calculate slope if we have enough data
        let slope = 0;
        let direction = 'flat';
        
        if (history.values.length >= 3) {
            const recent = history.values.slice(-3);
            const times = history.timestamps.slice(-3);
            
            // Simple linear regression for slope
            const n = recent.length;
            const sumX = times.reduce((a, b) => a + (b - times[0]), 0);
            const sumY = recent.reduce((a, b) => a + b, 0);
            const sumXY = recent.reduce((sum, y, i) => sum + y * (times[i] - times[0]), 0);
            const sumX2 = times.reduce((sum, t, i) => sum + Math.pow(t - times[0], 2), 0);
            
            slope = sumX2 !== 0 ? (n * sumXY - sumX * sumY) / (n * sumX2) : 0;
            slope = slope * 1000; // Scale for readability
            
            // Determine direction
            if (slope > this.config.rsi.slopeThreshold) {
                direction = rsi < 50 ? 'rising_from_oversold' : 'rising_strong';
            } else if (slope < -this.config.rsi.slopeThreshold) {
                direction = rsi > 50 ? 'falling_from_overbought' : 'falling_strong';
            }
        }
        
        return {
            value: rsi,
            slope: slope,
            direction: direction,
            isExtreme: rsi < 30 || rsi > 70,
            isInZone: rsi < this.config.rsi.callZone || rsi > this.config.rsi.putZone
        };
    }
    
    /**
     * Standard RSI calculation
     */
    calculateRSI(candles, period = 14) {
        if (candles.length < period + 1) return 50;
        
        let gains = 0;
        let losses = 0;
        
        for (let i = candles.length - period; i < candles.length; i++) {
            const change = candles[i].close - candles[i].open;
            if (change > 0) gains += change;
            else losses -= change;
        }
        
        const avgGain = gains / period;
        const avgLoss = losses / period;
        
        if (avgLoss === 0) return 100;
        
        const rs = avgGain / avgLoss;
        return 100 - (100 / (1 + rs));
    }
    
    // ═══════════════════════════════════════════════════════════════
    // ⚡ PRICE VELOCITY - Speed of price movement
    // ═══════════════════════════════════════════════════════════════
    
    /**
     * Calculate price velocity (speed of price change)
     */
    calculateVelocity(candles) {
        if (!candles || candles.length < 3) {
            return { value: 0, direction: 'neutral', strength: 0 };
        }
        
        const recent = candles.slice(-5);
        const firstPrice = recent[0].close;
        const lastPrice = recent[recent.length - 1].close;
        const timeSpan = recent.length - 1; // candles
        
        // Velocity = price change per candle
        const priceChange = (lastPrice - firstPrice) / firstPrice;
        const velocity = priceChange / timeSpan;
        
        // Direction
        const direction = velocity > 0 ? 'up' : velocity < 0 ? 'down' : 'neutral';
        
        // Strength (normalized)
        const absVelocity = Math.abs(velocity);
        let strength = 0;
        if (absVelocity >= this.config.velocity.extreme) strength = 3;
        else if (absVelocity >= this.config.velocity.strong) strength = 2;
        else if (absVelocity >= this.config.velocity.minForTrade) strength = 1;
        
        return {
            value: velocity,
            direction: direction,
            strength: strength,
            priceChange: priceChange
        };
    }
    
    // ═══════════════════════════════════════════════════════════════
    // 🔥 MICRO MOMENTUM SYSTEM - Tick buffer with momentum + acceleration
    // ═══════════════════════════════════════════════════════════════
    
    /**
     * Update tick buffer with new price
     */
    updateTickBuffer(pair, price) {
        if (!this.tickBuffer.has(pair)) {
            this.tickBuffer.set(pair, {
                prices: [],
                timestamps: [],
                momentums: []
            });
        }
        
        const buffer = this.tickBuffer.get(pair);
        const now = Date.now();
        
        // Add new tick
        buffer.prices.push(price);
        buffer.timestamps.push(now);
        
        // Calculate momentum if we have previous price
        if (buffer.prices.length >= 2) {
            const prevPrice = buffer.prices[buffer.prices.length - 2];
            const momentum = price - prevPrice;
            buffer.momentums.push(momentum);
            
            // Store in momentum history
            this.updateMomentumHistory(pair, momentum);
        }
        
        // Maintain max size
        if (buffer.prices.length > this.maxTickBuffer) {
            buffer.prices.shift();
            buffer.timestamps.shift();
        }
        if (buffer.momentums.length > this.maxTickBuffer) {
            buffer.momentums.shift();
        }
    }
    
    /**
     * Update momentum history for acceleration calculation
     */
    updateMomentumHistory(pair, momentum) {
        if (!this.momentumHistory.has(pair)) {
            this.momentumHistory.set(pair, {
                momentums: [],
                accelerations: []
            });
        }
        
        const history = this.momentumHistory.get(pair);
        history.momentums.push(momentum);
        
        // Calculate acceleration
        if (history.momentums.length >= 2) {
            const prevMomentum = history.momentums[history.momentums.length - 2];
            const acceleration = momentum - prevMomentum;
            history.accelerations.push(acceleration);
        }
        
        // Maintain max size
        if (history.momentums.length > this.maxMomentumHistory) {
            history.momentums.shift();
        }
        if (history.accelerations.length > this.maxMomentumHistory) {
            history.accelerations.shift();
        }
    }
    
    /**
     * Calculate micro momentum from tick data or candles
     */
    calculateMicroMomentum(pair, tickData, candles) {
        // If we have tick data, use it
        if (tickData && tickData.length > 0) {
            return this.calculateTickMomentum(tickData);
        }
        
        // Otherwise use candle-based momentum
        return this.calculateCandleMomentum(candles);
    }
    
    /**
     * Calculate momentum from tick data
     */
    calculateTickMomentum(tickData) {
        if (!tickData || tickData.length < 3) {
            return { strength: 0, direction: 'neutral', acceleration: 0 };
        }
        
        const recent = tickData.slice(-5);
        const prices = recent.map(t => t.price || t);
        
        // Calculate momentum (price change)
        const momentum = prices[prices.length - 1] - prices[0];
        
        // Calculate acceleration (change in momentum)
        let acceleration = 0;
        if (prices.length >= 3) {
            const momentum1 = prices[1] - prices[0];
            const momentum2 = prices[2] - prices[1];
            acceleration = momentum2 - momentum1;
        }
        
        // Direction and strength
        const direction = momentum > 0 ? 'up' : momentum < 0 ? 'down' : 'neutral';
        const strength = Math.min(Math.abs(momentum) * 1000, 1); // Normalize to 0-1
        
        return {
            strength: strength,
            direction: direction,
            acceleration: acceleration,
            rawMomentum: momentum
        };
    }
    
    /**
     * Calculate momentum from candles (fallback)
     */
    calculateCandleMomentum(candles) {
        if (!candles || candles.length < 3) {
            return { strength: 0, direction: 'neutral', acceleration: 0 };
        }
        
        const recent = candles.slice(-5);
        const prices = recent.map(c => c.close);
        
        // Count bullish vs bearish candles
        let bullish = 0;
        let bearish = 0;
        
        for (const candle of recent) {
            if (candle.close > candle.open) bullish++;
            else if (candle.close < candle.open) bearish++;
        }
        
        // Calculate momentum
        const firstPrice = prices[0];
        const lastPrice = prices[prices.length - 1];
        const momentum = (lastPrice - firstPrice) / firstPrice;
        
        // Direction
        const direction = momentum > 0 ? 'up' : momentum < 0 ? 'down' : 'neutral';
        
        // Strength
        const strength = Math.min(Math.abs(momentum) * 1000, 1);
        
        return {
            strength: strength,
            direction: direction,
            acceleration: 0, // Can't calculate from candles alone
            bullishCount: bullish,
            bearishCount: bearish
        };
    }
    
    /**
     * Calculate acceleration from momentum history
     */
    calculateAcceleration(pair, momentum) {
        const history = this.momentumHistory.get(pair);
        
        if (!history || history.accelerations.length < 2) {
            return { value: 0, direction: 'neutral', strength: 0 };
        }
        
        // Get recent accelerations
        const recentAccels = history.accelerations.slice(-3);
        const avgAcceleration = recentAccels.reduce((a, b) => a + b, 0) / recentAccels.length;
        
        // Normalize
        const normalizedAccel = avgAcceleration * 10000;
        
        // Direction
        const direction = normalizedAccel > 0 ? 'increasing' : normalizedAccel < 0 ? 'decreasing' : 'flat';
        
        // Strength
        let strength = 0;
        const absAccel = Math.abs(normalizedAccel);
        if (absAccel >= this.config.acceleration.extreme * 10000) strength = 3;
        else if (absAccel >= this.config.acceleration.strong * 10000) strength = 2;
        else if (absAccel >= this.config.acceleration.minForTrade * 10000) strength = 1;
        
        return {
            value: normalizedAccel,
            direction: direction,
            strength: strength,
            rawValue: avgAcceleration
        };
    }
    
    // ═══════════════════════════════════════════════════════════════
    // 📈 CANDLE PRESSURE - Bull vs Bear strength
    // ═══════════════════════════════════════════════════════════════
    
    /**
     * Calculate buying vs selling pressure
     */
    calculateCandlePressure(candles) {
        if (!candles || candles.length < 3) {
            return { direction: 'neutral', strength: 0, ratio: 1 };
        }
        
        const recent = candles.slice(-5);
        
        let bullishPressure = 0;
        let bearishPressure = 0;
        
        for (const candle of recent) {
            const body = Math.abs(candle.close - candle.open);
            const upperWick = candle.high - Math.max(candle.open, candle.close);
            const lowerWick = Math.min(candle.open, candle.close) - candle.low;
            
            if (candle.close > candle.open) {
                // Bullish candle
                bullishPressure += body + (lowerWick * 0.5); // Lower wick shows buying
                bearishPressure += upperWick * 0.3;
            } else {
                // Bearish candle
                bearishPressure += body + (upperWick * 0.5); // Upper wick shows selling
                bullishPressure += lowerWick * 0.3;
            }
        }
        
        const totalPressure = bullishPressure + bearishPressure;
        const ratio = totalPressure > 0 ? bullishPressure / bearishPressure : 1;
        
        let direction = 'neutral';
        let strength = 0;
        
        if (ratio > 1.5) {
            direction = 'bullish';
            strength = Math.min((ratio - 1) * 2, 1);
        } else if (ratio < 0.67) {
            direction = 'bearish';
            strength = Math.min((1 / ratio - 1) * 2, 1);
        }
        
        return {
            direction: direction,
            strength: strength,
            ratio: ratio,
            bullishPressure: bullishPressure,
            bearishPressure: bearishPressure
        };
    }
    
    // ═══════════════════════════════════════════════════════════════
    // 🔮 BUILD PREDICTION - Combine all factors
    // ═══════════════════════════════════════════════════════════════
    
    /**
     * Build prediction from all analyzed factors
     */
    buildPrediction(factors) {
        const { rsiAnalysis, velocity, momentum, acceleration, pressure, pair, currentPrice } = factors;
        
        let direction = 'NEUTRAL';
        let signals = [];
        
        // CALL (BUY) conditions - predict reversal up
        if (rsiAnalysis.value < this.config.rsi.callZone && 
            rsiAnalysis.slope > this.config.rsi.slopeThreshold &&
            velocity.direction === 'up' &&
            momentum.direction === 'up' &&
            acceleration.direction === 'increasing') {
            
            direction = 'CALL';
            signals.push('RSI rising from oversold');
            signals.push('Positive velocity');
            signals.push('Upward momentum');
            signals.push('Increasing acceleration');
        }
        
        // PUT (SELL) conditions - predict reversal down
        else if (rsiAnalysis.value > this.config.rsi.putZone && 
                 rsiAnalysis.slope < -this.config.rsi.slopeThreshold &&
                 velocity.direction === 'down' &&
                 momentum.direction === 'down' &&
                 acceleration.direction === 'increasing') {
            
            direction = 'PUT';
            signals.push('RSI falling from overbought');
            signals.push('Negative velocity');
            signals.push('Downward momentum');
            signals.push('Increasing acceleration');
        }
        
        // Alternative: Pressure-based prediction for trending markets
        else if (pressure.direction === 'bullish' && 
                 pressure.strength > 0.6 &&
                 velocity.strength >= 2 &&
                 momentum.direction === 'up') {
            direction = 'CALL';
            signals.push('Strong bullish pressure');
            signals.push('Upward velocity');
            signals.push('Upward momentum');
        }
        else if (pressure.direction === 'bearish' && 
                 pressure.strength > 0.6 &&
                 velocity.strength >= 2 &&
                 momentum.direction === 'down') {
            direction = 'PUT';
            signals.push('Strong bearish pressure');
            signals.push('Downward velocity');
            signals.push('Downward momentum');
        }
        
        return {
            direction: direction,
            pair: pair,
            price: currentPrice,
            signals: signals,
            factors: {
                rsi: rsiAnalysis,
                velocity: velocity,
                momentum: momentum,
                acceleration: acceleration,
                pressure: pressure
            },
            timestamp: Date.now()
        };
    }
    
    // ═══════════════════════════════════════════════════════════════
    // 🎯 CONFIDENCE SCORE - 0-10 weighted scoring
    // ═══════════════════════════════════════════════════════════════
    
    /**
     * Calculate confidence score (0-10)
     */
    calculateConfidenceScore(prediction) {
        const { factors, direction } = prediction;
        const { rsi, velocity, momentum, acceleration, pressure } = factors;
        
        let score = 0;
        const breakdown = {};
        
        // RSI Score (0-2 points)
        if (direction === 'CALL' && rsi.slope > 0) {
            breakdown.rsi = Math.min(rsi.slope * 2, 2);
        } else if (direction === 'PUT' && rsi.slope < 0) {
            breakdown.rsi = Math.min(Math.abs(rsi.slope) * 2, 2);
        } else {
            breakdown.rsi = 0;
        }
        score += breakdown.rsi;
        
        // Velocity Score (0-2 points)
        breakdown.velocity = velocity.strength;
        score += breakdown.velocity;
        
        // Momentum Score (0-3 points)
        breakdown.momentum = momentum.strength * 3;
        score += breakdown.momentum;
        
        // Acceleration Score (0-3 points)
        breakdown.acceleration = acceleration.strength;
        score += breakdown.acceleration;
        
        // Pressure Bonus (0-1 point)
        if ((direction === 'CALL' && pressure.direction === 'bullish') ||
            (direction === 'PUT' && pressure.direction === 'bearish')) {
            breakdown.pressure = pressure.strength;
            score += breakdown.pressure;
        } else {
            breakdown.pressure = 0;
        }
        
        // Cap at 10
        score = Math.min(score, 10);
        
        // Determine confidence level
        let level = 'skip';
        if (score >= this.config.confidence.high) level = 'high';
        else if (score >= this.config.confidence.medium) level = 'medium';
        else if (score >= this.config.confidence.low) level = 'low';
        
        return {
            total: score,
            level: level,
            breakdown: breakdown
        };
    }
    
    /**
     * Get position size multiplier based on confidence
     */
    getPositionSize(confidenceLevel) {
        return this.config.positionSizing[confidenceLevel] || 0;
    }
    
    // ═══════════════════════════════════════════════════════════════
    // 🚫 ENTRY FILTERS - When NOT to trade
    // ═══════════════════════════════════════════════════════════════
    
    /**
     * Check if market conditions allow trading
     */
    checkEntryFilters(data) {
        const { candles, prediction, newsCheck } = data;
        
        const filters = {
            canTrade: true,
            reasons: []
        };
        
        // Filter 1: Avoid strong sideway markets
        const volatility = this.calculateVolatility(candles);
        if (volatility.isSideway && volatility.strength > 0.7) {
            filters.canTrade = false;
            filters.reasons.push('Strong sideway market detected');
        }
        
        // Filter 2: Low volatility (boring market)
        if (volatility.value < 0.0001) {
            filters.canTrade = false;
            filters.reasons.push('Volatility too low - no movement');
        }
        
        // Filter 3: High volatility (chaotic market)
        if (volatility.value > 0.001) {
            filters.canTrade = false;
            filters.reasons.push('Volatility too high - unpredictable');
        }
        
        // Filter 4: News event
        if (newsCheck && newsCheck.shouldStop) {
            filters.canTrade = false;
            filters.reasons.push(`News event: ${newsCheck.reason}`);
        }
        
        // Filter 5: Conflicting signals
        if (prediction && prediction.direction === 'NEUTRAL') {
            filters.canTrade = false;
            filters.reasons.push('No clear prediction direction');
        }
        
        return filters;
    }
    
    /**
     * Calculate market volatility
     */
    calculateVolatility(candles) {
        if (!candles || candles.length < 10) {
            return { value: 0, isSideway: false, strength: 0 };
        }
        
        const recent = candles.slice(-20);
        
        // Calculate ATR-like volatility
        let totalRange = 0;
        for (const candle of recent) {
            totalRange += (candle.high - candle.low) / candle.close;
        }
        const avgVolatility = totalRange / recent.length;
        
        // Check if sideway (price staying in range)
        const prices = recent.map(c => c.close);
        const maxPrice = Math.max(...prices);
        const minPrice = Math.min(...prices);
        const range = (maxPrice - minPrice) / minPrice;
        
        const isSideway = range < 0.001; // Less than 0.1% range
        const sidewayStrength = isSideway ? 1 - (range / 0.001) : 0;
        
        return {
            value: avgVolatility,
            isSideway: isSideway,
            strength: sidewayStrength,
            range: range
        };
    }
    
    // ═══════════════════════════════════════════════════════════════
    // 🧠 AI LEARNING LOOP - Continuous optimization
    // ═══════════════════════════════════════════════════════════════
    
    /**
     * Store prediction for later learning
     */
    storePrediction(prediction, confidence) {
        const record = {
            prediction: prediction,
            confidence: confidence,
            timestamp: Date.now(),
            result: null // Will be updated later
        };
        
        this.predictionHistory.push(record);
        
        // Maintain max size
        if (this.predictionHistory.length > this.maxHistorySize) {
            this.predictionHistory.shift();
        }
        
        this.performance.totalPredictions++;
    }
    
    /**
     * Update prediction with actual result
     */
    updatePredictionResult(pair, direction, result) {
        // Find matching prediction
        const prediction = this.predictionHistory
            .filter(p => p.result === null)
            .reverse()
            .find(p => p.prediction.pair === pair && p.prediction.direction === direction);
        
        if (prediction) {
            prediction.result = result;
            
            // Update performance
            if (result === 'win') {
                this.performance.correctPredictions++;
            } else if (result === 'loss') {
                // Analyze what went wrong
                this.analyzeFalsePositive(prediction);
            }
            
            // Update average confidence
            this.performance.avgConfidence = (
                this.performance.avgConfidence * (this.performance.totalPredictions - 1) +
                prediction.confidence.total
            ) / this.performance.totalPredictions;
            
            // Auto-optimize periodically
            this.autoOptimize();
        }
    }
    
    /**
     * Analyze false positives to improve predictions
     */
    analyzeFalsePositive(prediction) {
        const { factors, direction } = prediction.prediction;
        
        // Store pattern for learning
        if (!this.learningData.has(prediction.prediction.pair)) {
            this.learningData.set(prediction.prediction.pair, {
                patterns: [],
                accuracy: { total: 0, correct: 0 }
            });
        }
        
        const data = this.learningData.get(prediction.prediction.pair);
        data.patterns.push({
            factors: factors,
            predicted: direction,
            actual: 'loss',
            timestamp: Date.now()
        });
        
        data.accuracy.total++;
    }
    
    /**
     * Auto-optimize thresholds based on performance
     */
    autoOptimize() {
        const now = Date.now();
        const hoursSinceLastOpt = (now - this.performance.lastOptimization) / (1000 * 60 * 60);
        
        // Only optimize every hour
        if (hoursSinceLastOpt < 1) return;
        
        const recentPredictions = this.predictionHistory
            .filter(p => p.result !== null && p.timestamp > now - 3600000)
            .slice(-50);
        
        if (recentPredictions.length < 10) return;
        
        const wins = recentPredictions.filter(p => p.result === 'win').length;
        const winRate = wins / recentPredictions.length;
        
        // Adjust thresholds based on performance
        if (winRate < 0.5) {
            // Lower performance - tighten requirements
            this.config.confidence.skip = Math.min(this.config.confidence.skip + 0.5, 8);
            this.config.rsi.slopeThreshold = Math.min(this.config.rsi.slopeThreshold * 1.1, 2.0);
            logger.info('[AI-PREDICT] Auto-optimization: Tightening filters (low win rate)');
        } else if (winRate > 0.7) {
            // High performance - can relax slightly
            this.config.confidence.skip = Math.max(this.config.confidence.skip - 0.2, 3);
            logger.info('[AI-PREDICT] Auto-optimization: Relaxing filters (high win rate)');
        }
        
        this.performance.lastOptimization = now;
    }
    
    /**
     * Get learning statistics
     */
    getLearningStats() {
        const accuracy = this.performance.totalPredictions > 0
            ? (this.performance.correctPredictions / this.performance.totalPredictions * 100).toFixed(1)
            : 0;
        
        return {
            totalPredictions: this.performance.totalPredictions,
            correctPredictions: this.performance.correctPredictions,
            accuracy: `${accuracy}%`,
            avgConfidence: this.performance.avgConfidence.toFixed(1),
            currentThresholds: {
                confidenceSkip: this.config.confidence.skip,
                rsiSlope: this.config.rsi.slopeThreshold
            }
        };
    }
    
    // ═══════════════════════════════════════════════════════════════
    // 🧹 CLEANUP
    // ═══════════════════════════════════════════════════════════════
    
    /**
     * Clear old data to prevent memory leaks
     */
    cleanup() {
        const now = Date.now();
        const maxAge = 3600000; // 1 hour
        
        // Clean old predictions
        this.predictionHistory = this.predictionHistory.filter(
            p => p.timestamp > now - maxAge || p.result === null
        );
        
        // Clean old RSI history
        for (const [pair, history] of this.rsiHistory.entries()) {
            const cutoff = history.timestamps.findIndex(t => t > now - maxAge);
            if (cutoff > 0) {
                history.values = history.values.slice(cutoff);
                history.timestamps = history.timestamps.slice(cutoff);
            }
        }
        
        logger.debug('[AI-PREDICT] Cleanup completed');
    }
}

// Export singleton
module.exports = new AIPredictionEngine();
