/**
 * DYNAMIC EDGE SYSTEM
 * Score-based profit filtering with dynamic position sizing
 * 
 * Scoring System:
 * - RSI > 70 → +2
 * - RSI 60-70 → +1
 * - RSI < 60 → BLOCK
 * 
 * - Conditions: 2 → +1, 3 → +2
 * - Market Alignment: +1 (if trend matches signal)
 * 
 * Hard Rules:
 * - Only BUY signals
 * - Minimum 2 conditions
 * 
 * Position Sizing:
 * - Confidence >= 4 → 1.5% risk
 * - Confidence < 4 → 1% risk
 */

const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');

class DynamicEdgeSystem {
    constructor() {
        this.name = 'DynamicEdgeSystem';
        
        // Score thresholds
        this.thresholds = {
            minScore: 3,        // Minimum to trade
            highConfidence: 4,  // For increased position size
            maxScore: 6         // Maximum possible score
        };
        
        // Position sizing
        this.positionSizing = {
            normal: 1.0,    // 1% risk
            increased: 1.5  // 1.5% risk
        };
        
        // Hard rules (cannot be violated)
        this.hardRules = {
            allowedSignals: ['BUY'],  // Only BUY
            minConditions: 2         // At least 2 conditions
        };
        
        // Performance tracking
        this.performance = {
            scoreDistribution: {},
            positionSizePerformance: {},
            tradeCount: 0,
            winCount: 0,
            totalProfit: 0
        };
        
        this.loadHistoricalData();
    }

    /**
     * Calculate EDGE score and determine if trade is valid
     * @param {Object} context - Trade context
     * @returns {Object} Score result with position size
     */
    calculateScore(context) {
        try {
            const {
                rsi,
                signal,
                conditions,
                conditionCount,
                marketCondition,
                pair
            } = context;

            const rsiValue = typeof rsi === 'object' ? rsi.value : rsi;
            const normalizedSignal = signal?.toUpperCase?.() || signal;
            const count = conditionCount || 
                (conditions ? Object.values(conditions).filter(Boolean).length : 0);

            // ===== HARD RULES CHECK (Non-negotiable) =====
            const hardFailures = [];
            
            // Rule 1: Only BUY signals
            if (!this.hardRules.allowedSignals.includes(normalizedSignal)) {
                hardFailures.push(`Signal ${signal} not allowed (only ${this.hardRules.allowedSignals.join(', ')})`);
            }
            
            // Rule 2: Minimum 2 conditions
            if (count < this.hardRules.minConditions) {
                hardFailures.push(`Conditions ${count} < ${this.hardRules.minConditions}`);
            }
            
            // Rule 3: RSI < 60 = BLOCK
            if (rsiValue < 60) {
                hardFailures.push(`RSI ${rsiValue.toFixed(1)} < 60 (blocked)`);
            }
            
            // If hard rules violated, return invalid
            if (hardFailures.length > 0) {
                return {
                    valid: false,
                    score: 0,
                    maxScore: this.thresholds.maxScore,
                    confidence: 'none',
                    positionSize: 0,
                    failures: hardFailures,
                    passed: [],
                    breakdown: {}
                };
            }

            // ===== SCORING SYSTEM =====
            let score = 0;
            const breakdown = {};
            const passed = [];

            // RSI Score (0-2)
            if (rsiValue > 70) {
                score += 2;
                breakdown.rsi = { value: rsiValue, points: 2, level: 'strong' };
                passed.push(`RSI ${rsiValue.toFixed(1)} > 70 (+2)`);
            } else if (rsiValue >= 60) {
                score += 1;
                breakdown.rsi = { value: rsiValue, points: 1, level: 'moderate' };
                passed.push(`RSI ${rsiValue.toFixed(1)} 60-70 (+1)`);
            }

            // Condition Score (0-2)
            if (count >= 3) {
                score += 2;
                breakdown.conditions = { count: count, points: 2 };
                passed.push(`Conditions ${count}/3 (+2)`);
            } else if (count === 2) {
                score += 1;
                breakdown.conditions = { count: count, points: 1 };
                passed.push(`Conditions ${count}/3 (+1)`);
            }

            // Market Alignment Score (0-1)
            const alignment = this.calculateMarketAlignment(normalizedSignal, marketCondition);
            if (alignment.aligned) {
                score += 1;
                breakdown.alignment = { aligned: true, points: 1, trend: alignment.trend };
                passed.push(`Market alignment (+1)`);
            } else {
                breakdown.alignment = { aligned: false, points: 0 };
            }

            // Determine confidence level
            let confidence = 'low';
            if (score >= 5) confidence = 'very_high';
            else if (score >= 4) confidence = 'high';
            else if (score >= 3) confidence = 'medium';

            // Determine position size
            const positionSize = score >= this.thresholds.highConfidence 
                ? this.positionSizing.increased 
                : this.positionSizing.normal;

            // Check if meets minimum threshold
            const valid = score >= this.thresholds.minScore;

            // Log result
            if (!valid) {
                logger.info(`EDGE SYSTEM: Score ${score} below threshold ${this.thresholds.minScore}`, {
                    pair,
                    rsi: rsiValue,
                    signal,
                    conditions: count
                });
            } else {
                logger.debug(`EDGE SYSTEM: Score ${score}/${this.thresholds.maxScore}, Position ${positionSize}%`, {
                    pair,
                    rsi: rsiValue,
                    signal,
                    conditions: count,
                    market: marketCondition?.type
                });
            }

            return {
                valid: valid,
                score: score,
                maxScore: this.thresholds.maxScore,
                confidence: confidence,
                positionSize: positionSize,
                breakdown: breakdown,
                passed: passed,
                failures: valid ? [] : [`Score ${score} < ${this.thresholds.minScore}`],
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            logger.error('Dynamic Edge System error', error);
            return {
                valid: false,
                score: 0,
                confidence: 'error',
                positionSize: 0,
                failures: ['System error: ' + error.message],
                passed: []
            };
        }
    }

    /**
     * Calculate market alignment bonus
     */
    calculateMarketAlignment(signal, marketCondition) {
        if (!marketCondition) return { aligned: false, trend: 'unknown' };
        
        const trend = marketCondition.trend || 'NEUTRAL';
        const marketType = marketCondition.type || 'UNKNOWN';
        
        // BUY signal aligns with uptrend
        if (signal === 'BUY' && (trend.includes('UP') || marketType === 'TREND')) {
            return { aligned: true, trend: trend };
        }
        
        // In sideways market, both signals can work
        if (marketType === 'SIDEWAY' && trend === 'NEUTRAL') {
            return { aligned: true, trend: 'sideways' };
        }
        
        return { aligned: false, trend: trend };
    }

    /**
     * Quick check - returns boolean
     */
    check(context) {
        return this.calculateScore(context).valid;
    }

    /**
     * Get position size based on score
     */
    getPositionSize(context) {
        const result = this.calculateScore(context);
        return result.valid ? result.positionSize : 0;
    }

    /**
     * Record trade result for performance tracking
     */
    recordTrade(score, positionSize, result, profit) {
        try {
            this.performance.tradeCount++;
            if (result === 'WIN' || profit > 0) {
                this.performance.winCount++;
            }
            this.performance.totalProfit += profit || 0;

            // Track by score
            const scoreKey = score.toString();
            if (!this.performance.scoreDistribution[scoreKey]) {
                this.performance.scoreDistribution[scoreKey] = { count: 0, wins: 0, profit: 0 };
            }
            this.performance.scoreDistribution[scoreKey].count++;
            if (profit > 0) this.performance.scoreDistribution[scoreKey].wins++;
            this.performance.scoreDistribution[scoreKey].profit += profit;

            // Track by position size
            const sizeKey = positionSize.toString();
            if (!this.performance.positionSizePerformance[sizeKey]) {
                this.performance.positionSizePerformance[sizeKey] = { count: 0, wins: 0, profit: 0 };
            }
            this.performance.positionSizePerformance[sizeKey].count++;
            if (profit > 0) this.performance.positionSizePerformance[sizeKey].wins++;
            this.performance.positionSizePerformance[sizeKey].profit += profit;

            this.saveHistoricalData();

        } catch (error) {
            logger.error('Failed to record trade', error);
        }
    }

    /**
     * Get performance statistics
     */
    getStats() {
        const winrate = this.performance.tradeCount > 0 
            ? (this.performance.winCount / this.performance.tradeCount * 100).toFixed(1)
            : 0;

        return {
            thresholds: this.thresholds,
            hardRules: this.hardRules,
            performance: {
                ...this.performance,
                winrate: `${winrate}%`
            },
            scorePerformance: this.calculateScorePerformance()
        };
    }

    /**
     * Calculate performance by score level
     */
    calculateScorePerformance() {
        const result = {};
        
        Object.entries(this.performance.scoreDistribution).forEach(([score, data]) => {
            if (data.count >= 5) {
                const winrate = (data.wins / data.count * 100).toFixed(1);
                result[score] = {
                    trades: data.count,
                    winrate: `${winrate}%`,
                    profit: data.profit.toFixed(2),
                    avgProfit: (data.profit / data.count).toFixed(2)
                };
            }
        });

        return result;
    }

    /**
     * Load historical performance data
     */
    loadHistoricalData() {
        try {
            const dataPath = path.join(__dirname, '../../data/dynamicEdgeHistory.json');
            if (fs.existsSync(dataPath)) {
                const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
                this.performance = { ...this.performance, ...data.performance };
                logger.info('Dynamic Edge System loaded historical data');
            }
        } catch (error) {
            logger.warn('Failed to load historical data', error);
        }
    }

    /**
     * Save performance data
     */
    saveHistoricalData() {
        try {
            const dataDir = path.join(__dirname, '../../data');
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
            }

            const dataPath = path.join(dataDir, 'dynamicEdgeHistory.json');
            const data = {
                performance: this.performance,
                updatedAt: new Date().toISOString()
            };

            fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
        } catch (error) {
            logger.error('Failed to save historical data', error);
        }
    }

    /**
     * Reset performance tracking
     */
    reset() {
        this.performance = {
            scoreDistribution: {},
            positionSizePerformance: {},
            tradeCount: 0,
            winCount: 0,
            totalProfit: 0
        };
        this.saveHistoricalData();
        logger.info('Dynamic Edge System reset');
    }
}

module.exports = DynamicEdgeSystem;
