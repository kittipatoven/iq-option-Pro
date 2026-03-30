/**
 * STRATEGY SELECTOR
 * Dynamically selects trading strategy based on market condition
 * 
 * Strategy Mapping:
 * - TREND → TREND_FOLLOWING strategy
 * - SIDEWAY → REVERSAL/RANGE strategy
 * - BREAKOUT → BREAKOUT/MOMENTUM strategy
 */

const logger = require('../utils/logger');
const SniperEntry = require('../strategies/sniperEntry');

class StrategySelector {
    constructor() {
        this.strategies = {
            TREND: {
                name: 'TREND_FOLLOWING',
                description: 'Follow the trend direction',
                indicators: ['MA', 'MACD', 'ADX'],
                entryRules: {
                    buy: ['Price above MA', 'MACD bullish', 'ADX > 25'],
                    sell: ['Price below MA', 'MACD bearish', 'ADX > 25']
                },
                riskProfile: 'moderate',
                winRateTarget: 0.60
            },
            SIDEWAY: {
                name: 'RANGE_REVERSAL',
                description: 'Buy low, sell high in range',
                indicators: ['RSI', 'Bollinger Bands', 'Support/Resistance'],
                entryRules: {
                    buy: ['RSI < 30', 'Price at lower BB', 'Support level'],
                    sell: ['RSI > 70', 'Price at upper BB', 'Resistance level']
                },
                riskProfile: 'low',
                winRateTarget: 0.65
            },
            BREAKOUT: {
                name: 'BREAKOUT_MOMENTUM',
                description: 'Trade momentum breakouts',
                indicators: ['Volatility', 'Volume', 'Price Action'],
                entryRules: {
                    buy: ['BB expansion', 'High momentum', 'Break above resistance'],
                    sell: ['BB expansion', 'High momentum', 'Break below support']
                },
                riskProfile: 'high',
                winRateTarget: 0.55
            }
        };
        
        // Initialize default strategy
        this.sniperEntry = new SniperEntry();
        this.currentStrategy = null;
        this.lastMarketCondition = null;
    }

    /**
     * Select strategy based on market condition
     * @param {Object} marketCondition - Output from MarketDetector
     * @returns {Object} Selected strategy configuration
     */
    selectStrategy(marketCondition) {
        try {
            const marketType = marketCondition?.type || marketCondition?.overall || 'UNKNOWN';
            
            // Log strategy selection
            if (this.lastMarketCondition !== marketType) {
                logger.info(`Strategy switch: ${this.lastMarketCondition || 'NONE'} → ${marketType}`);
                this.lastMarketCondition = marketType;
            }

            switch (marketType) {
                case 'TREND':
                    this.currentStrategy = this.getTrendStrategy(marketCondition);
                    break;
                case 'SIDEWAY':
                    this.currentStrategy = this.getSidewayStrategy(marketCondition);
                    break;
                case 'BREAKOUT':
                    this.currentStrategy = this.getBreakoutStrategy(marketCondition);
                    break;
                default:
                    this.currentStrategy = this.getDefaultStrategy();
            }

            return {
                ...this.currentStrategy,
                marketCondition: marketType,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            logger.error('Strategy selection failed', error);
            return this.getDefaultStrategy();
        }
    }

    /**
     * Get TREND_FOLLOWING strategy configuration
     */
    getTrendStrategy(marketCondition) {
        const trendDirection = marketCondition?.trend || 'NEUTRAL';
        const isUptrend = trendDirection.includes('UP');
        const isDowntrend = trendDirection.includes('DOWN');
        const strength = marketCondition?.metrics?.trendStrength || 0.5;

        return {
            name: 'TREND_FOLLOWING',
            marketType: 'TREND',
            direction: isUptrend ? 'LONG' : isDowntrend ? 'SHORT' : 'NEUTRAL',
            bias: isUptrend ? 'BULLISH' : isDowntrend ? 'BEARISH' : 'NEUTRAL',
            params: {
                rsiBuyThreshold: 40,        // Higher threshold for trend following
                rsiSellThreshold: 60,
                minScore: strength > 0.7 ? 6 : 7,  // Lower threshold for strong trends
                useMAFilter: true,
                useMACDFilter: true,
                trendConfirmation: true
            },
            entryRules: {
                buy: [
                    'Price above MA20',
                    'RSI > 40 (not oversold)',
                    'MACD bullish',
                    'ADX > 25'
                ],
                sell: [
                    'Price below MA20',
                    'RSI < 60 (not overbought)',
                    'MACD bearish',
                    'ADX > 25'
                ]
            },
            exitRules: {
                takeProfit: '2:1 R:R',
                stopLoss: 'Below swing low/high',
                trailingStop: true
            },
            riskProfile: 'moderate',
            priority: strength > 0.7 ? 'HIGH' : 'MEDIUM'
        };
    }

    /**
     * Get RANGE_REVERSAL strategy configuration
     */
    getSidewayStrategy(marketCondition) {
        return {
            name: 'RANGE_REVERSAL',
            marketType: 'SIDEWAY',
            direction: 'BOTH',
            bias: 'NEUTRAL',
            params: {
                rsiBuyThreshold: 30,        // Lower threshold for reversal
                rsiSellThreshold: 70,
                minScore: 7,                // Higher threshold for reversal
                useBBFilter: true,
                useRSIExtreme: true,
                requireEngulfing: true
            },
            entryRules: {
                buy: [
                    'RSI < 30 (oversold)',
                    'Price at or below lower BB',
                    'Bullish engulfing pattern',
                    'Support level hold'
                ],
                sell: [
                    'RSI > 70 (overbought)',
                    'Price at or above upper BB',
                    'Bearish engulfing pattern',
                    'Resistance level hold'
                ]
            },
            exitRules: {
                takeProfit: 'Middle BB or opposite band',
                stopLoss: 'Below/above entry candle',
                trailingStop: false
            },
            riskProfile: 'low',
            priority: 'MEDIUM'
        };
    }

    /**
     * Get BREAKOUT_MOMENTUM strategy configuration
     */
    getBreakoutStrategy(marketCondition) {
        const volatility = marketCondition?.volatility || 'NORMAL';
        const isHighVol = volatility === 'HIGH';

        return {
            name: 'BREAKOUT_MOMENTUM',
            marketType: 'BREAKOUT',
            direction: 'MOMENTUM',
            bias: 'MOMENTUM',
            params: {
                rsiBuyThreshold: 50,        // Neutral for breakout
                rsiSellThreshold: 50,
                minScore: isHighVol ? 8 : 7,  // Higher threshold for high vol
                useVolatilityFilter: true,
                requireConfirmation: true,
                waitForPullback: isHighVol
            },
            entryRules: {
                buy: [
                    'BB width expansion > 5%',
                    'Break above resistance',
                    'Volume confirmation',
                    'Momentum candle'
                ],
                sell: [
                    'BB width expansion > 5%',
                    'Break below support',
                    'Volume confirmation',
                    'Momentum candle'
                ]
            },
            exitRules: {
                takeProfit: '3:1 R:R (momentum target)',
                stopLoss: 'Below/above breakout level',
                trailingStop: true,
                timeStop: '2-3 candles'
            },
            riskProfile: 'high',
            priority: isHighVol ? 'LOW' : 'MEDIUM'  // Lower priority in high vol
        };
    }

    /**
     * Get default strategy when market condition is unknown
     */
    getDefaultStrategy() {
        return {
            name: 'SNIPER_ENTRY',
            marketType: 'UNKNOWN',
            direction: 'NEUTRAL',
            bias: 'NEUTRAL',
            params: {
                rsiBuyThreshold: 25,
                rsiSellThreshold: 75,
                minScore: 8,  // Very high threshold for unknown conditions
                conservativeMode: true
            },
            entryRules: {
                buy: ['Wait for clear signal'],
                sell: ['Wait for clear signal']
            },
            exitRules: {
                takeProfit: '1.5:1 R:R',
                stopLoss: 'Tight stop',
                trailingStop: false
            },
            riskProfile: 'very_low',
            priority: 'LOW'
        };
    }

    /**
     * Analyze market using selected strategy
     */
    analyze(candles, indicators, marketCondition) {
        try {
            const strategy = this.selectStrategy(marketCondition);
            
            // Use sniper entry as base analysis
            const sniperResult = this.sniperEntry.analyze(candles, indicators);
            
            // Adjust based on strategy
            const adjustedResult = this.adjustForStrategy(sniperResult, strategy, indicators);
            
            return {
                strategy: strategy.name,
                marketType: strategy.marketType,
                direction: adjustedResult.signal,
                score: adjustedResult.score,
                confidence: adjustedResult.confidence,
                conditions: adjustedResult.conditions,
                params: strategy.params,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            logger.error('Strategy analysis failed', error);
            return {
                strategy: 'ERROR',
                direction: 'NONE',
                score: 0,
                confidence: 'NONE'
            };
        }
    }

    /**
     * Adjust sniper entry result based on strategy
     */
    adjustForStrategy(sniperResult, strategy, indicators) {
        let score = sniperResult.score;
        let confidence = sniperResult.confidence;
        let signal = sniperResult.signal;
        
        // Apply strategy-specific filters
        switch (strategy.name) {
            case 'TREND_FOLLOWING':
                // Boost score for trend-aligned signals
                if (strategy.bias === 'BULLISH' && signal === 'BUY') {
                    score *= 1.2;
                    confidence = 'SNIPPER';
                } else if (strategy.bias === 'BEARISH' && signal === 'SELL') {
                    score *= 1.2;
                    confidence = 'SNIPPER';
                }
                // Reduce score for counter-trend signals
                else if ((strategy.bias === 'BULLISH' && signal === 'SELL') ||
                         (strategy.bias === 'BEARISH' && signal === 'BUY')) {
                    score *= 0.5;
                    confidence = 'LOW';
                }
                break;
                
            case 'RANGE_REVERSAL':
                // Reversal strategy - keep sniper logic
                // Already optimized for range bound markets
                break;
                
            case 'BREAKOUT_MOMENTUM':
                // Require higher scores for breakout
                if (score < strategy.params.minScore) {
                    signal = 'NONE';
                    confidence = 'LOW';
                }
                break;
        }
        
        return {
            ...sniperResult,
            score: Math.min(10, score),
            confidence,
            signal
        };
    }

    /**
     * Get current strategy info
     */
    getCurrentStrategy() {
        return this.currentStrategy;
    }

    /**
     * Get strategy statistics
     */
    getStrategyStats() {
        return {
            availableStrategies: Object.keys(this.strategies),
            currentStrategy: this.currentStrategy?.name || 'NONE',
            lastMarketCondition: this.lastMarketCondition
        };
    }
}

module.exports = StrategySelector;
