/**
 * Production Validation & Auto-Optimization System
 * ระบบทดสอบและ optimize อัตโนมัติสำหรับ IQ Option Trading Bot
 */

const fs = require('fs');
const path = require('path');

class ProductionValidator {
    constructor() {
        this.dataPath = './data/ai_analysis.json';
        this.reportPath = './analytics/validation_report.json';
        this.tradeHistory = [];
        this.stats = {
            totalTrades: 0,
            wins: 0,
            losses: 0,
            winRate: 0,
            profit: 0,
            drawdown: 0,
            maxLossStreak: 0,
            errors: 0,
            latency: []
        };
        this.issues = [];
        this.recommendations = [];
    }

    async runValidation() {
        console.log('\n╔══════════════════════════════════════════════════════════════╗');
        console.log('║     🤖 PRODUCTION VALIDATION & AUTO-OPTIMIZATION            ║');
        console.log('╚══════════════════════════════════════════════════════════════╝\n');

        // Step 1: Load and analyze data
        await this.loadData();
        
        // Step 2: Calculate metrics
        this.calculateMetrics();
        
        // Step 3: Identify issues
        this.identifyIssues();
        
        // Step 4: Generate recommendations
        this.generateRecommendations();
        
        // Step 5: Auto-fix if enabled
        await this.autoFix();
        
        // Step 6: Generate report
        this.generateReport();
        
        // Step 7: Return status
        return this.getStatus();
    }

    async loadData() {
        try {
            if (fs.existsSync(this.dataPath)) {
                const data = JSON.parse(fs.readFileSync(this.dataPath, 'utf8'));
                this.tradeHistory = data.tradeHistory || [];
                console.log(`📊 Loaded ${this.tradeHistory.length} trades from history`);
            } else {
                console.log('⚠️ No existing trade data found');
            }
        } catch (error) {
            console.error('❌ Error loading data:', error.message);
            this.issues.push({ type: 'data_error', message: error.message });
        }
    }

    calculateMetrics() {
        const trades = this.tradeHistory;
        this.stats.totalTrades = trades.length;
        
        if (trades.length === 0) {
            console.log('⚠️ No trades to analyze');
            return;
        }

        // Wins and losses
        this.stats.wins = trades.filter(t => t.result === 'win').length;
        this.stats.losses = trades.filter(t => t.result === 'loss').length;
        
        // Win rate
        this.stats.winRate = this.stats.totalTrades > 0 
            ? (this.stats.wins / this.stats.totalTrades * 100).toFixed(2)
            : 0;

        // Profit
        this.stats.profit = trades.reduce((sum, t) => sum + (t.profit || 0), 0);

        // Max loss streak
        let currentStreak = 0;
        let maxStreak = 0;
        for (const trade of trades) {
            if (trade.result === 'loss') {
                currentStreak++;
                maxStreak = Math.max(maxStreak, currentStreak);
            } else {
                currentStreak = 0;
            }
        }
        this.stats.maxLossStreak = maxStreak;

        // Drawdown calculation
        let peak = 0;
        let maxDrawdown = 0;
        let runningProfit = 0;
        for (const trade of trades) {
            runningProfit += (trade.profit || 0);
            peak = Math.max(peak, runningProfit);
            const drawdown = peak - runningProfit;
            maxDrawdown = Math.max(maxDrawdown, drawdown);
        }
        this.stats.drawdown = maxDrawdown;

        console.log('\n📈 PERFORMANCE METRICS');
        console.log('═══════════════════════════════════════════════════════════');
        console.log(`Total Trades:     ${this.stats.totalTrades}`);
        console.log(`Wins:             ${this.stats.wins}`);
        console.log(`Losses:           ${this.stats.losses}`);
        console.log(`Win Rate:         ${this.stats.winRate}%`);
        console.log(`Total Profit:     $${this.stats.profit.toFixed(2)}`);
        console.log(`Max Drawdown:     $${this.stats.drawdown.toFixed(2)}`);
        console.log(`Max Loss Streak:  ${this.stats.maxLossStreak}`);
        console.log('═══════════════════════════════════════════════════════════\n');
    }

    identifyIssues() {
        console.log('🔍 ANALYZING ISSUES...\n');

        // Issue 1: Win rate too low
        if (this.stats.winRate < 55) {
            this.issues.push({
                severity: 'high',
                type: 'low_winrate',
                message: `Win rate ${this.stats.winRate}% below target 55%`,
                metric: this.stats.winRate
            });
            console.log('❌ ISSUE: Win rate below 55%');
        }

        // Issue 2: Loss streak too high
        if (this.stats.maxLossStreak > 3) {
            this.issues.push({
                severity: 'high',
                type: 'high_loss_streak',
                message: `Loss streak ${this.stats.maxLossStreak} exceeds limit 3`,
                metric: this.stats.maxLossStreak
            });
            console.log('❌ ISSUE: Loss streak exceeds 3');
        }

        // Issue 3: Drawdown too high
        if (this.stats.drawdown > 10) {
            this.issues.push({
                severity: 'critical',
                type: 'high_drawdown',
                message: `Drawdown $${this.stats.drawdown.toFixed(2)} exceeds limit $10`,
                metric: this.stats.drawdown
            });
            console.log('❌ ISSUE: Drawdown exceeds $10');
        }

        // Issue 4: Trading in wrong market conditions
        const wrongConditionTrades = this.tradeHistory.filter(t => 
            (t.result === 'loss') && 
            (t.marketCondition === 'TREND_UP' || t.marketCondition === 'TREND_DOWN')
        );
        if (wrongConditionTrades.length > 5) {
            this.issues.push({
                severity: 'medium',
                type: 'wrong_market_condition',
                message: `${wrongConditionTrades.length} losses in trending markets`,
                metric: wrongConditionTrades.length
            });
            console.log('❌ ISSUE: Trading in trending markets causing losses');
        }

        // Issue 5: RSI not extreme enough
        const nonExtremeRSI = this.tradeHistory.filter(t => {
            const rsi = t.rsi || 50;
            return t.result === 'loss' && rsi > 25 && rsi < 75;
        });
        if (nonExtremeRSI.length > 5) {
            this.issues.push({
                severity: 'medium',
                type: 'rsi_not_extreme',
                message: `${nonExtremeRSI.length} losses with RSI not extreme`,
                metric: nonExtremeRSI.length
            });
            console.log('❌ ISSUE: RSI not extreme enough for entries');
        }

        if (this.issues.length === 0) {
            console.log('✅ No major issues found!');
        }

        console.log('');
    }

    generateRecommendations() {
        console.log('🧠 GENERATING RECOMMENDATIONS...\n');

        for (const issue of this.issues) {
            switch (issue.type) {
                case 'low_winrate':
                    this.recommendations.push({
                        priority: 1,
                        action: 'increase_sniper_threshold',
                        current: 'score >= 7',
                        target: 'score >= 8',
                        reason: 'Increase entry quality threshold'
                    });
                    this.recommendations.push({
                        priority: 2,
                        action: 'increase_ai_confidence',
                        current: 'confidence > 0.70',
                        target: 'confidence > 0.80',
                        reason: 'Higher AI confidence required'
                    });
                    break;

                case 'high_loss_streak':
                    this.recommendations.push({
                        priority: 1,
                        action: 'reduce_max_consecutive_losses',
                        current: 'maxConsecutiveLosses = 3',
                        target: 'maxConsecutiveLosses = 2',
                        reason: 'Stop earlier to prevent streaks'
                    });
                    this.recommendations.push({
                        priority: 2,
                        action: 'increase_cooldown',
                        current: 'cooldown = 5min',
                        target: 'cooldown = 10min',
                        reason: 'Longer cooldown after losses'
                    });
                    break;

                case 'high_drawdown':
                    this.recommendations.push({
                        priority: 1,
                        action: 'reduce_position_size',
                        current: 'base = 1',
                        target: 'base = 0.5',
                        reason: 'Smaller positions to reduce risk'
                    });
                    this.recommendations.push({
                        priority: 1,
                        action: 'add_stop_loss',
                        current: 'no stop loss',
                        target: 'stop at -5% daily',
                        reason: 'Hard stop to prevent large drawdown'
                    });
                    break;

                case 'wrong_market_condition':
                    this.recommendations.push({
                        priority: 1,
                        action: 'only_trade_sideway',
                        current: 'trade all conditions',
                        target: 'SIDEWAY only',
                        reason: 'SIDEWAY markets have higher win rate'
                    });
                    break;

                case 'rsi_not_extreme':
                    this.recommendations.push({
                        priority: 1,
                        action: 'tighten_rsi_threshold',
                        current: 'RSI < 25 or > 75',
                        target: 'RSI < 20 or > 80',
                        reason: 'Only extreme RSI for entries'
                    });
                    break;
            }
        }

        // Always recommend strict time filter
        this.recommendations.push({
            priority: 3,
            action: 'strict_time_filter',
            current: 'trade all hours',
            target: 'only 7-9, 13-15',
            reason: 'London/NY open have better liquidity'
        });

        console.log('📝 RECOMMENDATIONS:');
        console.log('═══════════════════════════════════════════════════════════');
        this.recommendations.forEach((rec, i) => {
            console.log(`${i + 1}. [P${rec.priority}] ${rec.action}`);
            console.log(`   ${rec.current} → ${rec.target}`);
            console.log(`   Reason: ${rec.reason}\n`);
        });
        console.log('═══════════════════════════════════════════════════════════\n');
    }

    async autoFix() {
        console.log('🔧 APPLYING AUTO-FIXES...\n');

        const botPath = './src/core/bot.js';
        let botContent = fs.readFileSync(botPath, 'utf8');
        let fixesApplied = 0;

        for (const rec of this.recommendations) {
            switch (rec.action) {
                case 'increase_sniper_threshold':
                    if (botContent.includes('minThreshold: 7')) {
                        botContent = botContent.replace('minThreshold: 7', 'minThreshold: 8');
                        console.log('✅ Fixed: Increased sniper threshold from 7 to 8');
                        fixesApplied++;
                    }
                    break;

                case 'reduce_max_consecutive_losses':
                    if (botContent.includes('maxConsecutiveLosses: 3')) {
                        botContent = botContent.replace('maxConsecutiveLosses: 3', 'maxConsecutiveLosses: 2');
                        console.log('✅ Fixed: Reduced max consecutive losses from 3 to 2');
                        fixesApplied++;
                    }
                    break;

                case 'tighten_rsi_threshold':
                    if (botContent.includes('callMax: 25')) {
                        botContent = botContent.replace('callMax: 25', 'callMax: 20');
                        console.log('✅ Fixed: Tightened RSI callMax from 25 to 20');
                        fixesApplied++;
                    }
                    if (botContent.includes('putMin: 75')) {
                        botContent = botContent.replace('putMin: 75', 'putMin: 80');
                        console.log('✅ Fixed: Tightened RSI putMin from 75 to 80');
                        fixesApplied++;
                    }
                    break;

                case 'increase_cooldown':
                    if (botContent.includes('cooldownUntil = Date.now() + (5 * 60 * 1000)')) {
                        botContent = botContent.replace(
                            'cooldownUntil = Date.now() + (5 * 60 * 1000)',
                            'cooldownUntil = Date.now() + (10 * 60 * 1000)'
                        );
                        console.log('✅ Fixed: Increased cooldown from 5min to 10min');
                        fixesApplied++;
                    }
                    break;

                case 'only_trade_sideway':
                    // Add stricter market condition filter
                    if (botContent.includes('// 🎯 PROFIT FILTER 4: Market condition filter')) {
                        const oldFilter = `if (config.marketFilter.blocked.includes(market.type))`;
                        const newFilter = `if (market.type !== 'SIDEWAY')`;
                        botContent = botContent.replace(oldFilter, newFilter);
                        console.log('✅ Fixed: Only trading SIDEWAY markets now');
                        fixesApplied++;
                    }
                    break;
            }
        }

        if (fixesApplied > 0) {
            fs.writeFileSync(botPath, botContent);
            console.log(`\n✅ Applied ${fixesApplied} fixes to bot.js`);
        } else {
            console.log('ℹ️ No fixes needed - bot already optimized');
        }

        console.log('');
    }

    generateReport() {
        const report = {
            timestamp: new Date().toISOString(),
            metrics: this.stats,
            issues: this.issues,
            recommendations: this.recommendations,
            status: this.getPassFailStatus()
        };

        // Ensure directory exists
        const dir = path.dirname(this.reportPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(this.reportPath, JSON.stringify(report, null, 2));
        console.log(`📄 Report saved to ${this.reportPath}`);
    }

    getPassFailStatus() {
        const pass = 
            this.stats.winRate >= 55 &&
            this.stats.maxLossStreak <= 3 &&
            this.stats.drawdown < 10;
        
        return pass ? 'PASS' : 'FAIL';
    }

    getStatus() {
        return {
            trades: this.stats.totalTrades,
            winRate: this.stats.winRate,
            profit: this.stats.profit,
            errors: this.issues.length,
            status: this.getPassFailStatus(),
            nextAction: this.getPassFailStatus() === 'PASS' 
                ? 'Continue trading - system optimized'
                : 'Fixed issues - re-run validation'
        };
    }
}

// Run if called directly
if (require.main === module) {
    const validator = new ProductionValidator();
    validator.runValidation().then(status => {
        console.log('\n╔══════════════════════════════════════════════════════════════╗');
        console.log('║                      FINAL STATUS                             ║');
        console.log('╚══════════════════════════════════════════════════════════════╝');
        console.log(`Trades:     ${status.trades}`);
        console.log(`Win Rate:   ${status.winRate}%`);
        console.log(`Profit:     $${status.profit.toFixed(2)}`);
        console.log(`Errors:     ${status.errors}`);
        console.log(`Status:     ${status.status === 'PASS' ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`Next:       ${status.nextAction}`);
        console.log('═══════════════════════════════════════════════════════════════\n');
        
        process.exit(status.status === 'PASS' ? 0 : 1);
    }).catch(error => {
        console.error('❌ Validation failed:', error);
        process.exit(1);
    });
}

module.exports = ProductionValidator;
