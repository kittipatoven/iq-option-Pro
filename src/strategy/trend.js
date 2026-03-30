const logger = require('../utils/logger');

class TrendStrategy {
    constructor() {
        this.name = 'TrendStrategy';
        this.description = 'Moving Average + MACD trend following strategy';
    }

    analyze(indicators, marketCondition) {
        try {
            const { movingAverages, macd, rsi } = indicators;
            
            if (!movingAverages || !macd || !rsi) {
                throw new Error('Missing required indicators for trend strategy');
            }

            const signals = {
                entry: 'NONE',
                direction: 'NONE',
                strength: 0,
                reasons: []
            };

            // Check for uptrend conditions (buy signal)
            if (this.isUptrend(movingAverages, macd, rsi)) {
                signals.entry = 'BUY';
                signals.direction = 'CALL';
                signals.strength = this.calculateStrength(movingAverages, macd, rsi, 'BUY');
                signals.reasons = this.getTrendReasons(movingAverages, macd, rsi, 'BUY');
            }
            // Check for downtrend conditions (sell signal)
            else if (this.isDowntrend(movingAverages, macd, rsi)) {
                signals.entry = 'SELL';
                signals.direction = 'PUT';
                signals.strength = this.calculateStrength(movingAverages, macd, rsi, 'SELL');
                signals.reasons = this.getTrendReasons(movingAverages, macd, rsi, 'SELL');
            }

            const result = {
                strategy: this.name,
                signals: signals,
                confidence: this.calculateConfidence(signals, marketCondition),
                recommended: signals.entry !== 'NONE'
            };

            logger.debug('Trend strategy analysis completed', result);
            return result;
        } catch (error) {
            logger.error('Trend strategy analysis failed', error);
            throw error;
        }
    }

    isUptrend(movingAverages, macd, rsi) {
        try {
            // Price above both EMAs
            const priceAbove50 = movingAverages.isPriceAboveEMA50(movingAverages.currentPrice, movingAverages.ema50.current);
            const priceAbove200 = movingAverages.isPriceAboveEMA200(movingAverages.currentPrice, movingAverages.ema200.current);
            
            // EMA50 above EMA200 (golden cross or already above)
            const emaAbove = movingAverages.ema50.current > movingAverages.ema200.current;
            
            // MACD bullish
            const macdBullish = macd.isAboveSignal() || macd.isBullishCross();
            
            // RSI not overbought
            const rsiNotOverbought = !rsi.isOverbought(rsi.current, 70);
            
            // Need at least 3 of 4 conditions
            const conditions = [priceAbove50, priceAbove200, emaAbove, macdBullish, rsiNotOverbought].filter(Boolean).length;
            
            return conditions >= 3;
        } catch (error) {
            logger.error('Uptrend check failed', error);
            return false;
        }
    }

    isDowntrend(movingAverages, macd, rsi) {
        try {
            // Price below both EMAs
            const priceBelow50 = !movingAverages.isPriceAboveEMA50(movingAverages.currentPrice, movingAverages.ema50.current);
            const priceBelow200 = !movingAverages.isPriceAboveEMA200(movingAverages.currentPrice, movingAverages.ema200.current);
            
            // EMA50 below EMA200 (death cross or already below)
            const emaBelow = movingAverages.ema50.current < movingAverages.ema200.current;
            
            // MACD bearish
            const macdBearish = macd.isBelowSignal() || macd.isBearishCross();
            
            // RSI not oversold
            const rsiNotOversold = !rsi.isOversold(rsi.current, 30);
            
            // Need at least 3 of 4 conditions
            const conditions = [priceBelow50, priceBelow200, emaBelow, macdBearish, rsiNotOversold].filter(Boolean).length;
            
            return conditions >= 3;
        } catch (error) {
            logger.error('Downtrend check failed', error);
            return false;
        }
    }

    calculateStrength(movingAverages, macd, rsi, direction) {
        try {
            let strength = 0;
            
            if (direction === 'BUY') {
                // Moving averages contribution
                if (movingAverages.isGoldenCross(movingAverages.ema50, movingAverages.ema200)) strength += 3;
                else if (movingAverages.ema50.current > movingAverages.ema200.current) strength += 2;
                
                // Price position contribution
                if (movingAverages.currentPrice > movingAverages.ema50.current * 1.01) strength += 1;
                
                // MACD contribution
                if (macd.isBullishCross()) strength += 2;
                else if (macd.isAboveSignal()) strength += 1;
                
                // MACD histogram strength
                if (macd.current.histogram > 0.002) strength += 1;
                
                // RSI contribution (not too overbought)
                if (rsi.current > 40 && rsi.current < 60) strength += 1;
                else if (rsi.current > 30 && rsi.current < 70) strength += 0.5;
            } else if (direction === 'SELL') {
                // Moving averages contribution
                if (movingAverages.isDeathCross(movingAverages.ema50, movingAverages.ema200)) strength += 3;
                else if (movingAverages.ema50.current < movingAverages.ema200.current) strength += 2;
                
                // Price position contribution
                if (movingAverages.currentPrice < movingAverages.ema50.current * 0.99) strength += 1;
                
                // MACD contribution
                if (macd.isBearishCross()) strength += 2;
                else if (macd.isBelowSignal()) strength += 1;
                
                // MACD histogram strength
                if (macd.current.histogram < -0.002) strength += 1;
                
                // RSI contribution (not too oversold)
                if (rsi.current < 60 && rsi.current > 40) strength += 1;
                else if (rsi.current < 70 && rsi.current > 30) strength += 0.5;
            }
            
            return Math.min(5, strength); // Scale 0-5
        } catch (error) {
            logger.error('Strength calculation failed', error);
            return 0;
        }
    }

    getTrendReasons(movingAverages, macd, rsi, direction) {
        try {
            const reasons = [];
            
            if (direction === 'BUY') {
                if (movingAverages.isGoldenCross(movingAverages.ema50, movingAverages.ema200)) {
                    reasons.push('Golden cross detected');
                } else if (movingAverages.ema50.current > movingAverages.ema200.current) {
                    reasons.push('EMA50 above EMA200');
                }
                
                if (movingAverages.currentPrice > movingAverages.ema50.current) {
                    reasons.push('Price above EMA50');
                }
                
                if (macd.isBullishCross()) {
                    reasons.push('MACD bullish crossover');
                } else if (macd.isAboveSignal()) {
                    reasons.push('MACD above signal line');
                }
                
                if (rsi.current > 40 && rsi.current < 70) {
                    reasons.push(`RSI healthy at ${rsi.current.toFixed(2)}`);
                }
            } else if (direction === 'SELL') {
                if (movingAverages.isDeathCross(movingAverages.ema50, movingAverages.ema200)) {
                    reasons.push('Death cross detected');
                } else if (movingAverages.ema50.current < movingAverages.ema200.current) {
                    reasons.push('EMA50 below EMA200');
                }
                
                if (movingAverages.currentPrice < movingAverages.ema50.current) {
                    reasons.push('Price below EMA50');
                }
                
                if (macd.isBearishCross()) {
                    reasons.push('MACD bearish crossover');
                } else if (macd.isBelowSignal()) {
                    reasons.push('MACD below signal line');
                }
                
                if (rsi.current < 60 && rsi.current > 30) {
                    reasons.push(`RSI healthy at ${rsi.current.toFixed(2)}`);
                }
            }
            
            return reasons;
        } catch (error) {
            logger.error('Getting trend reasons failed', error);
            return [];
        }
    }

    calculateConfidence(signals, marketCondition) {
        try {
            if (signals.entry === 'NONE') {
                return 0;
            }
            
            let confidence = signals.strength * 20; // Base confidence from strength (0-100)
            
            // Market condition adjustment
            if (marketCondition.overall.includes('TRENDING')) {
                confidence += 25; // Bonus for trending markets
            } else if (marketCondition.overall === 'SIDEWAYS') {
                confidence -= 15; // Penalty for sideways markets
            }
            
            // Trend strength adjustment
            if (marketCondition.trend.includes('STRONG')) {
                confidence += 15;
            } else if (marketCondition.trend.includes('WEAK')) {
                confidence -= 5;
            }
            
            // Momentum adjustment
            if (signals.direction === 'CALL' && marketCondition.momentum.includes('BULLISH')) {
                confidence += 10;
            } else if (signals.direction === 'PUT' && marketCondition.momentum.includes('BEARISH')) {
                confidence += 10;
            }
            
            return Math.max(0, Math.min(100, confidence));
        } catch (error) {
            logger.error('Confidence calculation failed', error);
            return 0;
        }
    }

    isApplicable(marketCondition) {
        return marketCondition.overall.includes('TRENDING') || 
               marketCondition.trend.includes('UPTREND') || 
               marketCondition.trend.includes('DOWNTREND');
    }
}

module.exports = TrendStrategy;
