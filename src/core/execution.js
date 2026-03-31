const logger = require('../utils/logger');
const iqoptionAPI = require('../api/unifiediqoption');
const riskManager = require('./riskManager');
const aiAnalyzer = require('./aiTradingAnalyzer');
const tradeTracker = require('./tradeResultTracker');

class ExecutionEngine {
    constructor() {
        this.name = 'ExecutionEngine';
        this.activeOrders = new Map();
        this.executionHistory = [];
        this.maxRetries = 3;
        this.retryDelay = 1000; // OPTIMIZED: Reduced from 2000 to 1000ms
        this.orderTimeout = 30000; // OPTIMIZED: Reduced from 60000 to 30000ms (trades resolve faster)
        
        // Initialize statistics
        this.stats = {
            totalTrades: 0,
            wins: 0,
            losses: 0,
            totalProfit: 0,
            totalLoss: 0,
            winRate: 0,
            netProfit: 0
        };
    }

    /**
     * Initialize execution engine
     */
    async initialize() {
        try {
            logger.info('Initializing Execution Engine...');
            
            // Check if connected to API - use correct method
            if (!iqoptionAPI.isReady || typeof iqoptionAPI.isReady !== 'function') {
                throw new Error('IQ Option API does not have isReady method');
            }
            
            if (!iqoptionAPI.isReady()) {
                throw new Error('IQ Option API not connected');
            }
            
            logger.info('Execution Engine initialized successfully');
            return true;
        } catch (error) {
            logger.error('Failed to initialize Execution Engine', error);
            throw error;
        }
    }

    async executeTrade(tradeSignal) {
        try {
            const { pair, direction, amount, confidence, score, strategy } = tradeSignal;
            
            logger.info('Executing trade', tradeSignal);
            
            // Validate trade signal
            const validation = this.validateTradeSignal(tradeSignal);
            if (!validation.valid) {
                throw new Error(`Invalid trade signal: ${validation.reason}`);
            }
            
            // Calculate position size
            const positionSize = riskManager.calculatePositionSize(score, confidence);
            const finalAmount = Math.min(amount, positionSize.positionSize);
            
            // Check if we should use martingale
            const martingaleSize = riskManager.calculateMartingaleSize(riskManager.dailyStats.consecutiveLosses);
            const tradeAmount = Math.max(finalAmount, martingaleSize);
            
            // Execute the trade with retry logic
            const orderResult = await this.executeWithRetry(pair, direction, tradeAmount);
            
            if (orderResult.success) {
                // Create order object
                const order = {
                    id: orderResult.order_id, // Use order_id from API response
                    pair: tradeSignal.pair,
                    direction: tradeSignal.direction,
                    amount: tradeSignal.amount,
                    confidence: tradeSignal.confidence,
                    score: tradeSignal.score,
                    strategy: tradeSignal.strategy,
                    timestamp: new Date(),
                    status: 'ACTIVE'
                };
                
                this.activeOrders.set(order.id, order);
                this.executionHistory.push(order);
                
                logger.info('Trade executed successfully', order);
                
                // Set up order monitoring
                this.monitorOrder(order.id);
                
                return {
                    success: true,
                    orderId: order.id,
                    order: order
                };
            } else {
                throw new Error(`Trade execution failed: ${orderResult.message}`);
            }
        } catch (error) {
            logger.error('Trade execution failed', error);
            return {
                success: false,
                error: error.message,
                tradeSignal
            };
        }
    }

    validateTradeSignal(tradeSignal) {
        try {
            const { pair, direction, amount, confidence, score } = tradeSignal;
            
            // Check required fields
            if (!pair || !direction || !amount) {
                return { valid: false, reason: 'Missing required fields' };
            }
            
            // Check direction
            if (!['CALL', 'PUT'].includes(direction)) {
                return { valid: false, reason: 'Invalid direction' };
            }
            
            // Check amount
            if (amount <= 0) {
                return { valid: false, reason: 'Invalid amount' };
            }
            
            // Check confidence
            if (confidence < 0 || confidence > 100) {
                return { valid: false, reason: 'Invalid confidence' };
            }
            
            // Check score
            if (score < 0 || score > 5) {
                return { valid: false, reason: 'Invalid score' };
            }
            
            return { valid: true };
        } catch (error) {
            logger.error('Trade signal validation failed', error);
            return { valid: false, reason: 'Validation error' };
        }
    }

    async executeWithRetry(pair, direction, amount, attempt = 1) {
        try {
            // Use unifiediqoption.placeTrade() which has built-in retry, fallback, and error classification
            const result = await iqoptionAPI.placeTrade({
                pair,
                direction: direction.toLowerCase(),
                amount,
                duration: 1
            });
            
            // Validate result
            if (!result.success) {
                throw new Error(result.error || 'Order execution failed');
            }
            
            // Validate order ID is real
            if (!result.id && !result.order_id) {
                throw new Error('API did not return order ID');
            }
            
            const orderId = result.id || result.order_id;
            
            // Check for mock patterns
            if (orderId.startsWith('order_') && /^\d+$/.test(orderId.replace('order_', ''))) {
                throw new Error('Received mock order ID - API not working in real mode');
            }
            
            if (orderId.includes('failed_')) {
                throw new Error('Order execution failed');
            }
            
            logger.info('Real order executed', { orderId, latency: result.latency });
            return {
                success: true,
                order_id: orderId,
                id: orderId,
                ...result
            };
            
        } catch (error) {
            logger.error(`Trade execution attempt ${attempt} failed`, error);
            
            // Use placeTrade's built-in retry, but add our own as backup
            if (attempt < this.maxRetries) {
                logger.info(`Retrying trade execution in ${this.retryDelay}ms...`);
                await this.delay(this.retryDelay);
                return this.executeWithRetry(pair, direction, amount, attempt + 1);
            } else {
                throw new Error(`Order execution failed after ${this.maxRetries} attempts: ${error.message}`);
            }
        }
    }

    async monitorOrder(orderId) {
        if (!orderId) {
            logger.error('[Monitor] No orderId provided');
            return;
        }
        
        const checkIntervalMs = 2000; // OPTIMIZED: Reduced from 5000 to 2000ms for faster updates
        const timeoutMs = this.orderTimeout;
        let elapsed = 0;
        let checkInterval = null;
        let isCompleted = false;
        
        try {
            console.log(`\n🔍 Monitoring order ${orderId}...`);
            
            checkInterval = setInterval(async () => {
                // Prevent multiple concurrent checks
                if (isCompleted) return;
                
                try {
                    elapsed += checkIntervalMs;
                    
                    const order = this.activeOrders.get(orderId);
                    if (!order || order.status === 'COMPLETED') {
                        console.log(`✅ Order ${orderId} no longer active`);
                        isCompleted = true;
                        if (checkInterval) {
                            clearInterval(checkInterval);
                            checkInterval = null;
                        }
                        return;
                    }
                    
                    // Check order status with retry
                    let orderInfo = null;
                    try {
                        orderInfo = await iqoptionAPI.getOrderInfo(orderId);
                    } catch (e) {
                        logger.debug(`[Monitor] getOrderInfo failed for ${orderId}:`, e.message);
                    }
                    
                    // Handle case where orderInfo is undefined or null
                    if (!orderInfo) {
                        return; // Keep polling
                    }
                    
                    // Handle case where orderInfo.success is false
                    if (!orderInfo.success) {
                        return; // Keep polling
                    }
                    
                    // Check if trade is settled (won/lost/closed/expired)
                    const isSettled = ['won', 'lost', 'closed', 'expired'].includes(orderInfo.status);
                    
                    if (isSettled) {
                        // VALIDATE: profit must be defined
                        if (orderInfo.profit === undefined || orderInfo.profit === null) {
                            return; // Don't process, keep waiting for valid data
                        }
                        
                        console.log(`\n✅ Order ${orderId} SETTLED - Status: ${orderInfo.status}, Profit: ${orderInfo.profit}`);
                        
                        // Order completed - process it
                        isCompleted = true;
                        if (checkInterval) {
                            clearInterval(checkInterval);
                            checkInterval = null;
                        }
                        this.processOrderCompletion(orderId, orderInfo);
                        return;
                    }
                    
                    // Check for timeout
                    if (elapsed > timeoutMs) {
                        logger.warn(`Order ${orderId} timeout, force processing`);
                        isCompleted = true;
                        if (checkInterval) {
                            clearInterval(checkInterval);
                            checkInterval = null;
                        }
                        this.processOrderCompletion(orderId, { status: 'timeout' });
                        return;
                    }
                } catch (error) {
                    logger.error(`[Monitor] Error checking order ${orderId}:`, error);
                }
            }, checkIntervalMs);
            
        } catch (error) {
            logger.error(`[Monitor] Failed to monitor order ${orderId}`, error);
            if (checkInterval) {
                clearInterval(checkInterval);
            }
        }
    }

    processOrderCompletion(orderId, orderInfo) {
        try {
            const order = this.activeOrders.get(orderId);
            if (!order) {
                logger.warn(`Order ${orderId} not found in active orders`);
                return;
            }
            
            // Validate orderInfo
            if (!orderInfo) {
                logger.error(`🚨 No orderInfo provided for ${orderId}`);
                return;
            }
            
            // Determine result - ONLY use real data from API
            let result = 'LOSS';
            let profit = -order.amount;
            
            // Handle different order info structures
            const status = orderInfo.status || 'unknown';
            const orderProfit = orderInfo.profit !== undefined ? orderInfo.profit : null;
            
            // DEBUG: Log raw API response
            logger.info('🎯 ORDER RESULT FROM IQ OPTION API', {
                orderId,
                rawStatus: status,
                rawProfit: orderProfit,
                orderAmount: order.amount,
                closeTime: orderInfo.close_time,
                rawOrderInfo: JSON.stringify(orderInfo)
            });
            
            console.log('\n🎯 PROCESSING ORDER RESULT:');
            console.log(`   Order ID: ${orderId}`);
            console.log(`   Status: ${status}`);
            console.log(`   Profit from API: ${orderProfit}`);
            console.log(`   Order Amount: ${order.amount}`);
            
            // HANDLE ALL CASES
            if (status === 'won') {
                result = 'WIN';
                // Use win_amount if available: netProfit = win_amount - amount
                if (orderInfo.win_amount && orderInfo.win_amount > 0) {
                    profit = orderInfo.win_amount - order.amount;
                    console.log(`   ✅ Using win_amount calculation: ${orderInfo.win_amount} - ${order.amount} = ${profit}`);
                } else if (orderProfit !== null && orderProfit > 0) {
                    profit = orderProfit;
                    console.log(`   ✅ Using REAL profit from API: ${profit}`);
                } else {
                    console.error(`   🚨 No win_amount or profit from API!`);
                    logger.error('🚨 API returned WIN but no data!', { orderId, orderInfo });
                    return;
                }
            } else if (status === 'lost') {
                result = 'LOSS';
                // Loss is always negative of amount
                profit = -order.amount;
                console.log(`   ✅ LOSS: -${order.amount}`);
            } else if (status === 'timeout' || status === 'expired') {
                result = 'TIMEOUT';
                profit = -order.amount;
                console.log(`   ⏰ TIMEOUT: ${profit}`);
            } else if (status === 'canceled') {
                result = 'CANCELED';
                profit = 0;
                console.log(`   🚫 CANCELED: ${profit}`);
            } else if (status === 'closed') {
                // For closed status, determine by real profit only
                if (orderProfit !== null && orderProfit > 0) {
                    result = 'WIN';
                    profit = orderProfit;
                    console.log(`   ✅ CLOSED as WIN: ${profit}`);
                } else if (orderProfit !== null && orderProfit < 0) {
                    result = 'LOSS';
                    profit = orderProfit;
                    console.log(`   ✅ CLOSED as LOSS: ${profit}`);
                } else if (orderProfit === 0) {
                    result = 'TIE';
                    profit = 0;
                    console.log(`   ✅ CLOSED as TIE: ${profit}`);
                } else {
                    console.error(`   🚨 API returned CLOSED but no profit value!`);
                    logger.error('🚨 API returned CLOSED but no profit value!', { orderId });
                    return;
                }
            } else if (status === 'error' || status === 'unknown') {
                result = 'ERROR';
                profit = -order.amount;
                console.log(`   ❌ ERROR: ${profit}`);
            }
            
            // FINAL VALIDATION
            console.log('\n📊 FINAL VALIDATION:');
            console.log(`   Result: ${result}`);
            console.log(`   Profit: ${profit}`);
            console.log(`   Order ID: ${orderId}`);
            console.log(`   Timestamp: ${orderInfo.close_time || new Date().toISOString()}`);
            console.log(`   Source: IQ_OPTION_API`);
            
            // Update order status
            order.status = 'COMPLETED';
            order.result = result;
            order.profit = profit;
            order.completionTime = new Date();
            order.duration = order.completionTime - order.timestamp;
            
            // Record trade in risk manager
            const tradeResult = {
                pair: order.pair,
                direction: order.direction,
                amount: order.amount,
                result: result,
                profit: profit,
                orderId: orderId
            };
            
            riskManager.recordTrade(tradeResult);
            
            // Remove from active orders
            this.activeOrders.delete(orderId);
            
            logger.info('Order completed', {
                orderId,
                result,
                profit,
                status,
                duration: order.duration
            });
            
            // Update statistics
            this.updateStatistics(result, profit);
            
        } catch (error) {
            logger.error(`Failed to process order completion for ${orderId}`, error);
        }
    }

    async closeOrder(orderId) {
        try {
            if (!orderId) {
                throw new Error('Order ID is required');
            }
            
            logger.info(`Closing order: ${orderId}`);
            
            const result = await iqoptionAPI.sell(orderId);
            
            if (result.success) {
                logger.info(`Order ${orderId} closed successfully`);
                this.activeOrders.delete(orderId);
            } else {
                logger.error(`Failed to close order ${orderId}: ${result.message}`);
            }
            
            return result;
        } catch (error) {
            logger.error(`Failed to close order ${orderId}`, error);
            return { success: false, error: error.message };
        }
    }

    async closeAllOrders() {
        try {
            const orderIds = Array.from(this.activeOrders.keys());
            
            if (orderIds.length === 0) {
                logger.info('No active orders to close');
                return [];
            }
            
            logger.info(`Closing all active orders (${orderIds.length} orders)`);
            
            const closePromises = [];
            for (const orderId of orderIds) {
                closePromises.push(this.closeOrder(orderId));
            }
            
            const results = await Promise.all(closePromises);
            const successful = results.filter(r => r.success).length;
            
            logger.info(`Closed ${successful}/${orderIds.length} orders successfully`);
            
            return results;
        } catch (error) {
            logger.error('Close all orders failed', error);
            return [];
        }
    }

    getActiveOrders() {
        try {
            return Array.from(this.activeOrders.values()).map(order => ({
                ...order,
                duration: Date.now() - order.timestamp.getTime()
            }));
        } catch (error) {
            logger.error('Failed to get active orders', error);
            return [];
        }
    }

    getExecutionStats() {
        try {
            const totalOrders = this.executionHistory.length;
            const activeOrders = this.activeOrders.size;
            const completedOrders = totalOrders - activeOrders;
            
            const recentOrders = this.executionHistory.slice(-100); // Last 100 orders
            const wins = recentOrders.filter(order => order.result === 'WIN').length;
            const losses = recentOrders.filter(order => order.result === 'LOSS').length;
            const winRate = completedOrders > 0 ? (wins / completedOrders) * 100 : 0;
            
            const totalProfit = recentOrders.reduce((sum, order) => sum + (order.profit || 0), 0);
            const avgProfit = completedOrders > 0 ? totalProfit / completedOrders : 0;
            
            return {
                totalOrders,
                activeOrders,
                completedOrders,
                wins,
                losses,
                winRate: Math.round(winRate * 100) / 100,
                totalProfit: Math.round(totalProfit * 100) / 100,
                avgProfit: Math.round(avgProfit * 100) / 100,
                recentOrders: recentOrders.length
            };
        } catch (error) {
            logger.error('Execution stats calculation failed', error);
            return null;
        }
    }

    getOrderHistory(limit = 100) {
        try {
            return this.executionHistory
                .slice(-limit)
                .reverse()
                .map(order => ({
                    id: order.id,
                    pair: order.pair,
                    direction: order.direction,
                    amount: order.amount,
                    result: order.result,
                    profit: order.profit,
                    strategy: order.strategy,
                    confidence: order.confidence,
                    score: order.score,
                    timestamp: order.timestamp,
                    duration: order.duration
                }));
        } catch (error) {
            logger.error('Order history retrieval failed', error);
            return [];
        }
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Cleanup all timers and intervals - prevents memory leaks
     */
    cleanup() {
        try {
            // Clear any pending intervals in active orders
            this.activeOrders.forEach(order => {
                if (order.checkInterval) {
                    clearInterval(order.checkInterval);
                }
            });
            this.activeOrders.clear();
            logger.info('Execution engine cleaned up');
        } catch (error) {
            logger.error('Execution engine cleanup failed', error);
        }
    }

    updateStatistics(result, profit) {
        try {
            // Update execution statistics
            this.stats.totalTrades = (this.stats.totalTrades || 0) + 1;
            
            if (result === 'WIN') {
                this.stats.wins = (this.stats.wins || 0) + 1;
                this.stats.totalProfit = (this.stats.totalProfit || 0) + profit;
            } else if (result === 'LOSS') {
                this.stats.losses = (this.stats.losses || 0) + 1;
                this.stats.totalLoss = (this.stats.totalLoss || 0) + Math.abs(profit);
            }
            
            // Calculate win rate
            this.stats.winRate = this.stats.totalTrades > 0 
                ? (this.stats.wins / this.stats.totalTrades) * 100 
                : 0;
            
            // Calculate net profit
            this.stats.netProfit = (this.stats.totalProfit || 0) - (this.stats.totalLoss || 0);
            
            logger.debug('Statistics updated', {
                totalTrades: this.stats.totalTrades,
                wins: this.stats.wins,
                losses: this.stats.losses,
                winRate: this.stats.winRate.toFixed(2) + '%',
                netProfit: this.stats.netProfit
            });
            
        } catch (error) {
            logger.error('Failed to update statistics', error);
        }
    }

    async testExecution(pair = 'EURUSD', amount = 1) {
        try {
            logger.info('Testing execution engine');
            
            const testSignal = {
                pair: pair,
                direction: 'CALL',
                amount: amount,
                confidence: 75,
                score: 3.5,
                strategy: 'TEST'
            };
            
            const result = await this.executeTrade(testSignal);
            
            logger.info('Execution test completed', result);
            return result;
        } catch (error) {
            logger.error('Execution test failed', error);
            return { success: false, error: error.message };
        }
    }

    reset() {
        try {
            this.activeOrders.clear();
            this.executionHistory = [];
            logger.info('Execution engine reset');
        } catch (error) {
            logger.error('Execution engine reset failed', error);
        }
    }
}

module.exports = new ExecutionEngine();
