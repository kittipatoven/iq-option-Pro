/**
 * RL Trading Engine - Reinforcement Learning for Trading
 * Q-table based learning system with adaptive strategy weights
 */

const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');

class RLEngine {
    constructor() {
        this.name = 'RLEngine';
        
        // ═══════════════════════════════════════════════════════════════
        // 🧠 Q-LEARNING CONFIGURATION
        // ═══════════════════════════════════════════════════════════════
        this.config = {
            learningRate: 0.3,      // α (alpha) - how fast we learn
            discountFactor: 0.9,    // γ (gamma) - future reward importance
            epsilon: 0.15,          // Exploration rate (15% random actions)
            epsilonDecay: 0.995,    // Decay epsilon over time
            minEpsilon: 0.05,       // Minimum exploration
            
            // State discretization
            stateBins: {
                rsi: [20, 30, 40, 50, 60, 70, 80],  // RSI zones
                rsiSlope: [-0.5, -0.1, 0, 0.1, 0.5], // RSI change rate
                momentum: [-0.3, -0.1, 0, 0.1, 0.3], // Price momentum
                hour: [7, 9, 13, 15, 17]  // Trading hours
            }
        };
        
        // ═══════════════════════════════════════════════════════════════
        // 🎯 Q-TABLE: state -> action values
        // ═══════════════════════════════════════════════════════════════
        this.qTable = new Map();        // state -> {CALL, PUT, SKIP} values
        this.visitCount = new Map();    // Track state visits
        
        // ═══════════════════════════════════════════════════════════════
        // 📊 STRATEGY WEIGHTS - Adaptive multi-strategy system
        // ═══════════════════════════════════════════════════════════════
        this.strategies = {
            REVERSAL: {
                weight: 1.0,
                performance: { wins: 0, losses: 0, profit: 0 },
                conditions: {
                    rsiExtreme: true,
                    momentumShift: true,
                    marketType: ['SIDEWAY']
                }
            },
            TREND_FOLLOW: {
                weight: 0.8,
                performance: { wins: 0, losses: 0, profit: 0 },
                conditions: {
                    momentumStrong: true,
                    marketType: ['TREND_UP', 'TREND_DOWN']
                }
            },
            SCALPING: {
                weight: 0.6,
                performance: { wins: 0, losses: 0, profit: 0 },
                conditions: {
                    momentumStrong: true,
                    tickVelocity: true
                }
            }
        };
        
        // ═══════════════════════════════════════════════════════════════
        // 💰 REWARD TRACKING
        // ═══════════════════════════════════════════════════════════════
        this.episodeHistory = [];       // Recent trades for learning
        this.episodeSize = 50;          // Window size for updates
        
        // ═══════════════════════════════════════════════════════════════
        // 🔄 LEARNING STATE
        // ═══════════════════════════════════════════════════════════════
        this.learningStats = {
            totalUpdates: 0,
            totalTrades: 0,
            wins: 0,
            losses: 0,
            totalReward: 0,
            averageReward: 0,
            bestStrategy: 'REVERSAL',
            lastUpdate: null
        };
        
        // Pending states waiting for outcome
        this.pendingStates = new Map(); // tradeId -> { state, action, timestamp }
        
        // Load previous learning data
        this.loadFromDisk();
    }
    
    /**
     * ═══════════════════════════════════════════════════════════════
     * 🧠 STATE ENCODING - Convert market data to discrete state
     * ═══════════════════════════════════════════════════════════════
     */
    encodeState(indicators, marketType, pair, hour) {
        const { rsi, momentum, rsiSlope } = indicators;
        
        // Discretize continuous values into bins
        const rsiBin = this.discretize(rsi, this.config.stateBins.rsi);
        const slopeBin = this.discretize(rsiSlope || 0, this.config.stateBins.rsiSlope);
        const momentumBin = this.discretize(momentum?.strength || 0, this.config.stateBins.momentum);
        const hourBin = this.discretize(hour, this.config.stateBins.hour);
        
        // Create state string: "RSI_SLOPE_MOMENTUM_MARKET_HOUR_PAIR"
        const state = `${rsiBin}_${slopeBin}_${momentumBin}_${marketType}_${hourBin}_${pair}`;
        
        return state;
    }
    
    /**
     * Discretize a continuous value into bins
     */
    discretize(value, bins) {
        for (let i = 0; i < bins.length; i++) {
            if (value < bins[i]) return i;
        }
        return bins.length;
    }
    
    /**
     * ═══════════════════════════════════════════════════════════════
     * 🎯 ACTION SELECTION - Epsilon-Greedy Policy
     * ═══════════════════════════════════════════════════════════════
     */
    selectAction(state, exploration = true) {
        // Get or initialize Q-values for this state
        const qValues = this.getQValues(state);
        
        // Track state visits
        this.visitCount.set(state, (this.visitCount.get(state) || 0) + 1);
        
        // Epsilon-greedy: explore or exploit
        if (exploration && Math.random() < this.config.epsilon) {
            // EXPLORATION: Try random action
            const actions = ['CALL', 'PUT', 'SKIP'];
            const randomAction = actions[Math.floor(Math.random() * actions.length)];
            return {
                action: randomAction,
                qValue: qValues[randomAction],
                exploration: true,
                confidence: 3  // Low confidence for exploration
            };
        }
        
        // EXPLOITATION: Choose best known action
        const bestAction = this.getBestAction(qValues);
        const confidence = this.calculateConfidence(qValues);
        
        return {
            action: bestAction,
            qValue: qValues[bestAction],
            exploration: false,
            confidence: confidence
        };
    }
    
    /**
     * Get Q-values for a state
     */
    getQValues(state) {
        if (!this.qTable.has(state)) {
            // Initialize with small random values (optimistic initialization)
            this.qTable.set(state, {
                CALL: Math.random() * 0.1,
                PUT: Math.random() * 0.1,
                SKIP: 0.05  // Slightly favor skipping initially (safer)
            });
        }
        return this.qTable.get(state);
    }
    
    /**
     * Get best action from Q-values
     */
    getBestAction(qValues) {
        let bestAction = 'SKIP';
        let bestValue = qValues.SKIP;
        
        for (const [action, value] of Object.entries(qValues)) {
            if (value > bestValue) {
                bestValue = value;
                bestAction = action;
            }
        }
        
        return bestAction;
    }
    
    /**
     * Calculate confidence score from Q-value spread
     */
    calculateConfidence(qValues) {
        const values = Object.values(qValues);
        const max = Math.max(...values);
        const min = Math.min(...values);
        const spread = max - min;
        
        // Scale to 0-10
        return Math.min(10, Math.max(1, spread * 10));
    }
    
    /**
     * ═══════════════════════════════════════════════════════════════
     * 💰 REWARD FUNCTION - Calculate reward from trade outcome
     * ═══════════════════════════════════════════════════════════════
     */
    calculateReward(outcome, profit, state, action) {
        let reward = 0;
        
        if (outcome === 'win') {
            // Base reward for winning
            reward = 1.0;
            
            // Bonus for high confidence correct predictions
            const qValues = this.getQValues(state);
            const bestAction = this.getBestAction(qValues);
            if (bestAction === action && qValues[action] > 0.5) {
                reward += 0.3; // Confidence bonus
            }
            
        } else if (outcome === 'loss') {
            // Penalty for losing (scaled by confidence)
            const qValues = this.getQValues(state);
            const confidence = this.calculateConfidence(qValues) / 10;
            reward = -1.0 * (1 + confidence * 0.5); // Higher penalty for high-confidence losses
            
        } else if (outcome === 'skip') {
            // Small penalty for skipping (opportunity cost)
            reward = -0.1;
        }
        
        // Add profit-based adjustment
        if (profit > 0) {
            reward += profit * 0.01; // Scale profit contribution
        }
        
        return reward;
    }
    
    /**
     * ═══════════════════════════════════════════════════════════════
     * 🔄 Q-LEARNING UPDATE - Bellman equation
     * ═══════════════════════════════════════════════════════════════
     */
    updatePolicy(state, action, reward, nextState) {
        const alpha = this.config.learningRate;
        const gamma = this.config.discountFactor;
        
        // Get current Q-value
        const qValues = this.getQValues(state);
        const currentQ = qValues[action];
        
        // Get next state maximum Q-value
        const nextQValues = this.getQValues(nextState);
        const maxNextQ = Math.max(...Object.values(nextQValues));
        
        // Q-learning update: Q(s,a) = Q(s,a) + α * (reward + γ * max(Q(s')) - Q(s,a))
        const newQ = currentQ + alpha * (reward + gamma * maxNextQ - currentQ);
        
        // Update Q-table
        qValues[action] = newQ;
        
        // Decay epsilon (less exploration over time)
        this.config.epsilon = Math.max(
            this.config.minEpsilon,
            this.config.epsilon * this.config.epsilonDecay
        );
        
        // Update learning stats
        this.learningStats.totalUpdates++;
        this.learningStats.totalReward += reward;
        this.learningStats.averageReward = 
            this.learningStats.totalReward / this.learningStats.totalUpdates;
        this.learningStats.lastUpdate = Date.now();
        
        return { oldQ: currentQ, newQ, reward };
    }
    
    /**
     * ═══════════════════════════════════════════════════════════════
     * 📊 STRATEGY EVOLUTION - Update strategy weights based on performance
     * ═══════════════════════════════════════════════════════════════
     */
    updateStrategyWeights(outcome, strategy, profit, state) {
        if (!this.strategies[strategy]) return;
        
        const perf = this.strategies[strategy].performance;
        
        // Update performance metrics
        if (outcome === 'win') {
            perf.wins++;
        } else if (outcome === 'loss') {
            perf.losses++;
        }
        perf.profit += profit;
        
        // Calculate win rate
        const total = perf.wins + perf.losses;
        const winRate = total > 0 ? perf.wins / total : 0;
        
        // Adaptive weight update
        const oldWeight = this.strategies[strategy].weight;
        let newWeight = oldWeight;
        
        if (winRate > 0.65 && total >= 5) {
            // High performance: increase weight
            newWeight = Math.min(2.0, oldWeight * 1.1);
        } else if (winRate < 0.45 && total >= 5) {
            // Low performance: decrease weight
            newWeight = Math.max(0.3, oldWeight * 0.9);
        }
        
        this.strategies[strategy].weight = newWeight;
        
        // Find best strategy
        this.updateBestStrategy();
        
        return { strategy, oldWeight, newWeight, winRate };
    }
    
    /**
     * Determine best strategy based on performance
     */
    updateBestStrategy() {
        let bestStrategy = 'REVERSAL';
        let bestScore = -Infinity;
        
        for (const [name, strategy] of Object.entries(this.strategies)) {
            const perf = strategy.performance;
            const total = perf.wins + perf.losses;
            
            if (total >= 3) {  // Minimum sample size
                const winRate = perf.wins / total;
                const profitFactor = perf.profit / (total || 1);
                const score = winRate * 0.6 + profitFactor * 0.4;
                
                if (score > bestScore) {
                    bestScore = score;
                    bestStrategy = name;
                }
            }
        }
        
        this.learningStats.bestStrategy = bestStrategy;
    }
    
    /**
     * ═══════════════════════════════════════════════════════════════
     * 🎯 AUTO STRATEGY SELECTION - Choose strategy based on conditions
     * ═══════════════════════════════════════════════════════════════
     */
    selectStrategy(marketType, indicators, pair) {
        const { rsi, momentum } = indicators;
        
        // Score each strategy based on conditions
        const scores = {};
        
        for (const [name, strategy] of Object.entries(this.strategies)) {
            let score = strategy.weight; // Base score from learned weight
            
            // Add condition-based bonuses
            if (strategy.conditions.rsiExtreme && (rsi < 25 || rsi > 75)) {
                score += 0.5;
            }
            
            if (strategy.conditions.momentumShift && momentum?.direction !== 'NEUTRAL') {
                score += 0.3;
            }
            
            if (strategy.conditions.marketType?.includes(marketType)) {
                score += 0.4;
            }
            
            scores[name] = score;
        }
        
        // Find best scoring strategy
        let bestStrategy = 'REVERSAL';
        let bestScore = scores.REVERSAL || 0;
        
        for (const [name, score] of Object.entries(scores)) {
            if (score > bestScore) {
                bestScore = score;
                bestStrategy = name;
            }
        }
        
        return {
            strategy: bestStrategy,
            score: bestScore,
            allScores: scores,
            confidence: Math.min(10, bestScore * 5)
        };
    }
    
    /**
     * ═══════════════════════════════════════════════════════════════
     * 🔄 LEARNING CYCLE - Record trade and update model
     * ═══════════════════════════════════════════════════════════════
     */
    recordTrade(tradeId, state, action, outcome, profit = 0, strategy = 'REVERSAL') {
        // Calculate reward
        const reward = this.calculateReward(outcome, profit, state, action);
        
        // Find next state (current market state)
        const nextState = state;  // Simplified: use same state as next
        
        // Update Q-table
        const updateResult = this.updatePolicy(state, action, reward, nextState);
        
        // Update strategy weights
        const strategyUpdate = this.updateStrategyWeights(outcome, strategy, profit, state);
        
        // Add to episode history
        this.episodeHistory.push({
            state,
            action,
            outcome,
            reward,
            profit,
            strategy,
            timestamp: Date.now(),
            qUpdate: updateResult
        });
        
        // Maintain window size
        if (this.episodeHistory.length > this.episodeSize) {
            this.episodeHistory.shift();
        }
        
        // Update stats
        this.learningStats.totalTrades++;
        if (outcome === 'win') this.learningStats.wins++;
        if (outcome === 'loss') this.learningStats.losses++;
        
        // Log learning progress
        console.log(`\n🧠 RL LEARNING UPDATE:`);
        console.log(`   State: ${state}`);
        console.log(`   Action: ${action} | Outcome: ${outcome}`);
        console.log(`   Reward: ${reward.toFixed(2)} | Q: ${updateResult.oldQ.toFixed(3)} → ${updateResult.newQ.toFixed(3)}`);
        console.log(`   Strategy: ${strategy} (weight: ${strategyUpdate?.newWeight?.toFixed(2) || 'N/A'})`);
        console.log(`   Total Updates: ${this.learningStats.totalUpdates}`);
        console.log(`   Epsilon: ${this.config.epsilon.toFixed(3)}`);
        
        // Save to disk periodically
        if (this.learningStats.totalUpdates % 10 === 0) {
            this.saveToDisk();
        }
        
        return {
            reward,
            qUpdate: updateResult,
            strategyUpdate
        };
    }
    
    /**
     * Get current learning statistics
     */
    getLearningStats() {
        const totalTrades = this.learningStats.wins + this.learningStats.losses;
        const winRate = totalTrades > 0 ? (this.learningStats.wins / totalTrades) * 100 : 0;
        
        return {
            ...this.learningStats,
            winRate: winRate.toFixed(1),
            totalTrades,
            qTableSize: this.qTable.size,
            strategies: Object.entries(this.strategies).map(([name, s]) => ({
                name,
                weight: s.weight.toFixed(2),
                wins: s.performance.wins,
                losses: s.performance.losses,
                profit: s.profit?.toFixed(2) || 0
            })),
            epsilon: this.config.epsilon.toFixed(3)
        };
    }
    
    /**
     * Save learning data to disk
     */
    saveToDisk() {
        try {
            const data = {
                qTable: Array.from(this.qTable.entries()),
                visitCount: Array.from(this.visitCount.entries()),
                strategies: this.strategies,
                learningStats: this.learningStats,
                config: this.config,
                savedAt: new Date().toISOString()
            };
            
            const dataPath = path.join(__dirname, '../../data');
            if (!fs.existsSync(dataPath)) {
                fs.mkdirSync(dataPath, { recursive: true });
            }
            
            fs.writeFileSync(
                path.join(dataPath, 'rl_learning.json'),
                JSON.stringify(data, null, 2)
            );
            
            logger.debug('RL learning data saved');
        } catch (error) {
            logger.error('Failed to save RL learning data:', error);
        }
    }
    
    /**
     * Load learning data from disk
     */
    loadFromDisk() {
        try {
            const filePath = path.join(__dirname, '../../data/rl_learning.json');
            
            if (!fs.existsSync(filePath)) {
                logger.info('No previous RL learning data found, starting fresh');
                return;
            }
            
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            
            // Restore Q-table
            if (data.qTable) {
                this.qTable = new Map(data.qTable);
            }
            
            // Restore visit counts
            if (data.visitCount) {
                this.visitCount = new Map(data.visitCount);
            }
            
            // Restore strategies
            if (data.strategies) {
                this.strategies = { ...this.strategies, ...data.strategies };
            }
            
            // Restore stats
            if (data.learningStats) {
                this.learningStats = { ...this.learningStats, ...data.learningStats };
            }
            
            // Restore config
            if (data.config) {
                this.config = { ...this.config, ...data.config };
            }
            
            console.log(`🧠 RL LEARNING LOADED: ${this.qTable.size} states, ${this.learningStats.totalUpdates} updates`);
            
        } catch (error) {
            logger.error('Failed to load RL learning data:', error);
        }
    }
    
    /**
     * Generate learning report
     */
    generateReport() {
        const stats = this.getLearningStats();
        
        console.log(`\n╔══════════════════════════════════════════════════════════╗`);
        console.log(`║          🧠 RL LEARNING REPORT                            ║`);
        console.log(`╠══════════════════════════════════════════════════════════╣`);
        console.log(`║ Total Trades: ${stats.totalTrades} | Win Rate: ${stats.winRate}%`);
        console.log(`║ Total Updates: ${stats.totalUpdates} | Avg Reward: ${stats.averageReward.toFixed(3)}`);
        console.log(`║ Q-Table Size: ${stats.qTableSize} states`);
        console.log(`║ Best Strategy: ${stats.bestStrategy}`);
        console.log(`║ Epsilon: ${stats.epsilon} (exploration rate)`);
        console.log(`╠══════════════════════════════════════════════════════════╣`);
        console.log(`║ STRATEGY PERFORMANCE:`);
        stats.strategies.forEach(s => {
            const total = s.wins + s.losses;
            const wr = total > 0 ? ((s.wins/total)*100).toFixed(1) : '0.0';
            console.log(`║   ${s.name.padEnd(15)} W:${s.wins} L:${s.losses} WR:${wr}% W:${s.weight}`);
        });
        console.log(`╚══════════════════════════════════════════════════════════╝\n`);
        
        return stats;
    }
}

module.exports = new RLEngine();
