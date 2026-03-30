const logger = require('../utils/logger');

class MarketDetector {
    constructor() {
        this.name = 'MarketDetector';
        this.adxThreshold = 25;
        this.bbSqueezeThreshold = 2;
        this.bbExpansionThreshold = 4;
    }

    /**
     * Simple detect method for stress test compatibility
     * Analyzes candles to determine market condition
     */
    detect(candles, rsiValue = 50) {
        try {
            // Calculate volatility from candles
            const volatility = this.calculateVolatilityFromCandles(candles);
            
            // Determine market condition based on RSI and volatility
            let overall = 'SIDEWAYS';
            if (rsiValue > 60) {
                overall = 'TRENDING_UP';
            } else if (rsiValue < 40) {
                overall = 'TRENDING_DOWN';
            } else if (volatility === 'HIGH') {
                overall = 'BREAKOUT';
            }
            
            return {
                trend: overall,
                volatility: volatility,
                momentum: rsiValue > 50 ? 'BULLISH' : 'BEARISH',
                overall: overall
            };
        } catch (error) {
            logger.error('Detect failed', error);
            return {
                trend: 'UNKNOWN',
                volatility: 'NORMAL',
                momentum: 'NEUTRAL',
                overall: 'SIDEWAYS'
            };
        }
    }

    calculateVolatilityFromCandles(candles) {
        if (!candles || candles.length < 2) return 'NORMAL';
        
        let totalRange = 0;
        for (let i = 1; i < candles.length; i++) {
            totalRange += Math.abs(candles[i].close - candles[i-1].close);
        }
        const avgRange = totalRange / (candles.length - 1);
        
        if (avgRange > 0.0008) return 'HIGH';
        if (avgRange < 0.0002) return 'LOW';
        return 'NORMAL';
    }

    detectMarketCondition(indicators) {
        try {
            const { rsi, macd, bollingerBands, movingAverages } = indicators;
            
            const marketCondition = {
                trend: this.detectTrend(movingAverages, macd),
                volatility: this.detectVolatility(bollingerBands),
                momentum: this.detectMomentum(rsi, macd),
                overall: 'UNKNOWN'
            };

            marketCondition.overall = this.determineOverallCondition(marketCondition);
            
            logger.debug('Market condition detected', marketCondition);
            return marketCondition;
        } catch (error) {
            logger.error('Market detection failed', error);
            throw error;
        }
    }

    detectTrend(movingAverages, macd) {
        try {
            if (!movingAverages || !macd) {
                return 'UNKNOWN';
            }

            const maTrend = movingAverages.trend;
            const macdSignal = macd.signal;
            
            // Strong trend conditions
            if (maTrend === 'STRONG_UPTREND' && macdSignal === 'BULLISH') {
                return 'STRONG_UPTREND';
            }
            if (maTrend === 'STRONG_DOWNTREND' && macdSignal === 'BEARISH') {
                return 'STRONG_DOWNTREND';
            }
            
            // Weak trend conditions
            if (maTrend === 'WEAK_UPTREND' || (maTrend === 'STRONG_UPTREND' && macdSignal !== 'BULLISH')) {
                return 'WEAK_UPTREND';
            }
            if (maTrend === 'WEAK_DOWNTREND' || (maTrend === 'STRONG_DOWNTREND' && macdSignal !== 'BEARISH')) {
                return 'WEAK_DOWNTREND';
            }
            
            // Sideways conditions
            if (maTrend === 'SIDEWAYS') {
                return 'SIDEWAYS';
            }
            
            return 'UNKNOWN';
        } catch (error) {
            logger.error('Trend detection failed', error);
            return 'UNKNOWN';
        }
    }

    detectVolatility(bollingerBands) {
        try {
            if (!bollingerBands) {
                return 'UNKNOWN';
            }

            const width = bollingerBands.width;
            
            if (width < this.bbSqueezeThreshold) {
                return 'LOW'; // Squeeze - potential breakout
            } else if (width > this.bbExpansionThreshold) {
                return 'HIGH'; // Expansion - volatile
            } else {
                return 'NORMAL';
            }
        } catch (error) {
            logger.error('Volatility detection failed', error);
            return 'UNKNOWN';
        }
    }

    detectMomentum(rsi, macd) {
        try {
            if (!rsi || !macd) {
                return 'UNKNOWN';
            }

            const rsiSignal = rsi.signal;
            const macdSignal = macd.signal;
            
            // Strong momentum
            if (rsiSignal === 'OVERBOUGHT' && macdSignal === 'BULLISH') {
                return 'STRONG_BULLISH';
            }
            if (rsiSignal === 'OVERSOLD' && macdSignal === 'BEARISH') {
                return 'STRONG_BEARISH';
            }
            
            // Moderate momentum
            if (rsiSignal === 'BULLISH' && macdSignal === 'BULLISH') {
                return 'BULLISH';
            }
            if (rsiSignal === 'BEARISH' && macdSignal === 'BEARISH') {
                return 'BEARISH';
            }
            
            // Neutral/mixed signals
            return 'NEUTRAL';
        } catch (error) {
            logger.error('Momentum detection failed', error);
            return 'UNKNOWN';
        }
    }

    determineOverallCondition(marketCondition) {
        const { trend, volatility, momentum } = marketCondition;
        
        // Trending market
        if (trend.includes('UPTREND') || trend.includes('DOWNTREND')) {
            if (volatility === 'HIGH') {
                return 'TRENDING_VOLATILE';
            } else {
                return 'TRENDING';
            }
        }
        
        // Breakout setup
        if (volatility === 'LOW' && trend === 'SIDEWAYS') {
            return 'BREAKOUT_SETUP';
        }
        
        // Breakout happening
        if (volatility === 'HIGH' && trend === 'SIDEWAYS') {
            return 'BREAKOUT';
        }
        
        // Sideways market
        if (trend === 'SIDEWAYS' && volatility === 'NORMAL') {
            return 'SIDEWAYS';
        }
        
        // Default
        return 'UNKNOWN';
    }

    isTrending(marketCondition) {
        return marketCondition.overall.includes('TRENDING');
    }

    isSideways(marketCondition) {
        return marketCondition.overall === 'SIDEWAYS';
    }

    isBreakoutSetup(marketCondition) {
        return marketCondition.overall === 'BREAKOUT_SETUP';
    }

    isBreakout(marketCondition) {
        return marketCondition.overall === 'BREAKOUT';
    }

    isVolatile(marketCondition) {
        return marketCondition.volatility === 'HIGH';
    }

    isQuiet(marketCondition) {
        return marketCondition.volatility === 'LOW';
    }

    /**
     * Check if we should trade in current market condition
     * Only block weak signals in volatile markets, allow strong signals
     */
    shouldTrade(marketCondition, signalStrength = 'medium') {
        // Always allow high confidence signals
        if (signalStrength === 'high' || signalStrength === 'snipper') {
            return true;
        }
        
        // Block medium/low signals in volatile markets
        if (marketCondition.volatility === 'HIGH' && signalStrength !== 'high') {
            return false;
        }
        
        // Block medium/low signals in breakout
        if (marketCondition.overall === 'BREAKOUT' && signalStrength !== 'high') {
            return false;
        }
        
        return true;
    }

    getRecommendedStrategy(marketCondition) {
        switch (marketCondition.overall) {
            case 'TRENDING':
            case 'TRENDING_VOLATILE':
                return 'TREND';
            case 'SIDEWAYS':
                return 'REVERSAL';
            case 'BREAKOUT_SETUP':
            case 'BREAKOUT':
                return 'BREAKOUT';
            default:
                return 'NONE';
        }
    }

    getMarketStrength(marketCondition) {
        let strength = 0;
        
        // Trend strength
        if (marketCondition.trend.includes('STRONG')) strength += 2;
        else if (marketCondition.trend.includes('WEAK')) strength += 1;
        
        // Volatility contribution
        if (marketCondition.volatility === 'HIGH') strength += 1;
        else if (marketCondition.volatility === 'LOW') strength -= 1;
        
        // Momentum contribution
        if (marketCondition.momentum.includes('STRONG')) strength += 2;
        else if (marketCondition.momentum === 'BULLISH' || marketCondition.momentum === 'BEARISH') strength += 1;
        
        return Math.max(0, Math.min(5, strength)); // Scale 0-5
    }
}

module.exports = MarketDetector;
