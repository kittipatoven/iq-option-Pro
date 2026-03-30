/**
 * SNIPER ENTRY STRATEGY
 * High-precision entry points for maximum edge
 * 
 * BUY Conditions:
 * - RSI < 25 (oversold extreme)
 * - Price <= Lower Bollinger Band (BB breach)
 * - Bullish Engulfing pattern
 * 
 * SELL Conditions:
 * - RSI > 75 (overbought extreme)
 * - Price >= Upper Bollinger Band (BB breach)
 * - Bearish Engulfing pattern
 */

class SniperEntryStrategy {
    constructor() {
        this.name = 'SniperEntry';
        this.rsiExtremeLow = 25;
        this.rsiExtremeHigh = 75;
    }

    /**
     * Detect bullish engulfing pattern
     */
    isBullishEngulfing(candles) {
        if (candles.length < 2) return false;
        
        const prev = candles[candles.length - 2];
        const curr = candles[candles.length - 1];
        
        // Previous candle is bearish (close < open)
        const prevBearish = prev.close < prev.open;
        
        // Current candle is bullish (close > open)
        const currBullish = curr.close > curr.open;
        
        // Current candle engulfs previous (body larger than previous body)
        const prevBody = Math.abs(prev.close - prev.open);
        const currBody = Math.abs(curr.close - curr.open);
        const engulfs = currBody > prevBody;
        
        // Current close > previous open (engulfing confirmation)
        const closesHigher = curr.close > prev.open;
        
        return prevBearish && currBullish && engulfs && closesHigher;
    }

    /**
     * Detect bearish engulfing pattern
     */
    isBearishEngulfing(candles) {
        if (candles.length < 2) return false;
        
        const prev = candles[candles.length - 2];
        const curr = candles[candles.length - 1];
        
        // Previous candle is bullish
        const prevBullish = prev.close > prev.open;
        
        // Current candle is bearish
        const currBearish = curr.close < curr.open;
        
        // Current candle engulfs previous
        const prevBody = Math.abs(prev.close - prev.open);
        const currBody = Math.abs(curr.close - curr.open);
        const engulfs = currBody > prevBody;
        
        // Current close < previous open
        const closesLower = curr.close < prev.open;
        
        return prevBullish && currBearish && engulfs && closesLower;
    }

    /**
     * Check if price at or below lower Bollinger Band
     */
    isAtLowerBB(price, bollingerBands) {
        if (!bollingerBands || !bollingerBands.lower) return false;
        return price <= bollingerBands.lower;
    }

    /**
     * Check if price at or above upper Bollinger Band
     */
    isAtUpperBB(price, bollingerBands) {
        if (!bollingerBands || !bollingerBands.upper) return false;
        return price >= bollingerBands.upper;
    }

    /**
     * Analyze for SNIPER BUY entry
     * Now gives partial credit for meeting 1-2 conditions
     */
    analyzeBuy(candles, rsi, bollingerBands) {
        const conditions = {
            rsiExtreme: rsi < this.rsiExtremeLow,
            bbBreach: this.isAtLowerBB(candles[candles.length - 1].close, bollingerBands),
            engulfing: this.isBullishEngulfing(candles)
        };

        const conditionCount = Object.values(conditions).filter(Boolean).length;
        const allMet = conditionCount === 3;
        const strongSignal = conditionCount >= 2; // 2 or 3 conditions
        
        const score = (conditions.rsiExtreme ? 3 : 0) + 
                     (conditions.bbBreach ? 3 : 0) + 
                     (conditions.engulfing ? 2 : 0);

        // Signal levels based on condition count
        let signal = 'NONE';
        let confidence = 'LOW';
        
        if (allMet) {
            signal = 'BUY';
            confidence = 'SNIPPER'; // All 3 conditions = sniper entry
        } else if (strongSignal) {
            signal = 'BUY';
            confidence = 'HIGH'; // 2 conditions = high confidence
        } else if (conditionCount === 1) {
            signal = 'BUY';
            confidence = 'MEDIUM'; // 1 condition = medium confidence
        }

        return {
            signal: signal,
            score: score,
            conditions: conditions,
            conditionCount: conditionCount,
            confidence: confidence
        };
    }

    /**
     * Analyze for SNIPER SELL entry
     * Now gives partial credit for meeting 1-2 conditions
     */
    analyzeSell(candles, rsi, bollingerBands) {
        const conditions = {
            rsiExtreme: rsi > this.rsiExtremeHigh,
            bbBreach: this.isAtUpperBB(candles[candles.length - 1].close, bollingerBands),
            engulfing: this.isBearishEngulfing(candles)
        };

        const conditionCount = Object.values(conditions).filter(Boolean).length;
        const allMet = conditionCount === 3;
        const strongSignal = conditionCount >= 2;
        
        const score = (conditions.rsiExtreme ? 3 : 0) + 
                     (conditions.bbBreach ? 3 : 0) + 
                     (conditions.engulfing ? 2 : 0);

        let signal = 'NONE';
        let confidence = 'LOW';
        
        if (allMet) {
            signal = 'SELL';
            confidence = 'SNIPPER';
        } else if (strongSignal) {
            signal = 'SELL';
            confidence = 'HIGH';
        } else if (conditionCount === 1) {
            signal = 'SELL';
            confidence = 'MEDIUM';
        }

        return {
            signal: signal,
            score: score,
            conditions: conditions,
            conditionCount: conditionCount,
            confidence: confidence
        };
    }

    /**
     * Main analysis method
     */
    analyze(candles, indicators) {
        const { rsi, bollingerBands } = indicators;
        
        // DEBUG: Log input values
        console.log(`🔍 SNIPER DEBUG: candles.length = ${candles?.length}`);
        console.log(`🔍 SNIPER DEBUG: rsi = ${JSON.stringify(rsi)}`);
        console.log(`🔍 SNIPER DEBUG: bollingerBands = ${JSON.stringify(bollingerBands)}`);
        
        if (!candles || candles.length < 2 || !rsi || !bollingerBands) {
            console.log(`❌ SNIPER: Invalid input - returning NONE`);
            return { signal: 'NONE', score: 0, conditions: {}, confidence: 'NONE' };
        }

        const rsiValue = rsi.value || rsi;
        console.log(`🔍 SNIPER DEBUG: rsiValue = ${rsiValue}`);

        const buyAnalysis = this.analyzeBuy(candles, rsiValue, bollingerBands);
        const sellAnalysis = this.analyzeSell(candles, rsiValue, bollingerBands);
        
        console.log(`🔍 SNIPER DEBUG: buyAnalysis = ${JSON.stringify(buyAnalysis)}`);
        console.log(`🔍 SNIPER DEBUG: sellAnalysis = ${JSON.stringify(sellAnalysis)}`);

        // Return the stronger signal
        if (buyAnalysis.signal === 'BUY' && sellAnalysis.signal === 'NONE') {
            return buyAnalysis;
        } else if (sellAnalysis.signal === 'SELL' && buyAnalysis.signal === 'NONE') {
            return sellAnalysis;
        } else if (buyAnalysis.score > sellAnalysis.score) {
            return buyAnalysis;
        } else if (sellAnalysis.score > buyAnalysis.score) {
            return sellAnalysis;
        }

        return { signal: 'NONE', score: 0, conditions: {}, confidence: 'NONE' };
    }
}

module.exports = SniperEntryStrategy;
