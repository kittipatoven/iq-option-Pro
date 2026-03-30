const fs = require('fs');
const path = require('path');
const { HttpsProxyAgent } = require('https-proxy-agent');
const https = require('https');

/**
 * ProxyManager - Intelligent Proxy Rotation System
 * จัดการ Proxy Pool พร้อม Health Check และ Auto-Rotation
 */
class ProxyManager {
    constructor(options = {}) {
        this.proxyFile = options.proxyFile || path.join(process.cwd(), 'proxies.txt');
        this.proxies = [];
        this.currentIndex = 0;
        this.failedProxies = new Map(); // Track failed proxies with timestamp
        this.proxyTimeout = options.proxyTimeout || 30000;
        this.healthCheckTimeout = options.healthCheckTimeout || 10000;
        this.maxFailures = options.maxFailures || 3;
        this.cooldownPeriod = options.cooldownPeriod || 300000; // 5 minutes
        
        // Connection state
        this.state = 'IDLE'; // IDLE, CONNECTING, CONNECTED, FAILED, RECONNECTING
        this.currentProxy = null;
        this.lastSwitchTime = null;
        
        // Statistics
        this.stats = {
            totalSwitches: 0,
            failedAttempts: 0,
            successfulConnections: 0,
            lastError: null
        };
        
        this.loadProxies();
    }
    
    /**
     * Load proxies from file and environment
     */
    loadProxies() {
        console.log('🔥 [PROXY] Loading proxy pool...');
        
        // 1. Load from file
        if (fs.existsSync(this.proxyFile)) {
            const content = fs.readFileSync(this.proxyFile, 'utf8');
            const fileProxies = content
                .split('\n')
                .map(line => line.trim())
                .filter(line => line && !line.startsWith('#'));
            
            this.proxies.push(...fileProxies);
            console.log(`   📁 Loaded ${fileProxies.length} proxies from file`);
        }
        
        // 2. Load from environment
        const envProxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
        if (envProxy && !this.proxies.includes(envProxy)) {
            this.proxies.push(envProxy);
            console.log(`   🌐 Loaded proxy from environment: ${envProxy}`);
        }
        
        // 3. Add default localhost proxies (if user has local proxy running)
        const defaultProxies = [
            'http://127.0.0.1:7890',   // Clash
            'http://127.0.0.1:8080',   // Common HTTP
            'http://127.0.0.1:1080',   // SOCKS
            'http://127.0.0.1:10808',  // Clash default
            'socks5://127.0.0.1:1080'  // SOCKS5
        ];
        
        defaultProxies.forEach(proxy => {
            if (!this.proxies.includes(proxy)) {
                this.proxies.push(proxy);
            }
        });
        
        console.log(`   📊 Total proxies in pool: ${this.proxies.length}`);
        
        if (this.proxies.length === 0) {
            console.warn('⚠️ [PROXY] No proxies configured! Connection may fail if IP is blocked.');
        }
    }
    
    /**
     * Get next available proxy (with rotation)
     */
    getNextProxy() {
        if (this.proxies.length === 0) {
            return null;
        }
        
        // Find next working proxy
        let attempts = 0;
        let proxy = null;
        
        while (attempts < this.proxies.length) {
            this.currentIndex = (this.currentIndex + 1) % this.proxies.length;
            const candidate = this.proxies[this.currentIndex];
            
            // Check if proxy is in cooldown
            if (!this.isProxyFailed(candidate)) {
                proxy = candidate;
                break;
            }
            
            attempts++;
        }
        
        if (!proxy) {
            // All proxies failed, reset and try again
            console.warn('⚠️ [PROXY] All proxies in cooldown, resetting...');
            this.failedProxies.clear();
            proxy = this.proxies[0];
            this.currentIndex = 0;
        }
        
        this.currentProxy = proxy;
        this.lastSwitchTime = Date.now();
        this.stats.totalSwitches++;
        
        console.log(`🌐 [PROXY] Switched to: ${proxy}`);
        this.state = 'RECONNECTING';
        
        return proxy;
    }
    
    /**
     * Get current proxy
     */
    getCurrentProxy() {
        if (!this.currentProxy) {
            return this.getNextProxy();
        }
        return this.currentProxy;
    }
    
    /**
     * Create HTTPS agent from current proxy
     */
    createProxyAgent() {
        const proxy = this.getCurrentProxy();
        if (!proxy) {
            return null;
        }
        
        try {
            const agent = new HttpsProxyAgent(proxy);
            console.log(`🌐 [PROXY] Created agent for: ${proxy}`);
            return agent;
        } catch (error) {
            console.error(`❌ [PROXY] Failed to create agent: ${error.message}`);
            this.markProxyFailed(proxy);
            return null;
        }
    }
    
    /**
     * Check if proxy is in failed/cooldown state
     */
    isProxyFailed(proxy) {
        if (!this.failedProxies.has(proxy)) {
            return false;
        }
        
        const failData = this.failedProxies.get(proxy);
        const elapsed = Date.now() - failData.lastFail;
        
        // If cooldown period passed, remove from failed list
        if (elapsed > this.cooldownPeriod) {
            this.failedProxies.delete(proxy);
            return false;
        }
        
        return true;
    }
    
    /**
     * Mark proxy as failed
     */
    markProxyFailed(proxy) {
        const existing = this.failedProxies.get(proxy) || { count: 0, lastFail: 0 };
        existing.count++;
        existing.lastFail = Date.now();
        
        this.failedProxies.set(proxy, existing);
        this.stats.failedAttempts++;
        this.stats.lastError = `Proxy failed: ${proxy}`;
        
        console.log(`❌ [PROXY] Marked as failed (${existing.count}/${this.maxFailures}): ${proxy}`);
        
        // If proxy failed too many times, remove it permanently
        if (existing.count >= this.maxFailures) {
            console.warn(`🗑️ [PROXY] Removing permanently: ${proxy}`);
            const index = this.proxies.indexOf(proxy);
            if (index > -1) {
                this.proxies.splice(index, 1);
            }
        }
    }
    
    /**
     * Mark current proxy as successful
     */
    markProxySuccess() {
        if (this.currentProxy && this.failedProxies.has(this.currentProxy)) {
            this.failedProxies.delete(this.currentProxy);
            console.log(`✅ [PROXY] Restored: ${this.currentProxy}`);
        }
        
        this.stats.successfulConnections++;
        this.state = 'CONNECTED';
    }
    
    /**
     * Health check proxy before using
     */
    async healthCheckProxy(proxy) {
        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                resolve(false);
            }, this.healthCheckTimeout);
            
            try {
                const agent = new HttpsProxyAgent(proxy);
                
                https.get('https://iqoption.com', { agent }, (res) => {
                    clearTimeout(timeout);
                    const success = res.statusCode === 200 || res.statusCode === 301 || res.statusCode === 302;
                    resolve(success);
                }).on('error', (err) => {
                    clearTimeout(timeout);
                    resolve(false);
                });
            } catch (error) {
                clearTimeout(timeout);
                resolve(false);
            }
        });
    }
    
    /**
     * Find first working proxy (health check all)
     */
    async findWorkingProxy() {
        console.log('🔍 [PROXY] Health checking all proxies...');
        
        for (let i = 0; i < this.proxies.length; i++) {
            const proxy = this.proxies[i];
            
            if (this.isProxyFailed(proxy)) {
                console.log(`   ⏭️ Skipping (in cooldown): ${proxy}`);
                continue;
            }
            
            process.stdout.write(`   🧪 Testing ${proxy}... `);
            const working = await this.healthCheckProxy(proxy);
            
            if (working) {
                console.log('✅ WORKING');
                this.currentProxy = proxy;
                this.currentIndex = i;
                this.state = 'CONNECTED';
                return proxy;
            } else {
                console.log('❌ FAILED');
                this.markProxyFailed(proxy);
            }
        }
        
        return null;
    }
    
    /**
     * Get proxy statistics
     */
    getStats() {
        return {
            ...this.stats,
            totalProxies: this.proxies.length,
            failedProxies: this.failedProxies.size,
            currentProxy: this.currentProxy,
            state: this.state
        };
    }
    
    /**
     * Print statistics
     */
    printStats() {
        const stats = this.getStats();
        console.log('\n📊 [PROXY STATS]');
        console.log('='.repeat(50));
        console.log(`Total Proxies: ${stats.totalProxies}`);
        console.log(`Failed/Cooldown: ${stats.failedProxies}`);
        console.log(`Successful Connections: ${stats.successfulConnections}`);
        console.log(`Failed Attempts: ${stats.failedAttempts}`);
        console.log(`Total Switches: ${stats.totalSwitches}`);
        console.log(`Current State: ${stats.state}`);
        console.log(`Current Proxy: ${stats.currentProxy || 'NONE'}`);
        if (stats.lastError) {
            console.log(`Last Error: ${stats.lastError}`);
        }
        console.log('='.repeat(50));
    }
    
    /**
     * Force switch to next proxy
     */
    forceSwitch() {
        if (this.currentProxy) {
            this.markProxyFailed(this.currentProxy);
        }
        return this.getNextProxy();
    }
    
    /**
     * Check if we need to switch (after error)
     */
    shouldSwitchAfterError() {
        // Always switch after connection error
        return true;
    }
}

module.exports = ProxyManager;
