/**
 * ENHANCED CONFIDENCE SCORE SYSTEM
 * Weighted score calculation with market-adaptive weights
 * 
 * Base Weights:
 * - Sniper Entry Signal: 40%
 * - RSI Extreme: 25%
 * - Bollinger Band Breach: 20%
 * - Engulfing Pattern: 15%
 * 
 * Market-Adaptive Adjustments:
 * - TREND: Boost trend-aligned signals
 * - SIDEWAY: Boost reversal signals
 * - BREAKOUT: Boost momentum signals
 * 
 * Thresholds:
 * - >= 8.5: SNIPPER entry
 * - >= 7.0: HIGH confidence
 * - >= 5.5: MEDIUM confidence
 * - < 5.5: Skip trade
 */

const logger = require('../utils/logger');

class ConfidenceScore {
    constructor() {
        this.baseWeights = {
            sniperSignal: 0.40,
            rsiExtreme: 0.25,
            bbBreach: 0.20,
            engulfing: 0.15
        };
        this.thresholds = {
            snipper: 8.5,
            high: 7.0,
            medium: 5.5,
            minimum: 5.0
        };
        
        // Market-specific weight adjustments
        this.marketAdjustments = {
            TREND: {
                sniperSignal: 1.0,
                rsiExtreme: 0.9,
                bbBreach: 0.8,
                engulfing: 1.1,
                trendAlignment: 0.2  // Bonus for trend alignment
            },
            SIDEWAY: {
                sniperSignal: 1.0,
                rsiExtreme: 1.2,    // RSI more important in sideways
                bbBreach: 1.2,      // BB bands more important
                engulfing: 1.1,
                trendAlignment: 0
            },
            BREAKOUT: {
                sniperSignal: 1.0,
                rsiExtreme: 0.7,    // RSI less important
                bbBreach: 1.3,      // BB expansion critical
                engulfing: 1.0,
                trendAlignment: 0.15
            },
            UNKNOWN: {
                sniperSignal: 1.0,
                rsiExtreme: 1.0,
                bbBreach: 1.0,
                engulfing: 1.0,
                trendAlignment: 0
            }
        };
    }

    /**
     * Get weights for specific market condition
     */
    getWeights(marketType = 'UNKNOWN') {
        const adjustments = this.marketAdjustments[marketType] || this.marketAdjustments.UNKNOWN;
        
        return {
            sniperSignal: this.baseWeights.sniperSignal * (adjustments.sniperSignal || 1),
            rsiExtreme: this.baseWeights.rsiExtreme * (adjustments.rsiExtreme || 1),
            bbBreach: this.baseWeights.bbBreach * (adjustments.bbBreach || 1),
            engulfing: this.baseWeights.engulfing * (adjustments.engulfing || 1),
            trendAlignment: adjustments.trendAlignment || 0
        };
    }

    /**
     * Calculate weighted confidence score with market adaptation
     */
    calculate(params) {
        const {
            sniperSignal,      // 0-10 (strong sniper signal)
            rsiExtreme,        // 0-10 (RSI extreme value)
            bbBreach,          // 0-10 (BB breach strength)
            engulfing,         // 0-10 (engulfing pattern strength)
            trendAlignment,    // 0-10 (alignment with trend)
            marketCondition,    // Object from MarketDetector
            strategy          // Strategy from StrategySelector
        } = params;

        const marketType = marketCondition?.type || marketCondition?.overall || 'UNKNOWN';
        const weights = this.getWeights(marketType);

        let score = 0;
        let breakdown = {};

        // Sniper Entry Signal (40% base)
        if (sniperSignal !== undefined) {
            const sniperScore = sniperSignal * weights.sniperSignal;
            score += sniperScore;
            breakdown.sniper = { raw: sniperSignal, weighted: sniperScore.toFixed(2) };
        }

        // RSI Extreme (25% base)
        if (rsiExtreme !== undefined) {
            const rsiScore = rsiExtreme * weights.rsiExtreme;
            score += rsiScore;
            breakdown.rsi = { raw: rsiExtreme, weighted: rsiScore.toFixed(2) };
        }

        // Bollinger Band Breach (20% base)
        if (bbBreach !== undefined) {
            const bbScore = bbBreach * weights.bbBreach;
            score += bbScore;
            breakdown.bb = { raw: bbBreach, weighted: bbScore.toFixed(2) };
        }

        // Engulfing Pattern (15% base)
        if (engulfing !== undefined) {
            const engulfScore = engulfing * weights.engulfing;
            score += engulfScore;
            breakdown.engulfing = { raw: engulfing, weighted: engulfScore.toFixed(2) };
        }

        // Trend Alignment bonus
        if (trendAlignment !== undefined && weights.trendAlignment > 0) {
            const trendScore = trendAlignment * weights.trendAlignment;
            score += trendScore;
            breakdown.trendAlignment = { raw: trendAlignment, weighted: trendScore.toFixed(2) };
        }

        // Apply market condition penalties
        let penalties = [];
        
        // Volatile market penalty for weak signals
        if (marketCondition?.volatility === 'HIGH' && score < this.thresholds.high) {
            score *= 0.5;
            penalties.push('High volatility penalty (-50%)');
        }
        
        // Unknown market penalty
        if (marketType === 'UNKNOWN') {
            score *= 0.7;
            penalties.push('Unknown market condition (-30%)');
        }

        // Strategy-specific adjustments
        if (strategy) {
            const strategyBoost = this.getStrategyBoost(score, strategy);
            score *= strategyBoost.multiplier;
            if (strategyBoost.reason) {
                penalties.push(strategyBoost.reason);
            }
        }

        // Determine signal strength
        let signalStrength = 'low';
        if (score >= this.thresholds.snipper) {
            signalStrength = 'snipper';
        } else if (score >= this.thresholds.high) {
            signalStrength = 'high';
        } else if (score >= this.thresholds.medium) {
            signalStrength = 'medium';
        }

        // Dynamic threshold based on market condition
        let minThreshold = this.thresholds.medium;
        if (marketType === 'BREAKOUT') {
            minThreshold = this.thresholds.high; // Require higher score in breakout
        } else if (marketType === 'SIDEWAY') {
            minThreshold = this.thresholds.medium - 0.5; // Slightly lower for sideways
        }

        return {
            totalScore: parseFloat(score.toFixed(2)),
            signalStrength: signalStrength,
            shouldTrade: score >= minThreshold,
            isHighConfidence: score >= this.thresholds.high,
            isSniperEntry: score >= this.thresholds.snipper,
            minThreshold: minThreshold,
            marketType: marketType,
            breakdown: breakdown,
            penalties: penalties,
            weights: weights
        };
    }

    /**
     * Get strategy-specific score boost
     */
    getStrategyBoost(score, strategy) {
        const strategyName = strategy?.name || 'SNIPER_ENTRY';
        
        switch (strategyName) {
            case 'TREND_FOLLOWING':
                if (strategy.bias === 'BULLISH' && score > 7) {
                    return { multiplier: 1.1, reason: 'Trend following boost (+10%)' };
                }
                break;
            case 'RANGE_REVERSAL':
                if (score > 6 && score < 8) {
                    return { multiplier: 1.05, reason: 'Reversal strategy boost (+5%)' };
                }
                break;
            case 'BREAKOUT_MOMENTUM':
                if (score >= 8) {
                    return { multiplier: 1.15, reason: 'Breakout momentum boost (+15%)' };
                }
                break;
        }
        
        return { multiplier: 1.0, reason: null };
    }

    /**
     * Quick calculate from sniper analysis with full context
     */
    fromSniperAnalysis(sniperResult, marketCondition = null, strategy = null) {
        const trendAlignment = this.calculateTrendAlignment(sniperResult, marketCondition);
        
        const params = {
            sniperSignal: sniperResult.signal !== 'NONE' ? sniperResult.score : 0,
            rsiExtreme: sniperResult.conditions?.rsiExtreme ? 10 : 0,
            bbBreach: sniperResult.conditions?.bbBreach ? 10 : 0,
            engulfing: sniperResult.conditions?.engulfing ? 10 : 0,
            trendAlignment: trendAlignment,
            marketCondition: marketCondition,
            strategy: strategy
        };

        return this.calculate(params);
    }

    /**
     * Calculate trend alignment score
     */
    calculateTrendAlignment(sniperResult, marketCondition) {
        if (!marketCondition) return 5; // Neutral
        
        const trend = marketCondition.trend || 'NEUTRAL';
        const signal = sniperResult.signal;
        
        // Align buy with uptrend
        if (signal === 'BUY' && trend.includes('UP')) return 10;
        if (signal === 'BUY' && trend.includes('DOWN')) return 2;
        
        // Align sell with downtrend
        if (signal === 'SELL' && trend.includes('DOWN')) return 10;
        if (signal === 'SELL' && trend.includes('UP')) return 2;
        
        return 5; // Neutral alignment
    }

    /**
     * Get recommendation with market context
     */
    getRecommendation(score, marketCondition = null) {
        const marketType = marketCondition?.type || 'UNKNOWN';
        
        if (score >= this.thresholds.snipper) {
            return { 
                action: 'TRADE', 
                confidence: 'SNIPPER', 
                size: 'normal',
                marketContext: marketType
            };
        } else if (score >= this.thresholds.high) {
            return { 
                action: 'TRADE', 
                confidence: 'HIGH', 
                size: 'normal',
                marketContext: marketType
            };
        } else if (score >= this.thresholds.medium) {
            return { 
                action: 'TRADE', 
                confidence: 'MEDIUM', 
                size: marketType === 'BREAKOUT' ? 'reduced' : 'small',
                marketContext: marketType
            };
        } else {
            return { 
                action: 'SKIP', 
                confidence: 'LOW', 
                reason: `Score ${score.toFixed(1)} below threshold ${this.thresholds.medium}`,
                marketContext: marketType
            };
        }
    }

    /**
     * Get score statistics for analysis
     */
    getStats() {
        return {
            thresholds: this.thresholds,
            baseWeights: this.baseWeights,
            marketAdjustments: this.marketAdjustments
        };
    }
}

module.exports = ConfidenceScore;
