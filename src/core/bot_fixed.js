const EventEmitter = require('events');
const logger = require('../utils/logger');
const iqoptionAPI = require('../services/iqoption.api');
const newsFilter = require('../filters/newsFilter');

class TradingBot extends EventEmitter {
    constructor() {
        super();
        this.name = 'TradingBot';
        this.isRunning = false;
        this.pairStates = new Map();
        this.consecutiveLosses = 0;
        this.activePair = 'EURUSD';
        this.tradingInterval = null;
        this.analysisInterval = 60000;
        this.lastAnalysisTime = null;
        this.candles = [];
    }

    async analyzePair(pair) {
        try {
            logger.debug(`Analyzing pair: ${pair}`);
            
            if (this.consecutiveLosses >= 3) {
                console.log(`🛑 STOP TRADING: Max losses reached (${this.consecutiveLosses})`);
                return null;
            }
            
            const newsCheck = await newsFilter.shouldStopTrading(pair);
            if (newsCheck.shouldStop) {
                logger.info(`Trading stopped for ${pair} due to news: ${newsCheck.reason}`);
                return null;
            }
            
            let pairState = this.pairStates.get(pair) || {
                lastTradeTime: null,
                tradeCount: 0,
                cooldownUntil: null
            };
            
            if (pairState.cooldownUntil && Date.now() < pairState.cooldownUntil) {
                logger.debug(`Pair ${pair} is in cooldown`);
                return null;
            }
            
            const candles = await iqoptionAPI.getCandles(pair, 60, 200);
            if (!candles || candles.length < 100) {
                throw new Error(`Insufficient candle data for ${pair}`);
            }
            
            const indicators = await this.calculateIndicators(candles);
            const rsi = indicators.rsi || 50;
            console.log(`📊 RSI: ${rsi.toFixed(2)} for ${pair}`);
            
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
            
            if (signal) {
                const config = require('../config/config');
                const tradeAmount = config.TRADE_AMOUNT || 1;
                
                console.log(`🚀 EXECUTING: ${signal} ${pair} $${tradeAmount}`);
                
                try {
                    const result = await this.executeTrade(pair, signal, tradeAmount);
                    
                    if (result.success) {
                        console.log(`✅ TRADE SUCCESS: ${signal} ${pair} - Result: ${result.outcome || 'pending'}`);
                        
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
                
                pairState.lastTradeTime = new Date();
                pairState.tradeCount++;
                pairState.cooldownUntil = Date.now() + (5 * 60 * 1000);
            }
            
            this.pairStates.set(pair, pairState);
            
            return {
                pair,
                indicators,
                signal,
                shouldTrade: !!signal,
                timestamp: new Date()
            };
        } catch (error) {
            logger.error(`Pair analysis failed for ${pair}`, error);
            return null;
        }
    }

    async calculateIndicators(candles) {
        const rsi = this.calculateRSI(candles);
        return { rsi };
    }

    calculateRSI(candles, period = 14) {
        if (candles.length < period + 1) return 50;
        
        let gains = 0;
        let losses = 0;
        
        for (let i = candles.length - period; i < candles.length; i++) {
            const change = candles[i].close - candles[i].open;
            if (change > 0) gains += change;
            else losses -= change;
        }
        
        const avgGain = gains / period;
        const avgLoss = losses / period;
        
        if (avgLoss === 0) return 100;
        
        const rs = avgGain / avgLoss;
        return 100 - (100 / (1 + rs));
    }

    async executeTrade(pair, signal, amount) {
        try {
            console.log(`🚀 Executing ${signal} on ${pair} with $${amount}`);
            
            const result = await iqoptionAPI.placeTrade({
                pair,
                direction: signal,
                amount,
                duration: 1
            });
            
            return {
                success: true,
                outcome: result.outcome || 'pending',
                tradeId: result.id
            };
        } catch (error) {
            logger.error(`Trade execution failed for ${pair}`, error);
            return { success: false, error: error.message };
        }
    }

    async start() {
        if (this.isRunning) {
            console.log('⚠️ Bot is already running');
            return;
        }
        
        this.isRunning = true;
        console.log('🚀 Trading Bot Started');
        
        this.tradingInterval = setInterval(async () => {
            if (!this.isRunning) return;
            
            try {
                await this.analyzePair(this.activePair);
            } catch (error) {
                logger.error('Analysis loop error', error);
            }
        }, this.analysisInterval);
    }

    stop() {
        if (!this.isRunning) {
            console.log('⚠️ Bot is not running');
            return;
        }
        
        this.isRunning = false;
        
        if (this.tradingInterval) {
            clearInterval(this.tradingInterval);
            this.tradingInterval = null;
        }
        
        console.log('🛑 Trading Bot Stopped');
    }
}

module.exports = TradingBot;
