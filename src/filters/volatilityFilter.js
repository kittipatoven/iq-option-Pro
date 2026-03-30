const logger = require('../utils/logger');

class VolatilityFilter {
    constructor() {
        this.name = 'VolatilityFilter';
        this.minVolatility = 0.0005; // Minimum volatility threshold
        this.maxVolatility = 0.02;   // Maximum volatility threshold
        this.lookbackPeriod = 20;     // Periods for volatility calculation
    }

    calculateVolatility(candles) {
        try {
            if (!candles || candles.length < this.lookbackPeriod) {
                throw new Error(`Need at least ${this.lookbackPeriod} candles for volatility calculation`);
            }

            const recentCandles = candles.slice(-this.lookbackPeriod);
            const returns = [];
            
            // Calculate logarithmic returns
            for (let i = 1; i < recentCandles.length; i++) {
                const currentPrice = recentCandles[i].close;
                const previousPrice = recentCandles[i - 1].close;
                const logReturn = Math.log(currentPrice / previousPrice);
                returns.push(logReturn);
            }

            // Calculate standard deviation of returns
            const mean = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
            const squaredDiffs = returns.map(ret => Math.pow(ret - mean, 2));
            const variance = squaredDiffs.reduce((sum, diff) => sum + diff, 0) / returns.length;
            const volatility = Math.sqrt(variance);

            return {
                volatility: volatility,
                annualizedVolatility: volatility * Math.sqrt(252 * 24 * 60), // Annualized (assuming 1-minute candles)
                mean: mean,
                period: this.lookbackPeriod,
                currentPrice: recentCandles[recentCandles.length - 1].close
            };
        } catch (error) {
            logger.error('Volatility calculation failed', error);
            throw error;
        }
    }

    calculateTrueRange(candles) {
        try {
            if (!candles || candles.length < 2) {
                throw new Error('Need at least 2 candles for true range calculation');
            }

            const trueRanges = [];
            
            for (let i = 1; i < candles.length; i++) {
                const current = candles[i];
                const previous = candles[i - 1];
                
                const highLow = current.high - current.low;
                const highClose = Math.abs(current.high - previous.close);
                const lowClose = Math.abs(current.low - previous.close);
                
                const trueRange = Math.max(highLow, highClose, lowClose);
                trueRanges.push(trueRange);
            }

            const averageTrueRange = trueRanges.reduce((sum, tr) => sum + tr, 0) / trueRanges.length;
            const currentATR = trueRanges[trueRanges.length - 1];
            
            return {
                atr: averageTrueRange,
                currentATR: currentATR,
                atrPercent: (averageTrueRange / candles[candles.length - 1].close) * 100,
                trueRanges: trueRanges
            };
        } catch (error) {
            logger.error('True range calculation failed', error);
            throw error;
        }
    }

    detectVolatilityRegime(candles) {
        try {
            const volatilityData = this.calculateVolatility(candles);
            const atrData = this.calculateTrueRange(candles);
            
            let regime = 'NORMAL';
            let reasons = [];
            
            // Determine volatility regime
            if (volatilityData.volatility < this.minVolatility) {
                regime = 'LOW';
                reasons.push('Volatility below minimum threshold');
            } else if (volatilityData.volatility > this.maxVolatility) {
                regime = 'HIGH';
                reasons.push('Volatility above maximum threshold');
            }
            
            // Additional checks using ATR
            if (atrData.atrPercent < 0.1) {
                regime = 'LOW';
                reasons.push('ATR percentage very low');
            } else if (atrData.atrPercent > 2.0) {
                regime = 'HIGH';
                reasons.push('ATR percentage very high');
            }
            
            // Check for volatility spikes
            const atrSpike = atrData.currentATR / atrData.atr;
            if (atrSpike > 2.0) {
                regime = 'SPIKE';
                reasons.push('Volatility spike detected');
            }
            
            return {
                regime,
                volatility: volatilityData.volatility,
                atrPercent: atrData.atrPercent,
                atrSpike: atrSpike,
                reasons,
                data: {
                    volatility: volatilityData,
                    atr: atrData
                }
            };
        } catch (error) {
            logger.error('Volatility regime detection failed', error);
            throw error;
        }
    }

    shouldAllowTrading(candles, strategy = null) {
        try {
            const regime = this.detectVolatilityRegime(candles);
            
            let allow = true;
            let reasons = [];
            let confidence = 100;
            
            // Base filtering rules
            switch (regime.regime) {
                case 'LOW':
                    // Low volatility is generally good for most strategies
                    if (strategy === 'BREAKOUT') {
                        allow = false;
                        reasons.push('Low volatility not suitable for breakout strategy');
                        confidence = 30;
                    } else {
                        reasons.push('Low volatility - favorable for range strategies');
                        confidence = 80;
                    }
                    break;
                    
                case 'HIGH':
                    // High volatility can be risky
                    if (strategy === 'REVERSAL') {
                        allow = false;
                        reasons.push('High volatility not suitable for reversal strategy');
                        confidence = 20;
                    } else {
                        reasons.push('High volatility - increased risk');
                        confidence = 60;
                    }
                    break;
                    
                case 'SPIKE':
                    // Volatility spikes are generally dangerous
                    allow = false;
                    reasons.push('Volatility spike detected - trading halted');
                    confidence = 10;
                    break;
                    
                case 'NORMAL':
                    reasons.push('Normal volatility conditions');
                    confidence = 100;
                    break;
            }
            
            return {
                allow,
                confidence,
                regime: regime.regime,
                reasons,
                volatilityData: regime.data
            };
        } catch (error) {
            logger.error('Volatility filter check failed', error);
            return { allow: true, confidence: 50, regime: 'UNKNOWN', reasons: ['Filter error'] };
        }
    }

    getVolatilityScore(candles) {
        try {
            const regime = this.detectVolatilityRegime(candles);
            
            let score = 0;
            
            switch (regime.regime) {
                case 'NORMAL':
                    score = 1.0;
                    break;
                case 'LOW':
                    score = 0.7;
                    break;
                case 'HIGH':
                    score = 0.5;
                    break;
                case 'SPIKE':
                    score = 0.1;
                    break;
                default:
                    score = 0.5;
            }
            
            // Adjust based on ATR spike
            if (regime.atrSpike > 1.5) {
                score *= 0.5; // Penalty for significant ATR spike
            }
            
            return {
                score: Math.max(0, Math.min(1, score)),
                regime: regime.regime,
                volatility: regime.volatility,
                atrPercent: regime.atrPercent
            };
        } catch (error) {
            logger.error('Volatility scoring failed', error);
            return { score: 0.5, regime: 'UNKNOWN', volatility: 0, atrPercent: 0 };
        }
    }

    updateThresholds(minVolatility, maxVolatility) {
        try {
            this.minVolatility = minVolatility;
            this.maxVolatility = maxVolatility;
            logger.info('Volatility thresholds updated', { minVolatility, maxVolatility });
        } catch (error) {
            logger.error('Failed to update volatility thresholds', error);
        }
    }

    getVolatilityTrend(candles, period = 10) {
        try {
            if (!candles || candles.length < period + this.lookbackPeriod) {
                throw new Error(`Need at least ${period + this.lookbackPeriod} candles for volatility trend`);
            }
            
            const recentVolatilities = [];
            
            // Calculate rolling volatilities
            for (let i = period; i < candles.length; i++) {
                const window = candles.slice(i - this.lookbackPeriod, i);
                const volData = this.calculateVolatility(window);
                recentVolatilities.push(volData.volatility);
            }
            
            // Simple trend analysis
            const recent = recentVolatilities.slice(-5);
            const older = recentVolatilities.slice(-10, -5);
            
            const recentAvg = recent.reduce((sum, v) => sum + v, 0) / recent.length;
            const olderAvg = older.reduce((sum, v) => sum + v, 0) / older.length;
            
            let trend = 'STABLE';
            if (recentAvg > olderAvg * 1.2) {
                trend = 'INCREASING';
            } else if (recentAvg < olderAvg * 0.8) {
                trend = 'DECREASING';
            }
            
            return {
                trend,
                recentAverage: recentAvg,
                olderAverage: olderAvg,
                changePercent: ((recentAvg - olderAvg) / olderAvg) * 100,
                volatilities: recentVolatilities
            };
        } catch (error) {
            logger.error('Volatility trend analysis failed', error);
            return { trend: 'UNKNOWN', recentAverage: 0, olderAverage: 0, changePercent: 0 };
        }
    }
}

module.exports = new VolatilityFilter();
