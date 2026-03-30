const logger = require('../utils/logger');

class ReversalStrategy {
    constructor() {
        this.name = 'ReversalStrategy';
        this.description = 'RSI + Bollinger Bands reversal strategy for sideways markets';
    }

    analyze(indicators, marketCondition) {
        try {
            const { rsi, bollingerBands, macd } = indicators;
            
            if (!rsi || !bollingerBands || !macd) {
                throw new Error('Missing required indicators for reversal strategy');
            }

            const signals = {
                entry: 'NONE',
                direction: 'NONE',
                strength: 0,
                reasons: []
            };

            // Check for oversold conditions (buy signal)
            if (this.isOversoldReversal(rsi, bollingerBands, macd)) {
                signals.entry = 'BUY';
                signals.direction = 'CALL';
                signals.strength = this.calculateStrength(rsi, bollingerBands, macd, 'BUY');
                signals.reasons = this.getReversalReasons(rsi, bollingerBands, macd, 'BUY');
            }
            // Check for overbought conditions (sell signal)
            else if (this.isOverboughtReversal(rsi, bollingerBands, macd)) {
                signals.entry = 'SELL';
                signals.direction = 'PUT';
                signals.strength = this.calculateStrength(rsi, bollingerBands, macd, 'SELL');
                signals.reasons = this.getReversalReasons(rsi, bollingerBands, macd, 'SELL');
            }

            const result = {
                strategy: this.name,
                signals: signals,
                confidence: this.calculateConfidence(signals, marketCondition),
                recommended: signals.entry !== 'NONE'
            };

            logger.debug('Reversal strategy analysis completed', result);
            return result;
        } catch (error) {
            logger.error('Reversal strategy analysis failed', error);
            throw error;
        }
    }

    isOversoldReversal(rsi, bollingerBands, macd) {
        try {
            // RSI oversold
            const rsiOversold = rsi.isOversold(rsi.current, 30);
            
            // Price at or below lower Bollinger Band
            const atLowerBand = bollingerBands.isAtLowerBand();
            
            // MACD showing bullish divergence or crossover
            const macdBullish = macd.isBullishCross() || macd.isAboveSignal();
            
            // Need at least 2 of 3 conditions
            const conditions = [rsiOversold, atLowerBand, macdBullish].filter(Boolean).length;
            
            return conditions >= 2;
        } catch (error) {
            logger.error('Oversold reversal check failed', error);
            return false;
        }
    }

    isOverboughtReversal(rsi, bollingerBands, macd) {
        try {
            // RSI overbought
            const rsiOverbought = rsi.isOverbought(rsi.current, 70);
            
            // Price at or above upper Bollinger Band
            const atUpperBand = bollingerBands.isAtUpperBand();
            
            // MACD showing bearish divergence or crossover
            const macdBearish = macd.isBearishCross() || macd.isBelowSignal();
            
            // Need at least 2 of 3 conditions
            const conditions = [rsiOverbought, atUpperBand, macdBearish].filter(Boolean).length;
            
            return conditions >= 2;
        } catch (error) {
            logger.error('Overbought reversal check failed', error);
            return false;
        }
    }

    calculateStrength(rsi, bollingerBands, macd, direction) {
        try {
            let strength = 0;
            
            if (direction === 'BUY') {
                // RSI contribution
                if (rsi.current < 25) strength += 2;
                else if (rsi.current < 30) strength += 1;
                
                // Bollinger Bands contribution
                if (bollingerBands.position === 'LOWER_BAND') strength += 2;
                else if (bollingerBands.position === 'NORMAL' && bollingerBands.current.price < bollingerBands.current.lower * 1.02) strength += 1;
                
                // MACD contribution
                if (macd.isBullishCross()) strength += 2;
                else if (macd.isAboveSignal()) strength += 1;
                
                // Histogram strength
                if (macd.current.histogram > 0.001) strength += 1;
            } else if (direction === 'SELL') {
                // RSI contribution
                if (rsi.current > 75) strength += 2;
                else if (rsi.current > 70) strength += 1;
                
                // Bollinger Bands contribution
                if (bollingerBands.position === 'UPPER_BAND') strength += 2;
                else if (bollingerBands.position === 'NORMAL' && bollingerBands.current.price > bollingerBands.current.upper * 0.98) strength += 1;
                
                // MACD contribution
                if (macd.isBearishCross()) strength += 2;
                else if (macd.isBelowSignal()) strength += 1;
                
                // Histogram strength
                if (macd.current.histogram < -0.001) strength += 1;
            }
            
            return Math.min(5, strength); // Scale 0-5
        } catch (error) {
            logger.error('Strength calculation failed', error);
            return 0;
        }
    }

    getReversalReasons(rsi, bollingerBands, macd, direction) {
        try {
            const reasons = [];
            
            if (direction === 'BUY') {
                if (rsi.isOversold(rsi.current, 30)) {
                    reasons.push(`RSI oversold at ${rsi.current.toFixed(2)}`);
                }
                if (bollingerBands.isAtLowerBand()) {
                    reasons.push('Price at lower Bollinger Band');
                }
                if (macd.isBullishCross()) {
                    reasons.push('MACD bullish crossover');
                } else if (macd.isAboveSignal()) {
                    reasons.push('MACD above signal line');
                }
            } else if (direction === 'SELL') {
                if (rsi.isOverbought(rsi.current, 70)) {
                    reasons.push(`RSI overbought at ${rsi.current.toFixed(2)}`);
                }
                if (bollingerBands.isAtUpperBand()) {
                    reasons.push('Price at upper Bollinger Band');
                }
                if (macd.isBearishCross()) {
                    reasons.push('MACD bearish crossover');
                } else if (macd.isBelowSignal()) {
                    reasons.push('MACD below signal line');
                }
            }
            
            return reasons;
        } catch (error) {
            logger.error('Getting reversal reasons failed', error);
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
            if (marketCondition.overall === 'SIDEWAYS') {
                confidence += 20; // Bonus for sideways markets
            } else if (marketCondition.overall.includes('TRENDING')) {
                confidence -= 10; // Penalty for trending markets
            }
            
            // Volatility adjustment
            if (marketCondition.volatility === 'NORMAL') {
                confidence += 10;
            } else if (marketCondition.volatility === 'HIGH') {
                confidence -= 10;
            }
            
            return Math.max(0, Math.min(100, confidence));
        } catch (error) {
            logger.error('Confidence calculation failed', error);
            return 0;
        }
    }

    isApplicable(marketCondition) {
        return marketCondition.overall === 'SIDEWAYS' || 
               marketCondition.overall === 'BREAKOUT_SETUP';
    }
}

module.exports = ReversalStrategy;
