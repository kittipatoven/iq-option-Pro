/**
 * Ultra Entry System - Sniper Mode Enhanced
 * Combines all AI systems for ultra-precise entry
 */

const logger = require('../utils/logger');
const transformerPrediction = require('./transformerPrediction');
const orderFlowAnalyzer = require('./orderFlowAnalyzer');
const marketMaker = require('./marketMaker');
const latencyArbitrage = require('./latencyArbitrage');

class UltraEntrySystem {
    constructor() {
        this.name = 'UltraEntrySystem';
        
        // ═══════════════════════════════════════════════════════════════
        // 🎯 ENTRY CONFIGURATION
        // ═══════════════════════════════════════════════════════════════
        this.config = {
            // Thresholds
            minConfidence: 7.5,      // Transformer confidence (0-10)
            minOrderFlowStrength: 6,  // Order flow strength (0-10)
            minSniperScore: 8,       // Sniper score (0-10)
            
            // Combination weights
            weights: {
                transformer: 0.30,
                orderFlow: 0.25,
                sniper: 0.25,
                marketMaker: 0.10,
                latency: 0.10
            },
            
            // Risk management
            maxRiskPerTrade: 0.01,     // 1% max risk
            dailyLossLimit: 0.05,     // 5% daily loss limit
            consecutiveLossesMax: 3,
            
            // Execution
            useAllSystems: true,      // Require all systems to agree
            minAgreements: 3          // Minimum 3 systems must agree
        };
        
        // ═══════════════════════════════════════════════════════════════
        // 📊 STATE TRACKING
        // ═══════════════════════════════════════════════════════════════
        this.state = {
            consecutiveLosses: 0,
            dailyProfit: 0,
            dailyTrades: 0,
            lastTradeTime: 0,
            cooldownUntil: 0,
            isActive: true
        };
        
        // ═══════════════════════════════════════════════════════════════
        // 📈 PERFORMANCE
        // ═══════════════════════════════════════════════════════════════
        this.performance = {
            totalTrades: 0,
            wins: 0,
            losses: 0,
            winRate: 0,
            totalProfit: 0,
            avgEntryScore: 0,
            bestEntryScore: 0,
            systemUsage: {
                transformer: 0,
                orderFlow: 0,
                sniper: 0,
                marketMaker: 0,
                latency: 0
            }
        };
        
        // Entry history
        this.entryHistory = [];
        this.maxHistory = 100;
    }
    
    /**
     * ═══════════════════════════════════════════════════════════════
     * 🎯 ULTRA ENTRY ANALYSIS
     * Combines all AI systems
     * ═══════════════════════════════════════════════════════════════
     */
    analyzeEntry(pair, candles, indicators, tickData, currentPrice) {
        // Check if system is active
        if (!this.state.isActive || Date.now() < this.state.cooldownUntil) {
            return {
                shouldTrade: false,
                reason: 'System in cooldown or inactive',
                cooldownRemaining: Math.max(0, this.state.cooldownUntil - Date.now())
            };
        }
        
        // Check daily limits
        if (this.state.dailyProfit < -this.config.dailyLossLimit) {
            return {
                shouldTrade: false,
                reason: 'Daily loss limit reached'
            };
        }
        
        // ═══════════════════════════════════════════════════════════════
        // 1. TRANSFORMER PREDICTION
        // ═══════════════════════════════════════════════════════════════
        const orderFlow = orderFlowAnalyzer.getFlowState(pair);
        const transformerResult = transformerPrediction.predict({
            candles,
            pair,
            currentPrice,
            tickData,
            orderFlow
        });
        
        // ═══════════════════════════════════════════════════════════════
        // 2. ORDER FLOW ANALYSIS
        // ═══════════════════════════════════════════════════════════════
        if (tickData) {
            orderFlowAnalyzer.processTick(pair, {
                price: currentPrice,
                volume: tickData.volume || 1,
                timestamp: Date.now()
            });
        }
        const orderFlowResult = orderFlowAnalyzer.analyzeFlow(pair);
        
        // ═══════════════════════════════════════════════════════════════
        // 3. MARKET MAKER ANALYSIS
        // ═══════════════════════════════════════════════════════════════
        const marketMakerState = marketMaker.analyzeMarket(pair, candles);
        const marketMakerSignal = marketMakerState 
            ? marketMaker.generateSignal(pair, currentPrice, indicators)
            : null;
        
        // ═══════════════════════════════════════════════════════════════
        // 4. LATENCY ARBITRAGE PRE-CALCULATION
        // ═══════════════════════════════════════════════════════════════
        latencyArbitrage.preCalculateIndicators(pair, candles);
        const latencyResult = latencyArbitrage.detectMomentumSpike(pair, currentPrice, tickData?.[0]);
        
        // ═══════════════════════════════════════════════════════════════
        // 🧠 COMBINE ALL SIGNALS
        // ═══════════════════════════════════════════════════════════════
        const combinedSignal = this.combineSignals({
            transformer: transformerResult,
            orderFlow: orderFlowResult,
            marketMaker: marketMakerSignal,
            latency: latencyResult,
            sniper: null  // Will be calculated separately
        });
        
        // Calculate sniper score if not already done
        if (!combinedSignal.sniperScore) {
            combinedSignal.sniperScore = this.calculateSniperScore(indicators, orderFlowResult);
        }
        
        // Check if entry meets criteria
        const entryDecision = this.evaluateEntry(combinedSignal);
        
        // Log analysis
        this.logAnalysis(pair, combinedSignal, entryDecision);
        
        return entryDecision;
    }
    
    /**
     * Combine signals from all systems
     */
    combineSignals(signals) {
        const weights = this.config.weights;
        
        // Transformer direction
        const transformerDir = signals.transformer.direction === 'UP' ? 1 : 
                              signals.transformer.direction === 'DOWN' ? -1 : 0;
        const transformerWeight = signals.transformer.shouldTrade ? weights.transformer : 0;
        
        // Order flow direction
        const orderFlowDir = signals.orderFlow.direction === 'UP' ? 1 :
                            signals.orderFlow.direction === 'DOWN' ? -1 : 0;
        const orderFlowWeight = signals.orderFlow.strength > 0.5 ? weights.orderFlow : 0;
        
        // Market maker direction
        const mmDir = signals.marketMaker?.shouldTrade ? 
                     (signals.marketMaker.direction === 'CALL' ? 1 : -1) : 0;
        const mmWeight = signals.marketMaker?.shouldTrade ? weights.marketMaker : 0;
        
        // Latency direction
        const latencyDir = signals.latency.shouldTrade ? 
                          (signals.latency.direction === 'UP' ? 1 : -1) : 0;
        const latencyWeight = signals.latency.shouldTrade ? weights.latency : 0;
        
        // Calculate weighted consensus
        let consensus = 0;
        let totalWeight = 0;
        
        if (transformerWeight > 0) {
            consensus += transformerDir * transformerWeight;
            totalWeight += transformerWeight;
        }
        if (orderFlowWeight > 0) {
            consensus += orderFlowDir * orderFlowWeight;
            totalWeight += orderFlowWeight;
        }
        if (mmWeight > 0) {
            consensus += mmDir * mmWeight;
            totalWeight += mmWeight;
        }
        if (latencyWeight > 0) {
            consensus += latencyDir * latencyWeight;
            totalWeight += latencyWeight;
        }
        
        // Normalize
        if (totalWeight > 0) {
            consensus /= totalWeight;
        }
        
        // Count agreements
        const agreements = [
            signals.transformer.shouldTrade,
            signals.orderFlow.strength > 0.5,
            signals.marketMaker?.shouldTrade,
            signals.latency.shouldTrade
        ].filter(Boolean).length;
        
        return {
            consensus,
            agreements,
            totalWeight,
            transformer: signals.transformer,
            orderFlow: signals.orderFlow,
            marketMaker: signals.marketMaker,
            latency: signals.latency,
            confidence: this.calculateCombinedConfidence(signals),
            direction: consensus > 0.3 ? 'UP' : consensus < -0.3 ? 'DOWN' : 'NEUTRAL'
        };
    }
    
    /**
     * Calculate sniper score
     */
    calculateSniperScore(indicators, orderFlow) {
        let score = 0;
        const rsi = indicators?.rsi || 50;
        const momentum = indicators?.momentum?.strength || 0;
        
        // RSI extreme (max 3 points)
        if (rsi < 20 || rsi > 80) score += 3;
        else if (rsi < 30 || rsi > 70) score += 2;
        else if (rsi < 40 || rsi > 60) score += 1;
        
        // Momentum alignment (max 3 points)
        if (Math.abs(momentum) > 0.7) score += 3;
        else if (Math.abs(momentum) > 0.5) score += 2;
        else if (Math.abs(momentum) > 0.3) score += 1;
        
        // Order flow confirmation (max 2 points)
        if (orderFlow.strength > 0.7) score += 2;
        else if (orderFlow.strength > 0.5) score += 1;
        
        // Velocity (max 2 points)
        if (orderFlow.velocity > 0.03) score += 2;
        else if (orderFlow.velocity > 0.01) score += 1;
        
        return score;
    }
    
    /**
     * Calculate combined confidence
     */
    calculateCombinedConfidence(signals) {
        const confidences = [
            signals.transformer.confidence || 0,
            signals.orderFlow.confidence || 0,
            signals.marketMaker?.confidence || 0,
            signals.latency.strength || 0
        ];
        
        const avg = confidences.reduce((a, b) => a + b, 0) / confidences.length;
        const max = Math.max(...confidences);
        
        // Weight toward max confidence
        return avg * 0.6 + max * 0.4;
    }
    
    /**
     * Evaluate if entry should be taken
     */
    evaluateEntry(combinedSignal) {
        const checks = {
            transformer: combinedSignal.transformer.confidence >= this.config.minConfidence,
            orderFlow: combinedSignal.orderFlow.strength >= this.config.minOrderFlowStrength / 10,
            sniper: combinedSignal.sniperScore >= this.config.minSniperScore,
            agreements: combinedSignal.agreements >= this.config.minAgreements,
            direction: combinedSignal.direction !== 'NEUTRAL',
            confidence: combinedSignal.confidence >= 6
        };
        
        const passedChecks = Object.values(checks).filter(Boolean).length;
        const totalChecks = Object.keys(checks).length;
        
        const shouldTrade = this.config.useAllSystems 
            ? passedChecks === totalChecks  // All must pass
            : passedChecks >= this.config.minAgreements;  // At least min agreements
        
        return {
            shouldTrade,
            direction: combinedSignal.direction,
            signal: combinedSignal.direction === 'UP' ? 'BUY' : 
                   combinedSignal.direction === 'DOWN' ? 'SELL' : null,
            confidence: combinedSignal.confidence,
            consensus: combinedSignal.consensus,
            agreements: combinedSignal.agreements,
            sniperScore: combinedSignal.sniperScore,
            checks,
            passedChecks,
            systems: {
                transformer: {
                    direction: combinedSignal.transformer.direction,
                    confidence: combinedSignal.transformer.confidence,
                    passed: checks.transformer
                },
                orderFlow: {
                    direction: combinedSignal.orderFlow.direction,
                    strength: combinedSignal.orderFlow.strength,
                    passed: checks.orderFlow
                },
                sniper: {
                    score: combinedSignal.sniperScore,
                    passed: checks.sniper
                }
            },
            entryQuality: this.calculateEntryQuality(combinedSignal, checks)
        };
    }
    
    /**
     * Calculate entry quality score
     */
    calculateEntryQuality(combinedSignal, checks) {
        let quality = 0;
        
        // Base quality from checks
        quality += Object.values(checks).filter(Boolean).length * 1.5;
        
        // Bonus for high consensus
        if (Math.abs(combinedSignal.consensus) > 0.8) quality += 2;
        
        // Bonus for high confidence
        if (combinedSignal.confidence > 8) quality += 2;
        else if (combinedSignal.confidence > 7) quality += 1;
        
        // Bonus for high sniper score
        if (combinedSignal.sniperScore >= 9) quality += 2;
        else if (combinedSignal.sniperScore >= 8) quality += 1;
        
        return Math.min(10, quality);
    }
    
    /**
     * Log analysis results
     */
    logAnalysis(pair, combinedSignal, decision) {
        console.log(`\n🎯 ULTRA ENTRY ANALYSIS for ${pair}:`);
        console.log(`   Direction: ${combinedSignal.direction} | Confidence: ${combinedSignal.confidence.toFixed(1)}/10`);
        console.log(`   Agreements: ${combinedSignal.agreements}/4 | Sniper Score: ${combinedSignal.sniperScore}/10`);
        console.log(`   Systems:`);
        console.log(`      🔮 Transformer: ${combinedSignal.transformer.direction} (${combinedSignal.transformer.confidence.toFixed(1)})`);
        console.log(`      📊 Order Flow: ${combinedSignal.orderFlow.direction} (${(combinedSignal.orderFlow.strength * 10).toFixed(1)})`);
        console.log(`      💰 Market Maker: ${combinedSignal.marketMaker?.signal || 'N/A'}`);
        console.log(`      ⚡ Latency: ${combinedSignal.latency.shouldTrade ? 'YES' : 'NO'}`);
        
        if (decision.shouldTrade) {
            console.log(`   ✅ ENTRY APPROVED: ${decision.signal} (Quality: ${decision.entryQuality}/10)`);
        } else {
            console.log(`   ❌ ENTRY REJECTED: ${decision.passedChecks}/${Object.keys(decision.checks).length} checks passed`);
            const failed = Object.entries(decision.checks)
                .filter(([_, passed]) => !passed)
                .map(([name]) => name);
            console.log(`      Failed: ${failed.join(', ')}`);
        }
    }
    
    /**
     * Record entry result
     */
    recordEntryResult(entry, result, profit) {
        // Update state
        this.state.dailyTrades++;
        this.state.lastTradeTime = Date.now();
        this.state.dailyProfit += profit;
        
        if (result === 'win') {
            this.state.consecutiveLosses = 0;
            this.performance.wins++;
        } else if (result === 'loss') {
            this.state.consecutiveLosses++;
            this.performance.losses++;
            
            // Start cooldown after max losses
            if (this.state.consecutiveLosses >= this.config.consecutiveLossesMax) {
                this.state.cooldownUntil = Date.now() + 600000; // 10 min cooldown
                console.log(`🛑 ULTRA ENTRY: Max losses reached, cooldown started`);
            }
        }
        
        // Update performance
        this.performance.totalTrades++;
        this.performance.totalProfit += profit;
        this.performance.winRate = this.performance.wins / this.performance.totalTrades;
        this.performance.avgEntryScore = 
            (this.performance.avgEntryScore * (this.performance.totalTrades - 1) + entry.entryQuality) 
            / this.performance.totalTrades;
        
        if (entry.entryQuality > this.performance.bestEntryScore) {
            this.performance.bestEntryScore = entry.entryQuality;
        }
        
        // Update system usage
        if (entry.systems.transformer.passed) this.performance.systemUsage.transformer++;
        if (entry.systems.orderFlow.passed) this.performance.systemUsage.orderFlow++;
        if (entry.systems.sniper.passed) this.performance.systemUsage.sniper++;
        
        // Store entry
        this.entryHistory.push({
            pair: entry.pair,
            direction: entry.direction,
            result,
            profit,
            entryQuality: entry.entryQuality,
            timestamp: Date.now()
        });
        
        if (this.entryHistory.length > this.maxHistory) {
            this.entryHistory.shift();
        }
    }
    
    /**
     * Get statistics
     */
    getStats() {
        return {
            ...this.performance,
            state: {
                dailyTrades: this.state.dailyTrades,
                dailyProfit: this.state.dailyProfit,
                consecutiveLosses: this.state.consecutiveLosses,
                inCooldown: Date.now() < this.state.cooldownUntil
            },
            systemUsage: {
                transformer: (this.performance.systemUsage.transformer / this.performance.totalTrades * 100).toFixed(1) + '%',
                orderFlow: (this.performance.systemUsage.orderFlow / this.performance.totalTrades * 100).toFixed(1) + '%',
                sniper: (this.performance.systemUsage.sniper / this.performance.totalTrades * 100).toFixed(1) + '%'
            }
        };
    }
    
    /**
     * Reset state
     */
    reset() {
        this.state.consecutiveLosses = 0;
        this.state.dailyProfit = 0;
        this.state.dailyTrades = 0;
        this.state.cooldownUntil = 0;
    }
    
    /**
     * Generate report
     */
    generateReport() {
        const stats = this.getStats();
        
        console.log(`\n╔══════════════════════════════════════════════════════════╗`);
        console.log(`║          🎯 ULTRA ENTRY SYSTEM REPORT                    ║`);
        console.log(`╠══════════════════════════════════════════════════════════╣`);
        console.log(`║ Total Trades: ${stats.totalTrades} | Win Rate: ${(stats.winRate * 100).toFixed(1)}%`);
        console.log(`║ Wins: ${stats.wins} | Losses: ${stats.losses}`);
        console.log(`║ Total Profit: ${(stats.totalProfit * 100).toFixed(2)}%`);
        console.log(`║ Avg Entry Quality: ${stats.avgEntryScore.toFixed(1)}/10`);
        console.log(`║ Best Entry: ${stats.bestEntryScore.toFixed(1)}/10`);
        console.log(`╠══════════════════════════════════════════════════════════╣`);
        console.log(`║ SYSTEM USAGE:`);
        console.log(`║   Transformer: ${stats.systemUsage.transformer}`);
        console.log(`║   Order Flow: ${stats.systemUsage.orderFlow}`);
        console.log(`║   Sniper: ${stats.systemUsage.sniper}`);
        console.log(`╠══════════════════════════════════════════════════════════╣`);
        console.log(`║ STATE:`);
        console.log(`║   Daily Trades: ${stats.state.dailyTrades}`);
        console.log(`║   Daily PnL: ${(stats.state.dailyProfit * 100).toFixed(2)}%`);
        console.log(`║   In Cooldown: ${stats.state.inCooldown ? 'YES' : 'NO'}`);
        console.log(`╚══════════════════════════════════════════════════════════╝\n`);
        
        return stats;
    }
}

module.exports = new UltraEntrySystem();
