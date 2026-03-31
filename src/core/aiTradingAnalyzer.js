/**
 * AI Trading Analysis & Strategy Optimization System
 * Quant-driven adaptive trading with machine learning
 */

const fs = require('fs');
const path = require('path');

class AITradingAnalyzer {
    constructor() {
        this.tradeHistory = [];
        this.marketConditions = [];
        this.indicators = [];
        
        // Performance tracking
        this.stats = {
            totalTrades: 0,
            wins: 0,
            losses: 0,
            winRate: 0,
            avgProfit: 0,
            avgLoss: 0,
            profitFactor: 0,
            maxDrawdown: 0,
            consecutiveWins: 0,
            consecutiveLosses: 0,
            maxConsecutiveLosses: 0
        };
        
        // Pattern analysis
        this.patterns = {
            rsi: { wins: [], losses: [] },
            market: { wins: [], losses: [] },
            time: { wins: [], losses: [] },
            pair: { wins: [], losses: [] }
        };
        
        // Optimal parameters (learned)
        this.optimalParams = {
            rsi: {
                buy: { threshold: 30, bestRange: [20, 35], winRate: 0 },
                sell: { threshold: 70, bestRange: [65, 80], winRate: 0 }
            },
            market: {
                SIDEWAY: { enabled: true, winRate: 0, trades: 0 },
                TREND_UP: { enabled: true, winRate: 0, trades: 0 },
                TREND_DOWN: { enabled: true, winRate: 0, trades: 0 },
                BREAKOUT: { enabled: false, winRate: 0, trades: 0 }
            },
            time: {
                bestHours: [],
                avoidHours: []
            }
        };
        
        // Load existing data
        this.loadData();
    }
    
    /**
     * Update trade result when outcome is known
     * This is called by TradeResultTracker when trade closes
     */
    updateTradeResult(orderId, resultData) {
        // Find pending trade by checking if any trade has matching ID in indicators
        const pendingTrade = this.tradeHistory.find(t => 
            t.result === 'pending' && 
            (t.id === orderId || t.orderId === orderId)
        );
        
        if (pendingTrade) {
            // Update with actual result
            pendingTrade.result = resultData.result;
            pendingTrade.profit = resultData.profit;
            pendingTrade.closePrice = resultData.closePrice;
            pendingTrade.closeTime = resultData.closeTime;
            pendingTrade.analyzed = false; // Re-analyze
            
            // Re-run analysis for this trade
            this.updateStats(pendingTrade);
            this.analyzePattern(pendingTrade);
            
            // Save updated data
            this.saveData();
            
            console.log(`🤖 AI learned: ${resultData.result.toUpperCase()} for ${pendingTrade.pair} (RSI: ${pendingTrade.rsi?.toFixed(1)})`);
            
            // Generate brief insight
            if (this.stats.totalTrades % 5 === 0) {
                this.generateQuickInsight();
            }
            
            return true;
        }
        
        return false;
    }
    
    /**
     * Get recent trades
     */
    getRecentTrades(count = 10) {
        return this.tradeHistory.slice(-count);
    }
    
    /**
     * Generate quick insight after trades
     */
    generateQuickInsight() {
        const recent = this.getRecentTrades(10);
        const recentWins = recent.filter(t => t.result === 'win').length;
        const recentWinRate = recent.length > 0 ? (recentWins / recent.length) * 100 : 0;
        
        console.log(`\n🧠 AI Insight: Last 10 trades - ${recentWinRate.toFixed(0)}% win rate`);
        
        if (recentWinRate < 40) {
            console.log('⚠️  Suggestion: Reduce trade frequency or check market conditions');
        } else if (recentWinRate > 60) {
            console.log('✅ Good performance! Continue current strategy');
        }
    }
    
    /**
     * Record a new trade with full context
     */
    recordTrade(tradeData) {
        const {
            pair,
            direction,
            amount,
            result,
            profit,
            rsi,
            marketCondition,
            timestamp,
            orderId,
            indicators = {}
        } = tradeData;
        
        const trade = {
            id: orderId || Date.now(),
            orderId: orderId,
            pair,
            direction,
            amount,
            result, // 'win' | 'loss' | 'pending'
            profit,
            rsi,
            marketCondition,
            timestamp: timestamp || new Date(),
            hour: new Date(timestamp || Date.now()).getHours(),
            indicators,
            analyzed: false
        };
        
        this.tradeHistory.push(trade);
        
        // Only update stats if result is known (not pending)
        if (result !== 'pending') {
            this.updateStats(trade);
            this.analyzePattern(trade);
        }
        
        // Auto-save
        this.saveData();
        
        if (result === 'pending') {
            console.log(`📊 Trade recorded (pending): ${pair} ${direction} (RSI: ${rsi?.toFixed(1) || 'N/A'})`);
        } else {
            console.log(`📊 Trade recorded: ${result.toUpperCase()} ${pair} $${profit} (RSI: ${rsi?.toFixed(1)})`);
        }
        
        return trade;
    }
    
    /**
     * Update overall statistics
     */
    updateStats(trade) {
        this.stats.totalTrades++;
        
        if (trade.result === 'win') {
            this.stats.wins++;
            this.stats.consecutiveWins++;
            this.stats.consecutiveLosses = 0;
            this.stats.avgProfit = (this.stats.avgProfit * (this.stats.wins - 1) + trade.profit) / this.stats.wins;
        } else {
            this.stats.losses++;
            this.stats.consecutiveLosses++;
            this.stats.consecutiveWins = 0;
            this.stats.avgLoss = (this.stats.avgLoss * (this.stats.losses - 1) + Math.abs(trade.profit)) / this.stats.losses;
            
            if (this.stats.consecutiveLosses > this.stats.maxConsecutiveLosses) {
                this.stats.maxConsecutiveLosses = this.stats.consecutiveLosses;
            }
        }
        
        // Safe win rate calculation
        this.stats.winRate = this.stats.totalTrades > 0 
            ? this.stats.wins / this.stats.totalTrades 
            : 0;
        
        // Safe profit factor calculation
        if (this.stats.avgLoss > 0 && this.stats.avgProfit > 0) {
            this.stats.profitFactor = this.stats.avgProfit / this.stats.avgLoss;
        } else if (this.stats.avgProfit > 0) {
            this.stats.profitFactor = 999; // High profit factor when no losses
        } else {
            this.stats.profitFactor = 0;
        }
    }
    
    /**
     * Analyze patterns from trade
     */
    analyzePattern(trade) {
        // RSI pattern
        if (trade.result === 'win') {
            this.patterns.rsi.wins.push(trade.rsi);
        } else {
            this.patterns.rsi.losses.push(trade.rsi);
        }
        
        // Market condition pattern
        if (trade.marketCondition) {
            if (trade.result === 'win') {
                this.patterns.market.wins.push(trade.marketCondition);
            } else {
                this.patterns.market.losses.push(trade.marketCondition);
            }
            
            // Update market performance
            const market = this.optimalParams.market[trade.marketCondition] || { trades: 0, wins: 0 };
            market.trades++;
            if (trade.result === 'win') market.wins++;
            market.winRate = market.wins / market.trades;
            this.optimalParams.market[trade.marketCondition] = market;
        }
        
        // Time pattern
        if (trade.result === 'win') {
            this.patterns.time.wins.push(trade.hour);
        } else {
            this.patterns.time.losses.push(trade.hour);
        }
        
        // Pair pattern
        if (trade.result === 'win') {
            this.patterns.pair.wins.push(trade.pair);
        } else {
            this.patterns.pair.losses.push(trade.pair);
        }
        
        trade.analyzed = true;
    }
    
    /**
     * Find optimal RSI ranges
     */
    analyzeRSIRanges() {
        const wins = this.patterns.rsi.wins;
        const losses = this.patterns.rsi.losses;
        
        if (wins.length < 5 || losses.length < 5) {
            return { message: 'Insufficient data (need 5+ wins and 5+ losses)' };
        }
        
        // Find best buy range (RSI for CALL/PUT)
        const winRSI = wins.sort((a, b) => a - b);
        const lossRSI = losses.sort((a, b) => a - b);
        
        const avgWinRSI = winRSI.reduce((a, b) => a + b, 0) / winRSI.length;
        const avgLossRSI = lossRSI.reduce((a, b) => a + b, 0) / lossRSI.length;
        
        // Find optimal thresholds
        // For CALL (buy): Low RSI is better
        const buyWins = winRSI.filter(r => r < 40);
        const buyLosses = lossRSI.filter(r => r < 40);
        const buyWinRate = buyWins.length / (buyWins.length + buyLosses.length);
        
        // For PUT (sell): High RSI is better
        const sellWins = winRSI.filter(r => r > 60);
        const sellLosses = lossRSI.filter(r => r > 60);
        const sellWinRate = sellWins.length / (sellWins.length + sellLosses.length);
        
        this.optimalParams.rsi.buy.winRate = buyWinRate;
        this.optimalParams.rsi.sell.winRate = sellWinRate;
        
        return {
            buy: {
                bestRange: [Math.min(...buyWins), Math.max(...buyWins)],
                winRate: buyWinRate,
                avgRSI: avgWinRSI
            },
            sell: {
                bestRange: [Math.min(...sellWins), Math.max(...sellWins)],
                winRate: sellWinRate,
                avgRSI: avgWinRSI
            }
        };
    }
    
    /**
     * Analyze best/worst trading hours
     */
    analyzeTimePatterns() {
        const hours = {};
        
        // Initialize all hours
        for (let i = 0; i < 24; i++) {
            hours[i] = { wins: 0, losses: 0, total: 0, winRate: 0 };
        }
        
        // Count by hour
        this.tradeHistory.forEach(trade => {
            const h = trade.hour;
            hours[h].total++;
            if (trade.result === 'win') {
                hours[h].wins++;
            } else {
                hours[h].losses++;
            }
        });
        
        // Calculate win rates
        Object.keys(hours).forEach(h => {
            if (hours[h].total > 0) {
                hours[h].winRate = hours[h].wins / hours[h].total;
            }
        });
        
        // Find best and worst hours
        const sortedHours = Object.entries(hours)
            .filter(([h, d]) => d.total >= 3) // Minimum 3 trades
            .sort((a, b) => b[1].winRate - a[1].winRate);
        
        this.optimalParams.time.bestHours = sortedHours.slice(0, 5).map(([h]) => parseInt(h));
        this.optimalParams.time.avoidHours = sortedHours.slice(-3).map(([h]) => parseInt(h));
        
        return {
            bestHours: this.optimalParams.time.bestHours,
            avoidHours: this.optimalParams.time.avoidHours,
            hourStats: hours
        };
    }
    
    /**
     * Get current optimal strategy parameters
     */
    getOptimalStrategy() {
        const rsiAnalysis = this.analyzeRSIRanges();
        const timeAnalysis = this.analyzeTimePatterns();
        
        // Determine best market conditions to trade
        const marketPerformance = Object.entries(this.optimalParams.market)
            .map(([condition, stats]) => ({
                condition,
                ...stats,
                enabled: stats.winRate > 0.5 || stats.trades < 5
            }))
            .sort((a, b) => b.winRate - a.winRate);
        
        return {
            rsi: this.optimalParams.rsi,
            market: marketPerformance,
            time: this.optimalParams.time,
            currentWinRate: this.stats.winRate,
            totalTrades: this.stats.totalTrades,
            recommendation: this.generateRecommendation()
        };
    }
    
    /**
     * Generate trading recommendation based on analysis
     */
    generateRecommendation() {
        const currentHour = new Date().getHours();
        const isGoodHour = this.optimalParams.time.bestHours.includes(currentHour);
        const isBadHour = this.optimalParams.time.avoidHours.includes(currentHour);
        
        // Check if we're in a losing streak
        if (this.stats.consecutiveLosses >= 3) {
            return {
                action: 'STOP',
                reason: `Consecutive losses: ${this.stats.consecutiveLosses}. Take a break.`,
                riskLevel: 'HIGH'
            };
        }
        
        // Check win rate
        if (this.stats.winRate < 0.45 && this.stats.totalTrades > 10) {
            return {
                action: 'CAUTION',
                reason: `Low win rate: ${(this.stats.winRate * 100).toFixed(1)}%. Review strategy.`,
                riskLevel: 'MEDIUM'
            };
        }
        
        // Time-based recommendation
        if (isBadHour) {
            return {
                action: 'AVOID',
                reason: `Hour ${currentHour} has poor historical performance`,
                riskLevel: 'MEDIUM'
            };
        }
        
        if (isGoodHour) {
            return {
                action: 'TRADE',
                reason: `Hour ${currentHour} has good historical performance`,
                riskLevel: 'LOW'
            };
        }
        
        return {
            action: 'NEUTRAL',
            reason: 'No strong pattern detected',
            riskLevel: 'MEDIUM'
        };
    }
    
    /**
     * Calculate position size based on performance - ENHANCED with Adaptive Kelly
     */
    calculatePositionSize(baseAmount = 1, edgeScore = 0) {
        // Validate base amount
        if (!baseAmount || baseAmount <= 0) baseAmount = 1;
        
        const { winRate, avgLoss, avgProfit, consecutiveLosses, totalTrades } = this.stats;
        
        // ═══════════════════════════════════════════════════════════════
        // 💰 ADAPTIVE KELLY CRITERION
        // ═══════════════════════════════════════════════════════════════
        
        // Kelly formula: f* = (p*b - q) / b
        // where: p = win rate, q = loss rate, b = avg win / avg loss
        const p = winRate || 0.5;
        const q = 1 - p;
        const b = avgLoss > 0 ? (avgProfit / avgLoss) : 1;
        
        // Full Kelly percentage
        let kellyPct = (p * b - q) / b;
        
        // Quarter Kelly for safety (reduce variance)
        let safeKelly = Math.max(0, kellyPct * 0.25);
        
        // ═══════════════════════════════════════════════════════════════
        // 📊 EXPERIENCE FACTOR (reduce size when data is limited)
        // ═══════════════════════════════════════════════════════════════
        const experienceFactor = Math.min(totalTrades / 20, 1); // Full size at 20+ trades
        safeKelly *= experienceFactor;
        
        // ═══════════════════════════════════════════════════════════════
        // 🔥 EDGE MULTIPLIER (increase size when edgeScore is high)
        // ═══════════════════════════════════════════════════════════════
        const edgeMultiplier = edgeScore > 0 ? (1 + edgeScore * 0.2) : 1;
        
        // ═══════════════════════════════════════════════════════════════
        // 📉 DRAWDOWN PROTECTION
        // ═══════════════════════════════════════════════════════════════
        const maxConsecutiveLosses = this.stats.maxConsecutiveLosses || 0;
        const currentStreak = this.stats.consecutiveLosses || 0;
        
        // Progressive reduction based on consecutive losses
        let drawdownMultiplier = 1;
        if (currentStreak >= 3) drawdownMultiplier = 0;      // Stop after 3 losses
        else if (currentStreak === 2) drawdownMultiplier = 0.3; // 70% reduction
        else if (currentStreak === 1) drawdownMultiplier = 0.7; // 30% reduction
        
        // ═══════════════════════════════════════════════════════════════
        // 🎯 FINAL POSITION SIZE CALCULATION
        // ═══════════════════════════════════════════════════════════════
        const finalSize = baseAmount * safeKelly * edgeMultiplier * drawdownMultiplier;
        
        // Hard limits
        const maxSize = baseAmount * 2;  // Max 2x base amount
        const minSize = 0.1;              // Min 0.1 units
        
        const clampedSize = Math.max(minSize, Math.min(finalSize, maxSize));
        
        return {
            baseAmount,
            kelly: safeKelly,
            experienceFactor,
            edgeMultiplier,
            drawdownMultiplier,
            finalSize: clampedSize,
            reason: this.getSizingReason(safeKelly, currentStreak, experienceFactor, edgeScore),
            shouldTrade: drawdownMultiplier > 0 && safeKelly > 0.05
        };
    }
    
    getSizingReason(kelly, consecutiveLosses, experience, edgeScore) {
        if (consecutiveLosses >= 3) return 'STOP: Max consecutive losses reached';
        if (consecutiveLosses === 2) return 'CAUTION: 2 consecutive losses - reduced size';
        if (experience < 0.5) return 'LEARNING: Limited trade history - conservative sizing';
        if (kelly < 0.05) return 'LOW: Unfavorable odds (Kelly < 5%)';
        if (edgeScore > 5) return 'HIGH: Strong edge detected';
        return 'NORMAL: Standard Kelly sizing';
    }
    
    /**
     * Check if we should trade based on current conditions - ENHANCED with stricter filters
     */
    shouldTrade(currentRSI, marketCondition, pair) {
        const recommendation = this.generateRecommendation();
        
        if (recommendation.action === 'STOP') {
            return { shouldTrade: false, reason: recommendation.reason };
        }
        
        // ENHANCED: Stricter market condition check
        const marketStats = this.optimalParams.market[marketCondition];
        if (marketStats && marketStats.trades > 10) {
            if (marketStats.winRate < 0.45) {
                return { 
                    shouldTrade: false, 
                    reason: `${marketCondition} has poor win rate: ${(marketStats.winRate * 100).toFixed(1)}%. Avoiding.` 
                };
            }
            // Only trade if winrate is good or we have limited data
            if (marketStats.winRate < 0.5 && this.stats.totalTrades > 20) {
                return { 
                    shouldTrade: false, 
                    reason: `${marketCondition} win rate ${(marketStats.winRate * 100).toFixed(1)}% below 50%.` 
                };
            }
        }
        
        // ENHANCED: RSI extreme check with better thresholds
        if (currentRSI < 15 || currentRSI > 85) {
            return { shouldTrade: true, reason: 'RSI extreme - high probability reversal' };
        }
        
        // Moderate RSI extremes - only if market is good
        if ((currentRSI < 25 || currentRSI > 75) && (!marketStats || marketStats.winRate > 0.5)) {
            return { shouldTrade: true, reason: 'RSI favorable with good market conditions' };
        }
        
        // Conservative RSI - require better conditions
        if (currentRSI < 30 || currentRSI > 70) {
            if (recommendation.action === 'TRADE' || this.stats.winRate > 0.55) {
                return { shouldTrade: true, reason: 'RSI good + favorable conditions' };
            }
        }
        
        // Default: Only trade if overall recommendation is positive
        if (recommendation.action === 'AVOID' || recommendation.action === 'CAUTION') {
            return { 
                shouldTrade: false, 
                reason: `Market conditions unfavorable: ${recommendation.reason}` 
            };
        }
        
        return { 
            shouldTrade: recommendation.action === 'TRADE', 
            reason: recommendation.reason 
        };
    }
    
    /**
     * Generate full analysis report
     */
    generateReport() {
        console.log('\n╔════════════════════════════════════════════════════════════╗');
        console.log('║          AI TRADING ANALYSIS REPORT                         ║');
        console.log('╚════════════════════════════════════════════════════════════╝\n');
        
        // Overall Performance
        console.log('📊 OVERALL PERFORMANCE');
        console.log('─────────────────────────────────────────────────────────────');
        console.log(`Total Trades: ${this.stats.totalTrades}`);
        console.log(`Wins: ${this.stats.wins} | Losses: ${this.stats.losses}`);
        console.log(`Win Rate: ${(this.stats.winRate * 100).toFixed(2)}%`);
        console.log(`Profit Factor: ${this.stats.profitFactor.toFixed(2)}`);
        console.log(`Max Consecutive Losses: ${this.stats.maxConsecutiveLosses}`);
        console.log(`Current Streak: ${this.stats.consecutiveLosses > 0 ? `L${this.stats.consecutiveLosses}` : `W${this.stats.consecutiveWins}`}`);
        
        // RSI Analysis
        console.log('\n📈 RSI PATTERN ANALYSIS');
        console.log('─────────────────────────────────────────────────────────────');
        const rsiAnalysis = this.analyzeRSIRanges();
        if (rsiAnalysis.buy) {
            console.log(`BUY (CALL) - Optimal RSI Range: ${rsiAnalysis.buy.bestRange[0].toFixed(0)}-${rsiAnalysis.buy.bestRange[1].toFixed(0)}`);
            console.log(`  Win Rate: ${(rsiAnalysis.buy.winRate * 100).toFixed(1)}%`);
            console.log(`SELL (PUT) - Optimal RSI Range: ${rsiAnalysis.sell.bestRange[0].toFixed(0)}-${rsiAnalysis.sell.bestRange[1].toFixed(0)}`);
            console.log(`  Win Rate: ${(rsiAnalysis.sell.winRate * 100).toFixed(1)}%`);
        } else {
            console.log(rsiAnalysis.message);
        }
        
        // Market Condition Analysis
        console.log('\n📉 MARKET CONDITION PERFORMANCE');
        console.log('─────────────────────────────────────────────────────────────');
        Object.entries(this.optimalParams.market)
            .sort((a, b) => b[1].winRate - a[1].winRate)
            .forEach(([condition, stats]) => {
                const status = stats.winRate > 0.5 ? '✅' : stats.winRate < 0.4 ? '❌' : '⚠️';
                console.log(`${status} ${condition}: ${(stats.winRate * 100).toFixed(1)}% (${stats.wins}/${stats.trades})`);
            });
        
        // Time Analysis
        console.log('\n⏰ TIME-BASED PATTERNS');
        console.log('─────────────────────────────────────────────────────────────');
        const timeAnalysis = this.analyzeTimePatterns();
        console.log(`Best Hours: ${timeAnalysis.bestHours.join(', ')}`);
        console.log(`Avoid Hours: ${timeAnalysis.avoidHours.join(', ')}`);
        
        // Current Recommendation
        console.log('\n🎯 CURRENT RECOMMENDATION');
        console.log('─────────────────────────────────────────────────────────────');
        const rec = this.generateRecommendation();
        const actionEmoji = { 'TRADE': '✅', 'CAUTION': '⚠️', 'STOP': '🛑', 'AVOID': '❌', 'NEUTRAL': '➖' };
        console.log(`${actionEmoji[rec.action] || '➖'} ACTION: ${rec.action}`);
        console.log(`Reason: ${rec.reason}`);
        console.log(`Risk Level: ${rec.riskLevel}`);
        
        // Position Sizing
        console.log('\n💰 POSITION SIZING');
        console.log('─────────────────────────────────────────────────────────────');
        const sizing = this.calculatePositionSize(1);
        console.log(`Recommended Size: $${sizing.finalSize.toFixed(2)}`);
        console.log(`Kelly %: ${(sizing.kelly * 100).toFixed(1)}%`);
        console.log(`Reason: ${sizing.reason}`);
        
        console.log('\n═════════════════════════════════════════════════════════════\n');
        
        return {
            stats: this.stats,
            recommendation: rec,
            sizing: sizing,
            optimalParams: this.getOptimalStrategy()
        };
    }
    
    /**
     * Save data to file
     */
    saveData() {
        try {
            const data = {
                tradeHistory: this.tradeHistory,
                stats: this.stats,
                patterns: this.patterns,
                optimalParams: this.optimalParams,
                lastUpdated: new Date().toISOString()
            };
            
            const dataPath = path.join(__dirname, '../../data/ai_analysis.json');
            const dir = path.dirname(dataPath);
            
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            
            fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
        } catch (error) {
            console.error('Failed to save AI analysis data:', error);
        }
    }
    
    /**
     * Load data from file with validation
     */
    loadData() {
        try {
            const dataPath = path.join(__dirname, '../../data/ai_analysis.json');
            if (fs.existsSync(dataPath)) {
                try {
                    const rawData = fs.readFileSync(dataPath, 'utf8');
                    
                    // Handle empty file
                    if (!rawData || rawData.trim() === '') {
                        console.log('📊 AI analysis file is empty, starting fresh');
                        return;
                    }
                    
                    const data = JSON.parse(rawData);
                    
                    // Validate data structure
                    if (!data || typeof data !== 'object') {
                        console.warn('📊 AI analysis data is invalid, starting fresh');
                        return;
                    }
                    
                    this.tradeHistory = Array.isArray(data.tradeHistory) ? data.tradeHistory : [];
                    this.stats = data.stats || this.stats;
                    this.patterns = data.patterns || this.patterns;
                    this.optimalParams = data.optimalParams || this.optimalParams;
                    
                    console.log(`📊 Loaded ${this.tradeHistory.length} historical trades`);
                } catch (parseError) {
                    console.warn('📊 Failed to parse AI analysis data:', parseError.message);
                    console.log('   Starting with fresh data');
                }
            }
        } catch (error) {
            console.log('📊 No previous AI analysis data found or error loading:', error.message);
        }
    }
    
    /**
     * Simulate trades for testing
     */
    simulateTrades(count = 20) {
        console.log(`\n🎲 Simulating ${count} trades for testing...\n`);
        
        const pairs = ['EURUSD-OTC', 'GBPUSD-OTC', 'USDJPY-OTC'];
        const directions = ['CALL', 'PUT'];
        const markets = ['SIDEWAY', 'TREND_UP', 'TREND_DOWN'];
        
        for (let i = 0; i < count; i++) {
            const pair = pairs[Math.floor(Math.random() * pairs.length)];
            const direction = directions[Math.floor(Math.random() * directions.length)];
            const market = markets[Math.floor(Math.random() * markets.length)];
            
            // Simulate RSI based on direction (bias towards successful patterns)
            let rsi;
            if (direction === 'CALL') {
                rsi = 20 + Math.random() * 25; // Low RSI for CALL
            } else {
                rsi = 65 + Math.random() * 20; // High RSI for PUT
            }
            
            // Simulate result (biased towards RSI extremes)
            const isExtreme = rsi < 25 || rsi > 75;
            const winProbability = isExtreme ? 0.65 : 0.45;
            const result = Math.random() < winProbability ? 'win' : 'loss';
            const profit = result === 'win' ? 0.8 : -1.0;
            
            this.recordTrade({
                pair,
                direction,
                amount: 1,
                result,
                profit,
                rsi,
                marketCondition: market,
                timestamp: new Date(Date.now() - i * 3600000) // Spread over time
            });
        }
        
        console.log(`\n✅ Simulated ${count} trades`);
        return this.generateReport();
    }
}

// Export singleton
module.exports = new AITradingAnalyzer();
