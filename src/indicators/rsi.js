const { RSI } = require('technicalindicators');
const logger = require('../utils/logger');

class RSIIndicator {
    constructor(period = 14) {
        this.period = period;
        this.name = 'RSI';
    }

    calculate(candles) {
        try {
            if (!candles || candles.length < this.period) {
                throw new Error(`Need at least ${this.period} candles for RSI calculation`);
            }

            const closes = candles.map(candle => candle.close);
            
            const rsiInput = {
                values: closes,
                period: this.period
            };

            const rsiValues = RSI.calculate(rsiInput);
            
            const result = {
                name: this.name,
                period: this.period,
                values: rsiValues,
                current: rsiValues[rsiValues.length - 1],
                signal: this.getSignal(rsiValues[rsiValues.length - 1])
            };

            logger.debug(`RSI calculated for ${candles.length} candles`, result);
            return result;
        } catch (error) {
            logger.error('RSI calculation failed', error);
            throw error;
        }
    }

    getSignal(currentRSI) {
        if (currentRSI > 70) {
            return 'OVERBOUGHT'; // Sell signal
        } else if (currentRSI < 30) {
            return 'OVERSOLD'; // Buy signal
        } else if (currentRSI > 50) {
            return 'BULLISH';
        } else {
            return 'BEARISH';
        }
    }

    isOverbought(currentRSI = null, threshold = 70) {
        const rsi = currentRSI || (this.current || 50);
        return rsi > threshold;
    }

    isOversold(currentRSI = null, threshold = 30) {
        const rsi = currentRSI || (this.current || 50);
        return rsi < threshold;
    }

    isBullish(currentRSI = null) {
        const rsi = currentRSI || (this.current || 50);
        return rsi > 50;
    }

    isBearish(currentRSI = null) {
        const rsi = currentRSI || (this.current || 50);
        return rsi < 50;
    }

    getScore(currentRSI = null) {
        const rsi = currentRSI || (this.current || 50);
        
        if (rsi > 70) return 1; // Strong sell
        if (rsi < 30) return 1; // Strong buy
        if (rsi > 60) return 0.5; // Moderate sell
        if (rsi < 40) return 0.5; // Moderate buy
        return 0; // Neutral
    }
}

module.exports = RSIIndicator;
