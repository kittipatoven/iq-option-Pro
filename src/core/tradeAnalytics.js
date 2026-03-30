/**
 * TRADE ANALYTICS MODULE
 * Records and analyzes trading data to find real edge
 * 
 * Records:
 * - timestamp
 * - pair
 * - market condition (trend, volatility, momentum, overall)
 * - RSI value
 * - BB position (upper, middle, lower, price position)
 * - score (totalScore, signalStrength)
 * - signal (BUY/SELL)
 * - conditions met (rsiExtreme, bbBreach, engulfing)
 * - result (WIN/LOSS)
 * - profit
 * 
 * Analysis:
 * - Winrate by different conditions
 * - Profit factor
 * - Best setup identification
 * - Edge analysis
 */

const fs = require('fs');
const path = require('path');

class TradeAnalytics {
    constructor() {
        this.trades = [];
        this.dataDir = './analytics';
        this.ensureDataDir();
    }

    ensureDataDir() {
        if (!fs.existsSync(this.dataDir)) {
            fs.mkdirSync(this.dataDir, { recursive: true });
        }
    }

    /**
     * Record a trade with full context
     */
    recordTrade(tradeData) {
        const {
            timestamp,
            pair,
            marketCondition,
            rsi,
            bollingerBands,
            score,
            signal,
            conditions,
            result,
            profit,
            amount
        } = tradeData;

        const trade = {
            id: this.trades.length + 1,
            timestamp: timestamp || new Date().toISOString(),
            pair,
            marketCondition: {
                trend: marketCondition?.trend || 'UNKNOWN',
                volatility: marketCondition?.volatility || 'UNKNOWN',
                momentum: marketCondition?.momentum || 'UNKNOWN',
                overall: marketCondition?.overall || 'UNKNOWN'
            },
            rsi: {
                value: typeof rsi === 'object' ? rsi.value : rsi,
                signal: rsi?.signal || 'NEUTRAL'
            },
            bb: {
                upper: bollingerBands?.upper || 0,
                middle: bollingerBands?.middle || 0,
                lower: bollingerBands?.lower || 0,
                price: bollingerBands?.price || 0,
                position: bollingerBands?.position || 'NORMAL'
            },
            score: {
                total: typeof score === 'object' ? score.totalScore : score,
                signalStrength: score?.signalStrength || 'LOW',
                shouldTrade: score?.shouldTrade || false
            },
            signal: signal || 'NONE',
            conditions: {
                rsiExtreme: conditions?.rsiExtreme || false,
                bbBreach: conditions?.bbBreach || false,
                engulfing: conditions?.engulfing || false,
                conditionCount: conditions?.conditionCount || 0
            },
            result: result || 'PENDING',
            profit: profit || 0,
            amount: amount || 0,
            source: 'IQ_OPTION_API'  // Mark as real API data
        };

        // DEBUG: Log trade recording
        console.log(`📝 TRADE ANALYTICS RECORDED:`, {
            tradeId: trade.id,
            pair: trade.pair,
            result: trade.result,
            profit: trade.profit,
            source: trade.source
        });

        this.trades.push(trade);
        this.saveTrade(trade);

        // Check milestones
        this.checkMilestones();

        return trade;
    }

    /**
     * Save individual trade to file
     */
    saveTrade(trade) {
        const date = trade.timestamp.split('T')[0];
        const filename = path.join(this.dataDir, `trades_${date}.json`);
        
        let trades = [];
        if (fs.existsSync(filename)) {
            trades = JSON.parse(fs.readFileSync(filename, 'utf8'));
        }
        
        trades.push(trade);
        fs.writeFileSync(filename, JSON.stringify(trades, null, 2));
    }

    /**
     * Update trade result after trade closes
     */
    updateTradeResult(tradeId, result, profit) {
        const trade = this.trades.find(t => t.id === tradeId);
        if (trade) {
            trade.result = result;
            trade.profit = profit;
            this.saveAllTrades();
        }
    }

    /**
     * Save all trades
     */
    saveAllTrades() {
        const filename = path.join(this.dataDir, `all_trades_${new Date().toISOString().split('T')[0]}.json`);
        fs.writeFileSync(filename, JSON.stringify(this.trades, null, 2));
    }

    /**
     * Check for analysis milestones
     */
    checkMilestones() {
        const count = this.trades.length;
        
        if (count === 50) {
            console.log('\n' + '='.repeat(80));
            console.log('🎯 MILESTONE: 50 TRADES REACHED!');
            console.log('='.repeat(80));
            this.analyze50Trades();
        }
        
        if (count === 100) {
            console.log('\n' + '='.repeat(80));
            console.log('🎯 MILESTONE: 100 TRADES REACHED!');
            console.log('='.repeat(80));
            this.analyze100Trades();
        }
    }

    /**
     * Analyze first 50 trades
     */
    analyze50Trades() {
        const trades = this.trades.slice(0, 50);
        const analysis = this.performAnalysis(trades, 50);
        
        console.log('\n📊 50 TRADE ANALYSIS REPORT');
        console.log('-'.repeat(60));
        this.printAnalysis(analysis);
        
        this.saveAnalysis('analysis_50_trades.json', analysis);
        
        return analysis;
    }

    /**
     * Analyze first 100 trades
     */
    analyze100Trades() {
        const trades = this.trades.slice(0, 100);
        const analysis = this.performAnalysis(trades, 100);
        
        console.log('\n📊 100 TRADE ANALYSIS REPORT');
        console.log('-'.repeat(60));
        this.printAnalysis(analysis);
        
        // Find best and worst setups
        this.findBestAndWorstSetups(trades);
        
        this.saveAnalysis('analysis_100_trades.json', analysis);
        
        return analysis;
    }

    /**
     * Perform comprehensive analysis
     */
    performAnalysis(trades, totalCount) {
        const wins = trades.filter(t => t.profit > 0);
        const losses = trades.filter(t => t.profit < 0);
        
        const winCount = wins.length;
        const lossCount = losses.length;
        const winRate = (winCount / trades.length) * 100;
        
        const totalProfit = wins.reduce((sum, t) => sum + t.profit, 0);
        const totalLoss = Math.abs(losses.reduce((sum, t) => sum + t.profit, 0));
        const profitFactor = totalLoss > 0 ? totalProfit / totalLoss : totalProfit > 0 ? Infinity : 0;
        
        const netProfit = trades.reduce((sum, t) => sum + t.profit, 0);
        const avgProfitPerTrade = netProfit / trades.length;
        
        // Analysis by market condition
        const byMarketTrend = this.analyzeByCondition(trades, 'marketCondition.trend');
        const byMarketOverall = this.analyzeByCondition(trades, 'marketCondition.overall');
        const byVolatility = this.analyzeByCondition(trades, 'marketCondition.volatility');
        
        // Analysis by signal conditions
        const bySignal = this.analyzeByCondition(trades, 'signal');
        const byRSIExtreme = this.analyzeByBooleanCondition(trades, 'conditions.rsiExtreme');
        const byBBBreach = this.analyzeByBooleanCondition(trades, 'conditions.bbBreach');
        const byEngulfing = this.analyzeByBooleanCondition(trades, 'conditions.engulfing');
        const byConditionCount = this.analyzeByCondition(trades, 'conditions.conditionCount');
        
        // Analysis by score
        const byScoreStrength = this.analyzeByCondition(trades, 'score.signalStrength');
        
        // Best setup analysis
        const bestSetup = this.findBestSetup(trades);
        
        return {
            totalTrades: trades.length,
            winCount,
            lossCount,
            winRate: winRate.toFixed(2),
            totalProfit: totalProfit.toFixed(2),
            totalLoss: totalLoss.toFixed(2),
            profitFactor: profitFactor.toFixed(2),
            netProfit: netProfit.toFixed(2),
            avgProfitPerTrade: avgProfitPerTrade.toFixed(2),
            byMarketTrend,
            byMarketOverall,
            byVolatility,
            bySignal,
            byRSIExtreme,
            byBBBreach,
            byEngulfing,
            byConditionCount,
            byScoreStrength,
            bestSetup
        };
    }

    /**
     * Analyze trades grouped by a condition
     */
    analyzeByCondition(trades, conditionPath) {
        const groups = {};
        
        trades.forEach(trade => {
            const value = this.getNestedValue(trade, conditionPath);
            if (!groups[value]) {
                groups[value] = { trades: [], wins: 0, losses: 0, profit: 0 };
            }
            groups[value].trades.push(trade);
            if (trade.profit > 0) groups[value].wins++;
            if (trade.profit < 0) groups[value].losses++;
            groups[value].profit += trade.profit;
        });
        
        // Calculate win rates and sort by profit
        const results = Object.entries(groups).map(([key, data]) => ({
            condition: key,
            trades: data.trades.length,
            wins: data.wins,
            losses: data.losses,
            winRate: ((data.wins / data.trades.length) * 100).toFixed(1),
            profit: data.profit.toFixed(2),
            avgProfit: (data.profit / data.trades.length).toFixed(2)
        }));
        
        return results.sort((a, b) => parseFloat(b.profit) - parseFloat(a.profit));
    }

    /**
     * Analyze boolean conditions
     */
    analyzeByBooleanCondition(trades, conditionPath) {
        const withCondition = trades.filter(t => this.getNestedValue(t, conditionPath));
        const withoutCondition = trades.filter(t => !this.getNestedValue(t, conditionPath));
        
        const analyzeGroup = (group, name) => {
            if (group.length === 0) return null;
            const wins = group.filter(t => t.profit > 0).length;
            const profit = group.reduce((sum, t) => sum + t.profit, 0);
            return {
                condition: name,
                trades: group.length,
                wins,
                losses: group.length - wins,
                winRate: ((wins / group.length) * 100).toFixed(1),
                profit: profit.toFixed(2),
                avgProfit: (profit / group.length).toFixed(2)
            };
        };
        
        return [
            analyzeGroup(withCondition, 'YES'),
            analyzeGroup(withoutCondition, 'NO')
        ].filter(Boolean);
    }

    /**
     * Find the best setup based on all conditions
     */
    findBestSetup(trades) {
        // Group by combination of key factors
        const setupGroups = {};
        
        trades.forEach(trade => {
            const key = `${trade.signal}|${trade.conditions.conditionCount}|${trade.marketCondition.overall}|${trade.score.signalStrength}`;
            
            if (!setupGroups[key]) {
                setupGroups[key] = {
                    setup: {
                        signal: trade.signal,
                        conditions: trade.conditions.conditionCount,
                        market: trade.marketCondition.overall,
                        scoreStrength: trade.score.signalStrength
                    },
                    trades: [],
                    wins: 0,
                    profit: 0
                };
            }
            
            setupGroups[key].trades.push(trade);
            if (trade.profit > 0) setupGroups[key].wins++;
            setupGroups[key].profit += trade.profit;
        });
        
        // Filter setups with at least 5 trades and calculate stats
        const validSetups = Object.values(setupGroups)
            .filter(g => g.trades.length >= 3)
            .map(g => ({
                ...g.setup,
                tradeCount: g.trades.length,
                wins: g.wins,
                winRate: ((g.wins / g.trades.length) * 100).toFixed(1),
                totalProfit: g.profit.toFixed(2),
                avgProfit: (g.profit / g.trades.length).toFixed(2)
            }))
            .sort((a, b) => parseFloat(b.totalProfit) - parseFloat(a.totalProfit));
        
        return validSetups.slice(0, 5); // Top 5 setups
    }

    /**
     * Find best and worst setups at 100 trade milestone
     */
    findBestAndWorstSetups(trades) {
        console.log('\n🏆 SETUP ANALYSIS (Top 5 Best & Worst)');
        console.log('-'.repeat(60));
        
        const setups = this.findBestSetup(trades);
        
        console.log('\n✅ BEST SETUPS (Most Profitable):');
        setups.slice(0, 5).forEach((setup, i) => {
            console.log(`\n   ${i + 1}. Signal: ${setup.signal} | Market: ${setup.market}`);
            console.log(`      Conditions: ${setup.conditions}/3 | Score: ${setup.scoreStrength}`);
            console.log(`      Trades: ${setup.tradeCount} | Wins: ${setup.wins} | WinRate: ${setup.winRate}%`);
            console.log(`      Total Profit: $${setup.totalProfit} | Avg: $${setup.avgProfit}/trade`);
        });
        
        console.log('\n❌ WORST SETUPS (Least Profitable):');
        const worstSetups = [...setups].reverse().slice(0, 5);
        worstSetups.forEach((setup, i) => {
            console.log(`\n   ${i + 1}. Signal: ${setup.signal} | Market: ${setup.market}`);
            console.log(`      Conditions: ${setup.conditions}/3 | Score: ${setup.scoreStrength}`);
            console.log(`      Trades: ${setup.tradeCount} | Wins: ${setup.wins} | WinRate: ${setup.winRate}%`);
            console.log(`      Total Profit: $${setup.totalProfit} | Avg: $${setup.avgProfit}/trade`);
        });
        
        // Edge analysis
        console.log('\n📊 EDGE ANALYSIS:');
        console.log('-'.repeat(60));
        
        const best = setups[0];
        const worst = worstSetups[0];
        
        if (best && worst) {
            console.log(`\n🎯 REAL EDGE FOUND:`);
            console.log(`   Best setup profits: $${best.totalProfit} over ${best.tradeCount} trades`);
            console.log(`   Worst setup loses: $${worst.totalProfit} over ${worst.tradeCount} trades`);
            console.log(`\n   💡 KEY DIFFERENCES:`);
            console.log(`   - Signal: ${best.signal} vs ${worst.signal}`);
            console.log(`   - Market: ${best.market} vs ${worst.market}`);
            console.log(`   - Conditions: ${best.conditions}/3 vs ${worst.conditions}/3`);
            console.log(`   - Score Strength: ${best.scoreStrength} vs ${worst.scoreStrength}`);
        }
    }

    /**
     * Print analysis results
     */
    printAnalysis(analysis) {
        console.log(`\n📈 OVERALL PERFORMANCE:`);
        console.log(`   Total Trades: ${analysis.totalTrades}`);
        console.log(`   Wins: ${analysis.winCount} | Losses: ${analysis.lossCount}`);
        console.log(`   WinRate: ${analysis.winRate}%`);
        console.log(`   Net Profit: $${analysis.netProfit}`);
        console.log(`   Profit Factor: ${analysis.profitFactor}`);
        console.log(`   Avg Profit/Trade: $${analysis.avgProfitPerTrade}`);
        
        console.log(`\n📊 BY MARKET CONDITION:`);
        analysis.byMarketOverall.forEach(m => {
            console.log(`   ${m.condition}: ${m.trades} trades, WinRate: ${m.winRate}%, Profit: $${m.profit}`);
        });
        
        console.log(`\n📊 BY SIGNAL TYPE:`);
        analysis.bySignal.forEach(s => {
            console.log(`   ${s.condition}: ${s.trades} trades, WinRate: ${s.winRate}%, Profit: $${s.profit}`);
        });
        
        console.log(`\n📊 BY CONDITION COUNT:`);
        analysis.byConditionCount.forEach(c => {
            console.log(`   ${c.condition} conditions: ${c.trades} trades, WinRate: ${c.winRate}%, Profit: $${c.profit}`);
        });
        
        console.log(`\n📊 BY INDIVIDUAL CONDITIONS:`);
        console.log(`   RSI Extreme: ${analysis.byRSIExtreme.map(x => `${x.condition}=${x.winRate}% ($${x.profit})`).join(', ')}`);
        console.log(`   BB Breach: ${analysis.byBBBreach.map(x => `${x.condition}=${x.winRate}% ($${x.profit})`).join(', ')}`);
        console.log(`   Engulfing: ${analysis.byEngulfing.map(x => `${x.condition}=${x.winRate}% ($${x.profit})`).join(', ')}`);
        
        console.log(`\n🏆 TOP 3 SETUPS:`);
        analysis.bestSetup.slice(0, 3).forEach((setup, i) => {
            console.log(`   ${i + 1}. ${setup.signal} in ${setup.market} market (${setup.conditions}/3 conditions)`);
            console.log(`      ${setup.tradeCount} trades, WinRate: ${setup.winRate}%, Profit: $${setup.totalProfit}`);
        });
    }

    /**
     * Save analysis to file
     */
    saveAnalysis(filename, analysis) {
        const filepath = path.join(this.dataDir, filename);
        fs.writeFileSync(filepath, JSON.stringify(analysis, null, 2));
        console.log(`\n💾 Analysis saved to: ${filepath}`);
    }

    /**
     * Get nested object value by path
     */
    getNestedValue(obj, path) {
        return path.split('.').reduce((current, prop) => current?.[prop], obj);
    }

    /**
     * Get all trades
     */
    getAllTrades() {
        return this.trades;
    }

    /**
     * Get trade count
     */
    getTradeCount() {
        return this.trades.length;
    }

    /**
     * Generate final report
     */
    generateFinalReport() {
        if (this.trades.length === 0) {
            console.log('No trades recorded yet.');
            return;
        }
        
        console.log('\n' + '='.repeat(80));
        console.log('📊 FINAL TRADE REPORT');
        console.log('='.repeat(80));
        
        const analysis = this.performAnalysis(this.trades, this.trades.length);
        this.printAnalysis(analysis);
        
        if (this.trades.length >= 50) {
            this.findBestAndWorstSetups(this.trades);
        }
        
        this.saveAnalysis(`final_report_${this.trades.length}_trades.json`, analysis);
    }
}

module.exports = TradeAnalytics;
