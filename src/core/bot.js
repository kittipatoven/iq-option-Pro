const EventEmitter = require('events');
const logger = require('../utils/logger');
const iqoptionAPI = require('../services/iqoption.api');
const newsFilter = require('../filters/newsFilter');
const Optimizer = require('./optimizer');
const LearningEngine = require('./learningEngine');
const dashboard = require('../services/dashboard');
const marketDetector = require('./marketDetector');

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
        
        // AI Auto Improve components
        this.optimizer = new Optimizer();
        this.learning = new LearningEngine();
        this.initialBalance = 1000; // Will be updated from API
        this.currentBalance = 1000;
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
            
            // STEP 4: Detect market condition
            const market = marketDetector.detect(candles, indicators);
            console.log(`📊 Market: ${market} | RSI: ${rsi.toFixed(2)}`);
            
            // Get optimized parameters for current market condition
            const params = this.optimizer.getParams(market);
            console.log(`🎯 ${market} Params: RSI ${params.rsiBuy}/${params.rsiSell} | Score: ${params.scoreThreshold}`);
            
            let signal = null;
            let score = 0;
            
            // Dynamic Signal Logic based on optimized parameters
            if (rsi < params.rsiBuy) {
                signal = 'BUY';
                score = Math.floor((params.rsiBuy - rsi) / 2); // Higher score for more extreme RSI
                console.log(`📈 SIGNAL: BUY ${pair} (RSI ${rsi.toFixed(2)} < ${params.rsiBuy})`);
            } else if (rsi > params.rsiSell) {
                signal = 'SELL';
                score = Math.floor((rsi - params.rsiSell) / 2);
                console.log(`📉 SIGNAL: SELL ${pair} (RSI ${rsi.toFixed(2)} > ${params.rsiSell})`);
            } else {
                console.log(`⏸️  NO SIGNAL for ${pair} (RSI ${rsi.toFixed(2)} - need <${params.rsiBuy} or >${params.rsiSell})`);
            }
            
            // STEP 4: Dynamic threshold filter
            if (signal && score < params.scoreThreshold) {
                console.log(`⚠️ Signal rejected: score ${score} below threshold ${params.scoreThreshold}`);
                signal = null;
            }
            
            if (signal) {
                const config = require('../config/config');
                const tradeAmount = config.TRADE_AMOUNT || 1;
                
                console.log(`🚀 EXECUTING: ${signal} ${pair} $${tradeAmount}`);
                
                try {
                    const result = await this.executeTrade(pair, signal, tradeAmount);
                    
                    if (result.success) {
                        console.log(`✅ TRADE SUCCESS: ${signal} ${pair} - Result: ${result.outcome || 'pending'}`);
                        
                        // Record trade in optimizer with current parameters and market condition
                        this.optimizer.record(result.outcome || 'pending', market, {
                            pair,
                            signal,
                            rsi,
                            score
                        });
                        
                        // STEP 2: Update learning after trade
                        this.learning.record({
                            result: result.outcome || 'pending',
                            pair,
                            signal,
                            rsi,
                            score
                        });
                        
                        // STEP 3: Analyze every 5 trades and adjust optimizer
                        if (this.learning.history.length % 5 === 0) {
                            console.log(`📊 Analyzing performance after ${this.learning.history.length} trades...`);
                            const winrate = this.learning.analyze();
                            this.optimizer.adjust(winrate);
                            
                            // STEP 5: Adaptive behavior based on winrate
                            if (winrate < 50) {
                                console.log("⚠️ Low performance detected - tightening rules");
                            } else if (winrate > 65) {
                                console.log("✅ High performance - can relax rules slightly");
                            }
                        }
                        
                        // STEP 6: Dashboard display every 10 trades
                        if (this.learning.history.length % 10 === 0) {
                            const winrate = this.learning.analyze();
                            dashboard.display({
                                balance: this.currentBalance,
                                initialBalance: this.initialBalance,
                                profit: this.currentBalance - this.initialBalance,
                                winrate,
                                trades: this.learning.history.length,
                                params: this.optimizer.getParams()
                            });
                        }
                        
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
        
        console.log('🚀 Starting Trading Bot...');
        this.isRunning = true;
        this.consecutiveErrors = 0;
        
        // Initialize balance from API
        try {
            const balance = await iqoptionAPI.getBalance();
            if (balance && balance > 0) {
                this.initialBalance = balance;
                this.currentBalance = balance;
                console.log(`💰 Initial balance: $${this.initialBalance}`);
            } else {
                console.log(`💰 Using default balance: $${this.currentBalance}`);
            }
        } catch (error) {
            logger.warn('Could not fetch initial balance from API', error);
            console.log(`💰 Using default balance: $${this.currentBalance}`);
        }
        
        // Initialize risk manager with current balance
        if (this.riskManager && typeof this.riskManager.initialize === 'function') {
            await this.riskManager.initialize(this.currentBalance || 100);
        }
        
        // Start main analysis loop with error recovery
        this.tradingInterval = setInterval(async () => {
            if (!this.isRunning) return;
            
            try {
                await this.analyzeWithRecovery();
            } catch (error) {
                console.error('❌ Main loop error:', error.message);
                this.consecutiveErrors = (this.consecutiveErrors || 0) + 1;
                
                if (this.consecutiveErrors >= 3) {
                    console.error('🛑 Too many consecutive errors, stopping bot');
                    await this.stop();
                }
            }
        }, this.analysisInterval);
        
        console.log('✅ Bot started successfully');
        console.log(`📊 Analyzing ${this.activePair} every ${this.analysisInterval/1000}s`);
    }
    
    async analyzeWithRecovery() {
        const maxRetries = 2;
        let lastError = null;
        
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                if (attempt > 0) {
                    console.log(`🔄 Retry attempt ${attempt}/${maxRetries}...`);
                    await this.sleep(1000 * attempt); // Exponential backoff
                }
                
                const result = await this.analyzePair(this.activePair);
                
                // Reset error counter on success
                this.consecutiveErrors = 0;
                
                return result;
                
            } catch (error) {
                lastError = error;
                console.warn(`⚠️ Analysis attempt ${attempt + 1} failed:`, error.message);
                
                // Don't retry on fatal errors
                if (error.message.includes('FATAL') || error.message.includes('Authentication')) {
                    throw error;
                }
            }
        }
        
        // All retries failed
        throw new Error(`Analysis failed after ${maxRetries + 1} attempts: ${lastError.message}`);
    }
    
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
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
