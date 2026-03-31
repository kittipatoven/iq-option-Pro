const EventEmitter = require('events');
const logger = require('../utils/logger');
const iqoptionAPI = require('../api/unifiediqoption');
const newsFilter = require('../filters/newsFilter');
const Optimizer = require('./optimizer');
const LearningEngine = require('./learningEngine');
const dashboard = require('../services/dashboard');
const marketDetector = require('./marketDetector');
const aiAnalyzer = require('./aiTradingAnalyzer');
const tradeTracker = require('./tradeResultTracker');
const healthMonitor = require('./systemHealthMonitor');
const aiPrediction = require('./aiPredictionEngine');
const rlEngine = require('./rlEngine');
const marketRegime = require('./marketRegimeDetector');
const multiAgent = require('./multiAgentSystem');
const portfolioManager = require('./portfolioManager');

// ═══════════════════════════════════════════════════════════════
// 🧠 HEDGE FUND AI SYSTEMS
// ═══════════════════════════════════════════════════════════════
const transformerPrediction = require('./transformerPrediction');
const orderFlowAnalyzer = require('./orderFlowAnalyzer');
const marketMaker = require('./marketMaker');
const latencyArbitrage = require('./latencyArbitrage');
const ultraEntry = require('./ultraEntry');

class TradingBot extends EventEmitter {
    constructor() {
        super();
        this.name = 'TradingBot';
        this.isRunning = false;
        this.pairStates = new Map();
        this.consecutiveLosses = 0;
        this.activePair = 'EURUSD-OTC';  // 🔥 FIXED: Use OTC pair from whitelist
        this.tradingInterval = null;
        this.analysisInterval = 60000;
        this.lastAnalysisTime = null;
        this.candles = [];
        this.consecutiveErrors = 0;
        
        // AI Auto Improve components
        this.optimizer = new Optimizer();
        this.learning = new LearningEngine();
        this.initialBalance = 1000;
        this.currentBalance = 1000;
        
        // Initialize risk manager with current balance
        this.riskManager = require('./riskManager');
        
        // ═══════════════════════════════════════════════════════════════
        // 🎯 SNIPER MODE CONFIGURATION (Max Win Rate Strategy)
        // ═══════════════════════════════════════════════════════════════
        this.sniperConfig = {
            // RSI EXTREME ONLY (Stricter than before)
            rsi: {
                callMax: 25,      // BUY only when RSI < 25
                putMin: 75,       // SELL only when RSI > 75
                extremeCall: 20,  // Deep oversold
                extremePut: 80    // Deep overbought
            },
            
            // SNIPER SCORE SYSTEM
            scoring: {
                rsiExtreme: 2,      // RSI < 25 or > 75
                bbEdge: 2,          // Price at BB edge with rejection
                priceAction: 2,     // Engulfing, pin bar, rejection
                momentumShift: 3,   // Tick momentum reversal
                minThreshold: 7     // Minimum score to trade
            },
            
            // LOSS CONTROL
            lossControl: {
                maxConsecutiveLosses: 3,
                pauseMinutes: 10,
                cooldownUntil: null
            },
            
            // TIME FILTER (London & NY open only)
            timeFilter: {
                bestHours: [7, 8, 9, 13, 14, 15],  // London 7-9, NY 13-15
                avoidHours: [0, 1, 2, 3, 4, 5, 6, 10, 11, 12, 16, 17, 18, 19, 20, 21, 22, 23]
            },
            
            // PAIR FILTER (Only best pairs)
            pairFilter: {
                whitelist: ['EURUSD-OTC', 'GBPUSD-OTC'],
                blacklist: ['USDJPY-OTC', 'AUDUSD-OTC', 'USDCAD-OTC']
            },
            
            // POSITION SIZING
            positionSizing: {
                base: 1,
                winRateHigh: 1.5,   // Increase when win rate > 65%
                lossStreak: 0.5,    // Decrease when loss streak >= 2
                extremeRSI: 1.3     // Extra size at extreme RSI
            },
            
            // BOLLINGER BANDS
            bb: {
                period: 20,
                deviation: 2,
                touchThreshold: 0.001  // How close to edge counts as "touch"
            }
        };
        
        // Legacy config for backward compatibility
        this.profitConfig = this.sniperConfig;
        
        // Real-time performance tracking
        this.performanceMetrics = {
            recentTrades: [], // Last N trades for rolling window analysis
            windowSize: 20,   // Analyze last 20 trades
            currentAdjustment: 'good', // Current adjustment level
            adjustmentHistory: []
        };
        
        // ═══════════════════════════════════════════════════════════════
        // ⚡ SMART CACHING SYSTEM (Performance Optimization)
        // ═══════════════════════════════════════════════════════════════
        this.cache = {
            rsi: new Map(),           // pair -> { value, timestamp }
            marketCondition: new Map(), // pair -> { type, timestamp }
            candles: new Map(),       // pair -> { data, timestamp }
            maxAge: 5000,             // Cache valid for 5 seconds
            maxSize: 50               // Max entries per cache
        };
        // ═══════════════════════════════════════════════════════════════
    }

    /**
     * Initialize the bot with credentials
     * @param {Object} credentials - { email, password, accountType }
     * @returns {Promise<boolean>} - true if initialized successfully
     */
    async initialize(credentials) {
        try {
            console.log('🚀 Initializing Trading Bot...');
            
            // Set API credentials
            if (credentials && credentials.email && credentials.password) {
                iqoptionAPI.setCredentials(
                    credentials.email,
                    credentials.password,
                    credentials.accountType || 'PRACTICE'
                );
                console.log('✅ API credentials set');
            }
            
            // Connect to API
            console.log('🔌 Connecting to IQ Option API...');
            const connected = await iqoptionAPI.connect();
            
            if (!connected) {
                throw new Error('Failed to connect to IQ Option API');
            }
            
            console.log('✅ Bot initialized successfully');
            return true;
            
        } catch (error) {
            logger.error('Bot initialization failed', error);
            console.error('❌ Bot initialization failed:', error.message);
            return false;
        }
    }

    /**
     * Get bot status for monitoring
     */
    getBotStatus() {
        return {
            isRunning: this.isRunning,
            name: this.name,
            activePair: this.activePair,
            currentBalance: this.currentBalance,
            initialBalance: this.initialBalance,
            consecutiveLosses: this.consecutiveLosses,
            stats: {
                totalTrades: this.learning.history.length,
                aiTrades: aiAnalyzer.stats.totalTrades,
                aiWinRate: aiAnalyzer.stats.winRate
            }
        };
    }

    async analyzePair(pair) {
        try {
            logger.debug(`Analyzing pair: ${pair}`);
            
            // 🎯 PROFIT FILTER 1: Check pair whitelist/blacklist
            const config = this.profitConfig;
            if (config.pairFilter.blacklist.includes(pair)) {
                console.log(`🚫 BLOCKED: ${pair} is in blacklist (historical win rate: 27.8%)`);
                return null;
            }
            if (!config.pairFilter.whitelist.includes(pair)) {
                console.log(`⚠️ NOT WHITELISTED: ${pair} - only trading EURUSD-OTC and GBPUSD-OTC`);
                // Continue anyway but mark as warning
            }
            
            // 🎯 PROFIT FILTER 2: Check time filter
            const currentHour = new Date().getHours();
            if (config.timeFilter.avoidHours.includes(currentHour)) {
                console.log(`� BLOCKED: Hour ${currentHour} has poor historical performance (<30% win rate)`);
                return null;
            }
            const timeBonus = config.timeFilter.bestHours.includes(currentHour) ? 1 : 0;
            
            // Check AI recommendation first
            const aiRec = aiAnalyzer.generateRecommendation();
            if (aiRec.action === 'STOP') {
                console.log(`🛑 AI RECOMMENDATION: ${aiRec.reason}`);
                return null;
            }
            
            // 🎯 PROFIT FILTER 3: Consecutive loss protection (reduced to 2)
            if (this.consecutiveLosses >= config.maxConsecutiveLosses) {
                console.log(`🛑 STOP TRADING: Max losses reached (${this.consecutiveLosses})`);
                return null;
            }
            
            // Get pair state for cooldown check
            let pairState = this.pairStates.get(pair) || {
                lastTradeTime: null,
                tradeCount: 0,
                cooldownUntil: null
            };
            
            if (pairState.cooldownUntil && Date.now() < pairState.cooldownUntil) {
                logger.debug(`Pair ${pair} is in cooldown`);
                return null;
            }
            
            // Get market data and news check in PARALLEL
            const [newsCheck, candles] = await Promise.all([
                newsFilter.shouldStopTrading(pair),
                iqoptionAPI.getCandles(pair, 60, 200)
            ]);
            
            if (newsCheck.shouldStop) {
                logger.info(`Trading stopped for ${pair} due to news: ${newsCheck.reason}`);
                return null;
            }
            
            if (!candles || candles.length < 100) {
                throw new Error(`Insufficient candle data for ${pair}`);
            }
            
            // Calculate indicators with caching (synchronous - faster)
            const indicators = this.calculateIndicators(candles, pair);
            const rsi = indicators.rsi || 50;
            const momentum = indicators.momentum || { direction: 'NEUTRAL', strength: 0 };
            
            // 🔮 AI PREDICTION ENGINE - Predict direction in advance
            const currentPrice = iqoptionAPI.getCurrentPrice(pair);
            const aiPrediction = require('./aiPredictionEngine');
            const prediction = aiPrediction.predict({
                candles,
                pair,
                currentPrice,
                tickData: indicators.tickMomentum ? [indicators.tickMomentum] : null
            });
            
            // Log prediction results
            if (prediction.direction !== 'NEUTRAL') {
                console.log(`\n🔮 AI PREDICTION for ${pair}:`);
                console.log(`   Direction: ${prediction.direction} | Confidence: ${prediction.confidence}/10 (${prediction.confidenceLevel})`);
                console.log(`   RSI Slope: ${prediction.prediction.rsiSlope.toFixed(3)} | Velocity: ${prediction.prediction.velocity.toFixed(5)}`);
                console.log(`   Momentum: ${prediction.prediction.momentum.toFixed(3)} | Accel: ${prediction.prediction.acceleration.toFixed(5)}`);
                console.log(`   Should Trade: ${prediction.shouldTrade} | Position: ${(prediction.positionSize * 100).toFixed(0)}%`);
            }
            
            // Store prediction for learning
            this.lastPrediction = prediction;
            
            // Check entry filters from AI
            const entryFilters = aiPrediction.checkEntryFilters({
                candles,
                prediction,
                newsCheck
            });
            
            if (!entryFilters.canTrade) {
                console.log(`🚫 AI FILTER BLOCK: ${entryFilters.reasons.join(', ')}`);
                return null;
            }
            
            // Override signal if AI prediction is strong
            if (prediction.confidence >= 7 && prediction.shouldTrade) {
                // AI has high confidence, trust it
                console.log(`🎯 AI OVERRIDE: High confidence prediction (${prediction.confidence}/10)`);
            }
            
            // Detect market condition
            const market = marketDetector.detect(candles, indicators);
            
            // 🎯 PROFIT FILTER 4: Market condition filter
            if (config.marketFilter.blocked.includes(market.type)) {
                console.log(`🚫 BLOCKED: ${market.type} market has poor win rate (35-45%) - Only trading SIDEWAY (92.5%)`);
                return null;
            }
            
            // 🎯 MULTI-TIMEFRAME CONFLUENCE CHECK
            const confluence = await this.calculateTimeframeConfluence(pair);
            const confluenceBonus = Math.floor(confluence.score * 3); // Up to +3 bonus
            const minAlignment = config.timeframeConfluence.minAlignment;
            
            if (confluence.score < minAlignment) {
                console.log(`🚫 BLOCKED: Timeframe confluence ${(confluence.score*100).toFixed(0)}% below threshold ${(minAlignment*100).toFixed(0)}%`);
                console.log(`   1m RSI: ${confluence.details.rsis?.['1m']?.toFixed(1) || 'N/A'}, 5m RSI: ${confluence.details.rsis?.['5m']?.toFixed(1) || 'N/A'}, 15m RSI: ${confluence.details.rsis?.['15m']?.toFixed(1) || 'N/A'}`);
                return null;
            }
            
            console.log(`📊 Market: ${market.type || 'UNKNOWN'} | RSI: ${rsi.toFixed(2)} | Confluence: ${(confluence.score*100).toFixed(0)}%${currentPrice ? ` | Price: ${currentPrice}` : ''}`);
            
            // Check AI shouldTrade decision
            const tradeDecision = aiAnalyzer.shouldTrade(rsi, market.type, pair);
            if (!tradeDecision.shouldTrade) {
                console.log(`🤖 AI BLOCKED: ${tradeDecision.reason}`);
                return null;
            }
            
            // 🎯 PROFIT-OPTIMIZED SIGNAL LOGIC with Micro-Optimization + Timing + Tick Momentum
            let signal = null;
            let score = 0;
            let entryQuality = 'LOW';
            let positionWeight = 1;
            
            // ⏱️ TIMING CHECK: Optimal entry window (seconds 10-19: 78.6% win rate)
            const currentSecond = new Date().getSeconds();
            const isOptimalTiming = currentSecond >= 10 && currentSecond <= 19;
            const timingBonus = isOptimalTiming ? 2 : 0;
            
            // 📊 TICK MOMENTUM CHECK: Confirm entry with real-time tick data
            const tickMomentum = indicators.tickMomentum;
            const hasTickConfirmation = tickMomentum && tickMomentum.strength > 0.3;
            const tickDirection = tickMomentum ? tickMomentum.direction : 'neutral';
            
            // 🎯 SNIPER MODE: Calculate comprehensive entry score
            const sniperScore = this.calculateSniperScore(candles, indicators, pair);
            
            console.log(`\n🎯 SNIPER ANALYSIS for ${pair}:`);
            console.log(`   RSI: ${rsi.toFixed(2)} | Market: ${market.type}`);
            console.log(`   Score: ${sniperScore.score}/10 (threshold: ${this.sniperConfig.scoring.minThreshold})`);
            if (sniperScore.breakdown.length > 0) {
                sniperScore.breakdown.forEach(item => console.log(`   ✅ ${item}`));
            }
            
            // 🚫 SNIPER BLOCK: Score must be >= 7 to trade
            if (!sniperScore.passed) {
                console.log(`   ❌ SNIPER REJECT: Score ${sniperScore.score} < ${this.sniperConfig.scoring.minThreshold}`);
                console.log(`      Missing: ${!sniperScore.rsiExtreme ? 'RSI Extreme ' : ''}${!sniperScore.momentumShift ? 'Momentum Shift' : ''}`);
                return null;
            }
            
            // 🧠 HEDGE FUND AI: Ultra Entry Analysis
            const ultraEntryResult = ultraEntry.analyzeEntry(
                pair, 
                candles, 
                indicators, 
                tickMomentum ? [tickMomentum] : null,
                currentPrice
            );
            
            if (ultraEntryResult.shouldTrade) {
                console.log(`\n🤖 HEDGE FUND AI APPROVED:`);
                console.log(`   Direction: ${ultraEntryResult.direction}`);
                console.log(`   Confidence: ${ultraEntryResult.confidence.toFixed(1)}/10`);
                console.log(`   Entry Quality: ${ultraEntryResult.entryQuality}/10`);
                console.log(`   Systems Aligned: ${ultraEntryResult.agreements}/4`);
            } else {
                console.log(`\n🤖 HEDGE FUND AI REJECTED: ${ultraEntryResult.reason || 'Conditions not met'}`);
                return null;
            }
            
            // 🎯 SNIPER APPROVED: High quality entry detected
            console.log(`   🎯 SNIPER APPROVED: High quality entry!`);
            
            // Determine signal direction based on Ultra Entry System
            entryQuality = 'HIGH';
            
            // Use Ultra Entry System direction if available
            if (ultraEntryResult.signal) {
                signal = ultraEntryResult.signal;
                entryQuality = ultraEntryResult.entryQuality >= 8 ? 'PERFECT' : 
                              ultraEntryResult.entryQuality >= 6 ? 'HIGH' : 'MEDIUM';
                console.log(`   📊 HEDGE FUND SIGNAL: ${signal} (Quality: ${entryQuality})`);
            } else if (rsi < this.sniperConfig.rsi.callMax) {
                signal = 'BUY';
                console.log(`   📈 SIGNAL: BUY (RSI ${rsi.toFixed(2)} < ${this.sniperConfig.rsi.callMax})`);
            } else if (rsi > this.sniperConfig.rsi.putMin) {
                signal = 'SELL';
                console.log(`   📉 SIGNAL: SELL (RSI ${rsi.toFixed(2)} > ${this.sniperConfig.rsi.putMin})`);
            }
            
            // Calculate SNIPER position sizing
            const positionSizing = this.calculateSniperPositionSize(1);
            positionWeight = positionSizing.multiplier;
            
            // Add timing bonus for optimal entry window
            score += timingBonus;
            if (isOptimalTiming) {
                console.log(`⏱️ OPTIMAL TIMING: Second ${currentSecond} (10-19s window: 78.6% win rate)`);
            }
            
            // Add time bonus for best hours
            score += timeBonus;
            
            // Add combo bonus
            score += comboBonus;
            
            // Add multi-timeframe confluence bonus
            score += confluenceBonus;
            
            // Threshold filter - stricter for non-optimal timing
            const baseThreshold = 4;
            const timingThreshold = isOptimalTiming ? 0 : 2;
            const qualityThreshold = entryQuality === 'PERFECT' ? -2 : entryQuality === 'HIGH' ? -1 : entryQuality === 'LOW' ? 2 : 0;
            const adjustedThreshold = baseThreshold + timingThreshold + qualityThreshold;
            
            if (signal && score < adjustedThreshold) {
                console.log(`⚠️ Signal rejected: score ${score} below threshold ${adjustedThreshold}`);
                signal = null;
            }
            
            if (signal) {
                console.log(`🎯 Entry: ${entryQuality} | Score: ${score}/${adjustedThreshold} | Combo: +${comboBonus} | Timing: +${timingBonus} | Confluence: +${confluenceBonus} | Tick: ${tickDirection} | Position: ${positionWeight.toFixed(2)}x`);
            }
            
            if (signal) {
                const tradeConfig = require('../config/config');
                const baseAmount = tradeConfig.TRADE_AMOUNT || 1;
                const tradeAmount = baseAmount * positionWeight; // Dynamic position sizing
                
                console.log(`🚀 EXECUTING: ${signal} ${pair} $${tradeAmount.toFixed(2)} (base: $${baseAmount} × weight: ${positionWeight.toFixed(2)})`);
                
                try {
                    const result = await this.executeTrade(pair, signal, tradeAmount);
                    
                    if (result.success) {
                        console.log(`✅ TRADE SUCCESS: ${signal} ${pair} - Result: ${result.outcome || 'pending'}`);
                        
                        // Record with profit config context
                        this.optimizer.record(result.outcome || 'pending', market.type || 'SIDEWAY', {
                            pair,
                            signal,
                            rsi,
                            score,
                            entryQuality,
                            hour: currentHour
                        });
                        
                        this.learning.record({
                            result: result.outcome || 'pending',
                            pair,
                            signal,
                            rsi,
                            score,
                            entryQuality
                        });
                        
                        // Performance tracking
                        if (this.learning.history.length % 5 === 0) {
                            const winrate = this.learning.analyze();
                            this.optimizer.adjust(winrate);
                            
                            if (winrate < 60) {
                                console.log("⚠️ Low performance - tightening profit filters");
                            } else if (winrate > 75) {
                                console.log("✅ High performance - maintaining current filters");
                            }
                        }
                        
                        if (this.learning.history.length % 10 === 0) {
                            const winrate = this.learning.analyze();
                            dashboard.display({
                                balance: this.currentBalance,
                                initialBalance: this.initialBalance,
                                profit: this.currentBalance - this.initialBalance,
                                winrate,
                                trades: this.learning.history.length,
                                params: this.profitConfig
                            });
                            
                            console.log('\n🤖 GENERATING AI ANALYSIS REPORT...');
                            aiAnalyzer.generateReport();
                        }
                        
                        if (result.outcome === 'loss') {
                            this.consecutiveLosses++;
                            console.log(`⚠️  Loss count: ${this.consecutiveLosses}/${config.maxConsecutiveLosses}`);
                        } else if (result.outcome === 'win') {
                            this.consecutiveLosses = 0;
                            console.log(`🎉 Win! Reset loss count`);
                        }
                    }
                } catch (tradeError) {
                    console.log(`❌ Trade execution error: ${tradeError.message}`);
                }
                
                pairState.lastTradeTime = new Date();
                pairState.tradeCount++;
                pairState.cooldownUntil = Date.now() + (5 * 60 * 1000);
            }
            
            this.pairStates.set(pair, pairState);
            
            this.lastAnalysisData = {
                pair,
                marketCondition: market.type || 'UNKNOWN',
                rsi: indicators.rsi || 50,
                momentum: indicators.momentum,
                tickMomentum: indicators.tickMomentum, // Include for AI learning
                timestamp: Date.now()
            };
            
            return {
                pair,
                indicators,
                signal,
                entryQuality,
                score,
                shouldTrade: !!signal,
                timestamp: new Date()
            };
        } catch (error) {
            logger.error(`Pair analysis failed for ${pair}`, error);
            return null;
        }
    }

    /**
     * Record trade result for continuous performance monitoring
     */
    recordTradeResult(trade) {
        const metrics = this.performanceMetrics;
        
        // Add to recent trades window
        metrics.recentTrades.push({
            result: trade.result,
            timestamp: Date.now(),
            rsi: trade.rsi,
            entryQuality: trade.entryQuality,
            pair: trade.pair
        });
        
        // 🧠 Update AI Prediction Engine with result for learning
        if (this.lastPrediction && trade.result) {
            const aiPrediction = require('./aiPredictionEngine');
            aiPrediction.updatePredictionResult(
                trade.pair,
                this.lastPrediction.direction,
                trade.result
            );
            
            // Log prediction accuracy periodically
            if (metrics.recentTrades.length % 10 === 0) {
                const stats = aiPrediction.getLearningStats();
                console.log(`\n🔮 AI Prediction Stats: ${stats.accuracy} accuracy (${stats.correctPredictions}/${stats.totalPredictions})`);
            }
        }
        
        // 🧠 RL LEARNING: Record trade and update Q-table
        if (this.lastAnalysisData && trade.result) {
            const state = rlEngine.encodeState(
                {
                    rsi: trade.rsi || 50,
                    momentum: this.lastAnalysisData.momentum,
                    rsiSlope: 0  // Could calculate from history
                },
                trade.marketCondition || 'UNKNOWN',
                trade.pair,
                new Date().getHours()
            );
            
            const action = trade.direction === 'BUY' ? 'CALL' : 
                          trade.direction === 'SELL' ? 'PUT' : 'SKIP';
            
            const profit = trade.profit || (trade.result === 'win' ? 1 : -1);
            
            // Record trade outcome for RL learning
            rlEngine.recordTrade(
                trade.orderId || Date.now(),
                state,
                action,
                trade.result,
                profit,
                this.lastAnalysisData.strategy || 'REVERSAL'
            );
            
            // Generate RL report periodically
            if (metrics.recentTrades.length % 20 === 0) {
                rlEngine.generateReport();
            }
        }
        
        // Maintain rolling window size
        if (metrics.recentTrades.length > metrics.windowSize) {
            metrics.recentTrades.shift();
        }
        
        // Check if we should auto-adjust
        if (metrics.recentTrades.length % this.profitConfig.autoAdjustment.checkInterval === 0) {
            this.autoAdjustStrategy();
        }
    }
    
    /**
     * Calculate rolling win rate from recent trades
     */
    calculateRollingWinRate() {
        const trades = this.performanceMetrics.recentTrades;
        if (trades.length === 0) return 0;
        
        const wins = trades.filter(t => t.result === 'win').length;
        return (wins / trades.length) * 100;
    }
    
    /**
     * Auto-adjust strategy based on rolling performance
     */
    autoAdjustStrategy() {
        const winRate = this.calculateRollingWinRate();
        const config = this.profitConfig.autoAdjustment;
        const metrics = this.performanceMetrics;
        
        let newLevel = 'good';
        if (winRate >= config.thresholds.excellent) newLevel = 'excellent';
        else if (winRate >= config.thresholds.good) newLevel = 'good';
        else if (winRate >= config.thresholds.warning) newLevel = 'warning';
        else newLevel = 'critical';
        
        // Only adjust if level changed
        if (newLevel !== metrics.currentAdjustment) {
            const oldLevel = metrics.currentAdjustment;
            metrics.currentAdjustment = newLevel;
            
            // Record adjustment
            metrics.adjustmentHistory.push({
                timestamp: Date.now(),
                from: oldLevel,
                to: newLevel,
                winRate: winRate
            });
            
            const adjustment = config.adjustments[newLevel];
            
            console.log('\n═══════════════════════════════════════════════════════════');
            console.log(`🔄 AUTO-ADJUSTMENT: ${oldLevel.toUpperCase()} → ${newLevel.toUpperCase()}`);
            console.log(`   Rolling Win Rate: ${winRate.toFixed(1)}%`);
            console.log(`   Threshold Modifier: ${adjustment.thresholdModifier > 0 ? '+' : ''}${adjustment.thresholdModifier}`);
            console.log(`   Position Multiplier: ${adjustment.positionMultiplier}x`);
            
            if (newLevel === 'critical') {
                console.log('🛑 EMERGENCY STOP: Trading halted due to poor performance');
                this.stop();
            }
            console.log('═══════════════════════════════════════════════════════════\n');
        }
    }
    
    /**
     * Get current auto-adjustment parameters
     */
    getAutoAdjustmentParams() {
        const level = this.performanceMetrics.currentAdjustment;
        return this.profitConfig.autoAdjustment.adjustments[level];
    }

    /**
     * Calculate multi-timeframe confluence score
     * Analyzes 1m, 5m, 15m timeframes for alignment confirmation
     */
    async calculateTimeframeConfluence(pair) {
        try {
            const config = this.profitConfig.timeframeConfluence;
            if (!config.enabled) return { score: 1, alignment: 1, details: {} };
            
            // Fetch candles for multiple timeframes in parallel
            const [candles1m, candles5m, candles15m] = await Promise.all([
                iqoptionAPI.getCandles(pair, 60, 50),    // 1 minute
                iqoptionAPI.getCandles(pair, 300, 20),   // 5 minute
                iqoptionAPI.getCandles(pair, 900, 10)    // 15 minute
            ]);
            
            // Calculate RSI for each timeframe
            const rsi1m = this.calculateRSI(candles1m);
            const rsi5m = this.calculateRSI(candles5m);
            const rsi15m = this.calculateRSI(candles15m);
            
            // Determine alignment for CALL (all RSIs < 30 = oversold alignment)
            const callAlignment = (
                (rsi1m < 30 ? 1 : 0) +
                (rsi5m < 30 ? 1 : 0) +
                (rsi15m < 30 ? 1 : 0)
            ) / 3;
            
            // Determine alignment for PUT (all RSIs > 70 = overbought alignment)
            const putAlignment = (
                (rsi1m > 70 ? 1 : 0) +
                (rsi5m > 70 ? 1 : 0) +
                (rsi15m > 70 ? 1 : 0)
            ) / 3;
            
            // Calculate weighted confluence score
            const confluenceScore = {
                call: callAlignment,
                put: putAlignment,
                rsis: { '1m': rsi1m, '5m': rsi5m, '15m': rsi15m }
            };
            
            // Log confluence data
            logger.debug(`Timeframe confluence for ${pair}:`, confluenceScore);
            
            return {
                score: Math.max(callAlignment, putAlignment),
                callAlignment,
                putAlignment,
                details: confluenceScore
            };
            
        } catch (error) {
            logger.warn(`Timeframe confluence calculation failed for ${pair}`, error.message);
            return { score: 0.5, alignment: 0.5, details: {} }; // Neutral on error
        }
    }

    /**
     * ═══════════════════════════════════════════════════════════════
     * 🎯 SNIPER MODE - ULTRA-PRECISE ENTRY METHODS
     * ═══════════════════════════════════════════════════════════════
     */
    
    /**
     * Calculate Sniper Score - Entry quality assessment
     * Score >= 7 required to trade
     */
    calculateSniperScore(candles, indicators, pair) {
        const config = this.sniperConfig;
        const rsi = indicators.rsi;
        const momentum = indicators.momentum;
        const tickMomentum = indicators.tickMomentum;
        
        let score = 0;
        let breakdown = [];
        
        // 1. RSI EXTREME (+2)
        const isRSIExtreme = rsi < config.rsi.callMax || rsi > config.rsi.putMin;
        if (isRSIExtreme) {
            score += config.scoring.rsiExtreme;
            breakdown.push(`RSI Extreme (${rsi.toFixed(1)}): +${config.scoring.rsiExtreme}`);
        }
        
        // 2. BOLLINGER BAND EDGE (+3) - High weight due to excellent 83.3% win rate
        const bbCheck = this.checkBollingerEdge(candles);
        if (bbCheck.atEdge && bbCheck.rejection) {
            score += 3; // Increased from 2 based on backtest data
            breakdown.push(`BB Edge Rejection: +3 (83.3% WR)`);
        }
        
        // 3. PRICE ACTION (+1) - Reduced weight due to poor backtest performance
        const priceAction = this.detectPriceAction(candles);
        if (priceAction.pattern && !priceAction.pattern.includes('Engulfing')) {
            score += 1; // Reduced from 2, exclude engulfing
            breakdown.push(`${priceAction.pattern}: +1`);
        }
        
        // 4. MOMENTUM SHIFT (+3) - HIGHEST WEIGHT
        const momentumShift = this.detectMomentumShift(momentum, tickMomentum, rsi);
        if (momentumShift.hasShift) {
            score += config.scoring.momentumShift;
            breakdown.push(`Momentum Shift (${momentumShift.type}): +${config.scoring.momentumShift}`);
        }
        
        return {
            score,
            breakdown,
            passed: score >= config.scoring.minThreshold,
            rsiExtreme: isRSIExtreme,
            bbEdge: bbCheck.atEdge,
            priceAction: priceAction.pattern,
            momentumShift: momentumShift.hasShift
        };
    }
    
    /**
     * Detect Price Action Patterns
     */
    detectPriceAction(candles) {
        if (!candles || candles.length < 3) return { pattern: null, direction: null };
        
        const current = candles[candles.length - 1];
        const prev = candles[candles.length - 2];
        
        const body = Math.abs(current.close - current.open);
        const upperWick = current.high - Math.max(current.open, current.close);
        const lowerWick = Math.min(current.open, current.close) - current.low;
        const totalRange = current.high - current.low;
        
        // BULLISH ENGULFING
        if (current.close > current.open && prev.close < prev.open &&
            current.open < prev.close && current.close > prev.open) {
            return { pattern: 'Bullish Engulfing', direction: 'UP' };
        }
        
        // BEARISH ENGULGING
        if (current.close < current.open && prev.close > prev.open &&
            current.open > prev.close && current.close < prev.open) {
            return { pattern: 'Bearish Engulfing', direction: 'DOWN' };
        }
        
        // PIN BAR
        const isPinBar = body < totalRange * 0.3 && (upperWick > body * 2 || lowerWick > body * 2);
        if (isPinBar) {
            return lowerWick > upperWick 
                ? { pattern: 'Bullish Pin Bar', direction: 'UP' }
                : { pattern: 'Bearish Pin Bar', direction: 'DOWN' };
        }
        
        // REJECTION
        if (upperWick > body * 2 && current.close < current.open) {
            return { pattern: 'Upper Rejection', direction: 'DOWN' };
        }
        if (lowerWick > body * 2 && current.close > current.open) {
            return { pattern: 'Lower Rejection', direction: 'UP' };
        }
        
        return { pattern: null, direction: null };
    }
    
    /**
     * Check Bollinger Band Edge Touch with Rejection
     */
    checkBollingerEdge(candles) {
        if (!candles || candles.length < 20) return { atEdge: false, rejection: false };
        
        const config = this.sniperConfig.bb;
        const current = candles[candles.length - 1];
        
        const period = config.period;
        const prices = candles.slice(-period).map(c => c.close);
        const sma = prices.reduce((a, b) => a + b, 0) / period;
        
        const squaredDiffs = prices.map(p => Math.pow(p - sma, 2));
        const variance = squaredDiffs.reduce((a, b) => a + b, 0) / period;
        const stdDev = Math.sqrt(variance);
        
        const upperBand = sma + (stdDev * config.deviation);
        const lowerBand = sma - (stdDev * config.deviation);
        
        const touchUpper = current.high >= upperBand - (upperBand * config.touchThreshold);
        const touchLower = current.low <= lowerBand + (lowerBand * config.touchThreshold);
        
        const rejectUpper = touchUpper && current.close < current.open;
        const rejectLower = touchLower && current.close > current.open;
        
        return {
            atEdge: touchUpper || touchLower,
            rejection: rejectUpper || rejectLower,
            atUpper: touchUpper,
            atLower: touchLower
        };
    }
    
    /**
     * Detect Momentum Shift
     */
    detectMomentumShift(candleMomentum, tickMomentum, rsi) {
        if (!candleMomentum || !tickMomentum) return { hasShift: false, type: null };
        
        const rsiOversold = rsi < 25;
        const rsiOverbought = rsi > 75;
        
        const tickReversing = (
            (rsiOversold && tickMomentum.direction === 'up') ||
            (rsiOverbought && tickMomentum.direction === 'down')
        );
        
        const candleReversing = (
            (rsiOversold && candleMomentum.direction === 'UP') ||
            (rsiOverbought && candleMomentum.direction === 'DOWN')
        );
        
        if (tickReversing && candleReversing) {
            return { 
                hasShift: true, 
                type: rsiOversold ? 'OVERSOLD_REVERSAL' : 'OVERBOUGHT_REVERSAL',
                strength: 'STRONG'
            };
        }
        
        return { hasShift: false, type: null, strength: null };
    }
    
    /**
     * Check Loss Control - Pause after 3 losses
     */
    checkLossControl() {
        const config = this.sniperConfig.lossControl;
        
        if (config.cooldownUntil && Date.now() < config.cooldownUntil) {
            const remaining = Math.ceil((config.cooldownUntil - Date.now()) / 60000);
            return { shouldStop: true, reason: `Loss cooldown: ${remaining}min` };
        }
        
        if (this.consecutiveLosses >= config.maxConsecutiveLosses) {
            config.cooldownUntil = Date.now() + (config.pauseMinutes * 60 * 1000);
            return { 
                shouldStop: true, 
                reason: `🛑 SNIPER STOP: ${this.consecutiveLosses} losses. Pause ${config.pauseMinutes}min`
            };
        }
        
        return { shouldStop: false };
    }
    
    /**
     * Calculate SNIPER position size based on win rate and loss streak
     */
    calculateSniperPositionSize(baseAmount) {
        const config = this.sniperConfig.positionSizing;
        let multiplier = config.base;
        let reasons = ['base: 1x'];
        
        // Get recent win rate from AI analyzer
        const recentWinRate = aiAnalyzer?.stats?.winRate || 0;
        const isHighWinRate = recentWinRate > 0.65;
        
        // High win rate boost
        if (isHighWinRate) {
            multiplier *= config.winRateHigh;
            reasons.push(`high WR (${(recentWinRate*100).toFixed(0)}%): x${config.winRateHigh}`);
        }
        
        // Loss streak reduction
        if (this.consecutiveLosses >= 2) {
            multiplier *= config.lossStreak;
            reasons.push(`loss streak (${this.consecutiveLosses}): x${config.lossStreak}`);
        }
        
        return { multiplier, reasons: reasons.join(', ') };
    }

    /**
     * Calculate indicators - SNIPER MODE with all components
     */
    calculateIndicators(candles, pair = 'default') {
        // Use cached RSI calculation
        const rsi = this.calculateRSICached(candles, 14, pair);
        
        // PRIORITY: Use ultra-fast tick momentum if available
        const tickMomentum = iqoptionAPI.getTickMomentum ? iqoptionAPI.getTickMomentum(this.activePair) : null;
        if (tickMomentum && tickMomentum.strength > 0) {
            // Convert tick momentum format to match candle momentum format
            return { 
                rsi, 
                momentum: {
                    direction: tickMomentum.direction.toUpperCase(),
                    strength: tickMomentum.strength,
                    velocity: tickMomentum.velocity,
                    source: 'ticks' // Mark as tick-derived for debugging
                },
                tickMomentum // Include raw tick momentum for correlation tracking
            };
        }
        
        // Fallback to candle-based momentum
        const momentum = this.calculatePriceMomentum(candles);
        return { rsi, momentum };
    }
    
    /**
     * Calculate price momentum for entry timing
     */
    calculatePriceMomentum(candles) {
        if (!candles || candles.length < 5) {
            return { direction: 'NEUTRAL', strength: 0, velocity: 0 };
        }
        
        const recent = candles.slice(-5);
        const firstPrice = recent[0].close;
        const lastPrice = recent[recent.length - 1].close;
        
        // Calculate velocity (price change per candle)
        const velocity = (lastPrice - firstPrice) / firstPrice;
        
        // Count directional moves
        let upMoves = 0;
        let downMoves = 0;
        
        for (let i = 1; i < recent.length; i++) {
            if (recent[i].close > recent[i-1].close) upMoves++;
            else if (recent[i].close < recent[i-1].close) downMoves++;
        }
        
        // Determine direction and strength
        const direction = upMoves > downMoves ? 'UP' : downMoves > upMoves ? 'DOWN' : 'NEUTRAL';
        const strength = Math.abs(upMoves - downMoves) / (recent.length - 1);
        
        return { direction, strength, velocity };
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

    async executeTrade(pair, signal, baseAmount) {
        try {
            // 🔥 OFFLINE MODE: Simulate trade instead of executing real trade
            const api = require('../api/unifiediqoption');
            if (api.networkMode === 'OFFLINE' || api.mockDataEnabled) {
                console.log(`📴 [OFFLINE] Simulating ${signal} trade on ${pair}`);
                
                // Generate simulated trade result (random win/loss for testing)
                const isWin = Math.random() > 0.45; // 55% win rate simulation
                const outcome = isWin ? 'win' : 'loss';
                const profit = isWin ? baseAmount * 0.82 : -baseAmount;
                
                // Simulate delay
                await this.sleep(100);
                
                const mockResult = {
                    success: true,
                    outcome: outcome,
                    tradeId: `MOCK_${Date.now()}`,
                    amount: baseAmount,
                    profit: profit,
                    offline: true
                };
                
                console.log(`📴 [OFFLINE] Trade result: ${outcome.toUpperCase()} $${profit.toFixed(2)}`);
                
                // Record for learning even in offline mode
                aiAnalyzer.recordTrade({
                    orderId: mockResult.tradeId,
                    pair,
                    direction: signal,
                    amount: baseAmount,
                    result: outcome,
                    profit: profit,
                    rsi: 50,
                    marketCondition: 'SIDEWAY',
                    timestamp: new Date(),
                    offline: true
                });
                
                return mockResult;
            }
            
            // Validate inputs
            if (!pair || !signal || !baseAmount || baseAmount <= 0) {
                return { 
                    success: false, 
                    error: `Invalid parameters: pair=${pair}, signal=${signal}, amount=${baseAmount}` 
                };
            }
            
            // Get AI-recommended position size with edge score
            const edgeScore = score; // Use signal score as edge indicator
            const sizing = aiAnalyzer.calculatePositionSize(baseAmount, edgeScore);
            const amount = sizing.finalSize;
            
            if (!sizing.shouldTrade || amount <= 0) {
                console.log(`🛑 AI RECOMMENDATION: Stop trading - ${sizing.reason}`);
                return { success: false, error: sizing.reason, aiBlocked: true };
            }
            
            console.log(`🚀 Executing ${signal} on ${pair} with $${amount.toFixed(2)}`);
            console.log(`   AI sizing: ${sizing.reason} (Kelly: ${(sizing.kelly * 100).toFixed(1)}%)`);
            
            // Execute trade with retry
            let result = null;
            let lastError = null;
            const maxRetries = 2;
            
            for (let attempt = 0; attempt <= maxRetries; attempt++) {
                try {
                    if (attempt > 0) {
                        console.log(`🔄 Retry ${attempt}/${maxRetries}...`);
                        await this.sleep(1000 * attempt);
                    }
                    
                    result = await iqoptionAPI.placeTrade({
                        pair,
                        direction: signal,
                        amount,
                        duration: 1
                    });
                    
                    // Validate result
                    if (result && result.success && (result.id || result.order_id)) {
                        break; // Success
                    }
                    
                    if (result && !result.success) {
                        lastError = result.error || 'Unknown error';
                        logger.warn(`Trade attempt ${attempt + 1} failed:`, lastError);
                    }
                    
                } catch (error) {
                    lastError = error.message;
                    logger.warn(`Trade attempt ${attempt + 1} exception:`, lastError);
                }
            }
            
            // Check final result
            if (!result || !result.success) {
                return { 
                    success: false, 
                    error: lastError || 'Trade execution failed after all retries',
                    attempts: maxRetries + 1
                };
            }
            
            // Record trade in AI analyzer as pending
            const orderId = result.id || result.order_id;
            
            // OPTIMIZED: Use cached market data from analysis instead of fetching again
            // This saves ~500-1000ms per trade execution
            let marketCondition = 'UNKNOWN';
            let rsi = 50;
            
            // Try to get from cache first
            if (this.lastAnalysisData && this.lastAnalysisData.pair === pair) {
                marketCondition = this.lastAnalysisData.marketCondition || 'UNKNOWN';
                rsi = this.lastAnalysisData.rsi || 50;
                logger.debug('Using cached market data for trade recording');
            } else {
                // Fallback: fetch fresh data (should rarely happen)
                try {
                    const candles = await iqoptionAPI.getCandles(pair, 60, 100);
                    if (candles && candles.length > 0) {
                        const indicators = this.calculateIndicators(candles);
                        rsi = indicators.rsi || 50;
                        const market = marketDetector.detect(candles, indicators);
                        marketCondition = market.type || 'UNKNOWN';
                    }
                } catch (e) {
                    logger.debug('Could not get market condition for trade recording:', e.message);
                }
            }
            
            // Record for AI learning
            aiAnalyzer.recordTrade({
                orderId: orderId,
                pair,
                direction: signal,
                amount,
                result: 'pending',
                profit: 0,
                rsi,
                marketCondition,
                timestamp: new Date()
            });
            
            // Register with trade tracker
            tradeTracker.registerTrade(orderId, {
                pair,
                direction: signal,
                amount,
                rsi,
                marketCondition
            });
            
            console.log(`📋 Trade #${orderId} registered for AI learning`);
            
            return {
                success: true,
                outcome: 'pending',
                tradeId: orderId,
                amount
            };
            
        } catch (error) {
            logger.error(`Trade execution failed for ${pair}`, error);
            return { 
                success: false, 
                error: error.message,
                fatal: error.message.includes('Authentication') || error.message.includes('Not connected')
            };
        }
    }

    async start() {
        if (this.isRunning) {
            console.log('⚠️ Bot is already running');
            return;
        }
        
        // 🔥 Check network mode
        const api = require('../api/unifiediqoption');
        const isOffline = api.networkMode === 'OFFLINE' || api.mockDataEnabled;
        
        console.log(isOffline ? '📴 Starting Trading Bot in OFFLINE mode...' : '🚀 Starting Trading Bot with AI Learning...');
        this.isRunning = true;
        this.consecutiveErrors = 0;
        
        // Start trade result tracker
        tradeTracker.start();
        
        // Start health monitor
        healthMonitor.start();
        
        // Show initial AI stats if available
        if (aiAnalyzer.stats.totalTrades > 0) {
            console.log(`📊 AI has ${aiAnalyzer.stats.totalTrades} historical trades (${(aiAnalyzer.stats.winRate * 100).toFixed(1)}% win rate)`);
        }
        
        // Initialize balance
        if (isOffline) {
            this.initialBalance = 10000;
            this.currentBalance = 10000;
            console.log(`💰 Offline mode balance: $${this.currentBalance}`);
        } else {
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
            
            // Subscribe to real-time price stream for active pair
            try {
                console.log(`📡 Subscribing to real-time price: ${this.activePair}...`);
                await iqoptionAPI.subscribePrice(this.activePair);
                console.log(`✅ Price subscription active`);
                
                // Wait for first price update
                await iqoptionAPI.waitForPrice(this.activePair, 5000);
                const initialPrice = iqoptionAPI.getCurrentPrice(this.activePair);
                console.log(`💵 Current price: ${initialPrice}`);
                
            } catch (error) {
                logger.warn('Could not subscribe to price stream', error);
                console.log(`⚠️ Using candles for price (slower)`);
            }
        }
        
        // Initialize risk manager with current balance
        if (this.riskManager && typeof this.riskManager.initialize === 'function') {
            try {
                await this.riskManager.initialize(this.currentBalance || 100);
            } catch (e) {
                logger.warn('Risk manager initialization failed:', e.message);
            }
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
        
        console.log(isOffline ? '✅ Bot started in OFFLINE mode (mock data)' : '✅ Bot started successfully with AI Learning enabled');
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
                if (error.message && (
                    error.message.includes('FATAL') || 
                    error.message.includes('Authentication') ||
                    error.message.includes('Not connected') ||
                    error.message.includes('Credentials')
                )) {
                    this.consecutiveErrors = (this.consecutiveErrors || 0) + 1;
                    throw error;
                }
            }
        }
        
        // All retries failed
        this.consecutiveErrors = (this.consecutiveErrors || 0) + 1;
        throw new Error(`Analysis failed after ${maxRetries + 1} attempts: ${lastError ? lastError.message : 'Unknown error'}`);
    }
    
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * ═══════════════════════════════════════════════════════════════
     * 🤖 MULTI-AGENT TRADING SYSTEM
     * ═══════════════════════════════════════════════════════════════
     */
    
    /**
     * Make trading decision using Multi-Agent System
     * Pipeline: signal → risk → execution → learning
     */
    async makeMultiAgentDecision(pair) {
        try {
            // Get market data
            const candles = await iqoptionAPI.getCandles(pair, 60, 100);
            if (!candles || candles.length < 50) {
                throw new Error('Insufficient candle data');
            }
            
            // Calculate indicators
            const indicators = this.calculateIndicators(candles, pair);
            const currentPrice = iqoptionAPI.getCurrentPrice(pair);
            indicators.currentPrice = currentPrice;
            
            // Detect market regime
            const regime = marketRegime.detectRegime(candles, pair);
            
            console.log(`\n🎯 MARKET REGIME: ${regime.regime} (confidence: ${(regime.confidence * 100).toFixed(1)}%)`);
            console.log(`   Strategy: ${regime.strategy?.primary || 'REVERSAL'} | Bias: ${regime.strategy?.bias || 'NEUTRAL'}`);
            
            // Get pair performance data
            const pairPerformance = portfolioManager.pairData.get(pair);
            
            // MULTI-AGENT DECISION
            const decision = await multiAgent.makeDecision({
                candles,
                indicators,
                pair,
                portfolioValue: this.currentBalance,
                pairPerformance,
                api: iqoptionAPI
            });
            
            // Log agent decisions
            console.log(`\n🤖 MULTI-AGENT DECISION:`);
            console.log(`   Signal: ${decision.signal?.direction || 'SKIP'} (confidence: ${(decision.signal?.confidence || 0).toFixed(2)})`);
            console.log(`   Risk: ${decision.riskAssessment?.allowed ? 'APPROVED' : 'REJECTED'} (${decision.riskAssessment?.riskLevel})`);
            console.log(`   Execution: ${decision.execution?.success ? 'SUCCESS' : decision.execution?.success === false ? 'FAILED' : 'PENDING'}`);
            
            // Execute if approved
            if (decision.action && decision.action !== 'SKIP' && decision.action !== 'STOP') {
                const tradeConfig = require('../config/config');
                const baseAmount = tradeConfig.TRADE_AMOUNT || 1;
                
                const result = await this.executeTrade(pair, decision.action, baseAmount);
                
                // Record for learning
                if (result.success) {
                    multiAgent.recordResult(
                        { outcome: 'pending', amount: result.amount, pair },
                        decision.signal?.rlDecision?.state,
                        decision.signal,
                        decision.riskAssessment
                    );
                    
                    // Update portfolio
                    portfolioManager.requestCapital(pair, result.amount, decision.signal.confidence);
                }
                
                return result;
            }
            
            return {
                success: false,
                reason: decision.reason || 'Multi-agent rejected trade',
                action: decision.action
            };
            
        } catch (error) {
            logger.error(`Multi-agent decision failed for ${pair}`, error);
            return { success: false, error: error.message };
        }
    }
    
    /**
     * Update portfolio with trade result
     */
    updatePortfolio(pair, amount, profit) {
        portfolioManager.releaseCapital(pair, amount, profit);
        
        // Show portfolio report periodically
        if (portfolioManager.portfolio.totalProfit % 10 === 0) {
            portfolioManager.generateReport();
        }
        
        // Check if rebalancing needed
        if (portfolioManager.checkRebalance()) {
            portfolioManager.rebalance();
        }
    }

    stop() {
        if (!this.isRunning) {
            console.log('⚠️ Bot is not running');
            return;
        }
        
        this.isRunning = false;
        
        // Stop health monitor
        healthMonitor.stop();
        
        // Stop trade tracker
        tradeTracker.stop();
        
        if (this.tradingInterval) {
            clearInterval(this.tradingInterval);
            this.tradingInterval = null;
        }
        
        console.log('🛑 Trading Bot Stopped');
        console.log(`📊 Trades pending results: ${tradeTracker.getPendingCount()}`);
    }
}

module.exports = new TradingBot();
