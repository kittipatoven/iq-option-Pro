const { BollingerBands } = require('technicalindicators');
const logger = require('../utils/logger');

class BollingerBandsIndicator {
    constructor(period = 20, stdDev = 2) {
        this.period = period;
        this.stdDev = stdDev;
        this.name = 'BollingerBands';
    }

    calculate(candles) {
        try {
            if (!candles || candles.length < this.period) {
                throw new Error(`Need at least ${this.period} candles for Bollinger Bands calculation`);
            }

            const closes = candles.map(candle => candle.close);
            
            const bbInput = {
                values: closes,
                period: this.period,
                stdDev: this.stdDev
            };

            const bbValues = BollingerBands.calculate(bbInput);
            
            const current = bbValues[bbValues.length - 1];
            const currentPrice = candles[candles.length - 1].close;
            
            const result = {
                name: this.name,
                parameters: {
                    period: this.period,
                    stdDev: this.stdDev
                },
                values: bbValues,
                current: {
                    upper: current.upper,
                    middle: current.middle,
                    lower: current.lower,
                    price: currentPrice
                },
                width: this.getWidth(current),
                position: this.getPosition(currentPrice, current),
                signal: this.getSignal(currentPrice, current)
            };

            logger.debug(`Bollinger Bands calculated for ${candles.length} candles`, result);
            return result;
        } catch (error) {
            logger.error('Bollinger Bands calculation failed', error);
            throw error;
        }
    }

    getWidth(current) {
        return (current.upper - current.lower) / current.middle * 100; // Percentage width
    }

    getPosition(price, current) {
        const range = current.upper - current.lower;
        const position = (price - current.lower) / range;
        
        if (position > 0.8) return 'UPPER_BAND';
        if (position < 0.2) return 'LOWER_BAND';
        if (position > 0.4 && position < 0.6) return 'MIDDLE_BAND';
        return 'NORMAL';
    }

    getSignal(price, current) {
        const position = this.getPosition(price, current);
        
        if (position === 'LOWER_BAND') {
            return 'OVERSOLD'; // Potential buy
        } else if (position === 'UPPER_BAND') {
            return 'OVERBOUGHT'; // Potential sell
        } else if (position === 'MIDDLE_BAND') {
            return 'NEUTRAL';
        } else {
            return 'NORMAL';
        }
    }

    isNarrow(width, threshold = 2) {
        return width < threshold;
    }

    isWide(width, threshold = 4) {
        return width > threshold;
    }

    isAtUpperBand(price = null, current = null) {
        const currPrice = price || (this.current ? this.current.price : null);
        const curr = current || this.current;
        if (!curr || !currPrice) return false;
        return currPrice >= curr.upper * 0.99;
    }

    isAtLowerBand(price = null, current = null) {
        const currPrice = price || (this.current ? this.current.price : null);
        const curr = current || this.current;
        if (!curr || !currPrice) return false;
        return currPrice <= curr.lower * 1.01;
    }

    getScore(price = null, current = null) {
        // Use provided parameters or fall back to instance properties
        const currPrice = price || (this.current ? this.current.price : null);
        const curr = current || this.current;
        
        if (!curr || !currPrice) {
            return 0; // Return neutral score if no data available
        }
        
        const position = this.getPosition(currPrice, curr);
        const width = this.getWidth(curr);
        
        // Strong signals at bands
        if (position === 'LOWER_BAND') return 1;
        if (position === 'UPPER_BAND') return 1;
        
        // Moderate signals based on width (squeeze)
        if (this.isNarrow(width)) return 0.5; // Squeeze setup
        
        return 0; // Neutral
    }
}

module.exports = BollingerBandsIndicator;
