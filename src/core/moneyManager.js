/**
 * Money Management System
 * Production-ready risk management for IQ Option Bot
 */

class MoneyManager {
    constructor() {
        this.initialBalance = 0;
        this.currentBalance = 0;
        this.dailyLoss = 0;
        this.dailyProfit = 0;
        this.tradeCount = 0;
        this.maxDailyLossPercent = 5;  // Stop if daily loss >= 5%
        this.dailyProfitTarget = 3;    // Stop if daily profit >= 3%
        this.tradePercent = 1; // 1% per trade
        this.lastReset = new Date().toDateString();
        this.consecutiveLosses = 0; // Track losing streak
        this.consecutiveWins = 0; // Track winning streak
        
        // Risk Management additions
        this.last10Trades = [];  // Track last 10 trades for performance guard
        this.maxTradesPerDay = 20;  // Max 20 trades per day
        this.trendStopThreshold = 0.7;  // Stop on strong downtrend (70% strength)
        this.performanceGuardThreshold = 0.40;  // Stop if last 10 trades < 40% winrate
        
        // Profit Maximization features
        this.winStreakBoostThreshold = 3;  // Boost risk at 3+ wins
        this.winStreakBoostPercent = 2.0;  // 2% risk on hot streak
        this.hotHandThreshold = 0.80;  // 80% winrate for hot hand
        this.hotHandExtraTrades = 10;  // +10 trades in hot hand mode
        this.smartTakeProfitEnabled = true;  // Smart profit taking
        
        // Profit Protection & Smooth Risk
        this.peakBalance = 0;  // Track highest balance
        this.profitLockThreshold = 0.95;  // Stop if balance < 95% of peak
        this.lossCooldownCount = 0;  // Skip trades after loss
        this.lossCooldownDuration = 2;  // Skip 2 trades after loss
        this.smoothRiskMax = 1.8;  // Max 1.8% with smooth increase
        this.riskIncrementPerWin = 0.003;  // +0.3% per win
        
        // Equity Curve Control
        this.equityHistory = [];  // Track last 20 balances for MA
        this.equityMAPeriod = 20;  // 20-period moving average
        this.drawdownSpeedThreshold = 3;  // 3+ losses in last 5 = fast drawdown
        this.recoveryModeThreshold = 0.05;  // 5% drawdown = recovery mode
        this.recoveryRiskPercent = 0.5;  // 0.5% risk in recovery
        this.recoveryMode = false;  // Recovery mode flag
        
        // Scaling + Withdrawal System
        this.monthStartBalance = 0;  // Balance at month start
        this.monthlyProfit = 0;  // Track monthly P&L
        this.lastMonthReset = new Date().toISOString().slice(0, 7);  // YYYY-MM
        this.scalingThreshold = 0.10;  // 10% profit = scale up
        this.scalingMultiplier = 1.2;  // Scale capital by 20%
        this.withdrawThreshold = 0.10;  // 10% profit = withdraw
        this.withdrawPercent = 0.30;  // Withdraw 30% of profit
        this.totalWithdrawn = 0;  // Track total withdrawals
        this.riskTiers = [  // Risk adjustment tiers
            { balance: 2000, risk: 0.8 },
            { balance: 5000, risk: 0.6 },
            { balance: 10000, risk: 0.5 }
        ];
        
        // Real Money Machine - Weekly Protection
        this.weeklyLoss = 0;  // Track weekly loss
        this.weekStartBalance = 0;  // Balance at week start
        this.lastWeekReset = this.getWeekStart();  // Week identifier
        this.weeklyLossLimit = 0.10;  // 10% weekly loss limit
        this.weeklyStopDays = 7;  // Stop for 7 days if hit
        this.weeklyStopUntil = null;  // Timestamp when weekly stop ends
        
        // Real Money Machine - 100 Trades Monitor
        this.trades100Stats = {  // Stats for every 100 trades
            startTrade: 0,
            wins: 0,
            losses: 0,
            profit: 0,
            startBalance: 0
        };
        
        // Production Safety Controls
        this.emergencyStop = false;  // Emergency stop flag
        this.maxTradeAmount = 100;  // Absolute max $100 per trade
        this.maxTotalRiskPercent = 10;  // Max 10% total account risk
        this.consecutiveLossLimit = 5;  // Stop after 5 consecutive losses
        this.dailyTradeAmountLimit = 500;  // Max $500 total daily trade volume
        this.dailyTradeAmountUsed = 0;  // Track daily trade volume
    }

    /**
     * Validate trade amount with strict production limits
     */
    validateTradeAmount(amount, balance) {
        // Check emergency stop
        if (this.emergencyStop) {
            throw new Error('🛑 EMERGENCY STOP: Trading halted by emergency stop flag');
        }
        
        // Check absolute maximum trade amount
        if (amount > this.maxTradeAmount) {
            throw new Error(`❌ TRADE REJECTED: Amount $${amount} exceeds maximum allowed $${this.maxTradeAmount}`);
        }
        
        // Check if amount exceeds 2% of balance (strict risk limit)
        const maxRiskAmount = balance * 0.02;
        if (amount > maxRiskAmount) {
            throw new Error(`❌ TRADE REJECTED: Amount $${amount} exceeds 2% risk limit ($${maxRiskAmount.toFixed(2)})`);
        }
        
        // Check daily trade volume limit
        if (this.dailyTradeAmountUsed + amount > this.dailyTradeAmountLimit) {
            throw new Error(`❌ TRADE REJECTED: Daily volume limit reached ($${this.dailyTradeAmountUsed}/$${this.dailyTradeAmountLimit})`);
        }
        
        // Check consecutive loss limit
        if (this.consecutiveLosses >= this.consecutiveLossLimit) {
            throw new Error(`🛑 TRADE BLOCKED: Consecutive loss limit reached (${this.consecutiveLosses}/${this.consecutiveLossLimit})`);
        }
        
        return true;
    }

    /**
     * Trigger emergency stop
     */
    emergencyStopTrading(reason = 'Manual emergency stop') {
        this.emergencyStop = true;
        console.error('\n' + '🛑'.repeat(40));
        console.error('EMERGENCY STOP TRIGGERED');
        console.error('Reason:', reason);
        console.error('🛑'.repeat(40) + '\n');
        return true;
    }

    /**
     * Reset emergency stop
     */
    resetEmergencyStop() {
        this.emergencyStop = false;
        console.log('✅ Emergency stop reset. Trading can resume.');
        return true;
    }

    /**
     * Record trade amount in daily volume
     */
    recordTradeVolume(amount) {
        this.dailyTradeAmountUsed += amount;
        return this.dailyTradeAmountUsed;
    }

    /**
     * Get week start identifier (YYYY-WW)
     */
    getWeekStart() {
        const now = new Date();
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        const pastDays = (now - startOfYear) / 86400000;
        const weekNum = Math.ceil((pastDays + startOfYear.getDay() + 1) / 7);
        return `${now.getFullYear()}-W${weekNum}`;
    }

    /**
     * Initialize with starting balance
     */
    initialize(balance) {
        this.initialBalance = balance;
        this.currentBalance = balance;
        this.peakBalance = balance;  // Initialize peak
        this.monthStartBalance = balance;  // Month start balance
        this.weekStartBalance = balance;  // Week start balance
        this.trades100Stats.startBalance = balance;  // 100 trades start
        this.dailyLoss = 0;
        this.tradeCount = 0;
        this.lossCooldownCount = 0;  // Reset cooldown
        console.log(`💰 Money Manager initialized: $${balance}`);
        console.log(`   Trade size: ${this.tradePercent}% = $${this.getTradeAmount(balance)}`);
        console.log(`   Max daily loss: ${this.maxDailyLossPercent}% = $${(balance * this.maxDailyLossPercent / 100).toFixed(2)}`);
        console.log(`   Profit Lock: Stop if balance < 95% of peak`);
        console.log(`   Scaling: +20% capital at +10% monthly profit`);
        console.log(`   Withdrawal: 30% of profit at +10% monthly profit`);
        console.log(`   Weekly Protection: Stop 7 days if weekly loss >= 10%`);
    }

    /**
     * Calculate trade amount with Risk Tier Adjustment
     * Balance > 2000: 0.8% | > 5000: 0.6% | > 10000: 0.5%
     */
    getTradeAmount(balance) {
        // Check loss cooldown
        if (this.lossCooldownCount > 0) {
            this.lossCooldownCount--;
            console.log(`⏸️ LOSS COOLDOWN: Skipping trade (${this.lossCooldownCount} remaining)`);
            return 0;  // Skip this trade
        }
        
        // Determine base risk based on balance tier
        let baseRisk = this.tradePercent;  // Default 1%
        for (const tier of this.riskTiers) {
            if (balance >= tier.balance) {
                baseRisk = tier.risk;
            }
        }
        
        // Recovery Mode: Ultra-low risk
        if (this.isRecoveryMode()) {
            baseRisk = Math.min(baseRisk, this.recoveryRiskPercent);
            console.log(`🔄 RECOVERY MODE: Risk reduced to ${baseRisk}% (drawdown: ${(this.getDrawdown() * 100).toFixed(1)}%)`);
            return Math.max(1, Math.floor(balance * baseRisk / 100));
        }
        
        // Drawdown Speed Control: 3+ losses in last 5 = reduce risk to 0.5%
        if (this.getLossesInLastN(5) >= 3) {
            baseRisk = Math.min(baseRisk, 0.5);
            console.log(`⚡ DRAWDOWN SPEED CONTROL: 3+ losses in last 5 - Risk ${baseRisk}%`);
            return Math.max(1, Math.floor(balance * baseRisk / 100));
        }
        
        // Smooth Win Streak: Gradual increase by 0.3% per win
        if (this.consecutiveWins > 0) {
            const extraRisk = this.consecutiveWins * this.riskIncrementPerWin;
            baseRisk = Math.min(
                baseRisk + extraRisk,
                this.smoothRiskMax  // Cap at 1.8%
            );
            console.log(`📈 SMOOTH RISK: ${this.consecutiveWins} wins → ${baseRisk.toFixed(1)}% risk`);
        }
        // Losing streak protection
        else if (this.consecutiveLosses >= 3) {
            baseRisk = baseRisk * 0.5;  // Reduce 50%
            console.log(`⚠️ ADAPTIVE MM: Losing streak ${this.consecutiveLosses} - Reducing trade size 50%`);
        }
        
        // Amount = balance * baseRisk%
        const amount = Math.floor(balance * baseRisk / 100);
        
        // Minimum $1, maximum $180 (for 1.8% max)
        return Math.max(1, Math.min(180, amount));
    }

    /**
     * Main risk check - combines all protections
     */
    checkRiskControls(marketCondition = null, asset = '') {
        // Check 1: Daily Loss Limit (5%)
        if (!this.canTrade()) {
            console.log('🛑 BLOCKED: Daily loss limit reached (5%)');
            return { allowed: false, reason: 'Daily loss limit reached (5%)' };
        }
        
        // Check 2: Daily Profit Target (3%)
        const dailyPnlPercent = ((this.dailyProfit - this.dailyLoss) / this.initialBalance) * 100;
        if (dailyPnlPercent >= this.dailyProfitTarget) {
            console.log(`🛑 BLOCKED: Daily profit target reached (${dailyPnlPercent.toFixed(2)}% >= 3%)`);
            return { allowed: false, reason: `Daily profit target reached (${dailyPnlPercent.toFixed(2)}% >= 3%)` };
        }
        
        // Check 3: Trade Limit (20 per day) - Hot Hand Mode allows more
        const hotHandMode = this.isHotHand();
        const tradeLimit = hotHandMode ? this.maxTradesPerDay + this.hotHandExtraTrades : this.maxTradesPerDay;
        if (this.tradeCount >= tradeLimit) {
            console.log(`🛑 BLOCKED: Daily trade limit reached (${this.tradeCount} >= ${tradeLimit})`);
            return { allowed: false, reason: `Daily trade limit reached (${this.tradeCount} >= ${tradeLimit})${hotHandMode ? ' [Hot Hand Mode]' : ''}` };
        }
        
        // Check 6: Smart Take Profit (profit >= 3% but winrate < 60%)
        if (this.smartTakeProfitEnabled) {
            const dailyPnlPercent = ((this.dailyProfit - this.dailyLoss) / this.initialBalance) * 100;
            const currentWinrate = this.tradeCount > 0 ? (this.getWins() / this.tradeCount) : 0;
            if (dailyPnlPercent >= 3 && currentWinrate < 0.60) {
                console.log(`🛑 BLOCKED: Smart Take Profit: Profit ${dailyPnlPercent.toFixed(2)}% but winrate ${(currentWinrate * 100).toFixed(1)}% < 60%`);
                return { allowed: false, reason: `Smart Take Profit: Profit ${dailyPnlPercent.toFixed(2)}% but winrate ${(currentWinrate * 100).toFixed(1)}% < 60%` };
            }
        }
        
        // Check 4: Market Protection (Strong Downtrend)
        if (marketCondition) {
            const trend = marketCondition.trend || 'NEUTRAL';
            const strength = marketCondition.metrics?.trendStrength || 0;
            if (trend.includes('DOWN') && strength >= this.trendStopThreshold) {
                console.log(`🛑 BLOCKED: Strong downtrend detected (${trend}, strength: ${(strength * 100).toFixed(1)}%)`);
                return { allowed: false, reason: `Strong downtrend detected (${trend}, strength: ${(strength * 100).toFixed(1)}%)` };
            }
        }
        
        // Check 7: Profit Lock (Balance < 95% of peak)
        if (this.peakBalance > 0) {
            const lockThreshold = this.peakBalance * this.profitLockThreshold;
            if (this.currentBalance < lockThreshold) {
                console.log(`🛑 BLOCKED: 🔒 PROFIT LOCK: Balance $${this.currentBalance.toFixed(2)} < 95% of peak $${this.peakBalance.toFixed(2)}`);
                return { allowed: false, reason: `🔒 PROFIT LOCK: Balance $${this.currentBalance.toFixed(2)} < 95% of peak $${this.peakBalance.toFixed(2)}` };
            }
        }
        
        // Check 8: Loss Cooldown (skip trades after loss)
        if (this.lossCooldownCount > 0) {
            console.log(`🛑 BLOCKED: ⏸️ LOSS COOLDOWN: ${this.lossCooldownCount} trades remaining`);
            return { allowed: false, reason: `⏸️ LOSS COOLDOWN: ${this.lossCooldownCount} trades remaining` };
        }
        
        // Check 9: Equity MA Filter (Balance < 20-period MA)
        if (this.equityHistory.length >= this.equityMAPeriod) {
            const equityMA = this.getEquityMA();
            if (this.currentBalance < equityMA) {
                console.log(`🛑 BLOCKED: 📉 EQUITY MA FILTER: Balance $${this.currentBalance.toFixed(2)} < MA $${equityMA.toFixed(2)}`);
                return { allowed: false, reason: `📉 EQUITY MA FILTER: Balance $${this.currentBalance.toFixed(2)} < MA $${equityMA.toFixed(2)}` };
            }
        }
        
        // Check 10: Recovery Mode active
        if (this.isRecoveryMode()) {
            console.log(`🔄 RECOVERY MODE: Drawdown ${(this.getDrawdown() * 100).toFixed(1)}% - Reduced risk & best setups only`);
        }
        
        // Check 5: Performance Guard (Last 10 trades < 40% winrate)
        if (this.last10Trades.length >= 10) {
            const wins = this.last10Trades.filter(t => t === 'WIN').length;
            const winrate = wins / this.last10Trades.length;
            if (winrate < this.performanceGuardThreshold) {
                console.log(`🛑 BLOCKED: Performance guard: Last 10 trades winrate ${(winrate * 100).toFixed(1)}% < 40%`);
                return { allowed: false, reason: `Performance guard: Last 10 trades winrate ${(winrate * 100).toFixed(1)}% < 40%` };
            }
        }
        
        // Check 11: Weekly Loss Protection (10% weekly loss = 7 day stop)
        const weeklyCheck = this.checkWeeklyLoss();
        if (!weeklyCheck.allowed) {
            console.log(`🛑 BLOCKED: ${weeklyCheck.reason}`);
            return weeklyCheck;
        }
        
        // Check 12: Session Filter (London/NY only) - NOT for OTC pairs
        const assetName = asset || '';
        if (!this.isTradingSession() && !assetName.includes('OTC')) {
            const now = new Date();
            const hour = now.getUTCHours();
            const day = now.getUTCDay();
            console.log(`🛑 BLOCKED: ⏰ SESSION FILTER: Outside London/NY trading hours (UTC: ${hour}:00, Day: ${day})`);
            return { allowed: false, reason: `⏰ SESSION FILTER: Outside London/NY trading hours` };
        }
        
        return { allowed: true, reason: null };
    }

    /**
     * Check weekly loss protection
     */
    checkWeeklyLoss() {
        // Check if weekly stop is active
        if (this.weeklyStopUntil && Date.now() < this.weeklyStopUntil) {
            const daysRemaining = Math.ceil((this.weeklyStopUntil - Date.now()) / 86400000);
            return { allowed: false, reason: `🚫 WEEKLY STOP: Trading paused for ${daysRemaining} more days (weekly loss limit hit)` };
        }
        
        // Reset weekly tracking if new week
        const currentWeek = this.getWeekStart();
        if (currentWeek !== this.lastWeekReset) {
            this.weeklyLoss = 0;
            this.weekStartBalance = this.currentBalance;
            this.lastWeekReset = currentWeek;
            console.log(`📅 New week started: ${currentWeek}`);
        }
        
        // Check weekly loss limit
        const weeklyLossPercent = (this.weekStartBalance - this.currentBalance) / this.weekStartBalance;
        if (weeklyLossPercent >= this.weeklyLossLimit) {
            // Trigger 7-day stop
            this.weeklyStopUntil = Date.now() + (this.weeklyStopDays * 86400000);
            return { allowed: false, reason: `🚫 WEEKLY LOSS LIMIT: ${(weeklyLossPercent * 100).toFixed(1)}% >= 10% - Trading stopped for 7 days` };
        }
        
        return { allowed: true, reason: null };
    }

    /**
     * Check if current time is in London or NY trading session
     */
    isTradingSession() {
        const now = new Date();
        const hour = now.getUTCHours();
        const day = now.getUTCDay();
        
        // Weekend check
        if (day === 0 || day === 6) return false;
        
        // London: 08:00 - 17:00 UTC
        const londonSession = hour >= 8 && hour < 17;
        
        // New York: 13:00 - 22:00 UTC
        const nySession = hour >= 13 && hour < 22;
        
        return londonSession || nySession;
    }

    /**
     * Check if trading is allowed (basic daily loss check)
     */
    canTrade() {
        // Reset daily stats if new day
        const today = new Date().toDateString();
        if (today !== this.lastReset) {
            this.dailyLoss = 0;
            this.dailyProfit = 0;
            this.tradeCount = 0;
            this.last10Trades = [];
            this.consecutiveWins = 0;
            this.consecutiveLosses = 0;
            this.lastReset = today;
        }

        const maxLoss = this.initialBalance * this.maxDailyLossPercent / 100;
        return this.dailyLoss < maxLoss;
    }

    /**
     * Record trade result with streak tracking
     */
    recordTrade(profit) {
        this.tradeCount++;
        
        // Track for performance guard
        this.last10Trades.push(profit > 0 ? 'WIN' : 'LOSS');
        if (this.last10Trades.length > 10) {
            this.last10Trades.shift();
        }
        
        if (profit < 0) {
            this.dailyLoss += Math.abs(profit);
            this.consecutiveLosses++;
            this.consecutiveWins = 0; // Reset win streak
            this.lossCooldownCount = this.lossCooldownDuration;  // Start cooldown
            console.log(`📉 Loss recorded: $${Math.abs(profit).toFixed(2)} | Daily loss: $${this.dailyLoss.toFixed(2)} | Streak: ${this.consecutiveLosses} | Cooldown: ${this.lossCooldownCount} trades`);
        } else {
            this.dailyProfit += profit;
            this.consecutiveWins++;
            this.consecutiveLosses = 0; // Reset loss streak
            console.log(`📈 Profit recorded: $${profit.toFixed(2)} | Daily profit: $${this.dailyProfit.toFixed(2)} | Win streak: ${this.consecutiveWins}`);
        }

        // Update current balance and peak
        this.currentBalance += profit;
        if (this.currentBalance > this.peakBalance) {
            this.peakBalance = this.currentBalance;
        }
        
        // Track weekly loss
        if (profit < 0) {
            this.weeklyLoss += Math.abs(profit);
        }
        
        // Track 100 trades stats
        this.update100TradesStats(profit);
        
        // Track equity history for MA calculation
        this.equityHistory.push(this.currentBalance);
        if (this.equityHistory.length > this.equityMAPeriod) {
            this.equityHistory.shift();
        }
        
        // Update recovery mode status
        this.recoveryMode = this.isRecoveryMode();
        
        // Check for monthly scaling and withdrawal
        this.checkMonthlyScalingAndWithdrawal();

        // Show stats
        const pnl = this.currentBalance - this.initialBalance;
        const pnlPercent = (pnl / this.initialBalance * 100).toFixed(2);
        const dailyPnl = this.dailyProfit - this.dailyLoss;
        console.log(`💼 Balance: $${this.currentBalance.toFixed(2)} | P&L: $${pnl.toFixed(2)} (${pnlPercent}%) | Daily P&L: $${dailyPnl.toFixed(2)} | Trades: ${this.tradeCount}`);

        return this.canTrade();
    }

    /**
     * Check if in Hot Hand Mode (last 5 trades >= 80% winrate)
     */
    isHotHand() {
        if (this.last10Trades.length < 5) return false;
        const last5 = this.last10Trades.slice(-5);
        const wins = last5.filter(t => t === 'WIN').length;
        const winrate = wins / last5.length;
        return winrate >= this.hotHandThreshold;
    }

    /**
     * Update 100 trades performance monitor
     */
    update100TradesStats(profit) {
        // Update stats
        if (profit > 0) {
            this.trades100Stats.wins++;
        } else if (profit < 0) {
            this.trades100Stats.losses++;
        }
        this.trades100Stats.profit += profit;
        
        // Check if we hit 100 trades
        const totalInBlock = this.trades100Stats.wins + this.trades100Stats.losses;
        if (totalInBlock >= 100) {
            this.report100TradesPerformance();
            // Reset for next 100
            this.trades100Stats = {
                startTrade: this.tradeCount,
                wins: 0,
                losses: 0,
                profit: 0,
                startBalance: this.currentBalance
            };
        }
    }

    /**
     * Report 100 trades performance
     */
    report100TradesPerformance() {
        const total = this.trades100Stats.wins + this.trades100Stats.losses;
        const winrate = total > 0 ? (this.trades100Stats.wins / total * 100).toFixed(1) : 0;
        const grossProfit = this.trades100Stats.wins > 0 ? this.trades100Stats.wins * 20 : 0;  // Approximate
        const grossLoss = this.trades100Stats.losses > 0 ? this.trades100Stats.losses * 10 : 0;  // Approximate
        const profitFactor = grossLoss > 0 ? (grossProfit / grossLoss).toFixed(2) : '∞';
        const drawdown = ((this.peakBalance - Math.min(this.currentBalance, this.peakBalance)) / this.peakBalance * 100).toFixed(1);
        
        console.log('\n' + '='.repeat(60));
        console.log('📊 100 TRADES PERFORMANCE REPORT');
        console.log('='.repeat(60));
        console.log(`   Trades: ${total} | Wins: ${this.trades100Stats.wins} | Losses: ${this.trades100Stats.losses}`);
        console.log(`   Winrate: ${winrate}% | Profit Factor: ${profitFactor}`);
        console.log(`   Net Profit: $${this.trades100Stats.profit.toFixed(2)}`);
        console.log(`   Drawdown: ${drawdown}%`);
        console.log('='.repeat(60));
        
        // Alerts for poor performance
        if (parseFloat(winrate) < 55) {
            console.log('⚠️ ALERT: Winrate below 55% - Review strategy');
        }
        if (parseFloat(profitFactor) < 1.3) {
            console.log('⚠️ ALERT: Profit Factor below 1.3 - Check risk/reward');
        }
        if (parseFloat(drawdown) > 8) {
            console.log('⚠️ ALERT: Drawdown above 8% - Reduce position size');
        }
    }

    /**
     * Check and execute monthly scaling and withdrawal
     */
    checkMonthlyScalingAndWithdrawal() {
        const currentMonth = new Date().toISOString().slice(0, 7);  // YYYY-MM
        
        // New month - check if we should scale/withdraw
        if (currentMonth !== this.lastMonthReset) {
            const monthlyReturn = (this.currentBalance - this.monthStartBalance) / this.monthStartBalance;
            const profitAmount = this.currentBalance - this.monthStartBalance;
            
            console.log(`\n📅 MONTHLY REVIEW: ${this.lastMonthReset}`);
            console.log(`   Start Balance: $${this.monthStartBalance.toFixed(2)}`);
            console.log(`   End Balance: $${this.currentBalance.toFixed(2)}`);
            console.log(`   Monthly Return: ${(monthlyReturn * 100).toFixed(2)}%`);
            
            // Check if profit >= 10%
            if (monthlyReturn >= this.scalingThreshold) {
                // Calculate withdrawal (30% of profit)
                const withdrawAmount = profitAmount * this.withdrawPercent;
                this.totalWithdrawn += withdrawAmount;
                
                // Scale capital (add 20% of profit back to balance)
                const scaleAmount = profitAmount * (this.scalingMultiplier - 1);
                this.currentBalance += scaleAmount;
                
                console.log(`\n💰 SCALING + WITHDRAWAL EXECUTED:`);
                console.log(`   Profit: $${profitAmount.toFixed(2)}`);
                console.log(`   Withdrawn (30%): $${withdrawAmount.toFixed(2)}`);
                console.log(`   Capital Scaled (+20%): $${scaleAmount.toFixed(2)}`);
                console.log(`   New Balance: $${this.currentBalance.toFixed(2)}`);
                console.log(`   Total Withdrawn: $${this.totalWithdrawn.toFixed(2)}`);
            }
            
            // Reset month tracking
            this.monthStartBalance = this.currentBalance;
            this.lastMonthReset = currentMonth;
        }
    }

    /**
     * Get scaling and withdrawal stats
     */
    getWins() {
        return this.last10Trades.filter(t => t === 'WIN').length;
    }

    /**
     * Get loss count in last N trades
     */
    getLossesInLastN(n) {
        if (this.last10Trades.length < n) return 0;
        const lastN = this.last10Trades.slice(-n);
        return lastN.filter(t => t === 'LOSS').length;
    }

    /**
     * Calculate Equity Moving Average (20-period)
     */
    getEquityMA() {
        if (this.equityHistory.length === 0) return this.currentBalance;
        const sum = this.equityHistory.reduce((a, b) => a + b, 0);
        return sum / this.equityHistory.length;
    }

    /**
     * Calculate current drawdown from peak
     */
    getDrawdown() {
        if (this.peakBalance === 0) return 0;
        return (this.peakBalance - this.currentBalance) / this.peakBalance;
    }

    /**
     * Check if in Recovery Mode (drawdown > 5%)
     */
    isRecoveryMode() {
        return this.getDrawdown() > this.recoveryModeThreshold;
    }

    /**
     * Get current stats with profit maximization info
     */
    getStats() {
        const pnl = this.currentBalance - this.initialBalance;
        const pnlPercent = (pnl / this.initialBalance * 100).toFixed(2);
        const dailyLossPercent = (this.dailyLoss / this.initialBalance * 100).toFixed(2);
        const dailyProfitPercent = (this.dailyProfit / this.initialBalance * 100).toFixed(2);
        
        // Calculate winrates
        let last10Winrate = 0;
        let last5Winrate = 0;
        if (this.last10Trades.length > 0) {
            const wins10 = this.last10Trades.filter(t => t === 'WIN').length;
            last10Winrate = (wins10 / this.last10Trades.length) * 100;
            
            const last5 = this.last10Trades.slice(-5);
            const wins5 = last5.filter(t => t === 'WIN').length;
            last5Winrate = (wins5 / last5.length) * 100;
        }

        return {
            initialBalance: this.initialBalance,
            currentBalance: this.currentBalance,
            pnl: pnl,
            pnlPercent: parseFloat(pnlPercent),
            dailyProfit: this.dailyProfit,
            dailyProfitPercent: parseFloat(dailyProfitPercent),
            dailyLoss: this.dailyLoss,
            dailyLossPercent: parseFloat(dailyLossPercent),
            tradeCount: this.tradeCount,
            last10TradesWinrate: last10Winrate.toFixed(1),
            last5TradesWinrate: last5Winrate.toFixed(1),
            consecutiveWins: this.consecutiveWins,
            consecutiveLosses: this.consecutiveLosses,
            isHotHand: this.isHotHand(),
            lossCooldownCount: this.lossCooldownCount,
            peakBalance: this.peakBalance,
            profitLockThreshold: `${(this.profitLockThreshold * 100).toFixed(0)}%`,
            equityMA: this.getEquityMA().toFixed(2),
            drawdown: (this.getDrawdown() * 100).toFixed(1) + '%',
            isRecoveryMode: this.isRecoveryMode(),
            lossesInLast5: this.getLossesInLastN(5),
            canTrade: this.canTrade(),
            monthStartBalance: this.monthStartBalance,
            monthlyProfit: ((this.currentBalance - this.monthStartBalance) / this.monthStartBalance * 100).toFixed(2) + '%',
            totalWithdrawn: this.totalWithdrawn.toFixed(2),
            currentRiskTier: this.getCurrentRiskTier(),
            weeklyLoss: this.weeklyLoss.toFixed(2),
            inTradingSession: this.isTradingSession(),
            trades100Block: `${this.trades100Stats.wins + this.trades100Stats.losses}/100`
        };
    }

    /**
     * Get current risk tier based on balance
     */
    getCurrentRiskTier() {
        const balance = this.currentBalance;
        if (balance >= 10000) return '0.5% (Tier 3)';
        if (balance >= 5000) return '0.6% (Tier 2)';
        if (balance >= 2000) return '0.8% (Tier 1)';
        return '1.0% (Base)';
    }
}

module.exports = MoneyManager;
