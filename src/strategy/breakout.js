const logger = require('../utils/logger');

class BreakoutStrategy {
    constructor() {
        this.name = 'BreakoutStrategy';
        this.description = 'Support/Resistance + Moving Average breakout strategy';
    }

    analyze(indicators, marketCondition, candles) {
        try {
            const { movingAverages, macd, rsi, bollingerBands } = indicators;
            
            if (!movingAverages || !macd || !rsi || !bollingerBands || !candles) {
                throw new Error('Missing required indicators/data for breakout strategy');
            }

            const signals = {
                entry: 'NONE',
                direction: 'NONE',
                strength: 0,
                reasons: []
            };

            // Calculate support/resistance levels
            const srLevels = this.calculateSupportResistance(candles);
            
            // Check for upward breakout
            if (this.isUpwardBreakout(candles, srLevels, movingAverages, macd, rsi, bollingerBands)) {
                signals.entry = 'BUY';
                signals.direction = 'CALL';
                signals.strength = this.calculateStrength('BUY', srLevels, movingAverages, macd, rsi, bollingerBands);
                signals.reasons = this.getBreakoutReasons('BUY', srLevels, movingAverages, macd, rsi, bollingerBands);
            }
            // Check for downward breakout
            else if (this.isDownwardBreakout(candles, srLevels, movingAverages, macd, rsi, bollingerBands)) {
                signals.entry = 'SELL';
                signals.direction = 'PUT';
                signals.strength = this.calculateStrength('SELL', srLevels, movingAverages, macd, rsi, rsi, bollingerBands);
                signals.reasons = this.getBreakoutReasons('SELL', srLevels, movingAverages, macd, rsi, bollingerBands);
            }

            const result = {
                strategy: this.name,
                signals: signals,
                supportResistance: srLevels,
                confidence: this.calculateConfidence(signals, marketCondition),
                recommended: signals.entry !== 'NONE'
            };

            logger.debug('Breakout strategy analysis completed', result);
            return result;
        } catch (error) {
            logger.error('Breakout strategy analysis failed', error);
            throw error;
        }
    }

    calculateSupportResistance(candles, lookback = 20) {
        try {
            const recentCandles = candles.slice(-lookback);
            const highs = recentCandles.map(c => c.high);
            const lows = recentCandles.map(c => c.low);
            
            // Find resistance levels (recent highs)
            const resistanceLevels = [];
            for (let i = 2; i < highs.length - 2; i++) {
                if (highs[i] > highs[i-1] && highs[i] > highs[i-2] && 
                    highs[i] > highs[i+1] && highs[i] > highs[i+2]) {
                    resistanceLevels.push(highs[i]);
                }
            }
            
            // Find support levels (recent lows)
            const supportLevels = [];
            for (let i = 2; i < lows.length - 2; i++) {
                if (lows[i] < lows[i-1] && lows[i] < lows[i-2] && 
                    lows[i] < lows[i+1] && lows[i] < lows[i+2]) {
                    supportLevels.push(lows[i]);
                }
            }
            
            // Get the most recent and significant levels
            const currentPrice = candles[candles.length - 1].close;
            
            const nearestResistance = resistanceLevels
                .filter(level => level > currentPrice)
                .sort((a, b) => a - b)[0];
            
            const nearestSupport = supportLevels
                .filter(level => level < currentPrice)
                .sort((a, b) => b - a)[0];
            
            return {
                support: nearestSupport,
                resistance: nearestResistance,
                allSupport: supportLevels,
                allResistance: resistanceLevels
            };
        } catch (error) {
            logger.error('Support/Resistance calculation failed', error);
            return { support: null, resistance: null, allSupport: [], allResistance: [] };
        }
    }

    isUpwardBreakout(candles, srLevels, movingAverages, macd, rsi, bollingerBands) {
        try {
            const currentPrice = candles[candles.length - 1].close;
            const previousPrice = candles[candles.length - 2].close;
            
            // Break above resistance
            const resistanceBreak = srLevels.resistance && 
                previousPrice <= srLevels.resistance && 
                currentPrice > srLevels.resistance;
            
            // Break above Bollinger upper band
            const bbBreak = previousPrice <= bollingerBands.current.upper && 
                          currentPrice > bollingerBands.current.upper;
            
            // Volume confirmation (using price range as proxy)
            const priceRange = currentPrice - previousPrice;
            const avgRange = this.calculateAverageRange(candles.slice(-10));
            const volumeConfirmation = priceRange > avgRange * 1.5;
            
            // MACD confirmation
            const macdConfirmation = macd.isAboveSignal() || macd.isBullishCross();
            
            // RSI not overbought (or just entering overbought)
            const rsiConfirmation = rsi.current > 50 && rsi.current < 80;
            
            // Moving average confirmation
            const maConfirmation = movingAverages.currentPrice > movingAverages.ema50.current;
            
            // Need at least 3 of 5 conditions
            const conditions = [
                resistanceBreak, 
                bbBreak, 
                volumeConfirmation, 
                macdConfirmation, 
                rsiConfirmation,
                maConfirmation
            ].filter(Boolean).length;
            
            return conditions >= 3;
        } catch (error) {
            logger.error('Upward breakout check failed', error);
            return false;
        }
    }

    isDownwardBreakout(candles, srLevels, movingAverages, macd, rsi, bollingerBands) {
        try {
            const currentPrice = candles[candles.length - 1].close;
            const previousPrice = candles[candles.length - 2].close;
            
            // Break below support
            const supportBreak = srLevels.support && 
                previousPrice >= srLevels.support && 
                currentPrice < srLevels.support;
            
            // Break below Bollinger lower band
            const bbBreak = previousPrice >= bollingerBands.current.lower && 
                          currentPrice < bollingerBands.current.lower;
            
            // Volume confirmation (using price range as proxy)
            const priceRange = previousPrice - currentPrice;
            const avgRange = this.calculateAverageRange(candles.slice(-10));
            const volumeConfirmation = priceRange > avgRange * 1.5;
            
            // MACD confirmation
            const macdConfirmation = macd.isBelowSignal() || macd.isBearishCross();
            
            // RSI not oversold (or just entering oversold)
            const rsiConfirmation = rsi.current < 50 && rsi.current > 20;
            
            // Moving average confirmation
            const maConfirmation = movingAverages.currentPrice < movingAverages.ema50.current;
            
            // Need at least 3 of 5 conditions
            const conditions = [
                supportBreak, 
                bbBreak, 
                volumeConfirmation, 
                macdConfirmation, 
                rsiConfirmation,
                maConfirmation
            ].filter(Boolean).length;
            
            return conditions >= 3;
        } catch (error) {
            logger.error('Downward breakout check failed', error);
            return false;
        }
    }

    calculateAverageRange(candles) {
        try {
            if (candles.length < 2) return 0;
            
            const ranges = candles.slice(1).map((candle, index) => 
                Math.abs(candle.close - candles[index].close)
            );
            
            return ranges.reduce((sum, range) => sum + range, 0) / ranges.length;
        } catch (error) {
            logger.error('Average range calculation failed', error);
            return 0;
        }
    }

    calculateStrength(direction, srLevels, movingAverages, macd, rsi, bollingerBands) {
        try {
            let strength = 0;
            
            if (direction === 'BUY') {
                // Resistance breakout strength
                if (srLevels.resistance) strength += 2;
                
                // Bollinger Bands breakout
                if (bollingerBands.position === 'UPPER_BAND') strength += 2;
                
                // MACD strength
                if (macd.isBullishCross()) strength += 2;
                else if (macd.isAboveSignal()) strength += 1;
                
                // RSI momentum
                if (rsi.current > 55 && rsi.current < 75) strength += 1;
                
                // Moving average confirmation
                if (movingAverages.currentPrice > movingAverages.ema50.current) strength += 1;
                
                // Trend alignment
                if (movingAverages.trend.includes('UPTREND')) strength += 1;
            } else if (direction === 'SELL') {
                // Support breakout strength
                if (srLevels.support) strength += 2;
                
                // Bollinger Bands breakout
                if (bollingerBands.position === 'LOWER_BAND') strength += 2;
                
                // MACD strength
                if (macd.isBearishCross()) strength += 2;
                else if (macd.isBelowSignal()) strength += 1;
                
                // RSI momentum
                if (rsi.current < 45 && rsi.current > 25) strength += 1;
                
                // Moving average confirmation
                if (movingAverages.currentPrice < movingAverages.ema50.current) strength += 1;
                
                // Trend alignment
                if (movingAverages.trend.includes('DOWNTREND')) strength += 1;
            }
            
            return Math.min(5, strength); // Scale 0-5
        } catch (error) {
            logger.error('Strength calculation failed', error);
            return 0;
        }
    }

    getBreakoutReasons(direction, srLevels, movingAverages, macd, rsi, bollingerBands) {
        try {
            const reasons = [];
            
            if (direction === 'BUY') {
                if (srLevels.resistance) {
                    reasons.push(`Break above resistance at ${srLevels.resistance.toFixed(5)}`);
                }
                
                if (bollingerBands.position === 'UPPER_BAND') {
                    reasons.push('Break above Bollinger upper band');
                }
                
                if (macd.isBullishCross()) {
                    reasons.push('MACD bullish crossover');
                } else if (macd.isAboveSignal()) {
                    reasons.push('MACD above signal line');
                }
                
                if (rsi.current > 50) {
                    reasons.push(`RSI momentum at ${rsi.current.toFixed(2)}`);
                }
                
                if (movingAverages.currentPrice > movingAverages.ema50.current) {
                    reasons.push('Price above EMA50');
                }
            } else if (direction === 'SELL') {
                if (srLevels.support) {
                    reasons.push(`Break below support at ${srLevels.support.toFixed(5)}`);
                }
                
                if (bollingerBands.position === 'LOWER_BAND') {
                    reasons.push('Break below Bollinger lower band');
                }
                
                if (macd.isBearishCross()) {
                    reasons.push('MACD bearish crossover');
                } else if (macd.isBelowSignal()) {
                    reasons.push('MACD below signal line');
                }
                
                if (rsi.current < 50) {
                    reasons.push(`RSI momentum at ${rsi.current.toFixed(2)}`);
                }
                
                if (movingAverages.currentPrice < movingAverages.ema50.current) {
                    reasons.push('Price below EMA50');
                }
            }
            
            return reasons;
        } catch (error) {
            logger.error('Getting breakout reasons failed', error);
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
            if (marketCondition.overall === 'BREAKOUT') {
                confidence += 30; // Big bonus for confirmed breakout
            } else if (marketCondition.overall === 'BREAKOUT_SETUP') {
                confidence += 15; // Moderate bonus for breakout setup
            } else if (marketCondition.overall === 'SIDEWAYS') {
                confidence -= 10; // Penalty for sideways markets
            }
            
            // Volatility adjustment
            if (marketCondition.volatility === 'HIGH') {
                confidence += 15; // Bonus for high volatility
            } else if (marketCondition.volatility === 'LOW') {
                confidence -= 15; // Penalty for low volatility
            }
            
            return Math.max(0, Math.min(100, confidence));
        } catch (error) {
            logger.error('Confidence calculation failed', error);
            return 0;
        }
    }

    isApplicable(marketCondition) {
        return marketCondition.overall === 'BREAKOUT' || 
               marketCondition.overall === 'BREAKOUT_SETUP' ||
               marketCondition.volatility === 'HIGH';
    }
}

module.exports = BreakoutStrategy;
