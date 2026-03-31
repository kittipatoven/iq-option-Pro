/**
 * Multi-Agent Trading System
 * 4 Specialized Agents working together:
 * 1. Signal Agent - Market analysis and signal generation
 * 2. Risk Agent - Risk management and position sizing
 * 3. Execution Agent - Trade execution and timing
 * 4. Learning Agent - Model updates and strategy optimization
 * 
 * Communication: signal → risk → execution → learning
 */

const logger = require('../utils/logger');
const rlEngine = require('./rlEngine');
const marketRegime = require('./marketRegimeDetector');

// ═══════════════════════════════════════════════════════════════
// 🤖 AGENT 1: SIGNAL AGENT - Market Analysis & Signal Generation
// ═══════════════════════════════════════════════════════════════

class SignalAgent {
    constructor() {
        this.name = 'SignalAgent';
        this.signalHistory = [];
        this.maxHistory = 100;
        
        // Technical indicators weights
        this.weights = {
            rsi: 0.25,
            trend: 0.20,
            momentum: 0.20,
            volume: 0.15,
            pattern: 0.20
        };
    }
    
    /**
     * Generate trading signal from market data
     */
    generateSignal(data) {
        const { candles, indicators, regime, pair, currentPrice } = data;
        
        // Get RL decision
        const rlDecision = rlEngine.getDecision({
            rsi: indicators.rsi,
            rsiSlope: indicators.rsiSlope || 0,
            price: currentPrice,
            bbPosition: indicators.bbPosition || 0.5,
            momentum: indicators.momentum?.strength || 0,
            acceleration: indicators.acceleration || 0,
            marketType: regime.regime,
            hour: new Date().getHours()
        });
        
        // Technical analysis scores
        const technicalScore = this.calculateTechnicalScore(indicators, regime);
        
        // Combine RL and technical analysis
        const combinedSignal = this.combineSignals(rlDecision, technicalScore);
        
        // Create signal object
        const signal = {
            pair,
            direction: combinedSignal.direction,
            confidence: combinedSignal.confidence,
            score: combinedSignal.score,
            regime: regime.regime,
            strategy: regime.strategy?.primary || 'REVERSAL',
            timestamp: Date.now(),
            rlDecision: rlDecision,
            technicalScore: technicalScore,
            indicators: {
                rsi: indicators.rsi,
                momentum: indicators.momentum,
                trend: indicators.trend
            }
        };
        
        // Store in history
        this.signalHistory.push(signal);
        if (this.signalHistory.length > this.maxHistory) {
            this.signalHistory.shift();
        }
        
        return signal;
    }
    
    /**
     * Calculate technical analysis score
     */
    calculateTechnicalScore(indicators, regime) {
        let callScore = 0;
        let putScore = 0;
        
        const { rsi, momentum } = indicators;
        
        // RSI-based scoring
        if (rsi < 30) callScore += this.weights.rsi;
        else if (rsi > 70) putScore += this.weights.rsi;
        
        // Trend-based scoring
        if (regime.regime === 'TREND_UP') {
            callScore += this.weights.trend;
        } else if (regime.regime === 'TREND_DOWN') {
            putScore += this.weights.trend;
        }
        
        // Momentum-based scoring
        if (momentum?.direction === 'UP') callScore += this.weights.momentum;
        else if (momentum?.direction === 'DOWN') putScore += this.weights.momentum;
        
        return { callScore, putScore, total: callScore + putScore };
    }
    
    /**
     * Combine RL and technical signals
     */
    combineSignals(rlDecision, technicalScore) {
        const rlWeight = 0.6;
        const techWeight = 0.4;
        
        // RL scores
        const rlCall = rlDecision.qValues[0];
        const rlPut = rlDecision.qValues[1];
        const rlSkip = rlDecision.qValues[2];
        
        // Combined scores
        const callScore = rlCall * rlWeight + technicalScore.callScore * techWeight;
        const putScore = rlPut * rlWeight + technicalScore.putScore * techWeight;
        const skipScore = rlSkip * rlWeight + (1 - technicalScore.total) * techWeight;
        
        // Determine direction
        let direction = 'SKIP';
        let confidence = skipScore;
        
        if (callScore > putScore && callScore > skipScore) {
            direction = 'CALL';
            confidence = callScore;
        } else if (putScore > callScore && putScore > skipScore) {
            direction = 'PUT';
            confidence = putScore;
        }
        
        return {
            direction,
            confidence,
            score: Math.max(callScore, putScore, skipScore)
        };
    }
}

// ═══════════════════════════════════════════════════════════════
// 🤖 AGENT 2: RISK AGENT - Risk Management & Position Sizing
// ═══════════════════════════════════════════════════════════════

class RiskAgent {
    constructor() {
        this.name = 'RiskAgent';
        
        // Risk limits
        this.limits = {
            maxDailyLoss: 50,           // Max $50 loss per day
            maxConsecutiveLosses: 3,     // Stop after 3 losses
            maxDrawdown: 0.10,          // Max 10% drawdown
            minConfidence: 0.6,         // Minimum confidence to trade
            maxPositionSize: 5,         // Max $5 per trade
            minPositionSize: 0.5        // Min $0.5 per trade
        };
        
        // Risk state
        this.dailyStats = {
            date: new Date().toDateString(),
            totalLoss: 0,
            totalProfit: 0,
            trades: 0,
            consecutiveLosses: 0
        };
        
        this.portfolioValue = 1000;  // Starting balance
        this.peakValue = 1000;      // Peak portfolio value
    }
    
    /**
     * Assess risk and determine position size
     */
    assessRisk(signal, portfolioValue, pairPerformance) {
        // Update portfolio tracking
        this.portfolioValue = portfolioValue;
        this.peakValue = Math.max(this.peakValue, portfolioValue);
        
        // Check if new day
        const today = new Date().toDateString();
        if (today !== this.dailyStats.date) {
            this.resetDailyStats(today);
        }
        
        // Risk checks
        const riskChecks = this.performRiskChecks(signal);
        
        // Calculate position size
        const positionSize = this.calculatePositionSize(signal, pairPerformance);
        
        return {
            allowed: riskChecks.passed,
            reasons: riskChecks.reasons,
            positionSize: positionSize.size,
            positionMultiplier: positionSize.multiplier,
            stopTrading: riskChecks.stopTrading,
            riskLevel: this.getRiskLevel()
        };
    }
    
    /**
     * Perform comprehensive risk checks
     */
    performRiskChecks(signal) {
        const reasons = [];
        let passed = true;
        let stopTrading = false;
        
        // Check 1: Confidence threshold
        if (signal.confidence < this.limits.minConfidence) {
            reasons.push(`Low confidence (${signal.confidence.toFixed(2)} < ${this.limits.minConfidence})`);
            passed = false;
        }
        
        // Check 2: Daily loss limit
        if (this.dailyStats.totalLoss >= this.limits.maxDailyLoss) {
            reasons.push(`Daily loss limit reached ($${this.dailyStats.totalLoss})`);
            passed = false;
            stopTrading = true;
        }
        
        // Check 3: Consecutive losses
        if (this.dailyStats.consecutiveLosses >= this.limits.maxConsecutiveLosses) {
            reasons.push(`Max consecutive losses (${this.dailyStats.consecutiveLosses})`);
            passed = false;
            stopTrading = true;
        }
        
        // Check 4: Drawdown limit
        const drawdown = (this.peakValue - this.portfolioValue) / this.peakValue;
        if (drawdown >= this.limits.maxDrawdown) {
            reasons.push(`Max drawdown reached (${(drawdown * 100).toFixed(1)}%)`);
            passed = false;
            stopTrading = true;
        }
        
        return { passed, reasons, stopTrading };
    }
    
    /**
     * Calculate position size based on signal strength and risk
     */
    calculatePositionSize(signal, pairPerformance) {
        // Base size from confidence
        let size = signal.confidence * this.limits.maxPositionSize;
        
        // Apply Kelly Criterion adjustment
        const winRate = pairPerformance?.winRate || 0.5;
        const avgWin = pairPerformance?.avgWin || 1;
        const avgLoss = pairPerformance?.avgLoss || 1;
        
        if (avgLoss > 0) {
            const kelly = (winRate * avgWin - (1 - winRate) * avgLoss) / avgWin;
            const halfKelly = kelly * 0.5;  // Conservative Kelly
            size *= Math.max(0.3, Math.min(1, halfKelly));
        }
        
        // Apply regime-based sizing
        if (signal.regime === 'VOLATILE') {
            size *= 0.5;  // Reduce size in volatile markets
        } else if (signal.regime === 'SIDEWAY') {
            size *= 0.8;
        }
        
        // Apply consecutive loss reduction
        const lossMultiplier = Math.pow(0.7, this.dailyStats.consecutiveLosses);
        size *= lossMultiplier;
        
        // Enforce limits
        size = Math.max(this.limits.minPositionSize, Math.min(this.limits.maxPositionSize, size));
        
        const multiplier = size / this.limits.maxPositionSize;
        
        return { size, multiplier };
    }
    
    /**
     * Get current risk level
     */
    getRiskLevel() {
        const drawdown = (this.peakValue - this.portfolioValue) / this.peakValue;
        
        if (drawdown > 0.08 || this.dailyStats.consecutiveLosses >= 2) return 'HIGH';
        if (drawdown > 0.05 || this.dailyStats.consecutiveLosses >= 1) return 'MEDIUM';
        return 'LOW';
    }
    
    /**
     * Record trade result for risk tracking
     */
    recordTradeResult(result, amount, profit) {
        this.dailyStats.trades++;
        
        if (result === 'win') {
            this.dailyStats.totalProfit += profit;
            this.dailyStats.consecutiveLosses = 0;
        } else if (result === 'loss') {
            this.dailyStats.totalLoss += amount;
            this.dailyStats.consecutiveLosses++;
        }
    }
    
    /**
     * Reset daily statistics
     */
    resetDailyStats(date) {
        this.dailyStats = {
            date: date,
            totalLoss: 0,
            totalProfit: 0,
            trades: 0,
            consecutiveLosses: 0
        };
    }
}

// ═══════════════════════════════════════════════════════════════
// 🤖 AGENT 3: EXECUTION AGENT - Trade Execution & Timing
// ═══════════════════════════════════════════════════════════════

class ExecutionAgent {
    constructor() {
        this.name = 'ExecutionAgent';
        
        // Execution config
        this.config = {
            maxSlippage: 0.001,        // Max 0.1% slippage
            retryAttempts: 3,          // Max retries
            retryDelay: 1000,          // 1 second between retries
            optimalTiming: {
                start: 10,              // Second 10
                end: 19                 // Second 19
            }
        };
        
        // Execution stats
        this.stats = {
            totalExecutions: 0,
            successfulExecutions: 0,
            failedExecutions: 0,
            avgLatency: 0
        };
    }
    
    /**
     * Determine optimal execution timing
     */
    getExecutionTiming() {
        const now = new Date();
        const second = now.getSeconds();
        const ms = now.getMilliseconds();
        
        // Check if in optimal window (seconds 10-19)
        const isOptimal = second >= this.config.optimalTiming.start && 
                         second <= this.config.optimalTiming.end;
        
        return {
            shouldExecute: isOptimal,
            second: second,
            millisecond: ms,
            urgency: isOptimal ? 'NORMAL' : 'HIGH',
            waitTime: isOptimal ? 0 : this.calculateWaitTime(second)
        };
    }
    
    /**
     * Calculate wait time for next optimal window
     */
    calculateWaitTime(currentSecond) {
        if (currentSecond < this.config.optimalTiming.start) {
            return (this.config.optimalTiming.start - currentSecond) * 1000;
        }
        // Wait for next minute
        return (60 - currentSecond + this.config.optimalTiming.start) * 1000;
    }
    
    /**
     * Validate execution conditions
     */
    validateExecution(signal, riskAssessment, timing) {
        const checks = {
            passed: true,
            warnings: [],
            errors: []
        };
        
        // Check if risk approved
        if (!riskAssessment.allowed) {
            checks.passed = false;
            checks.errors.push(...riskAssessment.reasons);
        }
        
        // Check timing
        if (!timing.shouldExecute) {
            checks.warnings.push(`Not in optimal timing window (second ${timing.second})`);
        }
        
        // Check if already have pending trade
        if (signal.hasPendingTrade) {
            checks.passed = false;
            checks.errors.push('Pending trade exists');
        }
        
        return checks;
    }
    
    /**
     * Execute trade with retry logic
     */
    async executeTrade(api, tradeParams) {
        const startTime = Date.now();
        
        for (let attempt = 0; attempt < this.config.retryAttempts; attempt++) {
            try {
                if (attempt > 0) {
                    await this.sleep(this.config.retryDelay * attempt);
                }
                
                const result = await api.placeTrade(tradeParams);
                
                if (result.success) {
                    this.stats.successfulExecutions++;
                    const latency = Date.now() - startTime;
                    this.updateAvgLatency(latency);
                    
                    return {
                        success: true,
                        orderId: result.id || result.order_id,
                        latency: latency,
                        attempts: attempt + 1
                    };
                }
                
            } catch (error) {
                logger.warn(`[Execution] Attempt ${attempt + 1} failed:`, error.message);
            }
        }
        
        this.stats.failedExecutions++;
        this.stats.totalExecutions++;
        
        return {
            success: false,
            error: 'All retry attempts failed',
            attempts: this.config.retryAttempts
        };
    }
    
    /**
     * Update average latency
     */
    updateAvgLatency(latency) {
        const n = this.stats.totalExecutions;
        this.stats.avgLatency = (this.stats.avgLatency * n + latency) / (n + 1);
        this.stats.totalExecutions++;
    }
    
    /**
     * Sleep utility
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    /**
     * Get execution statistics
     */
    getStats() {
        const successRate = this.stats.totalExecutions > 0
            ? (this.stats.successfulExecutions / this.stats.totalExecutions * 100).toFixed(1)
            : 0;
        
        return {
            ...this.stats,
            successRate: `${successRate}%`,
            avgLatencyMs: this.stats.avgLatency.toFixed(0)
        };
    }
}

// ═══════════════════════════════════════════════════════════════
// 🤖 AGENT 4: LEARNING AGENT - Model Updates & Optimization
// ═══════════════════════════════════════════════════════════════

class LearningAgent {
    constructor() {
        this.name = 'LearningAgent';
        
        // Learning config
        this.config = {
            updateFrequency: 10,       // Update every 10 trades
            miniBatchSize: 32,
            learningRate: 0.001
        };
        
        // Performance tracking
        this.performanceLog = [];
        this.strategyPerformance = new Map();
        
        // Model versioning
        this.modelVersion = 1;
        this.bestPerformance = 0;
    }
    
    /**
     * Learn from trade outcome
     */
    learn(tradeResult, preTradeState, signal, riskAssessment) {
        const { outcome, profit, pair, strategy } = tradeResult;
        
        // Update RL engine
        const rlAction = signal.direction === 'CALL' ? 'CALL' : 
                         signal.direction === 'PUT' ? 'PUT' : 'SKIP';
        
        const learnResult = rlEngine.recordTradeResult(
            preTradeState,
            rlAction,
            outcome,
            preTradeState,  // Simplified: same state
            signal.regime,
            signal.confidence > 0.7 ? 'HIGH' : signal.confidence > 0.5 ? 'MEDIUM' : 'LOW'
        );
        
        // Track strategy performance
        this.updateStrategyPerformance(strategy, outcome, profit);
        
        // Log performance
        this.performanceLog.push({
            timestamp: Date.now(),
            pair,
            outcome,
            profit,
            strategy,
            confidence: signal.confidence,
            regime: signal.regime
        });
        
        // Periodic model update
        if (this.performanceLog.length % this.config.updateFrequency === 0) {
            this.performModelUpdate();
        }
        
        return {
            rlTrained: learnResult.trained,
            loss: learnResult.loss,
            epsilon: learnResult.epsilon
        };
    }
    
    /**
     * Update strategy performance tracking
     */
    updateStrategyPerformance(strategy, outcome, profit) {
        if (!this.strategyPerformance.has(strategy)) {
            this.strategyPerformance.set(strategy, {
                wins: 0,
                losses: 0,
                profit: 0,
                trades: 0
            });
        }
        
        const perf = this.strategyPerformance.get(strategy);
        perf.trades++;
        
        if (outcome === 'win') {
            perf.wins++;
            perf.profit += profit;
        } else if (outcome === 'loss') {
            perf.losses++;
            perf.profit -= profit;
        }
    }
    
    /**
     * Perform model update and optimization
     */
    performModelUpdate() {
        // Train RL model
        const trainResult = rlEngine.train();
        
        // Calculate recent performance
        const recent = this.performanceLog.slice(-20);
        const wins = recent.filter(t => t.outcome === 'win').length;
        const winRate = wins / recent.length;
        
        // Save model if performance improved
        if (winRate > this.bestPerformance) {
            this.bestPerformance = winRate;
            this.modelVersion++;
            
            const modelPath = `./data/rl_model_v${this.modelVersion}.json`;
            rlEngine.saveModel(modelPath);
            
            logger.info(`[Learning] New best model saved: v${this.modelVersion} (WR: ${(winRate * 100).toFixed(1)}%)`);
        }
        
        // Log update
        console.log(`\n🧠 LEARNING UPDATE:`);
        console.log(`   Model Version: ${this.modelVersion}`);
        console.log(`   Recent Win Rate: ${(winRate * 100).toFixed(1)}%`);
        console.log(`   RL Trained: ${trainResult.trained}`);
        console.log(`   Loss: ${trainResult.loss?.toFixed(6) || 'N/A'}`);
        console.log(`   Epsilon: ${trainResult.epsilon?.toFixed(4) || 'N/A'}`);
        
        return {
            modelVersion: this.modelVersion,
            winRate,
            trained: trainResult.trained,
            loss: trainResult.loss
        };
    }
    
    /**
     * Get best performing strategy
     */
    getBestStrategy() {
        let bestStrategy = 'REVERSAL';
        let bestScore = -Infinity;
        
        for (const [name, perf] of this.strategyPerformance.entries()) {
            if (perf.trades >= 5) {
                const winRate = perf.wins / perf.trades;
                const profitFactor = perf.profit / perf.trades;
                const score = winRate * 0.6 + profitFactor * 0.4;
                
                if (score > bestScore) {
                    bestScore = score;
                    bestStrategy = name;
                }
            }
        }
        
        return bestStrategy;
    }
    
    /**
     * Get learning statistics
     */
    getStats() {
        return {
            modelVersion: this.modelVersion,
            bestPerformance: (this.bestPerformance * 100).toFixed(1) + '%',
            totalTrades: this.performanceLog.length,
            strategyPerformance: Array.from(this.strategyPerformance.entries()).map(([name, perf]) => ({
                name,
                trades: perf.trades,
                winRate: perf.trades > 0 ? (perf.wins / perf.trades * 100).toFixed(1) + '%' : '0%',
                profit: perf.profit.toFixed(2)
            }))
        };
    }
}

// ═══════════════════════════════════════════════════════════════
// 🎯 MULTI-AGENT ORCHESTRATOR - Coordinates all agents
// ═══════════════════════════════════════════════════════════════

class MultiAgentSystem {
    constructor() {
        this.signalAgent = new SignalAgent();
        this.riskAgent = new RiskAgent();
        this.executionAgent = new ExecutionAgent();
        this.learningAgent = new LearningAgent();
        
        this.name = 'MultiAgentSystem';
        this.isRunning = false;
    }
    
    /**
     * Main decision pipeline: signal → risk → execution → learning
     */
    async makeDecision(data) {
        const { candles, indicators, pair, portfolioValue, pairPerformance, api } = data;
        
        // Step 1: Detect market regime
        const regime = marketRegime.detectRegime(candles, pair);
        
        // Step 2: SIGNAL AGENT - Generate signal
        const signal = this.signalAgent.generateSignal({
            candles,
            indicators,
            regime,
            pair,
            currentPrice: indicators.currentPrice
        });
        
        console.log(`\n🤖 SIGNAL AGENT: ${signal.direction} | Confidence: ${signal.confidence.toFixed(2)} | Regime: ${regime.regime}`);
        
        // Step 3: RISK AGENT - Assess risk
        const riskAssessment = this.riskAgent.assessRisk(signal, portfolioValue, pairPerformance);
        
        console.log(`🤖 RISK AGENT: ${riskAssessment.allowed ? 'APPROVED' : 'REJECTED'} | Size: $${riskAssessment.positionSize.toFixed(2)} | Level: ${riskAssessment.riskLevel}`);
        
        if (!riskAssessment.allowed) {
            return {
                action: 'SKIP',
                reason: riskAssessment.reasons.join(', '),
                signal,
                riskAssessment
            };
        }
        
        if (riskAssessment.stopTrading) {
            return {
                action: 'STOP',
                reason: 'Risk limits reached',
                signal,
                riskAssessment
            };
        }
        
        // Step 4: EXECUTION AGENT - Check timing and execute
        const timing = this.executionAgent.getExecutionTiming();
        const validation = this.executionAgent.validateExecution(signal, riskAssessment, timing);
        
        console.log(`🤖 EXECUTION AGENT: ${timing.shouldExecute ? 'OPTIMAL' : 'WAIT'} | Second: ${timing.second}`);
        
        // Execute if conditions are met
        let execution = null;
        if (api && validation.passed) {
            execution = await this.executionAgent.executeTrade(api, {
                pair,
                direction: signal.direction,
                amount: riskAssessment.positionSize
            });
            
            console.log(`🤖 EXECUTION: ${execution.success ? 'SUCCESS' : 'FAILED'} | Order: ${execution.orderId || 'N/A'}`);
        }
        
        return {
            action: signal.direction,
            signal,
            riskAssessment,
            timing,
            execution,
            regime
        };
    }
    
    /**
     * Record trade result for learning
     */
    recordResult(tradeResult, preTradeState, signal, riskAssessment) {
        // Update Risk Agent
        this.riskAgent.recordTradeResult(
            tradeResult.outcome,
            tradeResult.amount,
            tradeResult.profit
        );
        
        // Learning Agent updates model
        const learnResult = this.learningAgent.learn(tradeResult, preTradeState, signal, riskAssessment);
        
        return learnResult;
    }
    
    /**
     * Get system statistics
     */
    getStats() {
        return {
            signal: this.signalAgent.signalHistory.length,
            risk: this.riskAgent.getRiskLevel(),
            execution: this.executionAgent.getStats(),
            learning: this.learningAgent.getStats()
        };
    }
}

// Export the orchestrator
module.exports = new MultiAgentSystem();
