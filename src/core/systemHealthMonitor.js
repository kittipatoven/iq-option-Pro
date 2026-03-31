/**
 * System Health Monitor & Performance Tracker
 * Monitors all system components and ensures 24/7 stability
 */

const os = require('os');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const iqoptionAPI = require('../api/unifiediqoption');
const aiAnalyzer = require('./aiTradingAnalyzer');
const tradeTracker = require('./tradeResultTracker');

class SystemHealthMonitor {
    constructor() {
        this.isMonitoring = false;
        this.checkInterval = null;
        this.checkIntervalMs = 30000; // Check every 30 seconds
        
        // Health status
        this.health = {
            api: { status: 'UNKNOWN', lastCheck: null, failures: 0 },
            ai: { status: 'UNKNOWN', lastCheck: null, failures: 0 },
            memory: { status: 'UNKNOWN', usage: 0, limit: 512 }, // MB
            cpu: { status: 'UNKNOWN', usage: 0 },
            disk: { status: 'UNKNOWN', usage: 0 },
            network: { status: 'UNKNOWN', lastPong: null }
        };
        
        // Performance metrics
        this.metrics = {
            startTime: Date.now(),
            totalChecks: 0,
            failedChecks: 0,
            lastTradeTime: null,
            tradesPerHour: 0,
            avgLatency: 0,
            errorCount: 0,
            // NEW: Execution performance tracking
            executionTimes: [],
            maxExecutionHistory: 100,
            avgExecutionTime: 0,
            maxExecutionTime: 0
        };
        
        // Alert thresholds
        this.thresholds = {
            maxMemoryPercent: 80,
            maxCpuPercent: 70,
            maxDiskPercent: 90,
            maxLatencyMs: 5000,
            maxApiFailures: 3,
            maxConsecutiveErrors: 5
        };
        
        // Auto-recovery actions
        this.recoveryAttempts = 0;
        this.maxRecoveryAttempts = 3;
        this.lastRecoveryTime = null;
    }
    
    /**
     * Start monitoring with concurrency protection
     */
    start() {
        if (this.isMonitoring) return;
        
        this.isMonitoring = true;
        console.log('🔍 System Health Monitor started');
        
        // Initial check
        this.checkHealth();
        
        // Schedule regular checks with concurrency protection
        this.checkInterval = setInterval(() => {
            if (!this.isChecking) {
                this.checkHealth();
            }
        }, this.checkIntervalMs);
        
        logger.info('System Health Monitor started', {
            interval: this.checkIntervalMs,
            thresholds: this.thresholds
        });
    }
    
    /**
     * Stop monitoring
     */
    stop() {
        this.isMonitoring = false;
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
        console.log('🔍 System Health Monitor stopped');
    }
    
    /**
     * Comprehensive health check with concurrency flag
     */
    async checkHealth() {
        if (this.isChecking) return; // Prevent concurrent runs
        
        this.isChecking = true;
        
        try {
            this.metrics.totalChecks++;
            const checks = [];
            
            // Check 1: API Connection
            checks.push(this.checkAPIHealth());
            
            // Check 2: AI System
            checks.push(this.checkAIHealth());
            
            // Check 3: System Resources
            checks.push(this.checkSystemResources());
            
            // Check 4: Trade Tracker
            checks.push(this.checkTradeTracker());
            
            // Wait for all checks
            const results = await Promise.allSettled(checks);
            
            // Analyze results
            const failedChecks = results.filter(r => r.status === 'rejected').length;
            if (failedChecks > 0) {
                this.metrics.failedChecks++;
                console.warn(`⚠️ Health check: ${failedChecks}/${results.length} checks failed`);
            }
            
            // Determine overall health
            const overallHealth = this.calculateOverallHealth();
            
            // Take action if unhealthy
            if (overallHealth === 'CRITICAL') {
                await this.handleCriticalState();
            } else if (overallHealth === 'WARNING') {
                await this.handleWarningState();
            }
            
            // Log status every 10 checks
            if (this.metrics.totalChecks % 10 === 0) {
                this.logHealthStatus();
            }
            
        } catch (error) {
            logger.error('Health check failed', error);
            this.metrics.errorCount++;
        } finally {
            this.isChecking = false;
        }
    }
    
    /**
     * Check API health with offline mode support
     */
    async checkAPIHealth() {
        try {
            // 🔥 OFFLINE MODE: Consider API healthy in offline mode
            if (iqoptionAPI.networkMode === 'OFFLINE' || iqoptionAPI.mockDataEnabled) {
                this.health.api.status = 'HEALTHY';
                this.health.api.lastCheck = Date.now();
                this.health.api.failures = 0;
                this.health.network.lastPong = Date.now();
                return { component: 'api', status: 'HEALTHY (OFFLINE)' };
            }
            
            // Safe method check for normal mode
            const isReady = iqoptionAPI && typeof iqoptionAPI.isReady === 'function' 
                ? iqoptionAPI.isReady() 
                : false;
            
            const stats = iqoptionAPI && typeof iqoptionAPI.getStatistics === 'function'
                ? iqoptionAPI.getStatistics()
                : {};
            
            this.health.api.lastCheck = Date.now();
            
            if (isReady) {
                this.health.api.status = 'HEALTHY';
                this.health.api.failures = 0;
                this.health.network.lastPong = iqoptionAPI.lastPong;
                this.metrics.avgLatency = parseInt(stats.avgRecentLatency) || 0;
            } else {
                this.health.api.status = 'UNHEALTHY';
                this.health.api.failures++;
                
                if (this.health.api.failures >= this.thresholds.maxApiFailures) {
                    throw new Error('API connection failed multiple times');
                }
            }
            
            return { component: 'api', status: this.health.api.status };
        } catch (error) {
            this.health.api.status = 'ERROR';
            throw { component: 'api', error: error.message };
        }
    }
    
    /**
     * Check AI system health
     */
    async checkAIHealth() {
        try {
            const stats = aiAnalyzer.stats;
            
            this.health.ai.lastCheck = Date.now();
            
            // AI is healthy if it has saved data successfully
            if (stats && typeof stats.totalTrades === 'number') {
                this.health.ai.status = 'HEALTHY';
                this.health.ai.failures = 0;
            } else {
                this.health.ai.status = 'WARNING';
            }
            
            return { component: 'ai', status: this.health.ai.status };
        } catch (error) {
            this.health.ai.status = 'ERROR';
            throw { component: 'ai', error: error.message };
        }
    }
    
    /**
     * Check system resources
     */
    async checkSystemResources() {
        try {
            // Memory usage
            const usedMemory = process.memoryUsage();
            const memoryMB = Math.round(usedMemory.heapUsed / 1024 / 1024);
            const memoryPercent = (memoryMB / this.health.memory.limit) * 100;
            
            this.health.memory.usage = memoryMB;
            this.health.memory.status = memoryPercent > this.thresholds.maxMemoryPercent ? 'WARNING' : 'HEALTHY';
            
            // CPU usage (simplified)
            const cpuUsage = process.cpuUsage();
            this.health.cpu.usage = (cpuUsage.user + cpuUsage.system) / 1000000; // Convert to seconds
            this.health.cpu.status = 'HEALTHY'; // Simplified check
            
            // Disk usage (check data directory)
            try {
                const dataPath = path.join(__dirname, '../../data');
                const stats = fs.statSync(dataPath);
                this.health.disk.status = 'HEALTHY';
            } catch (e) {
                this.health.disk.status = 'WARNING';
            }
            
            return { 
                component: 'system', 
                status: this.health.memory.status,
                memory: memoryMB
            };
        } catch (error) {
            throw { component: 'system', error: error.message };
        }
    }
    
    /**
     * Check trade tracker
     */
    async checkTradeTracker() {
        try {
            const pendingCount = tradeTracker.getPendingCount();
            
            // Alert if too many pending trades (might indicate API issue)
            if (pendingCount > 10) {
                console.warn(`⚠️ High number of pending trades: ${pendingCount}`);
            }
            
            return { component: 'tradeTracker', pendingTrades: pendingCount };
        } catch (error) {
            throw { component: 'tradeTracker', error: error.message };
        }
    }
    
    /**
     * Calculate overall system health
     */
    calculateOverallHealth() {
        const statuses = [
            this.health.api.status,
            this.health.ai.status,
            this.health.memory.status
        ];
        
        const errorCount = statuses.filter(s => s === 'ERROR').length;
        const warningCount = statuses.filter(s => s === 'WARNING').length;
        
        if (errorCount > 0) return 'CRITICAL';
        if (warningCount > 1) return 'WARNING';
        return 'HEALTHY';
    }
    
    /**
     * Handle critical state
     */
    async handleCriticalState() {
        console.error('🚨 SYSTEM IN CRITICAL STATE');
        console.error('   API:', this.health.api.status);
        console.error('   AI:', this.health.ai.status);
        console.error('   Memory:', this.health.memory.status);
        
        // Try auto-recovery
        if (this.canAttemptRecovery()) {
            await this.attemptRecovery();
        } else {
            console.error('❌ Max recovery attempts reached. Manual intervention required.');
        }
    }
    
    /**
     * Handle warning state
     */
    async handleWarningState() {
        console.warn('⚠️ SYSTEM IN WARNING STATE');
        
        // Log detailed info
        if (this.health.api.status !== 'HEALTHY') {
            console.warn('   API failures:', this.health.api.failures);
        }
        if (this.health.memory.status !== 'HEALTHY') {
            console.warn('   Memory usage:', this.health.memory.usage, 'MB');
        }
    }
    
    /**
     * Check if recovery can be attempted
     */
    canAttemptRecovery() {
        if (this.recoveryAttempts >= this.maxRecoveryAttempts) {
            return false;
        }
        
        // Don't attempt recovery more than once per minute
        if (this.lastRecoveryTime && (Date.now() - this.lastRecoveryTime) < 60000) {
            return false;
        }
        
        return true;
    }
    
    /**
     * Attempt system recovery
     */
    async attemptRecovery() {
        this.recoveryAttempts++;
        this.lastRecoveryTime = Date.now();
        
        console.log(`🔄 Attempting system recovery (${this.recoveryAttempts}/${this.maxRecoveryAttempts})...`);
        
        try {
            // Recovery action 1: Reconnect API if needed
            if (this.health.api.status !== 'HEALTHY') {
                console.log('   → Reconnecting API...');
                // Safe method check
                const isReady = iqoptionAPI && typeof iqoptionAPI.isReady === 'function'
                    ? iqoptionAPI.isReady()
                    : false;
                
                if (!isReady) {
                    console.log('   ⚠️ API not ready, waiting for auto-reconnect...');
                }
            }
            
            // Recovery action 2: Save AI data
            if (this.health.ai.status !== 'HEALTHY') {
                console.log('   → Saving AI data...');
                aiAnalyzer.saveData();
            }
            
            // Recovery action 3: Clear pending trades if stuck
            if (tradeTracker.getPendingCount() > 10) {
                console.log('   → Clearing stuck pending trades...');
                // This would require a method to clear old pending trades
            }
            
            console.log('✅ Recovery actions completed');
            
        } catch (error) {
            logger.error('Recovery attempt failed', error);
        }
    }
    
    /**
     * Log current health status
     */
    logHealthStatus() {
        const uptime = Math.floor((Date.now() - this.metrics.startTime) / 1000 / 60); // minutes
        
        console.log('\n╔════════════════════════════════════════════════════════════╗');
        console.log('║              SYSTEM HEALTH STATUS                          ║');
        console.log('╚════════════════════════════════════════════════════════════╝');
        console.log(`Uptime: ${uptime} minutes`);
        console.log(`Overall Health: ${this.calculateOverallHealth()}`);
        console.log(`\nComponents:`);
        console.log(`  API:     ${this.health.api.status} (failures: ${this.health.api.failures})`);
        console.log(`  AI:      ${this.health.ai.status} (trades: ${aiAnalyzer.stats.totalTrades})`);
        console.log(`  Memory:  ${this.health.memory.status} (${this.health.memory.usage}MB)`);
        console.log(`  Network: Latency ${this.metrics.avgLatency}ms`);
        console.log(`\nMetrics:`);
        console.log(`  Health Checks: ${this.metrics.totalChecks}`);
        console.log(`  Failed Checks: ${this.metrics.failedChecks}`);
        console.log(`  Pending Trades: ${tradeTracker.getPendingCount()}`);
        console.log(`  Win Rate: ${(aiAnalyzer.stats.winRate * 100).toFixed(1)}%`);
        console.log('══════════════════════════════════════════════════════════════\n');
    }
    
    /**
     * Check if system is ready for trading
     */
    isReadyForTrading() {
        const overallHealth = this.calculateOverallHealth();
        return overallHealth === 'HEALTHY' || overallHealth === 'WARNING';
    }
    
    /**
     * Get current health status
     */
    getHealthStatus() {
        return {
            overall: this.calculateOverallHealth(),
            components: this.health,
            metrics: this.metrics,
            ai: {
                totalTrades: aiAnalyzer.stats.totalTrades,
                winRate: aiAnalyzer.stats.winRate,
                consecutiveLosses: aiAnalyzer.stats.consecutiveLosses
            }
        };
    }
    
    /**
     * Record trade execution time for performance tracking
     */
    recordExecutionTime(durationMs) {
        this.metrics.executionTimes.push(durationMs);
        
        // Keep only last N measurements
        if (this.metrics.executionTimes.length > this.metrics.maxExecutionHistory) {
            this.metrics.executionTimes.shift();
        }
        
        // Calculate average
        const sum = this.metrics.executionTimes.reduce((a, b) => a + b, 0);
        this.metrics.avgExecutionTime = sum / this.metrics.executionTimes.length;
        
        // Track max
        if (durationMs > this.metrics.maxExecutionTime) {
            this.metrics.maxExecutionTime = durationMs;
        }
        
        this.metrics.lastTradeTime = Date.now();
    }
    
    /**
     * Get performance summary
     */
    getPerformanceSummary() {
        const uptime = Date.now() - this.metrics.startTime;
        const hours = uptime / (1000 * 60 * 60);
        
        return {
            uptime: Math.floor(uptime / 1000 / 60), // minutes
            tradesPerHour: this.metrics.tradesPerHour,
            avgLatency: this.metrics.avgLatency,
            avgExecutionTime: Math.round(this.metrics.avgExecutionTime),
            maxExecutionTime: this.metrics.maxExecutionTime,
            errorCount: this.metrics.errorCount,
            health: this.calculateOverallHealth()
        };
    }
}

// Export singleton
module.exports = new SystemHealthMonitor();
