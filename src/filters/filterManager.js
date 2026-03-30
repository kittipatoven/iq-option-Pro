/**
 * UNIFIED FILTER MANAGER
 * Combines all filter systems: News, Time, Volatility, Multi-Timeframe
 * 
 * Usage:
 *   const filters = new FilterManager();
 *   const result = await filters.checkAll(pair, candles, api);
 *   if (result.allow) { executeTrade(); }
 */

const logger = require('../utils/logger');
const newsFilter = require('./newsFilter');
const timeFilter = require('./timeFilter');
const volatilityFilter = require('./volatilityFilter');
const mtfFilter = require('./mtfFilter');

class FilterManager {
    constructor() {
        this.name = 'FilterManager';
        
        // Individual filters
        this.news = newsFilter;
        this.time = timeFilter;
        this.volatility = volatilityFilter;
        this.mtf = mtfFilter;
        
        // Configuration
        this.config = {
            newsEnabled: true,
            timeEnabled: true,
            volatilityEnabled: true,
            mtfEnabled: false,  // MTF requires more API calls, disabled by default
            minConfidence: 60   // Minimum confidence to allow trading
        };
        
        // Statistics
        this.stats = {
            totalChecks: 0,
            passed: 0,
            blocked: 0,
            byReason: {}
        };
    }

    /**
     * Initialize all filters
     */
    async initialize() {
        logger.info('Initializing Filter Manager...');
        
        try {
            await this.news.initialize();
            logger.info('✅ News Filter initialized');
        } catch (error) {
            logger.error('News Filter initialization failed', error);
        }
        
        logger.info('✅ Filter Manager initialized');
        return true;
    }

    /**
     * Check all filters - Main entry point
     * @param {string} pair - Trading pair
     * @param {Array} candles - Candle data
     * @param {Object} api - API instance for MTF
     * @param {string} direction - Trade direction ('CALL' or 'PUT')
     * @returns {Object} Filter result
     */
    async checkAll(pair, candles, api = null, direction = null) {
        this.stats.totalChecks++;
        
        const startTime = Date.now();
        const results = {
            allow: true,
            confidence: 100,
            reasons: [],
            details: {}
        };

        try {
            // 1. News Filter (highest priority)
            if (this.config.newsEnabled) {
                const newsResult = await this.checkNews(pair);
                results.details.news = newsResult;
                
                if (!newsResult.allow) {
                    results.allow = false;
                    results.reasons.push(newsResult.reason);
                    results.confidence = 0;
                    this.recordBlock('news');
                    return this.finalizeResult(results, startTime);
                }
                
                results.confidence = Math.min(results.confidence, newsResult.confidence);
            }

            // 2. Time Filter
            if (this.config.timeEnabled) {
                const timeResult = this.checkTime(pair);
                results.details.time = timeResult;
                
                if (!timeResult.allow) {
                    results.allow = false;
                    results.reasons.push(timeResult.reason);
                    results.confidence = 0;
                    this.recordBlock('time');
                    return this.finalizeResult(results, startTime);
                }
                
                results.confidence = Math.min(results.confidence, timeResult.confidence);
            }

            // 3. Volatility Filter
            if (this.config.volatilityEnabled && candles) {
                const volResult = this.checkVolatility(candles);
                results.details.volatility = volResult;
                
                if (!volResult.allow) {
                    results.allow = false;
                    results.reasons.push(volResult.reason);
                    results.confidence = Math.min(results.confidence, volResult.confidence);
                    this.recordBlock('volatility');
                    // Don't return immediately - continue to gather all info
                }
                
                results.confidence = Math.min(results.confidence, volResult.confidence);
            }

            // 4. Multi-Timeframe Filter (if enabled and API available)
            if (this.config.mtfEnabled && api && pair) {
                try {
                    const mtfResult = await this.checkMTF(pair, api, direction);
                    results.details.mtf = mtfResult;
                    
                    if (!mtfResult.allow) {
                        results.allow = false;
                        results.reasons.push(mtfResult.reason);
                        results.confidence = Math.min(results.confidence, mtfResult.confidence);
                        this.recordBlock('mtf');
                    }
                    
                    results.confidence = Math.min(results.confidence, mtfResult.confidence);
                } catch (mtfError) {
                    logger.warn('MTF filter check failed', mtfError);
                    results.details.mtf = { error: mtfError.message };
                }
            }

            // Final confidence check
            if (results.confidence < this.config.minConfidence) {
                results.allow = false;
                results.reasons.push(`Confidence ${results.confidence}% below minimum ${this.config.minConfidence}%`);
                this.recordBlock('low_confidence');
            }

            if (results.allow) {
                this.stats.passed++;
            } else {
                this.stats.blocked++;
            }

            return this.finalizeResult(results, startTime);
            
        } catch (error) {
            logger.error('Filter check error', error);
            return {
                allow: false,
                confidence: 0,
                reasons: [`Filter error: ${error.message}`],
                details: results.details,
                duration: Date.now() - startTime
            };
        }
    }

    /**
     * Check news filter
     */
    async checkNews(pair) {
        try {
            const result = await this.news.shouldStopTrading(pair);
            
            return {
                allow: !result.shouldStop,
                reason: result.reason,
                confidence: result.shouldStop ? 0 : 100,
                eventTime: result.eventTime,
                timeUntil: result.timeUntil,
                currency: result.currency
            };
        } catch (error) {
            logger.error('News filter check failed', error);
            return { allow: true, reason: null, confidence: 100, error: error.message };
        }
    }

    /**
     * Check time filter
     */
    checkTime(pair) {
        try {
            const result = this.time.shouldAllowTrading(pair);
            
            return {
                allow: result.allow,
                reason: result.reasons?.[0] || null,
                confidence: result.confidence,
                activeSessions: result.timeData?.activeSessions || [],
                currentTime: result.timeData?.currentTime
            };
        } catch (error) {
            logger.error('Time filter check failed', error);
            return { allow: true, reason: null, confidence: 100, error: error.message };
        }
    }

    /**
     * Check volatility filter
     */
    checkVolatility(candles) {
        try {
            const result = this.volatility.shouldAllowTrading(candles);
            
            return {
                allow: result.allow,
                reason: result.reasons?.[0] || null,
                confidence: result.confidence,
                regime: result.regime,
                volatility: result.volatilityData?.volatility?.volatility,
                atrPercent: result.volatilityData?.atr?.atrPercent
            };
        } catch (error) {
            logger.error('Volatility filter check failed', error);
            return { allow: true, reason: null, confidence: 100, error: error.message };
        }
    }

    /**
     * Check multi-timeframe filter
     */
    async checkMTF(pair, api, direction) {
        try {
            const analysis = await this.mtf.analyzeMultiTimeframe(pair, api, ['M5', 'M15']);
            const entryCheck = this.mtf.shouldAllowEntry(analysis, direction);
            
            return {
                allow: entryCheck.allow,
                reason: entryCheck.reason,
                confidence: entryCheck.confidence || 50,
                alignment: analysis.alignment,
                recommendation: analysis.recommendation
            };
        } catch (error) {
            logger.error('MTF filter check failed', error);
            return { allow: true, reason: null, confidence: 100, error: error.message };
        }
    }

    /**
     * Finalize filter result
     */
    finalizeResult(results, startTime) {
        results.duration = Date.now() - startTime;
        results.timestamp = new Date().toISOString();
        
        // Log result
        if (results.allow) {
            logger.debug('All filters passed', { 
                confidence: results.confidence,
                duration: results.duration 
            });
        } else {
            logger.info('Trade blocked by filter', { 
                reasons: results.reasons,
                confidence: results.confidence 
            });
        }
        
        return results;
    }

    /**
     * Record block reason for statistics
     */
    recordBlock(reason) {
        this.stats.byReason[reason] = (this.stats.byReason[reason] || 0) + 1;
    }

    /**
     * Quick check - News only (lightweight)
     */
    async quickCheck(pair) {
        const newsResult = await this.checkNews(pair);
        const timeResult = this.checkTime(pair);
        
        return {
            allow: newsResult.allow && timeResult.allow,
            confidence: Math.min(newsResult.confidence, timeResult.confidence),
            reasons: [
                ...(newsResult.reason ? [newsResult.reason] : []),
                ...(timeResult.reason ? [timeResult.reason] : [])
            ],
            details: {
                news: newsResult,
                time: timeResult
            }
        };
    }

    /**
     * Get filter status summary
     */
    getStatus() {
        return {
            config: this.config,
            stats: this.stats,
            news: this.news.getStatus(),
            time: {
                timezone: this.time.timezone,
                activeSessions: this.time.getActiveSessions()
            },
            volatility: {
                minVolatility: this.volatility.minVolatility,
                maxVolatility: this.volatility.maxVolatility
            }
        };
    }

    /**
     * Get statistics
     */
    getStats() {
        const passRate = this.stats.totalChecks > 0 
            ? (this.stats.passed / this.stats.totalChecks * 100).toFixed(1) 
            : 0;
            
        return {
            ...this.stats,
            passRate: `${passRate}%`
        };
    }

    /**
     * Reset statistics
     */
    resetStats() {
        this.stats = {
            totalChecks: 0,
            passed: 0,
            blocked: 0,
            byReason: {}
        };
    }

    /**
     * Update configuration
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        logger.info('Filter Manager config updated', this.config);
    }

    /**
     * Enable/disable specific filters
     */
    enable(filterName, enabled = true) {
        if (this.config.hasOwnProperty(`${filterName}Enabled`)) {
            this.config[`${filterName}Enabled`] = enabled;
            logger.info(`${filterName} filter ${enabled ? 'enabled' : 'disabled'}`);
        }
    }
}

// Export singleton instance
module.exports = new FilterManager();
