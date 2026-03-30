const { MACD } = require('technicalindicators');
const logger = require('../utils/logger');

class MACDIndicator {
    constructor(fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
        this.fastPeriod = fastPeriod;
        this.slowPeriod = slowPeriod;
        this.signalPeriod = signalPeriod;
        this.name = 'MACD';
    }

    calculate(candles) {
        try {
            if (!candles || candles.length < this.slowPeriod + this.signalPeriod) {
                throw new Error(`Need at least ${this.slowPeriod + this.signalPeriod} candles for MACD calculation`);
            }

            const closes = candles.map(candle => candle.close);
            
            const macdInput = {
                values: closes,
                fastPeriod: this.fastPeriod,
                slowPeriod: this.slowPeriod,
                signalPeriod: this.signalPeriod,
                SimpleMAOscillator: false,
                SimpleMASignal: false
            };

            const macdValues = MACD.calculate(macdInput);
            
            const current = macdValues[macdValues.length - 1];
            const previous = macdValues[macdValues.length - 2];
            
            const result = {
                name: this.name,
                parameters: {
                    fastPeriod: this.fastPeriod,
                    slowPeriod: this.slowPeriod,
                    signalPeriod: this.signalPeriod
                },
                values: macdValues,
                current: {
                    MACD: current.MACD,
                    signal: current.signal,
                    histogram: current.histogram
                },
                previous: {
                    MACD: previous.MACD,
                    signal: previous.signal,
                    histogram: previous.histogram
                },
                signal: this.getSignal(current, previous)
            };

            logger.debug(`MACD calculated for ${candles.length} candles`, result);
            return result;
        } catch (error) {
            logger.error('MACD calculation failed', error);
            throw error;
        }
    }

    getSignal(current, previous) {
        // Histogram cross over signal line
        if (previous.histogram < 0 && current.histogram > 0) {
            return 'BULLISH_CROSS'; // Buy signal
        }
        if (previous.histogram > 0 && current.histogram < 0) {
            return 'BEARISH_CROSS'; // Sell signal
        }
        
        // MACD above/below signal line
        if (current.MACD > current.signal) {
            return 'BULLISH';
        } else {
            return 'BEARISH';
        }
    }

    isBullishCross(current = null, previous = null) {
        const curr = current || this.current;
        const prev = previous || this.previous;
        
        return prev.histogram < 0 && curr.histogram > 0;
    }

    isBearishCross(current = null, previous = null) {
        const curr = current || this.current;
        const prev = previous || this.previous;
        
        return prev.histogram > 0 && curr.histogram < 0;
    }

    isAboveSignal(current = null) {
        const curr = current || this.current;
        return curr.MACD > curr.signal;
    }

    isBelowSignal(current = null) {
        const curr = current || this.current;
        return curr.MACD < curr.signal;
    }

    getScore(current = null, previous = null) {
        const curr = current || this.current;
        const prev = previous || this.previous;
        
        // Strong signals for crossovers
        if (this.isBullishCross(curr, prev)) return 1;
        if (this.isBearishCross(curr, prev)) return 1;
        
        // Moderate signals for position relative to signal
        if (Math.abs(curr.histogram) > 0.001) {
            return curr.histogram > 0 ? 0.5 : 0.5;
        }
        
        return 0; // Neutral
    }
}

module.exports = MACDIndicator;
