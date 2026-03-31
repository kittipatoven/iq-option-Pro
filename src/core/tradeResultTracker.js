/**
 * Trade Result Tracker
 * Tracks trade outcomes and updates AI analyzer with real results
 */

const iqoptionAPI = require('../api/unifiediqoption');
const aiAnalyzer = require('./aiTradingAnalyzer');
const logger = require('../utils/logger');

class TradeResultTracker {
    constructor() {
        this.pendingTrades = new Map(); // orderId -> tradeInfo
        this.checkInterval = null;
        this.isTracking = false;
    }
    
    /**
     * Start tracking trade results - OPTIMIZED with faster polling
     */
    start() {
        if (this.isTracking) return;
        
        this.isTracking = true;
        // OPTIMIZED: Reduced from 5000ms to 2000ms for faster result detection
        this.checkInterval = setInterval(() => this.checkPendingTrades(), 2000);
        console.log('📊 Trade Result Tracker started (2s interval)');
    }
    
    /**
     * Stop tracking
     */
    stop() {
        this.isTracking = false;
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
    }
    
    /**
     * Register a new trade for tracking
     */
    registerTrade(orderId, tradeInfo) {
        this.pendingTrades.set(orderId, {
            ...tradeInfo,
            orderId,
            registeredAt: Date.now(),
            checks: 0
        });
        console.log(`📋 Registered trade #${orderId} for result tracking`);
    }
    
    /**
     * Check all pending trades for results with error recovery
     */
    async checkPendingTrades() {
        if (!this.isTracking || this.pendingTrades.size === 0) return;
        
        // Create array copy to avoid modification during iteration
        const entries = Array.from(this.pendingTrades.entries());
        
        for (const [orderId, tradeInfo] of entries) {
            // Skip if no longer in map (might have been processed)
            if (!this.pendingTrades.has(orderId)) continue;
            
            try {
                // Skip if checked too many times (trade expired) - OPTIMIZED: reduced from 20 to 15
                if (tradeInfo.checks > 15) {
                    console.log(`⏰ Trade #${orderId} expired, removing from tracking`);
                    this.pendingTrades.delete(orderId);
                    continue;
                }
                
                // Increment check counter
                tradeInfo.checks = (tradeInfo.checks || 0) + 1;
                
                // Check result from API with timeout
                let result = null;
                try {
                    result = await Promise.race([
                        this.checkTradeResult(orderId),
                        new Promise((_, reject) => 
                            setTimeout(() => reject(new Error('Timeout')), 10000)
                        )
                    ]);
                } catch (checkError) {
                    logger.debug(`Trade result check failed for #${orderId}:`, checkError.message);
                    continue; // Try next trade
                }
                
                if (result && result.status && result.status !== 'pending') {
                    // We have a result!
                    const profit = result.profit !== undefined ? result.profit : 
                                  (result.status === 'win' ? 0.82 : -1.0);
                    
                    try {
                        // Update AI analyzer with actual result
                        aiAnalyzer.updateTradeResult(orderId, {
                            result: result.status,
                            profit: profit,
                            closePrice: result.closePrice,
                            closeTime: new Date()
                        });
                        
                        console.log(`✅ Trade #${orderId} result: ${result.status.toUpperCase()} $${profit}`);
                        
                        // Remove from pending
                        this.pendingTrades.delete(orderId);
                    } catch (updateError) {
                        logger.error(`Failed to update AI analyzer for #${orderId}:`, updateError);
                    }
                }
            } catch (error) {
                logger.error(`Failed to check trade #${orderId}`, error);
                // Don't let one trade failure stop checking others
            }
        }
    }
    
    /**
     * Check individual trade result with error handling
     */
    async checkTradeResult(orderId) {
        if (!orderId) {
            return { status: 'error', profit: 0 };
        }
        
        try {
            // Try to get from API with retry
            let orderInfo = null;
            let lastError = null;
            
            for (let attempt = 0; attempt < 2; attempt++) {
                try {
                    orderInfo = await iqoptionAPI.getOrderInfo(orderId);
                    if (orderInfo) break;
                } catch (e) {
                    lastError = e.message;
                    if (attempt === 0) {
                        await this.sleep(500); // Small delay before retry
                    }
                }
            }
            
            if (!orderInfo) {
                logger.debug(`No order info for #${orderId}:`, lastError);
                return { status: 'pending' };
            }
            
            // Determine status
            let status = 'pending';
            let profit = 0;
            
            const orderStatus = (orderInfo.status || '').toLowerCase();
            
            if (orderStatus === 'closed' || orderStatus === 'finished') {
                const pnl = orderInfo.profit || orderInfo.pnl || orderInfo.win_amount || 0;
                status = pnl > 0 ? 'win' : 'loss';
                profit = pnl;
            } else if (orderStatus === 'won' || orderStatus === 'win') {
                status = 'win';
                profit = orderInfo.profit || orderInfo.win_amount || 0.82;
            } else if (orderStatus === 'lost' || orderStatus === 'loss') {
                status = 'loss';
                profit = orderInfo.profit || -1.0;
            } else if (orderStatus === 'expired' || orderStatus === 'timeout') {
                status = 'loss';
                profit = orderInfo.profit || -1.0;
            } else if (orderStatus === 'canceled' || orderStatus === 'cancelled') {
                status = 'canceled';
                profit = 0;
            }
            
            return {
                status,
                profit,
                closePrice: orderInfo.closePrice || orderInfo.price,
                raw: orderInfo
            };
        } catch (error) {
            logger.debug(`Trade result check failed for #${orderId}:`, error.message);
            return { status: 'pending' };
        }
    }
    
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    /**
     * Get count of pending trades
     */
    getPendingCount() {
        return this.pendingTrades.size;
    }
    
    /**
     * Get all pending trades
     */
    getPendingTrades() {
        return Array.from(this.pendingTrades.values());
    }
}

// Export singleton
module.exports = new TradeResultTracker();
