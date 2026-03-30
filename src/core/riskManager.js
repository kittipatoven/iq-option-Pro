const logger = require('../utils/logger');

class RiskManager {
    constructor() {
        this.name = 'RiskManager';
        this.dailyStats = {
            trades: [],
            wins: 0,
            losses: 0,
            totalProfit: 0,
            totalLoss: 0,
            consecutiveLosses: 0,
            maxConsecutiveLosses: 0,
            startTime: new Date()
        };
        
        // Capital Tier System
        this.tier = null;
        this.tierConfig = null;
        
        // Tier configurations based on capital size
        this.tierConfigs = {
            SURVIVAL: {  // $10-$30
                name: 'SURVIVAL',
                minCapital: 10,
                maxCapital: 30,
                riskPercent: 0,
                fixedAmount: 1,
                maxTradePerDay: 10,
                minScore: 4,
                riskMode: 'SAFE',
                allowMartingale: false,
                strategy: 'REVERSAL',
                description: 'Survival Mode - Fixed $1 trades'
            },
            CONTROLLED: {  // $30-$100
                name: 'CONTROLLED',
                minCapital: 30,
                maxCapital: 100,
                riskPercent: 0.02,  // 2%
                maxTradePerDay: 15,
                minScore: 3.5,
                riskMode: 'HYBRID',
                allowMartingale: true,
                maxMartingaleLevel: 2,
                martingaleMultiplier: 1.4,
                strategy: 'HYBRID',
                description: 'Controlled Growth - 2% Risk'
            },
            PROFITABLE: {  // $100-$300
                name: 'PROFITABLE',
                minCapital: 100,
                maxCapital: 300,
                riskPercent: 0.01,  // 1%
                maxTradePerDay: 20,
                minScore: 4,
                riskMode: 'MODERATE',
                allowMartingale: true,
                maxMartingaleLevel: 2,
                martingaleMultiplier: 1.5,
                strategy: 'AI_SELECT',
                description: 'Real Profit - 1% Risk'
            },
            PRO: {  // $300-$1000
                name: 'PRO',
                minCapital: 300,
                maxCapital: 1000,
                riskPercent: 0.005,  // 0.5%
                maxTradePerDay: 25,
                minScore: 4,
                riskMode: 'PROFESSIONAL',
                allowMartingale: false,
                useTimeFilter: true,
                allowedSessions: ['London', 'NewYork'],
                strategy: 'TREND_PRO',
                description: 'Pro Level - 0.5% Risk'
            },
            ELITE: {  // $1000+
                name: 'ELITE',
                minCapital: 1000,
                maxCapital: Infinity,
                riskPercent: 0.003,  // 0.3%
                maxTradePerDay: 30,
                minScore: 5,  // A+ only
                riskMode: 'CONSERVATIVE',
                allowMartingale: false,
                useTimeFilter: true,
                allowedSessions: ['London', 'NewYork'],
                strategy: 'A_PLUS',
                description: 'Elite - A+ Setups Only'
            }
        };
        
        this.settings = {
            maxDailyLoss: parseFloat(process.env.MAX_DAILY_LOSS) || 50,
            maxDailyProfitPercent: parseFloat(process.env.MAX_DAILY_PROFIT_PERCENT) || 10,
            riskPercentage: parseFloat(process.env.RISK_PERCENTAGE) || 2,
            maxConsecutiveLosses: 3,
            baseAmount: parseFloat(process.env.BASE_AMOUNT) || 1,
            enableMartingale: false,
            martingaleMultiplier: 2,
            maxMartingaleLevel: 3
        };
        
        this.currentBalance = 0;
        this.initialBalance = 0;
        this.dailyTarget = 0;
        this.dailyStopLoss = 0;
    }

    // Detect capital tier based on balance
    detectTier(balance) {
        if (balance >= 1000) return 'ELITE';
        if (balance >= 300) return 'PRO';
        if (balance >= 100) return 'PROFITABLE';
        if (balance >= 30) return 'CONTROLLED';
        return 'SURVIVAL';
    }

    // Initialize with capital tier detection
    initialize(balance) {
        try {
            this.currentBalance = balance;
            this.initialBalance = balance;
            
            // Detect and set tier
            const tierName = this.detectTier(balance);
            this.tier = tierName;
            this.tierConfig = this.tierConfigs[tierName];
            
            // Calculate daily targets
            this.dailyTarget = balance * (this.settings.maxDailyProfitPercent / 100);
            this.dailyStopLoss = balance * (this.settings.maxDailyLoss / 100);
            
            logger.info('Risk Manager initialized with tier', {
                initialBalance: balance,
                tier: tierName,
                tierConfig: this.tierConfig,
                dailyTarget: this.dailyTarget,
                dailyStopLoss: this.dailyStopLoss
            });
            
            console.log(`💎 TIER: ${tierName} - ${this.tierConfig.description}`);
            console.log(`💰 Risk Mode: ${this.tierConfig.riskMode}`);
            console.log(`📊 Strategy: ${this.tierConfig.strategy}`);
            console.log(`🎯 Min Score: ${this.tierConfig.minScore}`);
            
            return true;
        } catch (error) {
            logger.error('Risk Manager initialization failed', error);
            return false;
        }
    }

    // Get trade amount based on tier
    getTradeAmount() {
        if (!this.tierConfig) return 1;
        
        // Survival tier: fixed $1
        if (this.tier === 'SURVIVAL') {
            return this.tierConfig.fixedAmount;
        }
        
        // Other tiers: percentage of balance
        const amount = Math.max(1, this.currentBalance * this.tierConfig.riskPercent);
        return Math.floor(amount);
    }

    // Check if trade limit reached for the day
    isTradeLimitReached() {
        if (!this.tierConfig) return false;
        return this.dailyStats.trades.length >= this.tierConfig.maxTradePerDay;
    }

    // Check if score meets tier requirement
    isScoreValid(score) {
        if (!this.tierConfig) return score >= 4;
        return score >= this.tierConfig.minScore;
    }

    // Check if take profit target hit (for PRO tier+)
    isTakeProfitHit() {
        if (!this.tierConfig || this.tier === 'SURVIVAL' || this.tier === 'CONTROLLED') {
            return false;
        }
        
        const profitTarget = this.initialBalance * 0.03; // 3% daily target
        if (this.dailyStats.totalProfit >= profitTarget) {
            console.log(`🎯 TAKE PROFIT HIT: $${this.dailyStats.totalProfit.toFixed(2)} >= $${profitTarget.toFixed(2)}`);
            return true;
        }
        return false;
    }

    // Check if current time is in allowed trading sessions (for PRO tier+)
    isInAllowedSession() {
        if (!this.tierConfig || !this.tierConfig.useTimeFilter) {
            return true;
        }
        
        const now = new Date();
        const hour = now.getUTCHours();
        
        // London: 8:00-17:00 UTC
        // New York: 13:00-22:00 UTC
        const isLondon = hour >= 8 && hour < 17;
        const isNewYork = hour >= 13 && hour < 22;
        
        const allowed = isLondon || isNewYork;
        
        if (!allowed) {
            console.log(`⛔ Outside trading hours (${hour}:00 UTC) - Waiting for London/NY session`);
        }
        
        return allowed;
    }

    // Update balance and recalculate if tier changes
    updateBalance(newBalance) {
        try {
            const oldBalance = this.currentBalance;
            this.currentBalance = newBalance;
            
            // Check if tier changed
            const newTier = this.detectTier(newBalance);
            if (newTier !== this.tier) {
                this.tier = newTier;
                this.tierConfig = this.tierConfigs[newTier];
                console.log(`💎 TIER UPGRADED: ${newTier} - ${this.tierConfig.description}`);
            }
            
            // Update daily targets based on new balance
            this.dailyTarget = newBalance * (this.settings.maxDailyProfitPercent / 100);
            this.dailyStopLoss = newBalance * (this.settings.maxDailyLoss / 100);
            
            logger.debug('Balance updated', {
                oldBalance,
                newBalance,
                change: newBalance - oldBalance,
                tier: this.tier
            });
        } catch (error) {
            logger.error('Balance update failed', error);
        }
    }

    recordTrade(tradeResult) {
        try {
            const trade = {
                timestamp: new Date(),
                pair: tradeResult.pair,
                direction: tradeResult.direction,
                amount: tradeResult.amount,
                result: tradeResult.result, // 'WIN' or 'LOSS'
                profit: tradeResult.profit || 0,
                balance: this.currentBalance
            };
            
            this.dailyStats.trades.push(trade);
            
            if (tradeResult.result === 'WIN') {
                this.dailyStats.wins++;
                this.dailyStats.totalProfit += trade.profit;
                this.dailyStats.consecutiveLosses = 0;
            } else {
                this.dailyStats.losses++;
                this.dailyStats.totalLoss += Math.abs(trade.profit);
                this.dailyStats.consecutiveLosses++;
                
                if (this.dailyStats.consecutiveLosses > this.dailyStats.maxConsecutiveLosses) {
                    this.dailyStats.maxConsecutiveLosses = this.dailyStats.consecutiveLosses;
                }
            }
            
            logger.trade(tradeResult.pair, tradeResult.direction, tradeResult);
            logger.debug('Trade recorded', trade);
            
            return trade;
        } catch (error) {
            logger.error('Trade recording failed', error);
            return null;
        }
    }

    shouldStopTrading() {
        try {
            const reasons = [];
            let shouldStop = false;
            
            // Check daily loss limit
            if (this.dailyStats.totalLoss >= this.settings.maxDailyLoss) {
                shouldStop = true;
                reasons.push(`Daily loss limit reached: $${this.dailyStats.totalLoss} >= $${this.settings.maxDailyLoss}`);
            }
            
            // Check daily profit target
            if (this.dailyStats.totalProfit >= this.dailyTarget) {
                shouldStop = true;
                reasons.push(`Daily profit target reached: $${this.dailyStats.totalProfit} >= $${this.dailyTarget}`);
            }
            
            // Check consecutive losses
            if (this.dailyStats.consecutiveLosses >= this.settings.maxConsecutiveLosses) {
                shouldStop = true;
                reasons.push(`Max consecutive losses reached: ${this.dailyStats.consecutiveLosses}`);
            }
            
            // Check if balance is too low
            const minBalance = this.initialBalance * 0.1; // 10% of initial balance
            if (this.currentBalance <= minBalance) {
                shouldStop = true;
                reasons.push(`Balance too low: $${this.currentBalance} <= $${minBalance}`);
            }
            
            if (shouldStop) {
                logger.warn('Trading stop condition triggered', { reasons });
            }
            
            return {
                shouldStop,
                reasons,
                stats: this.getDailyStats()
            };
        } catch (error) {
            logger.error('Stop trading check failed', error);
            return { shouldStop: false, reasons: ['Check error'], stats: this.getDailyStats() };
        }
    }

    calculatePositionSize(score = 1, confidence = 100) {
        try {
            let positionSize = this.settings.baseAmount;
            
            // Adjust based on risk percentage
            const riskAmount = this.currentBalance * (this.settings.riskPercentage / 100);
            positionSize = Math.min(positionSize, riskAmount);
            
            // Adjust based on score (0-1 scale)
            positionSize *= (0.5 + (score * 0.5)); // Scale between 50% and 100%
            
            // Adjust based on confidence (0-100 scale)
            positionSize *= (confidence / 100);
            
            // Ensure minimum position size
            positionSize = Math.max(positionSize, 0.1);
            
            // Round to 2 decimal places
            positionSize = Math.round(positionSize * 100) / 100;
            
            return {
                positionSize,
                riskAmount,
                riskPercentage: (positionSize / this.currentBalance) * 100,
                score,
                confidence
            };
        } catch (error) {
            logger.error('Position size calculation failed', error);
            return { positionSize: this.settings.baseAmount, riskAmount: 0, riskPercentage: 0 };
        }
    }

    calculateMartingaleSize(consecutiveLosses) {
        try {
            if (!this.settings.enableMartingale) {
                return this.settings.baseAmount;
            }
            
            if (consecutiveLosses > this.settings.maxMartingaleLevel) {
                return this.settings.baseAmount; // Reset to base after max level
            }
            
            const multiplier = Math.pow(this.settings.martingaleMultiplier, consecutiveLosses);
            const martingaleSize = this.settings.baseAmount * multiplier;
            
            // Cap at maximum risk
            const maxRisk = this.currentBalance * (this.settings.riskPercentage * 2 / 100); // Double risk for martingale
            
            return Math.min(martingaleSize, maxRisk);
        } catch (error) {
            logger.error('Martingale calculation failed', error);
            return this.settings.baseAmount;
        }
    }

    getRiskMetrics() {
        try {
            const totalTrades = this.dailyStats.wins + this.dailyStats.losses;
            const winRate = totalTrades > 0 ? (this.dailyStats.wins / totalTrades) * 100 : 0;
            const profitFactor = this.dailyStats.totalLoss > 0 ? 
                this.dailyStats.totalProfit / this.dailyStats.totalLoss : 0;
            const netProfit = this.dailyStats.totalProfit - this.dailyStats.totalLoss;
            const roi = this.initialBalance > 0 ? 
                (netProfit / this.initialBalance) * 100 : 0;
            
            return {
                totalTrades,
                wins: this.dailyStats.wins,
                losses: this.dailyStats.losses,
                winRate: Math.round(winRate * 100) / 100,
                profitFactor: Math.round(profitFactor * 100) / 100,
                totalProfit: this.dailyStats.totalProfit,
                totalLoss: this.dailyStats.totalLoss,
                netProfit,
                roi: Math.round(roi * 100) / 100,
                consecutiveLosses: this.dailyStats.consecutiveLosses,
                maxConsecutiveLosses: this.dailyStats.maxConsecutiveLosses,
                currentBalance: this.currentBalance,
                dailyTarget: this.dailyTarget,
                dailyStopLoss: this.dailyStopLoss,
                targetProgress: (this.dailyStats.totalProfit / this.dailyTarget) * 100,
                lossProgress: (this.dailyStats.totalLoss / this.settings.maxDailyLoss) * 100
            };
        } catch (error) {
            logger.error('Risk metrics calculation failed', error);
            return null;
        }
    }

    getDailyStats() {
        try {
            const now = new Date();
            const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const todayTrades = this.dailyStats.trades.filter(trade => 
                trade.timestamp >= dayStart
            );
            
            return {
                date: dayStart,
                trades: todayTrades.length,
                wins: this.dailyStats.wins,
                losses: this.dailyStats.losses,
                totalProfit: this.dailyStats.totalProfit,
                totalLoss: this.dailyStats.totalLoss,
                consecutiveLosses: this.dailyStats.consecutiveLosses,
                startTime: this.dailyStats.startTime
            };
        } catch (error) {
            logger.error('Daily stats retrieval failed', error);
            return null;
        }
    }

    resetDailyStats() {
        try {
            this.dailyStats = {
                trades: [],
                wins: 0,
                losses: 0,
                totalProfit: 0,
                totalLoss: 0,
                consecutiveLosses: 0,
                maxConsecutiveLosses: 0,
                startTime: new Date()
            };
            
            logger.info('Daily stats reset');
        } catch (error) {
            logger.error('Daily stats reset failed', error);
        }
    }

    updateSettings(newSettings) {
        try {
            this.settings = { ...this.settings, ...newSettings };
            
            // Recalculate targets
            this.dailyTarget = this.currentBalance * (this.settings.maxDailyProfitPercent / 100);
            this.dailyStopLoss = this.currentBalance * (this.settings.maxDailyLoss / 100);
            
            logger.info('Risk settings updated', this.settings);
        } catch (error) {
            logger.error('Settings update failed', error);
        }
    }

    getRiskLevel() {
        try {
            const metrics = this.getRiskMetrics();
            if (!metrics) return 'UNKNOWN';
            
            let riskScore = 0;
            
            // Consecutive losses risk
            if (metrics.consecutiveLosses >= 2) riskScore += 3;
            else if (metrics.consecutiveLosses >= 1) riskScore += 1;
            
            // Win rate risk
            if (metrics.winRate < 30) riskScore += 3;
            else if (metrics.winRate < 40) riskScore += 2;
            else if (metrics.winRate < 50) riskScore += 1;
            
            // Daily loss progress risk
            if (metrics.lossProgress > 80) riskScore += 3;
            else if (metrics.lossProgress > 60) riskScore += 2;
            else if (metrics.lossProgress > 40) riskScore += 1;
            
            // ROI risk
            if (metrics.roi < -10) riskScore += 3;
            else if (metrics.roi < -5) riskScore += 2;
            else if (metrics.roi < 0) riskScore += 1;
            
            if (riskScore >= 7) return 'HIGH';
            if (riskScore >= 4) return 'MEDIUM';
            if (riskScore >= 2) return 'LOW';
            return 'MINIMAL';
        } catch (error) {
            logger.error('Risk level calculation failed', error);
            return 'UNKNOWN';
        }
    }

    shouldReduceRisk() {
        try {
            const riskLevel = this.getRiskLevel();
            const metrics = this.getRiskMetrics();
            
            if (riskLevel === 'HIGH' || metrics.consecutiveLosses >= 2) {
                return true;
            }
            
            return false;
        } catch (error) {
            logger.error('Risk reduction check failed', error);
            return false;
        }
    }

    getRecommendedRiskAdjustment() {
        try {
            const shouldReduce = this.shouldReduceRisk();
            const metrics = this.getRiskMetrics();
            
            if (shouldReduce) {
                return {
                    action: 'REDUCE',
                    factor: 0.5, // Reduce by 50%
                    reason: `High risk level: ${this.getRiskLevel()} or consecutive losses: ${metrics.consecutiveLosses}`
                };
            }
            
            if (metrics.winRate > 60 && metrics.consecutiveLosses === 0) {
                return {
                    action: 'INCREASE',
                    factor: 1.2, // Increase by 20%
                    reason: 'Good performance with high win rate'
                };
            }
            
            return {
                action: 'MAINTAIN',
                factor: 1.0,
                reason: 'Normal risk conditions'
            };
        } catch (error) {
            logger.error('Risk adjustment recommendation failed', error);
            return { action: 'MAINTAIN', factor: 1.0, reason: 'Error in calculation' };
        }
    }
}

module.exports = RiskManager;
