/**
 * SMART MARKET DETECTOR
 * Detects market conditions: TREND, SIDEWAY, BREAKOUT
 * 
 * Detection Logic:
 * - ADX > 25 = TREND (strong directional movement)
 * - BB Width < threshold = SIDEWAY (low volatility, range bound)
 * - BB Expansion > threshold = BREAKOUT (volatility expansion)
 */

const logger = require('../utils/logger');

class MarketDetector {
    constructor() {
        this.thresholds = {
            adxTrend: 25,           // ADX > 25 = trending
            adxStrongTrend: 40,     // ADX > 40 = strong trend
            bbWidthSideway: 2,      // BB width < 2% = sideways
            bbWidthBreakout: 5,     // BB width > 5% = breakout
            volatilityThreshold: 0.02
        };
    }
    /**
     * Main detect method - returns market condition
     * @param {Array} candles - Candle data
     * @param {Object} indicators - Pre-calculated indicators
     * @returns {Object} Market condition with type and metadata
     */
    detect(candles, indicators = {}) {
        try {
            if (!candles || candles.length < 20) {
                return this.getDefaultCondition();
            }

            const last = candles[candles.length - 1];
            const prev = candles[candles.length - 2];

            // Calculate ADX
            const adx = this.calculateADX(candles, 14);
            
            // Calculate Bollinger Bands width
            const bb = indicators.bollingerBands || this.calculateBB(candles);
            const bbWidth = this.calculateBBWidth(bb);
            
            // Calculate volatility
            const volatility = this.calculateVolatility(candles);
            
            // Calculate trend strength
            const trendStrength = this.calculateTrendStrength(candles);
            
            // Detect market type
            const marketType = this.detectMarketType(adx, bbWidth, volatility, trendStrength, candles);
            
            // Calculate additional metrics
            const momentum = this.calculateMomentum(candles);
            const rangeBound = this.isRangeBound(candles, bb);

            return {
                type: marketType,           // 'TREND', 'SIDEWAY', 'BREAKOUT', 'UNKNOWN'
                trend: this.getTrendDirection(candles, adx),
                volatility: this.getVolatilityLevel(volatility),
                momentum: momentum,
                overall: marketType,
                // Detailed metrics
                metrics: {
                    adx: adx,
                    bbWidth: bbWidth,
                    volatility: volatility,
                    trendStrength: trendStrength,
                    rangeBound: rangeBound
                },
                // Trading recommendation
                recommendation: this.getTradingRecommendation(marketType, trendStrength),
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            logger.error('Market detection failed', error);
            return this.getDefaultCondition();
        }
    }

    /**
     * Detect market type based on indicators
     */
    detectMarketType(adx, bbWidth, volatility, trendStrength, candles) {
        // BREAKOUT: High volatility + BB expansion + price breaking out
        if (bbWidth > this.thresholds.bbWidthBreakout && volatility > this.thresholds.volatilityThreshold * 1.5) {
            return 'BREAKOUT';
        }
        
        // TREND: ADX > 25 and strong directional movement
        if (adx > this.thresholds.adxTrend && trendStrength > 0.6) {
            return 'TREND';
        }
        
        // SIDEWAY: Low BB width + low ADX + range bound
        if (bbWidth < this.thresholds.bbWidthSideway && adx < 20) {
            return 'SIDEWAY';
        }
        
        // Check for range bound market
        const priceRange = this.calculatePriceRange(candles, 20);
        if (priceRange < 0.01 && adx < 20) {
            return 'SIDEWAY';
        }
        
        // Default to TREND if ADX is decent
        if (adx > 20) {
            return 'TREND';
        }
        
        return 'UNKNOWN';
    }

    /**
     * Calculate ADX (Average Directional Index) with safety checks
     */
    calculateADX(candles, period = 14) {
        if (candles.length < period + 1) {
            return 25; // Default to neutral
        }

        const tr = [];
        const plusDM = [];
        const minusDM = [];

        for (let i = 1; i < candles.length; i++) {
            const current = candles[i];
            const prev = candles[i - 1];

            // True Range
            const tr1 = current.high - current.low;
            const tr2 = Math.abs(current.high - prev.close);
            const tr3 = Math.abs(current.low - prev.close);
            tr.push(Math.max(tr1, tr2, tr3));

            // +DM and -DM
            const upMove = current.high - prev.high;
            const downMove = prev.low - current.low;

            if (upMove > downMove && upMove > 0) {
                plusDM.push(upMove);
            } else {
                plusDM.push(0);
            }

            if (downMove > upMove && downMove > 0) {
                minusDM.push(downMove);
            } else {
                minusDM.push(0);
            }
        }

        // Calculate smoothed averages
        const atr = this.smoothAverage(tr, period);
        const smoothedPlusDM = this.smoothAverage(plusDM, period);
        const smoothedMinusDM = this.smoothAverage(minusDM, period);

        // Safety check for division by zero
        if (atr === 0 || smoothedPlusDM + smoothedMinusDM === 0) {
            return 25; // Default to neutral
        }

        // Calculate +DI and -DI
        const plusDI = (smoothedPlusDM / atr) * 100;
        const minusDI = (smoothedMinusDM / atr) * 100;

        // Safety check for DI calculation
        if (plusDI + minusDI === 0) {
            return 25; // Default to neutral
        }

        // Calculate DX and ADX
        const dx = (Math.abs(plusDI - minusDI) / (plusDI + minusDI)) * 100;
        
        return dx || 25; // Return 25 if dx is NaN
    }

    /**
     * Smooth average calculation for ADX
     */
    smoothAverage(values, period) {
        if (values.length < period) return values.reduce((a, b) => a + b, 0) / values.length;
        
        const initial = values.slice(0, period).reduce((a, b) => a + b, 0);
        let smoothed = initial / period;
        
        for (let i = period; i < values.length; i++) {
            smoothed = ((smoothed * (period - 1)) + values[i]) / period;
        }
        
        return smoothed;
    }

    /**
     * Calculate Bollinger Bands with validation - OPTIMIZED: single-pass calculation
     */
    calculateBB(candles, period = 20, stdDev = 2) {
        if (!candles || candles.length < period) {
            return { upper: 0, lower: 0, middle: 0 };
        }
        
        // OPTIMIZED: Single-pass calculation without intermediate arrays
        let sum = 0;
        let validCount = 0;
        const startIdx = Math.max(0, candles.length - period);
        
        for (let i = startIdx; i < candles.length; i++) {
            const close = candles[i].close;
            if (!isNaN(close) && close > 0) {
                sum += close;
                validCount++;
            }
        }
        
        if (validCount < 2) {
            return { upper: 0, lower: 0, middle: 0 };
        }
        
        const sma = sum / validCount;
        
        // Calculate variance in same loop
        let varianceSum = 0;
        for (let i = startIdx; i < candles.length; i++) {
            const close = candles[i].close;
            if (!isNaN(close) && close > 0) {
                varianceSum += Math.pow(close - sma, 2);
            }
        }
        
        const variance = varianceSum / validCount;
        const std = Math.sqrt(variance);

        return {
            upper: sma + (stdDev * std),
            lower: sma - (stdDev * std),
            middle: sma
        };
    }

    /**
     * Calculate BB Width percentage
     */
    calculateBBWidth(bb) {
        if (!bb || !bb.middle) return 0;
        return ((bb.upper - bb.lower) / bb.middle) * 100;
    }

    /**
     * Calculate volatility with validation - OPTIMIZED: reduced array allocations
     */
    calculateVolatility(candles, period = 20) {
        if (!candles || candles.length < period + 1) {
            return 0;
        }
        
        const startIdx = Math.max(1, candles.length - period);
        let sum = 0;
        let count = 0;
        
        // Single pass: calculate returns and sum
        for (let i = startIdx; i < candles.length; i++) {
            const prevClose = candles[i-1].close;
            if (prevClose > 0) {
                const ret = (candles[i].close - prevClose) / prevClose;
                if (!isNaN(ret)) {
                    sum += ret;
                    count++;
                }
            }
        }
        
        if (count === 0) {
            return 0;
        }
        
        const mean = sum / count;
        
        // Second pass: calculate variance
        let varianceSum = 0;
        for (let i = startIdx; i < candles.length; i++) {
            const prevClose = candles[i-1].close;
            if (prevClose > 0) {
                const ret = (candles[i].close - prevClose) / prevClose;
                if (!isNaN(ret)) {
                    varianceSum += Math.pow(ret - mean, 2);
                }
            }
        }
        
        const variance = varianceSum / count;
        return Math.sqrt(variance) || 0;
    }

    /**
     * Calculate trend strength (0-1) with validation
     */
    calculateTrendStrength(candles, period = 20) {
        if (!candles || candles.length < period) {
            return 0.5;
        }
        
        const recent = candles.slice(-period);
        const firstPrice = recent[0]?.close;
        const lastPrice = recent[recent.length - 1]?.close;
        
        if (!firstPrice || !lastPrice || firstPrice <= 0) {
            return 0.5;
        }
        
        const change = Math.abs((lastPrice - firstPrice) / firstPrice);
        
        // Count consistent directional candles
        let upCount = 0;
        let downCount = 0;
        
        for (let i = 1; i < recent.length; i++) {
            if (recent[i].close > recent[i-1].close) upCount++;
            else if (recent[i].close < recent[i-1].close) downCount++;
        }
        
        const consistency = Math.max(upCount, downCount) / (recent.length - 1);
        return Math.min(1, change * 10 + consistency * 0.5);
    }

    /**
     * Calculate price range percentage
     */
    calculatePriceRange(candles, period = 20) {
        const recent = candles.slice(-period);
        const highs = recent.map(c => c.high);
        const lows = recent.map(c => c.low);
        const max = Math.max(...highs);
        const min = Math.min(...lows);
        const avg = (max + min) / 2;
        return (max - min) / avg;
    }

    /**
     * Check if market is range bound
     */
    isRangeBound(candles, bb) {
        const recent = candles.slice(-10);
        const touchesUpper = recent.filter(c => c.high >= bb.upper * 0.995).length;
        const touchesLower = recent.filter(c => c.low <= bb.lower * 1.005).length;
        return touchesUpper >= 2 && touchesLower >= 2;
    }

    /**
     * Calculate momentum
     */
    calculateMomentum(candles) {
        const last = candles[candles.length - 1];
        const prev = candles[candles.length - 2];
        const change = last.close - prev.close;
        const avgRange = this.calculateAvgRange(candles);
        
        if (change > avgRange * 0.5) return 'STRONG_BULLISH';
        if (change > 0) return 'BULLISH';
        if (change < -avgRange * 0.5) return 'STRONG_BEARISH';
        if (change < 0) return 'BEARISH';
        return 'NEUTRAL';
    }

    /**
     * Get trend direction
     */
    getTrendDirection(candles, adx) {
        const last = candles[candles.length - 1];
        const prev5 = candles[candles.length - 5];
        const ma20 = this.calculateSMA(candles, 20);
        
        if (adx < 20) return 'NEUTRAL';
        
        const aboveMA = last.close > ma20;
        const priceChange = (last.close - prev5.close) / prev5.close;
        
        if (aboveMA && priceChange > 0) {
            return adx > 40 ? 'STRONG_UP' : 'WEAK_UP';
        } else if (!aboveMA && priceChange < 0) {
            return adx > 40 ? 'STRONG_DOWN' : 'WEAK_DOWN';
        }
        
        return 'NEUTRAL';
    }

    /**
     * Calculate Simple Moving Average
     */
    calculateSMA(candles, period) {
        const closes = candles.slice(-period).map(c => c.close);
        return closes.reduce((a, b) => a + b, 0) / closes.length;
    }

    /**
     * Get volatility level
     */
    getVolatilityLevel(volatility) {
        if (volatility > 0.02) return 'HIGH';
        if (volatility < 0.005) return 'LOW';
        return 'NORMAL';
    }

    /**
     * Calculate average range
     */
    calculateAvgRange(candles, period = 10) {
        const recent = candles.slice(-period);
        const ranges = recent.map(c => c.high - c.low);
        return ranges.reduce((a, b) => a + b, 0) / ranges.length || 0.0001;
    }

    /**
     * Get trading recommendation based on market type
     */
    getTradingRecommendation(marketType, trendStrength) {
        switch (marketType) {
            case 'TREND':
                return {
                    strategy: 'TREND_FOLLOWING',
                    action: trendStrength > 0.7 ? 'STRONG_TRADE' : 'MODERATE_TRADE',
                    direction: 'WITH_TREND',
                    confidence: trendStrength
                };
            case 'SIDEWAY':
                return {
                    strategy: 'RANGE_REVERSAL',
                    action: 'BUY_LOW_SELL_HIGH',
                    direction: 'COUNTER_TREND',
                    confidence: 0.6
                };
            case 'BREAKOUT':
                return {
                    strategy: 'BREAKOUT_MOMENTUM',
                    action: 'WAIT_CONFIRMATION',
                    direction: 'MOMENTUM',
                    confidence: 0.5
                };
            default:
                return {
                    strategy: 'NO_TRADE',
                    action: 'WAIT',
                    direction: 'NEUTRAL',
                    confidence: 0
                };
        }
    }

    /**
     * Get default condition when detection fails
     */
    getDefaultCondition() {
        return {
            type: 'UNKNOWN',
            trend: 'NEUTRAL',
            volatility: 'NORMAL',
            momentum: 'NEUTRAL',
            overall: 'UNKNOWN',
            metrics: {
                adx: 25,
                bbWidth: 3,
                volatility: 0.01,
                trendStrength: 0.5,
                rangeBound: false
            },
            recommendation: {
                strategy: 'NO_TRADE',
                action: 'WAIT',
                direction: 'NEUTRAL',
                confidence: 0
            },
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Update thresholds
     */
    updateThresholds(thresholds) {
        this.thresholds = { ...this.thresholds, ...thresholds };
        logger.info('Market detector thresholds updated', this.thresholds);
    }
}

module.exports = MarketDetector;
