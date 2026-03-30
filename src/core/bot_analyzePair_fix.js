    async analyzePair(pair) {
        try {
            logger.debug(`Analyzing pair: ${pair}`);
            
            // Risk Management - Check max consecutive losses
            if (this.consecutiveLosses >= 3) {
                console.log(`🛑 STOP TRADING: Max losses reached (${this.consecutiveLosses})`);
                return null;
            }
            
            // Check news filter first - if trading should stop, skip everything
            const newsCheck = await newsFilter.shouldStopTrading(pair);
            if (newsCheck.shouldStop) {
                logger.info(`Trading stopped for ${pair} due to news: ${newsCheck.reason}`, {
                    eventTime: newsCheck.eventTime,
                    timeUntil: newsCheck.timeUntil,
                    currency: newsCheck.currency
                });
                return null;
            }
            
            // Get pair state
            let pairState = this.pairStates.get(pair) || {
                lastTradeTime: null,
                tradeCount: 0,
                cooldownUntil: null
            };
            
            // Check cooldown
            if (pairState.cooldownUntil && Date.now() < pairState.cooldownUntil) {
                logger.debug(`Pair ${pair} is in cooldown`);
                return null;
            }
            
            // Get market data
            const candles = await iqoptionAPI.getCandles(pair, 60, 200);
            if (!candles || candles.length < 100) {
                throw new Error(`Insufficient candle data for ${pair}`);
            }
            
            // Calculate indicators
            const indicators = await this.calculateIndicators(candles);
            
            // Log RSI value for debugging
            const rsi = indicators.rsi || 50;
            console.log(`📊 RSI: ${rsi.toFixed(2)} for ${pair}`);
            
            // Signal Logic: RSI based
            let signal = null;
            if (rsi < 30) {
                signal = 'BUY';
                console.log(`📈 SIGNAL: BUY ${pair} (RSI ${rsi.toFixed(2)})`);
            } else if (rsi > 70) {
                signal = 'SELL';
                console.log(`📉 SIGNAL: SELL ${pair} (RSI ${rsi.toFixed(2)})`);
            } else {
                console.log(`⏸️  NO SIGNAL for ${pair} (RSI ${rsi.toFixed(2)})`);
            }
            
            // Execute trade if signal exists
            if (signal) {
                const config = require('../config/config');
                const tradeAmount = config.TRADE_AMOUNT || 1;
                
                console.log(`🚀 EXECUTING: ${signal} ${pair} $${tradeAmount}`);
                
                try {
                    const result = await this.executeTrade(pair, signal, tradeAmount);
                    
                    if (result.success) {
                        console.log(`✅ TRADE SUCCESS: ${signal} ${pair} - Result: ${result.outcome || 'pending'}`);
                        
                        // Track losses for risk management
                        if (result.outcome === 'loss') {
                            this.consecutiveLosses++;
                            console.log(`⚠️  Loss count: ${this.consecutiveLosses}`);
                        } else if (result.outcome === 'win') {
                            this.consecutiveLosses = 0;
                            console.log(`🎉 Win! Reset loss count`);
                        }
                    } else {
                        console.log(`❌ TRADE FAILED: ${result.error || 'Unknown error'}`);
                    }
                } catch (tradeError) {
                    console.log(`❌ Trade execution error: ${tradeError.message}`);
                }
                
                // Update pair state
                pairState.lastTradeTime = new Date();
                pairState.tradeCount++;
                pairState.cooldownUntil = Date.now() + (5 * 60 * 1000); // 5 min cooldown
            }
            
            this.pairStates.set(pair, pairState);
            
            const result = {
                pair,
                indicators,
                signal,
                shouldTrade: !!signal,
                timestamp: new Date()
            };
            
            return result;
        } catch (error) {
            logger.error(`Pair analysis failed for ${pair}`, error);
            return null;
        }
    }
