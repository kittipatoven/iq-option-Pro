/**
 * EDGE FILTER
 * Profit-based trading edge filter
 * 
 * Rules:
 * 1. RSI EDGE: Only trade when RSI > 60 (BUY bias)
 * 2. SIGNAL EDGE: Only BUY signals (no SELL)
 * 3. CONDITION EDGE: Require at least 2 conditions met
 * 
 * Adaptive Learning:
 * - Updates thresholds based on analytics data
 * - Learns from winrate and profit per setup
 */

const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');

class EdgeFilter {
    constructor() {
        this.name = 'EdgeFilter';
        
        // Core EDGE rules (profit-based from analytics)
        this.rules = {
            // RSI EDGE: Only trade RSI > 60
            rsi: {
                enabled: true,
                minRSI: 60,
                maxRSI: 100,
                description: 'Only trade when RSI > 60 (BUY bias)'
            },
            
            // SIGNAL EDGE: Only BUY signals
            signal: {
                enabled: true,
                allowedSignals: ['BUY'],
                description: 'Only BUY signals allowed'
            },
            
            // CONDITION EDGE: At least 2 conditions
            conditions: {
                enabled: true,
                minConditions: 2,
                description: 'Require at least 2 conditions met'
            }
        };
        
        // Performance tracking for adaptive learning
        this.performance = {
            rsiRanges: {},
            signalTypes: {},
            conditionCounts: {}
        };
        
        // Load historical data if exists
        this.loadHistoricalData();
    }

    /**
     * Check if trade meets EDGE requirements
     * @param {Object} context - Trade context
     * @returns {Object} Filter result
     */
    isValid(context) {
        try {
            const {
                rsi,
                signal,
                conditions,
                conditionCount,
                pair,
                marketCondition
            } = context;

            const failures = [];
            const passed = [];

            // Rule 1: RSI EDGE
            if (this.rules.rsi.enabled) {
                const rsiValue = typeof rsi === 'object' ? rsi.value : rsi;
                if (rsiValue < this.rules.rsi.minRSI) {
                    failures.push(`RSI ${rsiValue.toFixed(1)} < ${this.rules.rsi.minRSI}`);
                } else {
                    passed.push(`RSI ${rsiValue.toFixed(1)} >= ${this.rules.rsi.minRSI}`);
                }
            }

            // Rule 2: SIGNAL EDGE
            if (this.rules.signal.enabled) {
                const normalizedSignal = signal?.toUpperCase?.() || signal;
                if (!this.rules.signal.allowedSignals.includes(normalizedSignal)) {
                    failures.push(`Signal ${signal} not in [${this.rules.signal.allowedSignals.join(', ')}]`);
                } else {
                    passed.push(`Signal ${signal} allowed`);
                }
            }

            // Rule 3: CONDITION EDGE
            if (this.rules.conditions.enabled) {
                const count = conditionCount || 
                    (conditions ? Object.values(conditions).filter(Boolean).length : 0);
                if (count < this.rules.conditions.minConditions) {
                    failures.push(`Conditions ${count} < ${this.rules.conditions.minConditions}`);
                } else {
                    passed.push(`Conditions ${count} >= ${this.rules.conditions.minConditions}`);
                }
            }

            const isValid = failures.length === 0;

            // Log result
            if (!isValid) {
                logger.info(`EDGE FILTER BLOCKED: ${failures.join(', ')}`, {
                    pair,
                    rsi: typeof rsi === 'object' ? rsi.value : rsi,
                    signal,
                    conditionCount
                });
            } else {
                logger.debug(`EDGE FILTER PASSED: ${passed.join(', ')}`, {
                    pair,
                    rsi: typeof rsi === 'object' ? rsi.value : rsi,
                    signal,
                    conditionCount
                });
            }

            return {
                valid: isValid,
                failures: failures,
                passed: passed,
                rules: this.getActiveRules(),
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            logger.error('Edge filter validation error', error);
            return {
                valid: false,
                failures: ['Filter error: ' + error.message],
                passed: [],
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Quick check - just returns boolean
     */
    check(context) {
        return this.isValid(context).valid;
    }

    /**
     * Update rules from analytics data (adaptive learning)
     * @param {Object} analytics - Trade analytics data
     */
    updateFromAnalytics(analytics) {
        try {
            logger.info('Updating Edge Filter from analytics...');

            if (!analytics || !analytics.trades || analytics.trades.length === 0) {
                logger.warn('No analytics data available for learning');
                return;
            }

            const trades = analytics.trades;
            
            // Analyze RSI ranges
            this.analyzeRSIPerformance(trades);
            
            // Analyze signal types
            this.analyzeSignalPerformance(trades);
            
            // Analyze condition counts
            this.analyzeConditionPerformance(trades);

            // Update rules based on findings
            this.adaptRules();

            // Save updated rules
            this.saveHistoricalData();

            logger.info('Edge Filter updated from analytics', {
                rsiOptimal: this.performance.rsiRanges.optimal,
                signalOptimal: this.performance.signalTypes.optimal,
                conditionOptimal: this.performance.conditionCounts.optimal
            });

        } catch (error) {
            logger.error('Failed to update from analytics', error);
        }
    }

    /**
     * Analyze RSI performance by ranges
     */
    analyzeRSIPerformance(trades) {
        const ranges = {
            '0-30': { trades: [], wins: 0, profit: 0 },
            '30-40': { trades: [], wins: 0, profit: 0 },
            '40-50': { trades: [], wins: 0, profit: 0 },
            '50-60': { trades: [], wins: 0, profit: 0 },
            '60-70': { trades: [], wins: 0, profit: 0 },
            '70-100': { trades: [], wins: 0, profit: 0 }
        };

        trades.forEach(trade => {
            const rsi = typeof trade.rsi === 'object' ? trade.rsi.value : trade.rsi;
            if (rsi === undefined) return;

            let range;
            if (rsi < 30) range = '0-30';
            else if (rsi < 40) range = '30-40';
            else if (rsi < 50) range = '40-50';
            else if (rsi < 60) range = '50-60';
            else if (rsi < 70) range = '60-70';
            else range = '70-100';

            ranges[range].trades.push(trade);
            if (trade.result === 'WIN' || trade.profit > 0) {
                ranges[range].wins++;
            }
            ranges[range].profit += trade.profit || 0;
        });

        // Find optimal RSI range
        let bestRange = null;
        let bestProfit = -Infinity;

        Object.entries(ranges).forEach(([range, data]) => {
            if (data.trades.length >= 5) { // Minimum sample size
                const winrate = data.wins / data.trades.length;
                if (data.profit > bestProfit && winrate > 0.5) {
                    bestProfit = data.profit;
                    bestRange = range;
                }
            }
        });

        this.performance.rsiRanges = {
            ranges: ranges,
            optimal: bestRange,
            bestProfit: bestProfit
        };
    }

    /**
     * Analyze signal type performance
     */
    analyzeSignalPerformance(trades) {
        const signals = {
            'BUY': { trades: [], wins: 0, profit: 0 },
            'SELL': { trades: [], wins: 0, profit: 0 }
        };

        trades.forEach(trade => {
            const signal = trade.signal?.toUpperCase?.();
            if (!signals[signal]) return;

            signals[signal].trades.push(trade);
            if (trade.result === 'WIN' || trade.profit > 0) {
                signals[signal].wins++;
            }
            signals[signal].profit += trade.profit || 0;
        });

        // Find optimal signal
        let bestSignal = null;
        let bestProfit = -Infinity;

        Object.entries(signals).forEach(([signal, data]) => {
            if (data.trades.length >= 5) {
                const winrate = data.wins / data.trades.length;
                if (data.profit > bestProfit && winrate > 0.5) {
                    bestProfit = data.profit;
                    bestSignal = signal;
                }
            }
        });

        this.performance.signalTypes = {
            signals: signals,
            optimal: bestSignal,
            bestProfit: bestProfit
        };
    }

    /**
     * Analyze condition count performance
     */
    analyzeConditionPerformance(trades) {
        const counts = {
            '0': { trades: [], wins: 0, profit: 0 },
            '1': { trades: [], wins: 0, profit: 0 },
            '2': { trades: [], wins: 0, profit: 0 },
            '3': { trades: [], wins: 0, profit: 0 }
        };

        trades.forEach(trade => {
            const count = trade.conditions?.conditionCount || 
                (trade.conditions ? Object.values(trade.conditions).filter(Boolean).length : 0);
            
            const key = Math.min(count, 3).toString();
            if (!counts[key]) return;

            counts[key].trades.push(trade);
            if (trade.result === 'WIN' || trade.profit > 0) {
                counts[key].wins++;
            }
            counts[key].profit += trade.profit || 0;
        });

        // Find optimal condition count
        let bestCount = null;
        let bestProfit = -Infinity;

        Object.entries(counts).forEach(([count, data]) => {
            if (data.trades.length >= 5) {
                const winrate = data.wins / data.trades.length;
                if (data.profit > bestProfit && winrate > 0.5) {
                    bestProfit = data.profit;
                    bestCount = parseInt(count);
                }
            }
        });

        this.performance.conditionCounts = {
            counts: counts,
            optimal: bestCount,
            bestProfit: bestProfit
        };
    }

    /**
     * Adapt rules based on performance analysis
     */
    adaptRules() {
        // Adapt RSI rule
        if (this.performance.rsiRanges.optimal) {
            const optimal = this.performance.rsiRanges.optimal;
            if (optimal === '60-70') {
                this.rules.rsi.minRSI = 60;
                this.rules.rsi.maxRSI = 70;
            } else if (optimal === '70-100') {
                this.rules.rsi.minRSI = 70;
            } else if (optimal === '50-60') {
                this.rules.rsi.minRSI = 50;
            }
        }

        // Adapt signal rule
        if (this.performance.signalTypes.optimal) {
            this.rules.signal.allowedSignals = [this.performance.signalTypes.optimal];
        }

        // Adapt condition rule
        if (this.performance.conditionCounts.optimal !== null) {
            this.rules.conditions.minConditions = this.performance.conditionCounts.optimal;
        }
    }

    /**
     * Load historical performance data
     */
    loadHistoricalData() {
        try {
            const dataPath = path.join(__dirname, '../../data/edgeFilterHistory.json');
            if (fs.existsSync(dataPath)) {
                const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
                this.performance = { ...this.performance, ...data.performance };
                this.rules = { ...this.rules, ...data.rules };
                logger.info('Edge Filter loaded historical data');
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

            const dataPath = path.join(dataDir, 'edgeFilterHistory.json');
            const data = {
                performance: this.performance,
                rules: this.rules,
                updatedAt: new Date().toISOString()
            };

            fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
            logger.info('Edge Filter saved historical data');
        } catch (error) {
            logger.error('Failed to save historical data', error);
        }
    }

    /**
     * Get active rules summary
     */
    getActiveRules() {
        return {
            rsi: this.rules.rsi.enabled ? `RSI > ${this.rules.rsi.minRSI}` : 'disabled',
            signal: this.rules.signal.enabled ? `Signal: ${this.rules.signal.allowedSignals.join(', ')}` : 'disabled',
            conditions: this.rules.conditions.enabled ? `Conditions >= ${this.rules.conditions.minConditions}` : 'disabled'
        };
    }

    /**
     * Get performance statistics
     */
    getStats() {
        return {
            rules: this.getActiveRules(),
            performance: this.performance,
            adaptiveLearning: {
                rsiOptimal: this.performance.rsiRanges?.optimal,
                signalOptimal: this.performance.signalTypes?.optimal,
                conditionOptimal: this.performance.conditionCounts?.optimal
            }
        };
    }

    /**
     * Reset to default rules
     */
    reset() {
        this.rules = {
            rsi: {
                enabled: true,
                minRSI: 60,
                maxRSI: 100,
                description: 'Only trade when RSI > 60 (BUY bias)'
            },
            signal: {
                enabled: true,
                allowedSignals: ['BUY'],
                description: 'Only BUY signals allowed'
            },
            conditions: {
                enabled: true,
                minConditions: 2,
                description: 'Require at least 2 conditions met'
            }
        };
        this.saveHistoricalData();
        logger.info('Edge Filter reset to defaults');
    }
}

module.exports = EdgeFilter;
