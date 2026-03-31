/**
 * Market Regime Detection System
 * AI-powered market condition classification
 * 
 * Regimes:
 * - TREND_UP: Strong upward movement
 * - TREND_DOWN: Strong downward movement  
 * - SIDEWAY: Range-bound, mean-reverting
 * - VOLATILE: High volatility, unpredictable
 */

const logger = require('../utils/logger');

class MarketRegimeDetector {
    constructor() {
        // ═══════════════════════════════════════════════════════════════
        // 🎯 REGIME CONFIGURATION
        // ═══════════════════════════════════════════════════════════════
        this.config = {
            // Trend Detection
            trend: {
                maPeriods: [10, 20, 50],
                minSlope: 0.0005,       // Minimum slope for trend
                strongSlope: 0.0015     // Strong trend threshold
            },
            
            // Sideway Detection
            sideway: {
                maxRange: 0.003,        // Max 0.3% range for sideway
                adxThreshold: 25        // ADX below 25 = weak trend
            },
            
            // Volatility Detection
            volatility: {
                atrPeriod: 14,
                highVolatility: 0.002,  // ATR > 0.2%
                extremeVolatility: 0.004 // ATR > 0.4%
            }
        };
        
        // ═══════════════════════════════════════════════════════════════
        // 📊 REGIME HISTORY
        // ═══════════════════════════════════════════════════════════════
        this.regimeHistory = new Map();  // pair -> [{ regime, timestamp, confidence }]
        this.maxHistoryLength = 100;
        
        // ═══════════════════════════════════════════════════════════════
        // 🎯 STRATEGY MAPPING
        // ═══════════════════════════════════════════════════════════════
        this.strategyMapping = {
            'SIDEWAY': {
                primary: 'REVERSAL',
                secondary: 'RANGE_TRADING',
                avoid: ['TREND_FOLLOW'],
                confidence: 0
            },
            'TREND_UP': {
                primary: 'TREND_FOLLOW',
                secondary: 'BREAKOUT',
                avoid: ['REVERSAL'],
                confidence: 0,
                bias: 'CALL'
            },
            'TREND_DOWN': {
                primary: 'TREND_FOLLOW',
                secondary: 'BREAKOUT',
                avoid: ['REVERSAL'],
                confidence: 0,
                bias: 'PUT'
            },
            'VOLATILE': {
                primary: 'SCALPING',
                secondary: 'MOMENTUM',
                avoid: ['REVERSAL'],
                confidence: 0
            }
        };
    }
    
    /**
     * Detect market regime from candle data
     */
    detectRegime(candles, pair) {
        if (!candles || candles.length < 20) {
            return { regime: 'UNKNOWN', confidence: 0, features: {} };
        }
        
        try {
            // Calculate features
            const features = this.extractFeatures(candles);
            
            // Classify regime
            const classification = this.classifyRegime(features);
            
            // Update history
            this.updateHistory(pair, classification.regime, classification.confidence);
            
            // Get strategy recommendation
            const strategy = this.getStrategyForRegime(classification.regime);
            
            return {
                regime: classification.regime,
                confidence: classification.confidence,
                features: features,
                strategy: strategy,
                persistence: this.getRegimePersistence(pair)
            };
            
        } catch (error) {
            logger.error('[REGIME] Detection error:', error);
            return { regime: 'UNKNOWN', confidence: 0, features: {}, error: error.message };
        }
    }
    
    /**
     * Extract market features from candles
     */
    extractFeatures(candles) {
        const closes = candles.map(c => c.close);
        const highs = candles.map(c => c.high);
        const lows = candles.map(c => c.low);
        
        // 1. Trend Features
        const ma10 = this.calculateMA(closes, 10);
        const ma20 = this.calculateMA(closes, 20);
        const ma50 = this.calculateMA(closes, 50);
        
        const slope10 = this.calculateSlope(closes.slice(-10));
        const slope20 = this.calculateSlope(closes.slice(-20));
        
        // 2. Volatility Features
        const atr = this.calculateATR(candles);
        const volatility = this.calculateVolatility(closes);
        
        // 3. Range Features
        const range = (Math.max(...closes.slice(-20)) - Math.min(...closes.slice(-20))) / closes[closes.length - 1];
        
        // 4. ADX (Trend Strength)
        const adx = this.calculateADX(candles);
        
        // 5. Price Position
        const currentPrice = closes[closes.length - 1];
        const bbPosition = this.getBollingerPosition(currentPrice, closes);
        
        return {
            ma10,
            ma20,
            ma50,
            slope10,
            slope20,
            atr,
            volatility,
            range,
            adx,
            bbPosition,
            currentPrice,
            trendStrength: adx
        };
    }
    
    /**
     * Classify market regime based on features
     */
    classifyRegime(features) {
        const { slope10, slope20, adx, range, volatility, bbPosition } = features;
        
        let regime = 'SIDEWAY';
        let confidence = 0.5;
        
        // Check for volatility first (highest priority)
        if (volatility > this.config.volatility.extremeVolatility) {
            regime = 'VOLATILE';
            confidence = Math.min(1, volatility / 0.005);
        } else if (volatility > this.config.volatility.highVolatility) {
            if (adx < 20) {
                regime = 'VOLATILE';
                confidence = 0.7;
            }
        }
        
        // Check for trend
        const isStrongTrend = adx > 30 && Math.abs(slope20) > this.config.trend.minSlope;
        const isTrendUp = slope10 > 0 && slope20 > 0 && bbPosition > 0.5;
        const isTrendDown = slope10 < 0 && slope20 < 0 && bbPosition < 0.5;
        
        if (isStrongTrend) {
            if (isTrendUp) {
                regime = 'TREND_UP';
                confidence = Math.min(1, adx / 50 + Math.abs(slope20) * 100);
            } else if (isTrendDown) {
                regime = 'TREND_DOWN';
                confidence = Math.min(1, adx / 50 + Math.abs(slope20) * 100);
            }
        }
        
        // Check for sideway (if not trending and low volatility)
        if (range < this.config.sideway.maxRange && adx < this.config.sideway.adxThreshold) {
            if (regime === 'SIDEWAY' || confidence < 0.6) {
                regime = 'SIDEWAY';
                confidence = Math.min(1, (this.config.sideway.adxThreshold - adx) / 20 + (this.config.sideway.maxRange - range) / 0.002);
            }
        }
        
        return { regime, confidence: Math.min(1, confidence) };
    }
    
    /**
     * Get strategy recommendation for regime
     */
    getStrategyForRegime(regime) {
        const mapping = this.strategyMapping[regime];
        if (!mapping) return { primary: 'REVERSAL', secondary: null, avoid: [] };
        
        return {
            primary: mapping.primary,
            secondary: mapping.secondary,
            avoid: mapping.avoid,
            bias: mapping.bias || 'NEUTRAL'
        };
    }
    
    /**
     * Calculate Moving Average
     */
    calculateMA(prices, period) {
        if (prices.length < period) return prices[prices.length - 1];
        const sum = prices.slice(-period).reduce((a, b) => a + b, 0);
        return sum / period;
    }
    
    /**
     * Calculate slope (linear regression)
     */
    calculateSlope(prices) {
        if (prices.length < 2) return 0;
        const n = prices.length;
        const sumX = (n * (n - 1)) / 2;
        const sumY = prices.reduce((a, b) => a + b, 0);
        const sumXY = prices.reduce((sum, y, i) => sum + y * i, 0);
        const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6;
        
        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        return slope;
    }
    
    /**
     * Calculate ATR (Average True Range)
     */
    calculateATR(candles, period = 14) {
        if (candles.length < period) return 0;
        
        const trs = [];
        for (let i = 1; i < candles.length; i++) {
            const high = candles[i].high;
            const low = candles[i].low;
            const prevClose = candles[i - 1].close;
            
            const tr = Math.max(
                high - low,
                Math.abs(high - prevClose),
                Math.abs(low - prevClose)
            );
            trs.push(tr);
        }
        
        const sum = trs.slice(-period).reduce((a, b) => a + b, 0);
        return sum / period;
    }
    
    /**
     * Calculate volatility (standard deviation)
     */
    calculateVolatility(prices) {
        if (prices.length < 2) return 0;
        
        const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
        const squaredDiffs = prices.map(p => Math.pow(p - mean, 2));
        const variance = squaredDiffs.reduce((a, b) => a + b, 0) / prices.length;
        
        return Math.sqrt(variance);
    }
    
    /**
     * Calculate ADX (Average Directional Index)
     */
    calculateADX(candles, period = 14) {
        if (candles.length < period * 2) return 25;
        
        const dxs = [];
        
        for (let i = 1; i < candles.length; i++) {
            const high = candles[i].high;
            const low = candles[i].low;
            const prevHigh = candles[i - 1].high;
            const prevLow = candles[i - 1].low;
            
            const plusDM = high - prevHigh > prevLow - low ? Math.max(high - prevHigh, 0) : 0;
            const minusDM = prevLow - low > high - prevHigh ? Math.max(prevLow - low, 0) : 0;
            
            const tr = Math.max(
                high - low,
                Math.abs(high - candles[i - 1].close),
                Math.abs(low - candles[i - 1].close)
            );
            
            const plusDI = tr > 0 ? (plusDM / tr) * 100 : 0;
            const minusDI = tr > 0 ? (minusDM / tr) * 100 : 0;
            
            const dx = plusDI + minusDI > 0 ? Math.abs(plusDI - minusDI) / (plusDI + minusDI) * 100 : 0;
            dxs.push(dx);
        }
        
        const sum = dxs.slice(-period).reduce((a, b) => a + b, 0);
        return sum / period;
    }
    
    /**
     * Get position within Bollinger Bands (0-1 scale)
     */
    getBollingerPosition(currentPrice, closes, period = 20, deviation = 2) {
        if (closes.length < period) return 0.5;
        
        const prices = closes.slice(-period);
        const sma = prices.reduce((a, b) => a + b, 0) / period;
        
        const squaredDiffs = prices.map(p => Math.pow(p - sma, 2));
        const variance = squaredDiffs.reduce((a, b) => a + b, 0) / period;
        const stdDev = Math.sqrt(variance);
        
        const upperBand = sma + (stdDev * deviation);
        const lowerBand = sma - (stdDev * deviation);
        
        // Position within bands (0 = lower, 1 = upper)
        if (upperBand === lowerBand) return 0.5;
        return (currentPrice - lowerBand) / (upperBand - lowerBand);
    }
    
    /**
     * Update regime history
     */
    updateHistory(pair, regime, confidence) {
        if (!this.regimeHistory.has(pair)) {
            this.regimeHistory.set(pair, []);
        }
        
        const history = this.regimeHistory.get(pair);
        history.push({
            regime,
            confidence,
            timestamp: Date.now()
        });
        
        // Maintain max size
        if (history.length > this.maxHistoryLength) {
            history.shift();
        }
    }
    
    /**
     * Get regime persistence (how long current regime has lasted)
     */
    getRegimePersistence(pair) {
        const history = this.regimeHistory.get(pair);
        if (!history || history.length === 0) return 0;
        
        const currentRegime = history[history.length - 1].regime;
        let count = 0;
        
        for (let i = history.length - 1; i >= 0; i--) {
            if (history[i].regime === currentRegime) {
                count++;
            } else {
                break;
            }
        }
        
        return count;
    }
    
    /**
     * Get regime statistics
     */
    getRegimeStats(pair) {
        const history = this.regimeHistory.get(pair);
        if (!history || history.length === 0) return null;
        
        const counts = {};
        history.forEach(h => {
            counts[h.regime] = (counts[h.regime] || 0) + 1;
        });
        
        const total = history.length;
        const distribution = {};
        for (const [regime, count] of Object.entries(counts)) {
            distribution[regime] = (count / total * 100).toFixed(1) + '%';
        }
        
        return {
            current: history[history.length - 1].regime,
            persistence: this.getRegimePersistence(pair),
            distribution,
            historyLength: total
        };
    }
    
    /**
     * Check if regime has changed recently
     */
    hasRegimeChanged(pair, lookback = 3) {
        const history = this.regimeHistory.get(pair);
        if (!history || history.length < lookback + 1) return false;
        
        const current = history[history.length - 1].regime;
        const previous = history[history.length - lookback - 1].regime;
        
        return current !== previous;
    }
}

// Export singleton
module.exports = new MarketRegimeDetector();
