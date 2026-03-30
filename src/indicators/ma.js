const { EMA, SMA } = require('technicalindicators');
const logger = require('../utils/logger');

class MovingAverageIndicator {
    constructor() {
        this.name = 'MovingAverage';
    }

    calculateEMA(candles, period) {
        try {
            if (!candles || candles.length < period) {
                throw new Error(`Need at least ${period} candles for EMA calculation`);
            }

            const closes = candles.map(candle => candle.close);
            
            const emaInput = {
                values: closes,
                period: period
            };

            const emaValues = EMA.calculate(emaInput);
            
            return {
                name: `EMA${period}`,
                period: period,
                values: emaValues,
                current: emaValues[emaValues.length - 1]
            };
        } catch (error) {
            logger.error(`EMA${period} calculation failed`, error);
            throw error;
        }
    }

    calculateSMA(candles, period) {
        try {
            if (!candles || candles.length < period) {
                throw new Error(`Need at least ${period} candles for SMA calculation`);
            }

            const closes = candles.map(candle => candle.close);
            
            const smaInput = {
                values: closes,
                period: period
            };

            const smaValues = SMA.calculate(smaInput);
            
            return {
                name: `SMA${period}`,
                period: period,
                values: smaValues,
                current: smaValues[smaValues.length - 1]
            };
        } catch (error) {
            logger.error(`SMA${period} calculation failed`, error);
            throw error;
        }
    }

    calculateMultiple(candles) {
        try {
            const ema50 = this.calculateEMA(candles, 50);
            const ema200 = this.calculateEMA(candles, 200);
            const currentPrice = candles[candles.length - 1].close;
            
            const result = {
                name: this.name,
                ema50: ema50,
                ema200: ema200,
                currentPrice: currentPrice,
                trend: this.getTrend(currentPrice, ema50.current, ema200.current),
                cross: this.getCrossSignal(ema50, ema200),
                signal: this.getSignal(currentPrice, ema50.current, ema200.current)
            };

            logger.debug(`Moving Averages calculated for ${candles.length} candles`, result);
            return result;
        } catch (error) {
            logger.error('Moving Averages calculation failed', error);
            throw error;
        }
    }

    getTrend(price, ema50, ema200) {
        if (price > ema50 && ema50 > ema200) {
            return 'STRONG_UPTREND';
        } else if (price > ema50 && ema50 < ema200) {
            return 'WEAK_UPTREND';
        } else if (price < ema50 && ema50 < ema200) {
            return 'STRONG_DOWNTREND';
        } else if (price < ema50 && ema50 > ema200) {
            return 'WEAK_DOWNTREND';
        } else {
            return 'SIDEWAYS';
        }
    }

    getCrossSignal(ema50, ema200) {
        if (ema50.values.length < 2 || ema200.values.length < 2) {
            return 'INSUFFICIENT_DATA';
        }

        const prevEMA50 = ema50.values[ema50.values.length - 2];
        const prevEMA200 = ema200.values[ema200.values.length - 2];
        const currEMA50 = ema50.current;
        const currEMA200 = ema200.current;

        if (prevEMA50 < prevEMA200 && currEMA50 > currEMA200) {
            return 'GOLDEN_CROSS'; // Bullish signal
        } else if (prevEMA50 > prevEMA200 && currEMA50 < currEMA200) {
            return 'DEATH_CROSS'; // Bearish signal
        } else if (currEMA50 > currEMA200) {
            return 'ABOVE'; // Bullish
        } else {
            return 'BELOW'; // Bearish
        }
    }

    getSignal(price, ema50, ema200) {
        const trend = this.getTrend(price, ema50, ema200);
        
        switch (trend) {
            case 'STRONG_UPTREND':
                return 'STRONG_BUY';
            case 'WEAK_UPTREND':
                return 'BUY';
            case 'STRONG_DOWNTREND':
                return 'STRONG_SELL';
            case 'WEAK_DOWNTREND':
                return 'SELL';
            default:
                return 'NEUTRAL';
        }
    }

    isPriceAboveEMA50(price, ema50) {
        return price > ema50;
    }

    isPriceAboveEMA200(price, ema200) {
        return price > ema200;
    }

    isGoldenCross(ema50, ema200) {
        return this.getCrossSignal(ema50, ema200) === 'GOLDEN_CROSS';
    }

    isDeathCross(ema50, ema200) {
        return this.getCrossSignal(ema50, ema200) === 'DEATH_CROSS';
    }

    getScore(price, ema50, ema200) {
        const trend = this.getTrend(price, ema50, ema200);
        
        switch (trend) {
            case 'STRONG_UPTREND':
                return 1;
            case 'STRONG_DOWNTREND':
                return 1;
            case 'WEAK_UPTREND':
                return 0.5;
            case 'WEAK_DOWNTREND':
                return 0.5;
            default:
                return 0;
        }
    }
}

module.exports = MovingAverageIndicator;
