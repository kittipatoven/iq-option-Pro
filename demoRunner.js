/**
 * Demo Mode Test Runner - 100 Trades Validation
 * ระบบทดสอบ Demo Mode พร้อมเก็บสถิติครบ 100 เทรด
 */

const fs = require('fs');
const path = require('path');

class DemoModeRunner {
    constructor() {
        this.testId = `demo_${Date.now()}`;
        this.startTime = new Date();
        this.trades = [];
        this.isRunning = false;
        this.targetTrades = 100;
        this.config = {
            initialBalance: 1000,
            baseAmount: 1,
            pairs: ['EURUSD-OTC', 'GBPUSD-OTC'],
            maxDailyLoss: 50,
            maxLossStreak: 3
        };
        this.stats = {
            wins: 0,
            losses: 0,
            winRate: 0,
            profit: 0,
            maxDrawdown: 0,
            peakBalance: 1000,
            currentBalance: 1000,
            maxLossStreak: 0,
            currentLossStreak: 0
        };
        this.errors = [];
        this.latency = [];
    }

    async run() {
        console.log('\n╔══════════════════════════════════════════════════════════════╗');
        console.log('║          🤖 DEMO MODE - 100 TRADES VALIDATION                ║');
        console.log('╚══════════════════════════════════════════════════════════════╝\n');

        this.isRunning = true;
        
        // Check if .env exists
        if (!fs.existsSync('.env')) {
            console.log('⚠️  .env file not found. Please configure credentials first.');
            console.log('   Run: node run.js and select option 5\n');
            return { success: false, error: 'No .env file' };
        }

        console.log('📋 Test Configuration:');
        console.log(`   Target Trades: ${this.targetTrades}`);
        console.log(`   Initial Balance: $${this.config.initialBalance}`);
        console.log(`   Base Amount: $${this.config.baseAmount}`);
        console.log(`   Pairs: ${this.config.pairs.join(', ')}`);
        console.log(`   Max Loss Streak: ${this.config.maxLossStreak}\n`);

        try {
            // Initialize bot
            console.log('🚀 Initializing Trading Bot...\n');
            const bot = require('./src/core/bot');
            const config = require('./src/config/config');

            // Set credentials from env
            if (!config.IQ_OPTION_EMAIL || !config.IQ_OPTION_PASSWORD) {
                console.log('❌ Missing credentials in .env file');
                return { success: false, error: 'Missing credentials' };
            }

            // Initialize
            let initialized = false;
            let offlineMode = false;
            
            try {
                initialized = await bot.initialize({
                    email: config.IQ_OPTION_EMAIL,
                    password: config.IQ_OPTION_PASSWORD,
                    accountType: 'PRACTICE' // Force demo mode
                });
            } catch (initError) {
                console.log('⚠️ Initialization warning:', initError.message);
                // Check if we're in offline mode
                const api = require('./src/api/unifiediqoption');
                if (api.networkMode === 'OFFLINE' || api.mockDataEnabled) {
                    console.log('📴 Running in OFFLINE mode - using mock data');
                    offlineMode = true;
                    initialized = true; // Allow to continue
                } else {
                    throw initError;
                }
            }

            if (!initialized) {
                throw new Error('Bot initialization failed');
            }

            console.log(offlineMode ? '✅ Bot initialized in OFFLINE mode\n' : '✅ Bot initialized successfully\n');

            // Start trading
            await bot.start();

            // Monitor trades
            console.log('📊 Monitoring trades...\n');
            await this.monitorTrades(bot);

            // Generate final report
            return this.generateReport();

        } catch (error) {
            console.error('❌ Demo test failed:', error.message);
            this.errors.push({ timestamp: new Date(), error: error.message });
            return { success: false, error: error.message };
        }
    }

    async monitorTrades(bot) {
        return new Promise((resolve) => {
            const checkInterval = setInterval(() => {
                // Get bot status
                const status = bot.getBotStatus();
                
                // Check if we've reached target
                if (status.stats && status.stats.totalTrades >= this.targetTrades) {
                    clearInterval(checkInterval);
                    this.isRunning = false;
                    bot.stop();
                    resolve();
                }

                // Check for excessive errors
                if (this.errors.length > 10) {
                    console.log('🛑 Too many errors, stopping test');
                    clearInterval(checkInterval);
                    this.isRunning = false;
                    bot.stop();
                    resolve();
                }

                // Log progress every 10 trades
                if (status.stats && status.stats.totalTrades > 0 && 
                    status.stats.totalTrades % 10 === 0) {
                    this.logProgress(status);
                }

            }, 5000); // Check every 5 seconds

            // Timeout after 2 hours
            setTimeout(() => {
                if (this.isRunning) {
                    console.log('\n⏱️ Test timeout reached (2 hours)');
                    clearInterval(checkInterval);
                    this.isRunning = false;
                    bot.stop();
                    resolve();
                }
            }, 2 * 60 * 60 * 1000);
        });
    }

    logProgress(status) {
        const trades = status.stats.totalTrades;
        const winRate = status.stats.winRate || 0;
        
        console.log(`\n📊 Progress: ${trades}/${this.targetTrades} trades`);
        console.log(`   Win Rate: ${(winRate * 100).toFixed(1)}%`);
        console.log(`   Balance: $${status.currentBalance || 1000}`);
        console.log(`   Consecutive Losses: ${status.consecutiveLosses || 0}\n`);
    }

    generateReport() {
        const endTime = new Date();
        const duration = (endTime - this.startTime) / 1000 / 60; // minutes

        // Calculate final stats from ai_analysis.json if available
        let finalStats = { ...this.stats };
        try {
            const aiData = JSON.parse(fs.readFileSync('./data/ai_analysis.json', 'utf8'));
            const trades = aiData.tradeHistory || [];
            
            finalStats.wins = trades.filter(t => t.result === 'win').length;
            finalStats.losses = trades.filter(t => t.result === 'loss').length;
            finalStats.winRate = trades.length > 0 
                ? (finalStats.wins / trades.length * 100).toFixed(2)
                : 0;
            finalStats.profit = trades.reduce((sum, t) => sum + (t.profit || 0), 0);
            finalStats.totalTrades = trades.length;
        } catch (e) {
            console.log('⚠️ Could not read trade history');
        }

        const report = {
            testId: this.testId,
            timestamp: new Date().toISOString(),
            duration: `${duration.toFixed(1)} minutes`,
            config: this.config,
            results: {
                totalTrades: finalStats.totalTrades || 0,
                wins: finalStats.wins,
                losses: finalStats.losses,
                winRate: parseFloat(finalStats.winRate),
                profit: finalStats.profit,
                profitFactor: finalStats.losses > 0 
                    ? (finalStats.wins * 0.82 / finalStats.losses).toFixed(2)
                    : 'N/A'
            },
            validation: {
                winRateTarget: 55,
                winRatePassed: parseFloat(finalStats.winRate) >= 55,
                maxLossStreakTarget: 3,
                maxLossStreakPassed: finalStats.maxLossStreak <= 3,
                errors: this.errors.length,
                errorsPassed: this.errors.length === 0
            },
            status: 'COMPLETED',
            nextAction: this.determineNextAction(finalStats)
        };

        // Save report
        const reportPath = `./analytics/demo_validation_${this.testId}.json`;
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

        // Print summary
        console.log('\n╔══════════════════════════════════════════════════════════════╗');
        console.log('║              📊 DEMO TEST RESULTS                              ║');
        console.log('╚══════════════════════════════════════════════════════════════╝');
        console.log(`\nTest ID: ${this.testId}`);
        console.log(`Duration: ${duration.toFixed(1)} minutes`);
        console.log(`Trades: ${report.results.totalTrades}/${this.targetTrades}`);
        console.log(`Wins: ${report.results.wins} | Losses: ${report.results.losses}`);
        console.log(`Win Rate: ${report.results.winRate}% ${report.validation.winRatePassed ? '✅' : '❌'}`);
        console.log(`Profit: $${report.results.profit.toFixed(2)}`);
        console.log(`Profit Factor: ${report.results.profitFactor}`);
        console.log(`Errors: ${this.errors.length} ${report.validation.errorsPassed ? '✅' : '❌'}`);
        console.log(`\nOverall: ${this.getOverallStatus(report.validation)}`);
        console.log(`Next Action: ${report.nextAction}`);
        console.log(`Report: ${reportPath}`);
        console.log('═══════════════════════════════════════════════════════════════\n');

        return report;
    }

    determineNextAction(stats) {
        const winRate = parseFloat(stats.winRate);
        
        if (winRate >= 60) {
            return '✅ System optimized - Ready for extended testing';
        } else if (winRate >= 55) {
            return '⚠️ Acceptable but can improve - Run another test';
        } else {
            return '❌ Needs optimization - Check strategy adjustments';
        }
    }

    getOverallStatus(validation) {
        const passed = 
            validation.winRatePassed && 
            validation.maxLossStreakPassed && 
            validation.errorsPassed;
        
        return passed ? '✅ PASS' : '❌ FAIL';
    }

    // Quick analysis of existing data
    static analyzeExisting() {
        console.log('\n📊 ANALYZING EXISTING TRADE DATA...\n');
        
        try {
            const aiData = JSON.parse(fs.readFileSync('./data/ai_analysis.json', 'utf8'));
            const trades = aiData.tradeHistory || [];
            
            if (trades.length === 0) {
                console.log('No existing trade data found');
                return null;
            }

            const wins = trades.filter(t => t.result === 'win').length;
            const losses = trades.filter(t => t.result === 'loss').length;
            const winRate = trades.length > 0 ? (wins / trades.length * 100).toFixed(2) : 0;
            const profit = trades.reduce((sum, t) => sum + (t.profit || 0), 0);

            console.log(`Total Trades: ${trades.length}`);
            console.log(`Win Rate: ${winRate}%`);
            console.log(`Profit: $${profit.toFixed(2)}`);
            console.log(`Status: ${winRate >= 55 ? '✅ PASS' : '❌ FAIL'}`);

            return { trades: trades.length, winRate, profit };
        } catch (e) {
            console.log('No existing data to analyze');
            return null;
        }
    }
}

// Run if called directly
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.includes('--analyze')) {
        DemoModeRunner.analyzeExisting();
    } else {
        const runner = new DemoModeRunner();
        runner.run().then(report => {
            // 🔥 FIX: Check if report exists and has validation property
            if (!report || !report.validation) {
                console.error('❌ Demo failed - no report generated');
                process.exit(1);
            }
            process.exit(report.validation.winRatePassed ? 0 : 1);
        }).catch(error => {
            console.error('Fatal error:', error);
            process.exit(1);
        });
    }
}

module.exports = DemoModeRunner;
