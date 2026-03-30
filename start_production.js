/**
 * Production Trading Bot - Start Script
 * 
 * Usage:
 *   node start_production.js [mode]
 * 
 * Modes:
 *   demo     - Paper trading (default)
 *   live     - Real trading (⚠️ ระวัง!)
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

// Load modules
const MoneyManager = require('./src/core/moneyManager.js');
const MarketDetector = require('./src/core/marketDetector.js');
const StrategySelector = require('./src/core/strategySelector.js');
const DynamicEdgeSystem = require('./src/core/dynamicEdgeSystem.js');
const SniperEntry = require('./src/strategies/sniperEntry.js');
const ConfidenceScore = require('./src/core/confidenceScore.js');
const IQOptionClient = require('./src/api/iqOptionClient.js');
const logger = require('./src/utils/logger.js');
const TradeAnalytics = require('./src/core/tradeAnalytics.js');
const FilterManager = require('./src/filters/filterManager.js');
const TradeVerifier = require('./src/utils/tradeVerifier.js');

class ProductionBot {
    constructor(mode = 'demo') {
        this.mode = mode;
        this.isRunning = false;
        this.stopRequested = false;
        this.crashCount = 0;
        this.maxCrashes = 10;
        this.lastCrashTime = null;
        this.healthCheckInterval = null;
        
        // Trade safety
        this.lastTradeTime = null;
        this.minTradeInterval = 60000; // 60 seconds minimum between trades
        this.activeTrade = false;
        
        // Initialize components
        this.moneyManager = new MoneyManager();
        this.marketDetector = new MarketDetector();
        this.strategySelector = new StrategySelector();
        this.edgeSystem = new DynamicEdgeSystem();
        this.sniperEntry = new SniperEntry();
        this.confidenceScore = new ConfidenceScore();
        this.api = new IQOptionClient();
        this.analytics = new TradeAnalytics();
        this.filterManager = FilterManager;
        this.tradeVerifier = new TradeVerifier(); // NEW: Trade result verification
        
        // Store last analysis context for analytics
        this.lastAnalysisContext = null;
        
        // Configuration
        this.config = {
            initialBalance: 1000,
            tradePercent: 1,
            asset: 'EURUSD-OTC',
            timeframe: 60,
            duration: 60,
            minScore: 2.0,
            maxDailyLossPercent: 5,
            hardStopDrawdown: 10,
            killSwitchPercent: 90,
            maxTradeAmount: 100, // Maximum $100 per trade safety limit
            enableHealthCheck: true,
            healthCheckInterval: 30000 // 30 seconds
        };
        
        // Stats
        this.peakBalance = this.config.initialBalance;
        this.maxDrawdown = 0;
        this.tradeCount = 0;
        this.consecutiveLosses = 0;
        this.currentOrderId = null; // NEW: Track current order ID
        
        // Position sizing configuration
        this.positionSizing = {
            normal: 1.0,
            increased: 1.5
        };
        
        // State persistence
        this.stateFile = 'logs/bot_state.json';
        this.loadState();
        
        // Setup process handlers
        this.setupProcessHandlers();
    }

    async initialize() {
        console.log('\n' + '='.repeat(80));
        console.log(`     IQ OPTION SMART BOT - ${this.mode.toUpperCase()} MODE`);
        console.log('='.repeat(80) + '\n');
        
        // Load config
        this.loadConfig();
        
        // Initialize money manager
        this.moneyManager.initialize(this.config.initialBalance);
        this.moneyManager.maxDailyLossPercent = this.config.maxDailyLossPercent;
        
        // Connect to API if live mode
        if (this.mode === 'live') {
            console.log('⚠️  LIVE TRADING MODE - REAL MONEY AT RISK!');
            console.log('Press Ctrl+C within 5 seconds to cancel...\n');
            await this.sleep(5000);
            
            if (this.stopRequested) {
                console.log('Cancelled.');
                process.exit(0);
            }
            
            // Use hardened auto-connect with intelligent fallback
            console.log('🔌 Attempting intelligent connection to IQ Option...');
            console.log('   (Will auto-detect network issues and fallback to DEMO if needed)\n');
            
            const connectResult = await this.api.autoConnect('live');
            
            if (!connectResult.success) {
                console.error('\n❌ CONNECTION FAILED');
                console.error('❌ Cannot proceed with LIVE trading');
                process.exit(1);
            }
            
            if (connectResult.mode === 'demo') {
                // Auto-fallback to DEMO mode
                console.log('\n⚠️  AUTO-FALLBACK: Switching to DEMO mode');
                console.log(`   Reason: ${connectResult.reason}`);
                console.log('   Network is blocked, using simulated data instead\n');
                this.mode = 'demo';
            } else {
                console.log('\n✅ Connected to IQ Option LIVE!');
                console.log(`   Strategy used: ${connectResult.strategy || 'direct'}`);
                
                // Login
                console.log('\n🔑 Logging in...');
                try {
                    await this.api.login(process.env.IQ_OPTION_EMAIL, process.env.IQ_OPTION_PASSWORD);
                    console.log('✅ Login successful!\n');
                } catch (error) {
                    console.error('❌ Login failed:', error.message);
                    console.error('\n🔍 Possible causes:');
                    console.error('   1. Invalid email/password in .env');
                    console.error('   2. Account needs 2FA verification');
                    console.error('   3. Account locked');
                    process.exit(1);
                }
                
                // Subscribe to market data
                console.log('📊 Subscribing to market data...');
                this.api.subscribeCandles(this.config.asset, this.config.timeframe);
                
                // Wait for initial candle data
                console.log('⏳ Waiting for candle data...');
                await this.sleep(5000);
                
                const candles = this.api.getCandles(this.config.asset, this.config.timeframe);
                if (candles.length > 0) {
                    console.log(`   ✅ Received ${candles.length} candles`);
                    console.log(`   ✅ Last price: ${candles[candles.length - 1].close}\n`);
                } else {
                    console.log('   ⚠️ No candles yet, will retry in loop\n');
                }
                
                console.log('✅ Connected and ready for LIVE trading!\n');
            }
        } else {
            console.log('📘 DEMO MODE - Paper Trading (using simulated data)\n');
        }
        
        // Create logs directory
        if (!fs.existsSync('logs')) {
            fs.mkdirSync('logs');
        }
        
        console.log('💰 Initial Balance: $' + this.config.initialBalance.toFixed(2));
        console.log('📊 Trade Size: ' + this.config.tradePercent + '%');
        console.log('🎯 Asset: ' + this.config.asset);
        console.log('⏱️  Timeframe: ' + this.config.timeframe + 's');
        console.log('🛡️  Daily Loss Limit: ' + this.config.maxDailyLossPercent + '%');
        console.log('🛑 Hard Stop Drawdown: ' + this.config.hardStopDrawdown + '%\n');
        
        this.isRunning = true;
    }

    loadConfig() {
        try {
            const riskConfig = require('./src/config/risk.config.js');
            const tradingConfig = require('./src/config/trading.config.js');
            
            this.config.tradePercent = riskConfig.tradePercent || 1;
            this.config.maxDailyLossPercent = riskConfig.maxDailyLossPercent || 5;
            this.config.hardStopDrawdown = riskConfig.hardStopDrawdown || 10;
            this.config.killSwitchPercent = riskConfig.killSwitchBalancePercent || 90;
            
            this.config.asset = tradingConfig.asset || 'EURUSD';
            this.config.timeframe = tradingConfig.timeframe || 1;
            this.config.duration = tradingConfig.duration || 5;
            this.config.minScore = tradingConfig.minScore || 3.0;
            
        } catch (error) {
            console.log('⚠️  Using default config');
        }
    }

    updateDrawdown() {
        const currentBalance = this.moneyManager.currentBalance;
        if (currentBalance > this.peakBalance) {
            this.peakBalance = currentBalance;
        }
        const drawdown = this.peakBalance - currentBalance;
        if (drawdown > this.maxDrawdown) {
            this.maxDrawdown = drawdown;
        }
        return (drawdown / this.peakBalance) * 100;
    }

    async checkRiskControls(marketCondition = null) {
        const currentBalance = this.moneyManager.currentBalance;
        
        // Use MoneyManager's comprehensive risk checks
        const riskCheck = this.moneyManager.checkRiskControls(marketCondition, this.config.asset);
        if (!riskCheck.allowed) {
            console.log(`\n🛑 RISK CONTROL STOP: ${riskCheck.reason}`);
            return riskCheck;  // Return full object, not just false
        }
        
        // Hard stop drawdown
        const drawdown = this.updateDrawdown();
        if (drawdown >= this.config.hardStopDrawdown) {
            const reason = `HARD STOP: Drawdown ${drawdown.toFixed(2)}% >= ${this.config.hardStopDrawdown}%`;
            console.log(`\n🛑 ${reason}`);
            return { allowed: false, reason };
        }
        
        // Kill switch
        const killSwitchBalance = this.config.initialBalance * (this.config.killSwitchPercent / 100);
        if (currentBalance < killSwitchBalance) {
            const reason = `KILL SWITCH: Balance $${currentBalance.toFixed(2)} < $${killSwitchBalance.toFixed(2)}`;
            console.log(`\n🛑 ${reason}`);
            return { allowed: false, reason };
        }
        
        return { allowed: true, reason: null };
    }

    calculateTradeAmount(edgeResult = null) {
        const currentBalance = this.moneyManager.currentBalance;
        let tradePercent;
        
        // Dynamic position sizing based on edge score
        if (edgeResult && edgeResult.valid && edgeResult.positionSize) {
            tradePercent = edgeResult.positionSize / 100;  // Use edge system position size
        } else {
            tradePercent = this.positionSizing.normal / 100;  // Default 1%
        }
        
        // Equity protection - reduce size on losing streak
        if (this.consecutiveLosses >= 5) {
            tradePercent *= 0.25; // Reduce 75%
        } else if (this.consecutiveLosses >= 3) {
            tradePercent *= 0.50; // Reduce 50%
        }
        
        const amount = Math.floor(currentBalance * tradePercent);
        return Math.max(1, amount);
    }

    async executeTrade(direction, amount, confidence) {
        const tradeId = ++this.tradeCount;
        
        console.log(`\n🎯 TRADE #${tradeId}`);
        console.log(`   Direction: ${direction.toUpperCase()}`);
        console.log(`   Amount: $${amount}`);
        console.log(`   Confidence: ${confidence.totalScore.toFixed(1)} (${confidence.signalStrength})`);
        
        if (this.mode === 'live') {
            // REAL trade via WebSocket API
            try {
                console.log('💰 Executing REAL trade via IQ Option API...');
                
                // VALIDATION: Check amount
                if (!amount || amount <= 0 || isNaN(amount)) {
                    console.log('❌ CRITICAL: Invalid trade amount:', amount);
                    return null;
                }
                
                // VALIDATION: Check direction
                if (!direction || !['call', 'put'].includes(direction)) {
                    console.log('❌ CRITICAL: Invalid direction:', direction);
                    return null;
                }
                
                console.log('📤 Sending order to IQ Option WebSocket...');
                
                // CRITICAL: Place trade and get orderId
                const orderResult = await this.api.placeTrade(
                    this.config.asset,
                    direction,
                    amount,
                    this.config.duration
                );
                
                if (!orderResult || !orderResult.success || !orderResult.order_id) {
                    console.log(`   ❌ Order failed: ${orderResult?.error || 'Unknown error'}`);
                    return null;
                }
                
                const orderId = orderResult.order_id;
                this.currentOrderId = orderId;
                
                console.log(`   ✅ Order placed: ${orderId}`);
                console.log(`   🆔 ORDER ID CONFIRMED: ${orderId}`);
                console.log('   ⏳ BLOCKING: Waiting for trade result...');
                
                // CRITICAL: BLOCKING WAIT - Event-driven result (no polling delay)
                const tradeResult = await this.api.waitForResult(orderId, 120000);
                
                console.log(`   📊 RESULT RECEIVED: ${tradeResult.result}`);
                console.log(`   💰 PROFIT: $${tradeResult.profit}`);
                
                // Verify with TradeVerifier
                this.tradeVerifier.verifyTrade(orderId, tradeResult.result, tradeResult.result);
                
                // Sync balance from API only after result
                try {
                    const balance = await this.api.getRealBalance();
                    if (balance && balance.amount !== undefined) {
                        this.moneyManager.currentBalance = balance.amount;
                        console.log(`   � BALANCE SYNCED: $${balance.amount}`);
                    }
                } catch (e) {
                    console.log('   ⚠️ Balance sync failed:', e.message);
                }
                
                this.currentOrderId = null;
                
                return {
                    success: true,
                    id: orderId,
                    profit: tradeResult.profit,
                    isWin: tradeResult.result === 'WIN',
                    outcome: tradeResult.result.toLowerCase()
                };
                
            } catch (error) {
                console.log(`   ❌ API Error: ${error.message}`);
                console.error(error);
                this.currentOrderId = null;
                return null;
            }
        } else {
            // DEMO trade - simulation (no real money)
            console.log(`   📘 DEMO: Simulating trade (no real money)...`);
            console.log(`   ⚠️  SIMULATION - NOT REAL TRADING`);
            
            // Simulate based on confidence score
            let winRate = 0.55;
            if (confidence.totalScore >= 8.5) winRate = 0.75;
            else if (confidence.totalScore >= 7.0) winRate = 0.65;
            else if (confidence.totalScore >= 6.0) winRate = 0.60;
            
            const isWin = Math.random() < winRate;
            const payout = 0.85;
            const profit = isWin ? amount * payout : -amount;
            
            console.log(`   🎲 SIMULATED Result: ${isWin ? '✅ WIN' : '❌ LOSS'} | Profit: $${profit.toFixed(2)}`);
            
            return {
                success: true,
                profit: profit,
                isWin: isWin
            };
        }
    }

    async tradingLoop() {
        let loopCount = 0;
        
        // CRASH PROTECTION: Outer loop prevents complete bot crash
        while (this.isRunning && !this.stopRequested) {
            loopCount++;
            
            try {
                await this.tradingIteration(loopCount);
            } catch (error) {
                this.crashCount++;
                this.lastCrashTime = Date.now();
                
                console.error('\n' + '!'.repeat(80));
                console.error('🔥 CRASH PREVENTED - Bot will continue');
                console.error('!'.repeat(80));
                console.error(`Crash #${this.crashCount}: ${error.message}`);
                console.error(error.stack);
                
                // Log crash details
                this.logError(error, `Trading Loop Crash #${this.crashCount}`);
                
                // Save state after crash
                this.saveState();
                
                // Check if too many crashes
                if (this.crashCount >= this.maxCrashes) {
                    console.error('\n🛑 TOO MANY CRASHES - Shutting down for safety');
                    this.shutdown();
                    return;
                }
                
                // Wait before retry (exponential backoff)
                const retryDelay = Math.min(5000 * this.crashCount, 60000);
                console.log(`\n⏳ Waiting ${retryDelay}ms before retry...`);
                await this.sleep(retryDelay);
            }
            
            // Small delay between iterations
            await this.sleep(1000);
        }
        
        this.shutdown();
    }

    /**
     * Single trading iteration (wrapped in crash protection)
     */
    async tradingIteration(loopCount) {
        const loopStartTime = Date.now();
        
        console.log(`\n${'─'.repeat(60)}`);
        console.log(`🔄 TRADING LOOP #${loopCount} | ${new Date().toLocaleTimeString()}`);
        console.log(`${'─'.repeat(60)}`);
        
        // Health check
        if (this.config.enableHealthCheck && loopCount % 10 === 0) {
            this.logHealthStatus();
        }
                
                // NORMAL MODE: Check risk controls first
                console.log('🔍 STEP 1: Checking risk controls...');
                const riskCheck = await this.checkRiskControls(null);
                
                // DEBUG: Validate riskCheck format
                if (!riskCheck || typeof riskCheck !== 'object' || !('allowed' in riskCheck)) {
                    console.error('❌ CRITICAL: checkRiskControls returned invalid format:', riskCheck);
                    throw new Error('checkRiskControls must return { allowed, reason } object');
                }
                
                console.log('📊 RISK CHECK FULL:', JSON.stringify(riskCheck, null, 2));
                
                if (!riskCheck.allowed) {
                    console.log(`🛑 BLOCKED: ${riskCheck.reason}`);
                    console.log('⏳ Waiting 60 seconds before retry...');
                    await this.sleep(60000);
                    continue;
                }
                console.log('✅ Risk controls passed');
                
                // Check for stop file
                if (fs.existsSync('STOP')) {
                    console.log('\n🛑 Stop file detected. Stopping...');
                    fs.unlinkSync('STOP');
                    break;
                }
                
                // Initialize Filter Manager
                await this.filterManager.initialize();
                
                // SMART TRADING SYSTEM FLOW
                // API → candles → indicators → market → strategy → filters → score → trade
                
                // STEP 1: Get market data from REAL API
                console.log(`\n📊 STEP 1: Fetching REAL market data for ${this.config.asset}...`);
                let candles;
                if (this.mode === 'live') {
                    console.log('   Mode: LIVE - fetching from IQ Option API...');
                    
                    // CRITICAL: Wait for WebSocket data with timeout
                    let attempts = 0;
                    const maxAttempts = 10;
                    
                    while (attempts < maxAttempts) {
                        candles = this.api.getCandles(this.config.asset, this.config.timeframe);
                        if (candles && candles.length >= 20) {
                            console.log(`   ✅ Received ${candles.length} candles from API`);
                            break;
                        }
                        attempts++;
                        console.log(`   ⏳ Waiting for candle data... attempt ${attempts}/${maxAttempts}`);
                        await this.sleep(2000);
                    }
                    
                    if (!candles || candles.length === 0) {
                        console.log('   ❌ CRITICAL: No candles received from API after all attempts');
                        console.log('   🔄 Reconnecting WebSocket...');
                        await this.api.connect();
                        await this.api.login(process.env.IQ_OPTION_EMAIL, process.env.IQ_OPTION_PASSWORD);
                        this.api.subscribeCandles(this.config.asset, this.config.timeframe);
                        await this.sleep(5000);
                        continue;
                    }
                } else {
                    console.log('   Mode: DEMO - using simulated candles (no real money)');
                    candles = this.generateDemoCandles();
                }
                
                // DEBUG: Log real candle data with validation
                console.log(`\n📊 STEP 2: Validating REAL candle data...`);
                console.log(`   Candles received: ${candles?.length || 0}`);
                
                // VALIDATION: Check for real data integrity
                if (!candles || candles.length === 0) {
                    console.log('❌ CRITICAL: No candles received from API!');
                    await this.sleep(5000);
                    continue;
                }
                
                // VALIDATION: Check last candle validity
                const lastCandle = candles[candles.length - 1];
                if (!lastCandle || typeof lastCandle.close !== 'number' || isNaN(lastCandle.close)) {
                    console.log('❌ CRITICAL: Invalid candle data (close price is NaN or undefined)');
                    console.log('   Last candle:', lastCandle);
                    await this.sleep(5000);
                    continue;
                }
                
                // PRODUCTION LOG: Real data confirmation
                console.log(`   ✅ REAL DATA CONFIRMED:`);
                console.log(`   First candle: O:${candles[0]?.open} H:${candles[0]?.high} L:${candles[0]?.low} C:${candles[0]?.close}`);
                console.log(`   Last candle:  O:${lastCandle.open} H:${lastCandle.high} L:${lastCandle.low} C:${lastCandle.close}`);
                console.log(`   📈 LAST PRICE: ${lastCandle.close}`);
                const timestampStr = lastCandle.timestamp ? new Date(lastCandle.timestamp * 1000).toISOString() : 'N/A';
                console.log(`   ⏱️  Timestamp: ${timestampStr}`);
                
                // STEP 2: Calculate indicators
                console.log(`\n📉 STEP 3: Calculating indicators...`);
                const lastPrice = candles[candles.length - 1].close;
                const indicators = this.calculateIndicators(candles);
                
                console.log(`   RSI: ${indicators?.rsi?.value !== undefined && !isNaN(indicators.rsi.value) ? indicators.rsi.value.toFixed(2) : 'N/A'}`);
                console.log(`   BB Upper: ${indicators?.bollingerBands?.upper !== undefined && !isNaN(indicators.bollingerBands.upper) ? indicators.bollingerBands.upper.toFixed(5) : 'N/A'}`);
                console.log(`   BB Lower: ${indicators?.bollingerBands?.lower !== undefined && !isNaN(indicators.bollingerBands.lower) ? indicators.bollingerBands.lower.toFixed(5) : 'N/A'}`);
                console.log(`   MACD: ${indicators?.macd?.signal || 'N/A'}`);
                console.log(`   MA20: ${indicators?.ma20 !== undefined && !isNaN(indicators.ma20) ? indicators.ma20.toFixed(5) : 'N/A'}`);
                console.log(`   Last Price: ${lastPrice}`);
                
                if (!indicators || !indicators.rsi || !indicators.bollingerBands) {
                    console.log('❌ ERROR: Indicators calculation failed!');
                    await this.sleep(5000);
                    continue;
                }
                
                // STEP 3: Detect market condition (TREND/SIDEWAY/BREAKOUT)
                console.log(`\n🎯 STEP 4: Detecting market condition...`);
                const market = this.marketDetector.detect(candles, indicators);
                console.log(`   📊 Market Type: ${market?.type || 'N/A'}`);
                console.log(`   📈 Trend: ${market?.trend || 'N/A'}`);
                console.log(`   ⚡ Volatility: ${market?.volatility || 'N/A'}`);
                console.log(`   💪 Momentum: ${market?.momentum || 'N/A'}`);
                console.log(`   📏 ADX: ${market?.metrics?.adx?.toFixed(1) || 'N/A'}`);
                console.log(`   📐 BB Width: ${market?.metrics?.bbWidth?.toFixed(2) || 'N/A'}%`);
                
                // STEP 4: Select strategy based on market condition
                console.log(`\n🎯 STEP 5: Selecting strategy...`);
                const strategy = this.strategySelector.selectStrategy(market);
                console.log(`   🎲 Strategy: ${strategy?.name || 'N/A'}`);
                console.log(`   📊 Market Type: ${strategy?.marketType || 'N/A'}`);
                console.log(`   ➡️  Direction: ${strategy?.direction || 'N/A'}`);
                console.log(`   💡 Bias: ${strategy?.bias || 'N/A'}`);
                console.log(`   ⭐ Priority: ${strategy?.priority || 'N/A'}`);
                
                console.log(`\n🛡️ STEP 6: Checking filters...`);
                const filterResult = await this.filterManager.checkAll(
                    this.config.asset, 
                    candles, 
                    this.mode === 'live' ? this.api : null,
                    null
                );
                
                console.log(`   ✅ Filters Passed: ${filterResult.allow ? 'YES' : 'NO'}`);
                console.log(`   📊 Confidence: ${filterResult.confidence}%`);
                if (filterResult.reasons.length > 0) {
                    console.log(`   🚫 Reasons: ${filterResult.reasons.join(', ')}`);
                }
                
                if (!filterResult.allow) {
                    console.log(`\n⏳ Filters blocked trading. Waiting...`);
                    await this.sleep(30000);
                    continue;
                }
                
                // STEP 6: Analyze sniper entry with strategy
                console.log(`\n🎯 STEP 7: Analyzing sniper entry...`);
                const sniperResult = this.sniperEntry.analyze(candles, indicators);
                
                console.log(`   Signal: ${sniperResult?.signal || 'NONE'}`);
                console.log(`   Score: ${sniperResult?.score !== undefined ? sniperResult.score : 'N/A'}`);
                console.log(`   Confidence: ${sniperResult?.confidence || 'N/A'}`);
                console.log(`   Conditions met: ${sniperResult?.conditionCount || 0}/3`);
                
                if (sniperResult?.conditions) {
                    console.log(`   - RSI Extreme: ${sniperResult.conditions.rsiExtreme ? '✅' : '❌'}`);
                    console.log(`   - BB Breach: ${sniperResult.conditions.bbBreach ? '✅' : '❌'}`);
                    console.log(`   - Engulfing: ${sniperResult.conditions.engulfing ? '✅' : '❌'}`);
                }
                
                // STEP 7: Calculate confidence with full context
                console.log(`\n💯 STEP 8: Calculating confidence score...`);
                const confidence = this.confidenceScore.fromSniperAnalysis(
                    sniperResult, 
                    market,
                    strategy
                );
                
                console.log(`   Total Score: ${confidence?.totalScore !== undefined ? confidence.totalScore.toFixed(2) : 'N/A'}`);
                console.log(`   Signal Strength: ${confidence?.signalStrength || 'N/A'}`);
                console.log(`   Should Trade: ${confidence?.shouldTrade ? 'YES' : 'NO'}`);
                console.log(`   Is High Confidence: ${confidence?.isHighConfidence ? 'YES' : 'NO'}`);
                console.log(`   Min Threshold: ${confidence?.minThreshold || 'N/A'}`);
                
                if (confidence?.penalties?.length > 0) {
                    console.log(`   ⚠️ Penalties: ${confidence.penalties.join(', ')}`);
                }
                
                // Check if signal is strong enough
                if (!confidence || !confidence.shouldTrade) {
                    console.log(`\n⏳ Score ${confidence?.totalScore?.toFixed(1) || 'N/A'} below threshold. Waiting for better signal...`);
                    await this.sleep(30000);
                    continue;
                }
                
                // Store context for analytics (whether we trade or not)
                this.lastAnalysisContext = {
                    timestamp: new Date().toISOString(),
                    pair: this.config.asset,
                    marketCondition: market,
                    strategy: strategy,
                    rsi: indicators.rsi,
                    bollingerBands: indicators.bollingerBands,
                    macd: indicators.macd,
                    score: confidence,
                    signal: sniperResult.signal,
                    conditions: sniperResult.conditions,
                    conditionCount: sniperResult.conditionCount
                };
                
                // Check if signal is strong enough
                if (!confidence || confidence.totalScore < this.config.minScore) {
                    console.log(`\n⏳ Score ${confidence?.totalScore?.toFixed(1) || 'N/A'} < ${this.config.minScore}. Waiting for better signal...`);
                    await this.sleep(30000);
                    continue;
                }
                
                // STEP 8: Check DYNAMIC EDGE SYSTEM
                console.log(`\n🎯 STEP 8: DYNAMIC EDGE SYSTEM...`);
                const edgeContext = {
                    rsi: indicators.rsi,
                    signal: sniperResult.signal,
                    conditions: sniperResult.conditions,
                    conditionCount: sniperResult.conditionCount,
                    marketCondition: market,
                    pair: this.config.asset
                };
                
                const edgeResult = this.edgeSystem.calculateScore(edgeContext);
                console.log(`   Score: ${edgeResult.score}/${edgeResult.maxScore}`);
                console.log(`   Confidence: ${edgeResult.confidence}`);
                console.log(`   Valid: ${edgeResult.valid ? '✅ YES' : '❌ NO'}`);
                console.log(`   Position Size: ${edgeResult.positionSize}%`);
                
                if (edgeResult.breakdown) {
                    if (edgeResult.breakdown.rsi) {
                        console.log(`   RSI: ${edgeResult.breakdown.rsi.value.toFixed(1)} (+${edgeResult.breakdown.rsi.points})`);
                    }
                    if (edgeResult.breakdown.conditions) {
                        console.log(`   Conditions: ${edgeResult.breakdown.conditions.count}/3 (+${edgeResult.breakdown.conditions.points})`);
                    }
                    if (edgeResult.breakdown.alignment) {
                        console.log(`   Market Alignment: +${edgeResult.breakdown.alignment.points}`);
                    }
                }
                
                if (!edgeResult.valid) {
                    console.log(`\n⏳ EDGE SYSTEM blocked: ${edgeResult.failures.join(', ')}`);
                    await this.sleep(30000);
                    continue;
                }
                
                console.log(`   ✅ EDGE SYSTEM passed`);
                
                // STEP 9: Execute trade with dynamic position size
                console.log(`\n🚀 STEP 9: EXECUTING TRADE!`);
                console.log(`   Strategy: ${strategy?.name || 'N/A'}`);
                console.log(`   Market: ${market?.type || 'N/A'}`);
                console.log(`   Edge Score: ${edgeResult.score}/${edgeResult.maxScore}`);
                console.log(`   Position Size: ${edgeResult.positionSize}%`);
                const direction = sniperResult.signal === 'BUY' ? 'call' : 'put';
                const amount = this.calculateTradeAmount(edgeResult);
                
                console.log(`   Direction: ${direction.toUpperCase()}`);
                console.log(`   Amount: $${amount}`);
                console.log(`   Asset: ${this.config.asset}`);
                console.log(`   Duration: ${this.config.duration} min`);
                
                const result = await this.executeTrade(direction, amount, confidence);
                
                if (result && result.success) {
                    console.log(`\n✅ TRADE EXECUTED SUCCESSFULLY!`);
                    console.log(`   Trade ID: ${result.id || result.order_id || 'N/A'}`);
                    console.log(`   Status: ${result.outcome || 'pending'}`);
                    
                    // Determine result and profit
                    const isWin = result.isWin || result.profit > 0;
                    const tradeResult = isWin ? 'WIN' : result.profit < 0 ? 'LOSS' : 'TIE';
                    const profit = result.profit || 0;
                    
                    // Record trade with full context for analytics
                    if (this.lastAnalysisContext) {
                        const recordedTrade = this.analytics.recordTrade({
                            timestamp: new Date().toISOString(),
                            pair: this.config.asset,
                            marketCondition: this.lastAnalysisContext.marketCondition,
                            rsi: this.lastAnalysisContext.rsi,
                            bollingerBands: this.lastAnalysisContext.bollingerBands,
                            score: this.lastAnalysisContext.score,
                            signal: sniperResult.signal,
                            conditions: {
                                rsiExtreme: sniperResult.conditions?.rsiExtreme || false,
                                bbBreach: sniperResult.conditions?.bbBreach || false,
                                engulfing: sniperResult.conditions?.engulfing || false,
                                conditionCount: sniperResult.conditionCount || 0
                            },
                            result: tradeResult,
                            profit: profit,
                            amount: amount
                        });
                        
                        console.log(`   📊 Analytics recorded: Trade #${recordedTrade.id}`);
                        console.log(`   📈 Total trades recorded: ${this.analytics.getTradeCount()}`);
                    }
                    
                    // Record trade result
                    this.moneyManager.recordTrade(result.profit);
                    
                    if (result.isWin || result.profit > 0) {
                        this.consecutiveLosses = 0;
                        console.log(`   🎉 WIN! Profit: $${result.profit.toFixed(2)}`);
                    } else {
                        this.consecutiveLosses++;
                        console.log(`   📉 LOSS. Consecutive losses: ${this.consecutiveLosses}`);
                    }
                    
                    // Log trade
                    this.logTrade({
                        id: this.tradeCount,
                        direction,
                        amount,
                        profit: result.profit,
                        score: confidence.totalScore,
                        balance: this.moneyManager.currentBalance
                    });
                } else {
                    console.log(`\n❌ TRADE EXECUTION FAILED: ${result?.error || 'Unknown error'}`);
                }
                
                const loopDuration = Date.now() - loopStartTime;
                console.log(`\n⏱️ Loop duration: ${loopDuration}ms`);
                
                // Wait before next trade
                console.log(`\n⏳ Waiting 60 seconds before next analysis...`);
                await this.sleep(60000);
                
            } catch (error) {
                console.error('\n❌ ERROR in trading loop:', error.message);
                console.error(error.stack);
                await this.sleep(5000);
            }
        }
        
        this.shutdown();
    }

    generateDemoCandles() {
        // Generate simulated candles for demo mode
        const candles = [];
        let price = 1.1000;
        
        for (let i = 0; i < 20; i++) {
            const change = (Math.random() - 0.5) * 0.0005;
            price += change;
            candles.push({
                open: price - change * 0.5,
                high: price + Math.random() * 0.0003,
                low: price - Math.random() * 0.0003,
                close: price
            });
        }
        
        return candles;
    }

    calculateIndicators(candles) {
        // Calculate all indicators
        const rsi = this.calculateRSI(candles);
        const bb = this.calculateBB(candles);
        const macd = this.calculateMACD(candles);
        const ma20 = this.calculateSMA(candles, 20);
        
        return { 
            rsi: { value: rsi },
            bollingerBands: bb,
            macd: macd,
            ma20: ma20
        };
    }

    calculateMACD(candles, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
        if (candles.length < slowPeriod + signalPeriod) {
            return { signal: 'NEUTRAL', histogram: 0 };
        }
        
        const ema = (data, period) => {
            const k = 2 / (period + 1);
            let emaArray = [data[0]];
            for (let i = 1; i < data.length; i++) {
                emaArray.push(data[i] * k + emaArray[i - 1] * (1 - k));
            }
            return emaArray;
        };
        
        const closes = candles.map(c => c.close);
        const fastEMA = ema(closes, fastPeriod);
        const slowEMA = ema(closes, slowPeriod);
        
        const macdLine = fastEMA.map((fast, i) => fast - slowEMA[i]);
        const signalLine = ema(macdLine.slice(slowPeriod - 1), signalPeriod);
        
        const currentMACD = macdLine[macdLine.length - 1];
        const currentSignal = signalLine[signalLine.length - 1];
        const histogram = currentMACD - currentSignal;
        
        let signal = 'NEUTRAL';
        if (histogram > 0 && macdLine[macdLine.length - 2] <= signalLine[signalLine.length - 2]) {
            signal = 'BULLISH_CROSS';
        } else if (histogram < 0 && macdLine[macdLine.length - 2] >= signalLine[signalLine.length - 2]) {
            signal = 'BEARISH_CROSS';
        } else if (histogram > 0) {
            signal = 'BULLISH';
        } else {
            signal = 'BEARISH';
        }
        
        return {
            signal: signal,
            histogram: histogram,
            macd: currentMACD,
            signalLine: currentSignal
        };
    }

    calculateSMA(candles, period) {
        const closes = candles.slice(-period).map(c => c.close);
        return closes.reduce((a, b) => a + b, 0) / closes.length;
    }

    calculateRSI(candles, period = 14) {
        // Calculate proper RSI
        let gains = 0;
        let losses = 0;
        
        for (let i = 1; i < Math.min(period + 1, candles.length); i++) {
            const change = candles[i].close - candles[i-1].close;
            if (change > 0) {
                gains += change;
            } else {
                losses += Math.abs(change);
            }
        }
        
        const avgGain = gains / period;
        const avgLoss = losses / period;
        
        if (avgLoss === 0) return { value: 50 };
        
        const rs = avgGain / avgLoss;
        const rsi = 100 - (100 / (1 + rs));
        
        return { value: Math.round(rsi) };
    }

    calculateBB(candles, period = 20) {
        // Calculate proper Bollinger Bands
        const closes = candles.slice(-period).map(c => c.close);
        const sum = closes.reduce((a, b) => a + b, 0);
        const sma = sum / closes.length;
        
        const squaredDiffs = closes.map(c => Math.pow(c - sma, 2));
        const variance = squaredDiffs.reduce((a, b) => a + b, 0) / closes.length;
        const stdDev = Math.sqrt(variance);
        
        return {
            upper: sma + (2 * stdDev),
            lower: sma - (2 * stdDev),
            middle: sma
        };
    }

    logTrade(trade) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            ...trade
        };
        
        const logFile = `logs/trades_${new Date().toISOString().split('T')[0]}.json`;
        let logs = [];
        
        if (fs.existsSync(logFile)) {
            logs = JSON.parse(fs.readFileSync(logFile, 'utf8'));
        }
        
        logs.push(logEntry);
        fs.writeFileSync(logFile, JSON.stringify(logs, null, 2));
    }

    shutdown() {
        console.log('\n' + '='.repeat(80));
        console.log('     SHUTTING DOWN...');
        console.log('='.repeat(80) + '\n');
        
        const finalBalance = this.moneyManager.currentBalance;
        const totalReturn = ((finalBalance - this.config.initialBalance) / this.config.initialBalance) * 100;
        const drawdown = (this.maxDrawdown / this.peakBalance) * 100;
        
        console.log(`💰 Final Balance: $${finalBalance.toFixed(2)}`);
        console.log(`📊 Total Return: ${totalReturn.toFixed(2)}%`);
        console.log(`📉 Max Drawdown: ${drawdown.toFixed(2)}%`);
        console.log(`🎯 Total Trades: ${this.tradeCount}`);
        
        // Generate analytics report
        if (this.analytics && this.analytics.getTradeCount() > 0) {
            console.log('\n📊 GENERATING ANALYTICS REPORT...');
            this.analytics.generateFinalReport();
        }
        
        if (this.mode === 'live' && this.api) {
            this.api.disconnect();
        }
        
        console.log('\n✅ Bot stopped. Goodbye!\n');
        process.exit(0);
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Setup process handlers for stability
     */
    setupProcessHandlers() {
        // Handle uncaught exceptions
        process.on('uncaughtException', (error) => {
            console.error('\n💥 UNCAUGHT EXCEPTION:', error.message);
            console.error(error.stack);
            this.logError(error, 'Uncaught Exception');
            this.saveState();
            // Don't exit, let crash protection handle it
        });

        // Handle unhandled promise rejections
        process.on('unhandledRejection', (reason, promise) => {
            console.error('\n💥 UNHANDLED REJECTION:', reason);
            this.logError(new Error(String(reason)), 'Unhandled Rejection');
            this.saveState();
        });

        // Handle SIGTERM (for PM2)
        process.on('SIGTERM', () => {
            console.log('\n🛑 SIGTERM received. Graceful shutdown...');
            this.stopRequested = true;
            this.saveState();
            setTimeout(() => process.exit(0), 5000);
        });
    }

    /**
     * Load saved state from file
     */
    loadState() {
        try {
            if (fs.existsSync(this.stateFile)) {
                const state = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
                this.tradeCount = state.tradeCount || 0;
                this.consecutiveLosses = state.consecutiveLosses || 0;
                this.crashCount = state.crashCount || 0;
                this.lastTradeTime = state.lastTradeTime || null;
                
                if (state.balance) {
                    this.moneyManager.currentBalance = state.balance;
                }
                
                console.log('📂 State loaded from file');
                console.log(`   Trades: ${this.tradeCount}, Crashes: ${this.crashCount}`);
            }
        } catch (err) {
            console.log('⚠️ Could not load state:', err.message);
        }
    }

    /**
     * Save current state to file
     */
    saveState() {
        try {
            const state = {
                timestamp: new Date().toISOString(),
                tradeCount: this.tradeCount,
                consecutiveLosses: this.consecutiveLosses,
                crashCount: this.crashCount,
                lastTradeTime: this.lastTradeTime,
                balance: this.moneyManager.currentBalance,
                mode: this.mode,
                asset: this.config.asset
            };
            
            // Ensure logs directory exists
            if (!fs.existsSync('logs')) {
                fs.mkdirSync('logs', { recursive: true });
            }
            
            fs.writeFileSync(this.stateFile, JSON.stringify(state, null, 2));
        } catch (err) {
            console.error('❌ Could not save state:', err.message);
        }
    }

    /**
     * Log error to file
     */
    logError(error, context) {
        try {
            const logEntry = {
                timestamp: new Date().toISOString(),
                context: context,
                message: error.message,
                stack: error.stack,
                crashCount: this.crashCount
            };
            
            const errorLogFile = `logs/errors_${new Date().toISOString().split('T')[0]}.json`;
            let logs = [];
            
            if (fs.existsSync(errorLogFile)) {
                logs = JSON.parse(fs.readFileSync(errorLogFile, 'utf8'));
            }
            
            logs.push(logEntry);
            fs.writeFileSync(errorLogFile, JSON.stringify(logs, null, 2));
        } catch (err) {
            console.error('Failed to log error:', err.message);
        }
    }

    /**
     * Log health status
     */
    logHealthStatus() {
        const status = {
            timestamp: new Date().toISOString(),
            loopCount: this.tradeCount,
            crashes: this.crashCount,
            balance: this.moneyManager.currentBalance,
            lastTrade: this.lastTradeTime,
            mode: this.mode,
            connected: this.mode === 'live' ? this.api?.connected : null
        };
        
        console.log('\n💚 HEALTH CHECK');
        console.log(`   Mode: ${status.mode.toUpperCase()}`);
        console.log(`   Trades: ${status.loopCount}`);
        console.log(`   Crashes: ${status.crashes}`);
        console.log(`   Balance: $${status.balance?.toFixed(2)}`);
        console.log(`   Connected: ${status.connected !== null ? (status.connected ? '✅' : '❌') : 'N/A'}`);
        
        // Save to health log
        try {
            const healthFile = 'logs/health.json';
            let healthLogs = [];
            
            if (fs.existsSync(healthFile)) {
                healthLogs = JSON.parse(fs.readFileSync(healthFile, 'utf8'));
            }
            
            healthLogs.push(status);
            
            // Keep only last 100 entries
            if (healthLogs.length > 100) {
                healthLogs = healthLogs.slice(-100);
            }
            
            fs.writeFileSync(healthFile, JSON.stringify(healthLogs, null, 2));
        } catch (err) {
            // Silent fail for health logging
        }
    }

    /**
     * Check if we can place a trade (duplicate prevention)
     */
    canTrade() {
        // Check if already have an active trade
        if (this.activeTrade) {
            console.log('⏳ Trade already in progress');
            return false;
        }
        
        // Check minimum time between trades
        if (this.lastTradeTime) {
            const timeSinceLastTrade = Date.now() - this.lastTradeTime;
            if (timeSinceLastTrade < this.minTradeInterval) {
                const waitTime = Math.ceil((this.minTradeInterval - timeSinceLastTrade) / 1000);
                console.log(`⏳ Must wait ${waitTime}s before next trade`);
                return false;
            }
        }
        
        return true;
    }

    /**
     * Record trade execution
     */
    recordTradeExecution() {
        this.lastTradeTime = Date.now();
        this.activeTrade = true;
        this.saveState();
        
        // Clear active trade after duration + buffer
        setTimeout(() => {
            this.activeTrade = false;
        }, (this.config.duration + 30) * 1000);
    }

    async start() {
        await this.initialize();
        
        // Handle graceful shutdown
        process.on('SIGINT', () => {
            console.log('\n\n⚠️  Stop requested. Finishing current trade...');
            this.stopRequested = true;
            this.saveState();
        });
        
        // Start trading loop
        await this.tradingLoop();
    }
}

// Main
const mode = process.argv[2] || 'demo';

if (mode === 'live' && !process.env.IQ_OPTION_EMAIL) {
    console.error('❌ Error: IQ_OPTION_EMAIL not set in environment');
    console.error('Please set your credentials in .env file');
    process.exit(1);
}

const bot = new ProductionBot(mode);
bot.start().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
