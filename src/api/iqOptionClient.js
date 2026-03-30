/**
 * IQ Option API Client
 * Real-time WebSocket connection for live trading
 * 
 * Endpoint: wss://iqoption.com/echo/websocket
 */

const WebSocket = require('ws');
const EventEmitter = require('events');
const https = require('https');
const axios = require('axios');
const tough = require('tough-cookie');
const { HttpsProxyAgent } = require('https-proxy-agent');
const NetworkTester = require('../network/networkTester.js');
const ProxyManager = require('../network/proxyManager.js');

// SSL Agent for secure connection
const agent = new https.Agent({
    rejectUnauthorized: false,
    keepAlive: true,
    keepAliveMsecs: 30000
});

class IQOptionClient extends EventEmitter {
    constructor() {
        super();
        this.ws = null;
        this.connected = false;
        this.authenticated = false;
        this.email = null;
        this.password = null;
        this.ssid = null;
        this.messageId = 0;
        this.candles = new Map();
        this.subscriptions = new Map();
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 5000;
        this.heartbeatInterval = null;
        this.connectionTimeout = null;
        
        // Order tracking system - CRITICAL for accurate results
        this.orders = new Map();
        this.pendingResults = new Set();
        this.resultResolvers = new Map(); // Event-driven result resolution
        this.lastTradeTime = 0;
        this.minTradeInterval = 60000; // 60 seconds between trades
        
        // Account mode: 'DEMO' or 'REAL'
        this.accountMode = 'DEMO'; // Default to DEMO for safety
        this.balanceId = null;
        this.profileData = null;
        
        // Request-Response tracking system - CRITICAL for matching buyV2 responses
        this.pendingRequests = new Map(); // request_id -> { resolve, reject, timeout, name }
        
        // Cookie jar for session sharing between HTTP and WebSocket
        this.cookieJar = new tough.CookieJar();
        this.httpClient = axios.create({
            jar: this.cookieJar,
            withCredentials: true
        });
        
        // 🔥 ANTI-BLOCK: Proxy Manager for intelligent IP rotation
        this.proxyManager = new ProxyManager();
        this.connectionState = 'DISCONNECTED'; // DISCONNECTED, CONNECTING, CONNECTED, RECONNECTING, FAILED
        this.lastConnectionError = null;
        this.autoReconnectEnabled = true;
        this.maxProxySwitches = 10;
        this.proxySwitchCount = 0;
        
        // Rate limiting
        this.lastReconnectTime = 0;
        this.minReconnectInterval = 5000; // 5 seconds between reconnects
        this.reconnectBackoff = 1;
    }

    /**
     * 🔥 ANTI-BLOCK: Auto switch proxy on connection error
     */
    async handleConnectionError(error, context = '') {
        console.error(`❌ [ANTI-BLOCK] Connection error${context ? ` (${context})` : ''}: ${error.message}`);
        this.lastConnectionError = error.message;
        this.connectionState = 'FAILED';
        
        // Check if we should switch proxy
        const shouldSwitch = this.shouldSwitchProxy(error);
        
        if (shouldSwitch && this.proxySwitchCount < this.maxProxySwitches) {
            console.log(`🔄 [ANTI-BLOCK] Switching proxy (${this.proxySwitchCount + 1}/${this.maxProxySwitches})...`);
            
            // Mark current proxy as failed
            if (this.proxyManager.currentProxy) {
                this.proxyManager.markProxyFailed(this.proxyManager.currentProxy);
            }
            
            // Get next proxy
            const newProxy = this.proxyManager.getNextProxy();
            if (newProxy) {
                this.proxySwitchCount++;
                console.log(`✅ [ANTI-BLOCK] Switched to: ${newProxy}`);
                
                // Apply rate limiting
                await this.applyRateLimit();
                
                return { switched: true, proxy: newProxy };
            }
        }
        
        if (this.proxySwitchCount >= this.maxProxySwitches) {
            console.warn('⚠️ [ANTI-BLOCK] Max proxy switches reached. Falling back...');
            return { switched: false, reason: 'max_switches_reached' };
        }
        
        return { switched: false, reason: 'no_proxy_available' };
    }
    
    /**
     * 🔥 ANTI-BLOCK: Check if we should switch proxy based on error
     */
    shouldSwitchProxy(error) {
        const errorMessage = error.message || error.code || '';
        
        // Errors that indicate IP block
        const blockIndicators = [
            'timeout',
            'ETIMEDOUT',
            'ECONNREFUSED',
            'ECONNRESET',
            'ENOTFOUND',
            'actively rejecting',
            'blocked',
            'rate limit',
            '403',
            '401',
            '429'
        ];
        
        return blockIndicators.some(indicator => 
            errorMessage.toLowerCase().includes(indicator.toLowerCase())
        );
    }
    
    /**
     * 🔥 ANTI-BLOCK: Apply rate limiting to avoid being detected
     */
    async applyRateLimit() {
        const now = Date.now();
        const timeSinceLastReconnect = now - this.lastReconnectTime;
        
        // Calculate delay with exponential backoff
        const baseDelay = this.minReconnectInterval;
        const backoffDelay = baseDelay * this.reconnectBackoff;
        const jitter = Math.random() * 2000; // Add randomness
        const totalDelay = Math.max(0, backoffDelay - timeSinceLastReconnect) + jitter;
        
        if (totalDelay > 0) {
            console.log(`⏳ [ANTI-BLOCK] Rate limiting: waiting ${Math.round(totalDelay)}ms...`);
            await this.sleep(totalDelay);
        }
        
        this.lastReconnectTime = Date.now();
        this.reconnectBackoff = Math.min(this.reconnectBackoff * 1.5, 10); // Cap at 10x
        
        // Reset backoff on successful connection
        if (this.connectionState === 'CONNECTED') {
            this.reconnectBackoff = 1;
            this.proxySwitchCount = 0;
        }
    }
    
    /**
     * 🔥 ANTI-BLOCK: Auto recovery system
     */
    async autoRecover() {
        console.log('🔄 [ANTI-BLOCK] Starting auto recovery...');
        this.connectionState = 'RECONNECTING';
        
        const maxRecoveryAttempts = 10;
        let attempt = 0;
        
        while (attempt < maxRecoveryAttempts && this.autoReconnectEnabled) {
            attempt++;
            console.log(`\n🔄 [ANTI-BLOCK] Recovery attempt ${attempt}/${maxRecoveryAttempts}`);
            
            try {
                // Disconnect current connection
                this.disconnect();
                
                // Apply rate limit
                await this.applyRateLimit();
                
                // Try to connect with new proxy
                const result = await this.connectWithProxy();
                
                if (result.success) {
                    console.log('✅ [ANTI-BLOCK] Auto recovery successful!');
                    this.connectionState = 'CONNECTED';
                    this.proxyManager.markProxySuccess();
                    return { success: true, attempts: attempt };
                }
                
            } catch (error) {
                console.error(`❌ [ANTI-BLOCK] Recovery attempt ${attempt} failed: ${error.message}`);
                
                // Try to switch proxy
                const switchResult = await this.handleConnectionError(error, 'recovery');
                
                if (!switchResult.switched) {
                    console.warn('⚠️ [ANTI-BLOCK] Could not switch proxy, trying without proxy...');
                    
                    // Last resort: try direct connection
                    if (attempt === maxRecoveryAttempts - 1) {
                        try {
                            await this.sleep(10000); // Wait longer
                            const directResult = await this.connect();
                            if (directResult) {
                                return { success: true, attempts: attempt, method: 'direct' };
                            }
                        } catch (directError) {
                            console.error('❌ [ANTI-BLOCK] Direct connection also failed');
                        }
                    }
                }
            }
        }
        
        console.error('❌ [ANTI-BLOCK] Auto recovery failed after all attempts');
        this.connectionState = 'FAILED';
        return { success: false, attempts: attempt };
    }
    
    /**
     * 🔥 ANTI-BLOCK: Connect with current proxy from ProxyManager
     */
    async connectWithProxy() {
        const proxy = this.proxyManager.getCurrentProxy();
        
        if (!proxy) {
            console.log('⚠️ [ANTI-BLOCK] No proxy available, trying direct connection...');
            return await this.connect();
        }
        
        console.log(`🔌 [ANTI-BLOCK] Connecting via proxy: ${proxy}`);
        
        // Create proxy agent
        const agent = this.proxyManager.createProxyAgent();
        
        // Test connection with proxy
        try {
            const testResult = await this.testProxyConnection(agent);
            if (!testResult) {
                throw new Error('Proxy connection test failed');
            }
            
            // Proceed with actual connection
            return await this.connect();
            
        } catch (error) {
            this.proxyManager.markProxyFailed(proxy);
            throw error;
        }
    }
    
    /**
     * 🔥 ANTI-BLOCK: Test proxy connection before using
     */
    async testProxyConnection(proxyAgent) {
        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                resolve(false);
            }, 10000);
            
            try {
                https.get('https://iqoption.com', { agent: proxyAgent, timeout: 10000 }, (res) => {
                    clearTimeout(timeout);
                    const success = res.statusCode === 200 || res.statusCode === 301 || res.statusCode === 302;
                    console.log(`🧪 [ANTI-BLOCK] Proxy test: ${success ? '✅ PASS' : '❌ FAIL'} (status: ${res.statusCode})`);
                    resolve(success);
                }).on('error', (err) => {
                    clearTimeout(timeout);
                    console.log(`🧪 [ANTI-BLOCK] Proxy test error: ${err.message}`);
                    resolve(false);
                });
            } catch (error) {
                clearTimeout(timeout);
                resolve(false);
            }
        });
    }
    
    /**
     * 🔥 ANTI-BLOCK: Get connection status for monitoring
     */
    getConnectionStatus() {
        return {
            state: this.connectionState,
            connected: this.connected,
            authenticated: this.authenticated,
            currentProxy: this.proxyManager.getCurrentProxy(),
            proxyStats: this.proxyManager.getStats(),
            lastError: this.lastConnectionError,
            proxySwitchCount: this.proxySwitchCount,
            reconnectBackoff: this.reconnectBackoff
        };
    }
    
    /**
     * 🔥 ANTI-BLOCK: Print status report
     */
    printAntiBlockStatus() {
        const status = this.getConnectionStatus();
        
        console.log('\n🔥 [ANTI-BLOCK STATUS REPORT]');
        console.log('='.repeat(60));
        console.log(`Connection State: ${status.state}`);
        console.log(`Connected: ${status.connected ? '✅' : '❌'}`);
        console.log(`Authenticated: ${status.authenticated ? '✅' : '❌'}`);
        console.log(`Current Proxy: ${status.currentProxy || 'NONE'}`);
        console.log(`Proxy Switches: ${status.proxySwitchCount}/${this.maxProxySwitches}`);
        console.log(`Backoff Level: ${status.reconnectBackoff.toFixed(1)}x`);
        if (status.lastError) {
            console.log(`Last Error: ${status.lastError}`);
        }
        console.log('='.repeat(60));
    }

    /**
     * Get proxy agent if proxy is configured
     */
    getProxyAgent() {
        const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
        if (proxyUrl) {
            console.log('🌐 [PROXY] Using proxy:', proxyUrl);
            try {
                const proxyAgent = new HttpsProxyAgent(proxyUrl);
                return proxyAgent;
            } catch (error) {
                console.error('❌ [PROXY] Failed to create proxy agent:', error.message);
                return null;
            }
        }
        return null;
    }

    /**
     * Sleep utility
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Test connection without full bot initialization
     */
    async testConnection() {
        console.log('\n🧪 [TEST] ===============================');
        console.log('🧪 [TEST] Starting connection test...');
        console.log('🧪 [TEST] ===============================');
        console.log('🧪 [TEST] Environment check:');
        console.log('   - HTTPS_PROXY:', process.env.HTTPS_PROXY || 'Not set');
        console.log('   - HTTP_PROXY:', process.env.HTTP_PROXY || 'Not set');
        console.log('   - Node version:', process.version);
        console.log('   - Platform:', process.platform);
        console.log('🧪 [TEST] ===============================\n');
        
        try {
            const result = await this.connect();
            console.log('\n✅ [TEST] ===============================');
            console.log('✅ [TEST] Connection test PASSED');
            console.log('✅ [TEST] ===============================\n');
            return { success: true, message: 'Connected successfully' };
        } catch (error) {
            console.error('\n❌ [TEST] ===============================');
            console.error('❌ [TEST] Connection test FAILED:', error.message);
            
            // Analyze error
            let analysis = 'Unknown error';
            if (error.message.includes('timeout')) {
                analysis = 'Connection timeout - Possible causes:\n' +
                          '  1. Firewall blocking WebSocket connection\n' +
                          '  2. ISP blocking wss://iqoption.com\n' +
                          '  3. IQ Option blocking your IP\n' +
                          '  4. Network connectivity issues\n' +
                          '  5. Proxy required (try setting HTTPS_PROXY)';
            } else if (error.message.includes('ENOTFOUND') || error.message.includes('EAI_AGAIN')) {
                analysis = 'DNS resolution failed - Cannot resolve iqoption.com';
            } else if (error.message.includes('ECONNREFUSED')) {
                analysis = 'Connection refused - Server actively rejecting connection';
            } else if (error.message.includes('SSL') || error.message.includes('TLS')) {
                analysis = 'SSL/TLS error - Certificate or encryption issue';
            } else if (error.code === 'ECONNRESET') {
                analysis = 'Connection reset - Network or firewall issue';
            }
            
            console.error('🔍 [TEST] Error Analysis:');
            console.error(analysis);
            console.error('❌ [TEST] ===============================\n');
            
            return { 
                success: false, 
                message: error.message,
                analysis: analysis,
                error: error
            };
        }
    }

    /**
     * Connect with retry mechanism
     */
    async connectWithRetry(maxRetries = 5) {
        for (let i = 0; i < maxRetries; i++) {
            console.log(`\n🔄 [RETRY] Connection attempt ${i + 1}/${maxRetries}`);
            
            try {
                const result = await this.connect();
                if (result) {
                    console.log(`✅ [RETRY] Connected successfully on attempt ${i + 1}`);
                    return true;
                }
            } catch (error) {
                console.error(`❌ [RETRY] Attempt ${i + 1} failed:`, error.message);
                
                if (i < maxRetries - 1) {
                    const delay = 3000 * (i + 1); // Increasing delay
                    console.log(`⏳ [RETRY] Waiting ${delay}ms before next attempt...`);
                    await this.sleep(delay);
                } else {
                    console.error('❌ [RETRY] All retry attempts exhausted');
                    throw error;
                }
            }
        }
        return false;
    }

    /**
     * Hardened connect with auto-proxy detection, retry, and fallback
     * This method tries multiple strategies to establish connection
     */
    async connectHardened(options = {}) {
        const {
            maxRetries = 3,
            retryDelay = 3000,
            useAutoProxy = true,
            testNetworkFirst = true,
            fallbackToDemo = false
        } = options;

        console.log('\n');
        console.log('╔══════════════════════════════════════════════════════════════╗');
        console.log('║          HARDENED CONNECTION SYSTEM                          ║');
        console.log('╚══════════════════════════════════════════════════════════════╝');
        console.log('\n');
        console.log('🔧 Configuration:');
        console.log(`   Max Retries: ${maxRetries}`);
        console.log(`   Retry Delay: ${retryDelay}ms`);
        console.log(`   Auto Proxy: ${useAutoProxy ? 'YES' : 'NO'}`);
        console.log(`   Network Test First: ${testNetworkFirst ? 'YES' : 'NO'}`);
        console.log(`   Fallback to Demo: ${fallbackToDemo ? 'YES' : 'NO'}`);
        console.log('\n');

        // Step 1: Network test (if enabled)
        if (testNetworkFirst) {
            console.log('🔍 STEP 1: Running network diagnostic...');
            const networkTester = new NetworkTester();
            const networkResults = await networkTester.quickTest();
            
            if (!networkResults.ready) {
                console.error('\n❌ NETWORK TEST FAILED');
                console.error('   Reason:', networkResults.reason);
                
                if (useAutoProxy) {
                    console.log('\n🔄 Will attempt auto-proxy detection...');
                } else if (fallbackToDemo) {
                    console.log('\n⚠️ Switching to DEMO mode...');
                    return {
                        success: false,
                        mode: 'demo',
                        reason: 'Network blocked, falling back to demo'
                    };
                } else {
                    throw new Error(`Network not ready: ${networkResults.reason}`);
                }
            } else {
                console.log('✅ Network test passed');
                if (networkResults.method === 'proxy' && networkResults.proxy) {
                    process.env.HTTPS_PROXY = networkResults.proxy;
                    console.log(`   Auto-configured proxy: ${networkResults.proxy}`);
                }
            }
        }

        // Step 2: Try multiple connection strategies
        const strategies = this.buildConnectionStrategies(useAutoProxy);
        
        for (let strategyIndex = 0; strategyIndex < strategies.length; strategyIndex++) {
            const strategy = strategies[strategyIndex];
            
            console.log(`\n🔌 STRATEGY ${strategyIndex + 1}/${strategies.length}: ${strategy.name}`);
            console.log(`   Description: ${strategy.description}`);
            
            for (let retry = 0; retry < maxRetries; retry++) {
                console.log(`\n   Attempt ${retry + 1}/${maxRetries}...`);
                
                try {
                    const result = await this.tryConnect(strategy);
                    
                    if (result) {
                        console.log(`\n✅ CONNECTION SUCCESSFUL with strategy: ${strategy.name}`);
                        this.activeStrategy = strategy;
                        return {
                            success: true,
                            strategy: strategy.name,
                            endpoint: strategy.endpoint,
                            proxy: strategy.proxy || null
                        };
                    }
                } catch (error) {
                    console.log(`   ❌ Failed: ${error.message}`);
                    
                    if (retry < maxRetries - 1) {
                        const delay = retryDelay * (retry + 1);
                        console.log(`   ⏳ Waiting ${delay}ms before retry...`);
                        await this.sleep(delay);
                    }
                }
            }
            
            console.log(`   ❌ Strategy ${strategyIndex + 1} exhausted all retries`);
        }

        // All strategies failed
        console.error('\n╔══════════════════════════════════════════════════════════════╗');
        console.error('║          ❌ ALL CONNECTION STRATEGIES FAILED                    ║');
        console.error('╚══════════════════════════════════════════════════════════════╝');
        console.error('\n🔍 DIAGNOSIS:');
        console.error('   The following connection methods were tried and failed:');
        strategies.forEach((s, i) => {
            console.error(`   ${i + 1}. ${s.name}: ${s.description}`);
        });
        console.error('\n🛠️  POSSIBLE SOLUTIONS:');
        console.error('   1. Enable VPN (Recommended)');
        console.error('   2. Configure proxy in .env file');
        console.error('   3. Check firewall settings');
        console.error('   4. Try from different network');
        console.error('   5. Use DEMO mode instead\n');

        if (fallbackToDemo) {
            console.log('⚠️  FALLING BACK TO DEMO MODE...');
            return {
                success: false,
                mode: 'demo',
                reason: 'All connection strategies failed'
            };
        }

        throw new Error('All connection strategies failed. Network appears to be blocked.');
    }

    /**
     * Build list of connection strategies to try (10+ strategies)
     */
    buildConnectionStrategies(useAutoProxy) {
        const strategies = [];
        const endpoints = [
            'wss://iqoption.com/echo/websocket',
            'wss://iqoption.com/echo/websocket/',
            'wss://iqoption.com/ws',
            'wss://app.iqoption.com/echo/websocket'
        ];

        // Strategy 1: Direct connection
        strategies.push({
            name: 'Direct Connection',
            description: 'Direct WebSocket without proxy',
            endpoint: endpoints[0],
            proxy: null,
            useAgent: true,
            headers: this.getDefaultHeaders()
        });

        // Strategy 2: Direct + Relaxed TLS
        strategies.push({
            name: 'Direct + Relaxed TLS',
            description: 'Direct with relaxed SSL/TLS settings',
            endpoint: endpoints[0],
            proxy: null,
            useAgent: true,
            relaxedTLS: true,
            headers: this.getDefaultHeaders()
        });

        // Strategy 3-6: Different endpoints
        for (let i = 1; i < endpoints.length; i++) {
            strategies.push({
                name: `Endpoint ${i + 1}`,
                description: `Alternative endpoint ${endpoints[i]}`,
                endpoint: endpoints[i],
                proxy: null,
                useAgent: true,
                headers: this.getDefaultHeaders()
            });
        }

        // Strategy 7: Random User-Agent
        strategies.push({
            name: 'Random User-Agent',
            description: 'Direct with randomized user agent',
            endpoint: endpoints[0],
            proxy: null,
            useAgent: true,
            headers: this.getRandomHeaders()
        });

        // Strategy 8: IPv4 only (if we can resolve)
        strategies.push({
            name: 'IPv4 Only',
            description: 'Force IPv4 connection',
            endpoint: endpoints[0],
            proxy: null,
            useAgent: true,
            family: 4,
            headers: this.getDefaultHeaders()
        });

        // Strategy 9: Custom headers
        strategies.push({
            name: 'Custom Headers',
            description: 'Direct with custom headers',
            endpoint: endpoints[0],
            proxy: null,
            useAgent: true,
            headers: this.getCustomHeaders()
        });

        // Strategy 10+: With auto-detected proxies
        if (useAutoProxy) {
            const proxyList = [
                process.env.HTTPS_PROXY,
                process.env.HTTP_PROXY,
                'http://127.0.0.1:7890',   // Clash
                'http://127.0.0.1:8080',   // Common HTTP
                'http://127.0.0.1:1080',   // SOCKS
                'http://127.0.0.1:3128',   // Squid
                'http://127.0.0.1:8888',   // Alternative
                'http://127.0.0.1:8118',   // Privoxy
                'socks5://127.0.0.1:1080', // SOCKS5
                'http://localhost:7890',
                'http://localhost:8080',
                'http://localhost:1080',
                'http://localhost:3128'
            ].filter(Boolean);

            for (const proxy of proxyList) {
                strategies.push({
                    name: `Proxy ${proxy}`,
                    description: `Via proxy ${proxy}`,
                    endpoint: endpoints[0],
                    proxy: proxy,
                    useAgent: true,
                    headers: this.getDefaultHeaders()
                });
            }
        }

        return strategies;
    }

    /**
     * Get default headers
     */
    getDefaultHeaders() {
        return {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'Origin': 'https://iqoption.com',
            'Referer': 'https://iqoption.com/'
        };
    }

    /**
     * Get random headers
     */
    getRandomHeaders() {
        const userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/121.0'
        ];
        
        return {
            'User-Agent': userAgents[Math.floor(Math.random() * userAgents.length)],
            'Accept-Language': 'en-US,en;q=0.9',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'Origin': 'https://iqoption.com'
        };
    }

    /**
     * Get custom headers
     */
    getCustomHeaders() {
        return {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'Origin': 'https://iqoption.com',
            'Referer': 'https://iqoption.com/',
            'Sec-WebSocket-Extensions': 'permessage-deflate; client_max_window_bits'
        };
    }

    /**
     * Try a single connection strategy with enhanced options
     */
    async tryConnect(strategy) {
        return new Promise((resolve, reject) => {
            try {
                const wsOptions = {
                    headers: strategy.headers || this.getDefaultHeaders(),
                    handshakeTimeout: 15000,
                    rejectUnauthorized: strategy.relaxedTLS ? false : false,
                    followRedirects: true,
                    maxRedirects: 10
                };

                // Add family option for IPv4/IPv6
                if (strategy.family) {
                    wsOptions.family = strategy.family;
                }

                if (strategy.proxy) {
                    try {
                        wsOptions.agent = new HttpsProxyAgent(strategy.proxy);
                    } catch (error) {
                        reject(new Error(`Invalid proxy: ${error.message}`));
                        return;
                    }
                } else if (strategy.useAgent) {
                    wsOptions.agent = agent;
                }

                const ws = new WebSocket(strategy.endpoint, wsOptions);
                let resolved = false;

                const timeout = setTimeout(() => {
                    if (!resolved) {
                        ws.terminate();
                        resolved = true;
                        reject(new Error('Connection timeout'));
                    }
                }, 15000);

                ws.on('open', () => {
                    if (!resolved) {
                        clearTimeout(timeout);
                        
                        // Store the successful connection
                        this.ws = ws;
                        this.connected = true;
                        this.reconnectAttempts = 0;
                        
                        // Setup event handlers
                        this.setupWebSocketHandlers(ws);
                        
                        // Start heartbeat
                        this.startHeartbeat();
                        
                        resolved = true;
                        resolve(true);
                    }
                });

                ws.on('error', (error) => {
                    if (!resolved) {
                        clearTimeout(timeout);
                        resolved = true;
                        reject(error);
                    }
                });

            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Connect WebSocket with session cookies from HTTP login
     * Does NOT start heartbeat - that happens after login success
     */
    async connectWithCookies() {
        return new Promise((resolve, reject) => {
            try {
                const wsOptions = {
                    headers: {
                        ...this.getDefaultHeaders(),
                        'Cookie': this.authCookies || ''
                    },
                    handshakeTimeout: 15000,
                    rejectUnauthorized: false,
                    followRedirects: true,
                    maxRedirects: 10
                };

                console.log('🔌 Connecting WebSocket with cookies...');
                console.log('🍪 Cookie header present:', !!this.authCookies);
                console.log('🍪 Cookie length:', this.authCookies ? this.authCookies.length : 0);

                const ws = new WebSocket('wss://iqoption.com/echo/websocket', wsOptions);
                let resolved = false;

                const timeout = setTimeout(() => {
                    if (!resolved) {
                        ws.terminate();
                        resolved = true;
                        reject(new Error('Connection timeout with cookies'));
                    }
                }, 15000);

                ws.on('open', () => {
                    if (!resolved) {
                        clearTimeout(timeout);
                        
                        // Store the successful connection
                        this.ws = ws;
                        this.connected = true;
                        this.reconnectAttempts = 0;
                        
                        // Setup event handlers
                        this.setupWebSocketHandlers(ws);
                        
                        // NOTE: Heartbeat is started AFTER login success, not here
                        
                        console.log('✅ WebSocket connected with session cookies');
                        resolved = true;
                        resolve(true);
                    }
                });

                ws.on('error', (error) => {
                    if (!resolved) {
                        clearTimeout(timeout);
                        resolved = true;
                        reject(error);
                    }
                });

            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Setup WebSocket event handlers
     */
    setupWebSocketHandlers(ws) {
        ws.on('message', (data) => {
            console.log('🔥 HARD PROOF: 📥 RAW MESSAGE:', data.toString().slice(0, 200));
            this.handleMessage(data);
        });

        ws.on('error', (error) => {
            console.error('❌ [WS] WebSocket Error:', error.message);
            this.emit('error', error);
        });

        ws.on('close', (code, reason) => {
            console.log('⚠️ [WS] WebSocket CLOSED');
            console.log('⚠️ [WS] Close code:', code);
            console.log('⚠️ [WS] Close reason:', reason ? reason.toString() : 'No reason provided');
            
            this.connected = false;
            this.stopHeartbeat();
            this.authenticated = false;
            this.emit('disconnected', { code, reason });
            
            if (code !== 1000 && code !== 1001) {
                this.attemptReconnect();
            }
        });

        ws.on('unexpected-response', (request, response) => {
            console.error('❌ [WS] UNEXPECTED RESPONSE');
            console.error('❌ [WS] Status code:', response.statusCode);
            console.error('❌ [WS] Status message:', response.statusMessage);
            this.emit('unexpected-response', { request, response });
        });
    }

    /**
     * Original connect method - kept for backward compatibility
     */
    async connect() {
        const result = await this.connectPersistent();
        
        // 🔥 CRITICAL: Setup WebSocket debugging after connection
        if (this.ws && this.connected) {
            this.setupWebSocketDebugging();
        }
        
        // Update connection state
        this.connectionState = 'CONNECTED';
        this.lastConnectionError = null;
        this.proxyManager.markProxySuccess();
        this.proxySwitchCount = 0;
        this.reconnectBackoff = 1;
        
        console.log('✅ [ANTI-BLOCK] Connection established successfully');
        
        return result;
    }
    
    /**
     * 🔥 CRITICAL DEBUG: Setup WebSocket send wrapper and global listener
     */
    setupWebSocketDebugging() {
        console.log('🔧 Setting up WebSocket debugging...');
        
        // 🔥 GLOBAL MESSAGE SNIFFER - Capture ALL responses
        const originalOnMessage = this.ws.onmessage;
        this.ws.onmessage = (event) => {
            const rawData = event.data.toString();
            
            // Parse and analyze EVERY message from server
            try {
                const msg = JSON.parse(rawData);
                console.log('📥 GLOBAL SNIFFER:', msg.name || 'unknown', '| request_id:', msg.request_id || 'none');
                
                // Check if this could be a trade response
                if (msg.name && (
                    msg.name.includes('buy') || 
                    msg.name.includes('option') || 
                    msg.name.includes('order') ||
                    msg.name.includes('error')
                )) {
                    console.log('🎯 POTENTIAL TRADE RESPONSE:', JSON.stringify(msg, null, 2).slice(0, 500));
                }
                
                // Check if this has request_id that matches pending
                if (msg.request_id) {
                    if (this.pendingRequests.has(msg.request_id)) {
                        console.log(`✅ MATCHED PENDING: ${msg.request_id}`);
                    } else {
                        console.log(`⚠️ UNEXPECTED request_id: ${msg.request_id}`);
                    }
                }
            } catch (e) {
                console.log('📥 BINARY DATA:', rawData.slice(0, 100));
            }
            
            // Call original handler
            if (originalOnMessage) {
                originalOnMessage(event);
            }
        };
        
        // Step 4: Wrap WebSocket.send() to verify packets sent
        const originalSend = this.ws.send.bind(this.ws);
        this.ws.send = (data) => {
            console.log('📡 WS SEND:', data.toString().slice(0, 800));
            
            // Verify readyState before sending
            if (this.ws.readyState !== 1) {
                console.error('❌ WS NOT OPEN! readyState:', this.ws.readyState);
            }
            
            return originalSend(data);
        };
        
        console.log('✅ WebSocket debugging enabled');
    }

    /**
     * Connect WebSocket with all debugging enabled
     */
    async connectHardened(options) {
        return this.connectHardened({
            maxRetries: 3,
            retryDelay: 3000,
            useAutoProxy: true,
            testNetworkFirst: true,
            fallbackToDemo: false
        });
    }

    /**
     * Auto-connect with intelligent fallback
     * Order: LIVE → VPS → DEMO
     */
    async autoConnect(preferredMode = 'live') {
        if (preferredMode === 'demo') {
            return {
                success: true,
                mode: 'demo',
                realMoney: false,
                message: 'Demo mode selected'
            };
        }

        console.log('\n🔌 AUTO-CONNECT: Attempting LIVE mode...');
        console.log('   Fallback chain: LIVE → VPS → DEMO');
        
        try {
            // Step 1: Try local persistent connection
            const result = await this.connectPersistent();

            if (result.success) {
                return {
                    success: true,
                    mode: 'live',
                    realMoney: true,
                    location: 'local',
                    strategy: result.strategy,
                    attempts: result.attempts,
                    message: `Connected locally after ${result.attempts} attempts`
                };
            }

            // Step 2: Local failed - try VPS
            console.log('\n⚠️ Local connection failed. Checking VPS option...');
            
            const RemoteRunner = require('../remote/remoteRunner.js');
            const remoteRunner = new RemoteRunner();

            if (remoteRunner.isConfigured()) {
                console.log('🚀 VPS configured! Switching to remote execution...');
                
                const remoteResult = await remoteRunner.runOnRemoteServer({
                    mode: 'live',
                    streaming: true
                });

                if (remoteResult.success) {
                    return {
                        success: true,
                        mode: 'live',
                        realMoney: true,
                        location: 'vps',
                        message: 'Running on VPS - LIVE trading active'
                    };
                }
                
                console.log('❌ VPS execution also failed');
            } else {
                console.log('ℹ️ VPS not configured (set VPS_HOST, VPS_USER, VPS_PASS)');
            }

            // Step 3: All failed - fallback to DEMO
            if (result.mode === 'demo') {
                return {
                    success: true,
                    mode: 'demo',
                    realMoney: false,
                    reason: result.reason,
                    attempts: result.attempts,
                    message: `Network blocked - using DEMO mode`
                };
            }

        } catch (error) {
            console.error('❌ Auto-connect failed:', error.message);
            
            // Only fallback to demo if FORCE_LIVE is not enabled
            if (preferredMode === 'live' && process.env.FORCE_LIVE !== 'true') {
                console.log('\n⚠️  Falling back to DEMO mode...');
                return {
                    success: true,
                    mode: 'demo',
                    realMoney: false,
                    reason: error.message,
                    message: 'Connection failed - using DEMO mode'
                };
            }
            
            throw error;
        }
    }

    /**
     * Check if network is ready for live trading
     */
    async isNetworkReady() {
        const networkTester = new NetworkTester();
        const result = await networkTester.quickTest();
        return result.ready;
    }

    /**
     * Smart Decision Engine - Analyzes connection failures
     */
    analyzeFailure(error, attemptCount) {
        const errorCode = error.code || error.message;
        
        // Pattern recognition
        const isTimeout = errorCode.includes('timeout') || errorCode.includes('ETIMEDOUT');
        const isRefused = errorCode.includes('ECONNREFUSED');
        const isReset = errorCode.includes('ECONNRESET');
        const isDNS = errorCode.includes('ENOTFOUND') || errorCode.includes('EAI_AGAIN');
        const isSSL = errorCode.includes('SSL') || errorCode.includes('TLS');
        
        let diagnosis = 'Unknown';
        let severity = 'medium';
        
        if (isTimeout) {
            diagnosis = 'ISP/Firewall BLOCK - Connection timed out';
            severity = 'high';
        } else if (isRefused) {
            diagnosis = 'Server actively rejecting connections';
            severity = 'critical';
        } else if (isReset) {
            diagnosis = 'Connection reset - Possible middlebox';
            severity = 'high';
        } else if (isDNS) {
            diagnosis = 'DNS resolution failed';
            severity = 'medium';
        } else if (isSSL) {
            diagnosis = 'SSL/TLS handshake failed';
            severity = 'medium';
        }
        
        return {
            diagnosis,
            severity,
            attemptCount,
            shouldContinue: attemptCount < 50 && !isRefused, // Don't continue if server refuses
            recommendation: this.getRecommendation(diagnosis)
        };
    }

    /**
     * Get recommendation based on diagnosis
     */
    getRecommendation(diagnosis) {
        const recommendations = {
            'ISP/Firewall BLOCK - Connection timed out': 'Deploy to VPS or use VPN. Local network is actively blocked.',
            'Server actively rejecting connections': 'Server issue. Try again later or different endpoint.',
            'Connection reset - Possible middlebox': 'Corporate firewall detected. Deploy to VPS recommended.',
            'DNS resolution failed': 'Check DNS settings or deploy to VPS.',
            'SSL/TLS handshake failed': 'Certificate issue. Try relaxed TLS settings or VPS.',
            'Unknown': 'Retry with different strategy or deploy to VPS.'
        };
        return recommendations[diagnosis] || recommendations['Unknown'];
    }

    /**
     * Persistent connection mode - Exhaust all possibilities
     */
    async connectPersistent(options = {}) {
        const MAX_TOTAL_ATTEMPTS = parseInt(process.env.MAX_RETRY) || 50;
        const FORCE_LIVE = process.env.FORCE_LIVE === 'true';
        
        console.log('\n');
        console.log('╔══════════════════════════════════════════════════════════════╗');
        console.log('║     PERSISTENT CONNECTION MODE - Exhaust All Strategies      ║');
        console.log('╚══════════════════════════════════════════════════════════════╝');
        console.log(`\n🔥 Configuration:`);
        console.log(`   Max Total Attempts: ${MAX_TOTAL_ATTEMPTS}`);
        console.log(`   Force Live Mode: ${FORCE_LIVE ? 'YES' : 'NO'}`);
        console.log(`   Fallback to Demo: ${FORCE_LIVE ? 'NO (disabled by FORCE_LIVE)' : 'YES (after all attempts)'}`);
        console.log('\n');

        let globalAttempt = 0;
        const failureLog = [];

        // Get all strategies
        const strategies = this.buildConnectionStrategies(true);
        
        while (globalAttempt < MAX_TOTAL_ATTEMPTS) {
            globalAttempt++;
            
            console.log(`\n🔥 GLOBAL CONNECT ATTEMPT ${globalAttempt}/${MAX_TOTAL_ATTEMPTS}`);
            console.log('='.repeat(60));
            
            // Try each strategy
            for (let i = 0; i < strategies.length; i++) {
                const strategy = strategies[i];
                console.log(`\n🌐 Strategy ${i + 1}/${strategies.length}: ${strategy.name}`);
                
                try {
                    const result = await this.tryConnect(strategy);
                    
                    if (result) {
                        console.log(`\n✅✅✅ CONNECTION SUCCESSFUL! ✅✅✅`);
                        console.log(`   Strategy: ${strategy.name}`);
                        console.log(`   Total Attempts: ${globalAttempt}`);
                        console.log(`   Endpoint: ${strategy.endpoint}`);
                        if (strategy.proxy) {
                            console.log(`   Proxy: ${strategy.proxy}`);
                        }
                        
                        return {
                            success: true,
                            strategy: strategy.name,
                            endpoint: strategy.endpoint,
                            proxy: strategy.proxy || null,
                            attempts: globalAttempt,
                            mode: 'live'
                        };
                    }
                } catch (error) {
                    console.log(`   ❌ Failed: ${error.message}`);
                    
                    // Log failure for analysis
                    failureLog.push({
                        attempt: globalAttempt,
                        strategy: strategy.name,
                        error: error.message,
                        code: error.code
                    });
                }
            }
            
            // Analyze current failure pattern
            const analysis = this.analyzeFailure(
                failureLog[failureLog.length - 1], 
                globalAttempt
            );
            
            console.log(`\n🧠 Smart Analysis (Attempt ${globalAttempt}):`);
            console.log(`   Diagnosis: ${analysis.diagnosis}`);
            console.log(`   Severity: ${analysis.severity.toUpperCase()}`);
            console.log(`   Recommendation: ${analysis.recommendation}`);
            
            // Check if we should continue
            if (!analysis.shouldContinue && !FORCE_LIVE) {
                console.log(`\n⚠️  Smart Decision: Stopping early based on error pattern`);
                break;
            }
            
            // Wait before next global attempt
            if (globalAttempt < MAX_TOTAL_ATTEMPTS) {
                const delay = Math.min(3000 + (globalAttempt * 500), 10000);
                console.log(`\n⏳ Waiting ${delay}ms before next global attempt...`);
                await this.sleep(delay);
            }
        }

        // All attempts exhausted
        console.error('\n╔══════════════════════════════════════════════════════════════╗');
        console.error('║     ❌ ALL CONNECTION ATTEMPTS EXHAUSTED                     ║');
        console.error('╚══════════════════════════════════════════════════════════════╝');
        console.error(`\n📊 Statistics:`);
        console.error(`   Total Attempts: ${globalAttempt}`);
        console.error(`   Strategies Tried: ${strategies.length}`);
        console.error(`   Unique Errors: ${new Set(failureLog.map(f => f.code)).size}`);
        
        // Final diagnosis
        const finalAnalysis = this.analyzeFailure(
            failureLog[failureLog.length - 1], 
            globalAttempt
        );
        console.error(`\n🔍 Final Diagnosis: ${finalAnalysis.diagnosis}`);
        
        // Check FORCE_LIVE
        if (FORCE_LIVE) {
            console.error('\n⚠️  FORCE_LIVE is enabled, but connection failed.');
            console.error('   Will retry indefinitely or exit...');
            throw new Error('FORCE_LIVE enabled but connection impossible: ' + finalAnalysis.diagnosis);
        }
        
        // Fallback to demo
        console.log('\n⚠️  Falling back to DEMO mode after exhausting all strategies...');
        return {
            success: false,
            mode: 'demo',
            reason: `Connection impossible after ${globalAttempt} attempts: ${finalAnalysis.diagnosis}`,
            attempts: globalAttempt
        };
    }

    /**
     * Get connection diagnostics
     */
    async getDiagnostics() {
        const networkTester = new NetworkTester();
        return await networkTester.runFullTest();
    }

    /**
     * Start heartbeat to keep connection alive
     */
    startHeartbeat() {
        // Clear existing heartbeat if any
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }
        
        // Send heartbeat every 10 seconds
        this.heartbeatInterval = setInterval(() => {
            if (this.connected && this.ws) {
                try {
                    // Send ping to keep connection alive
                    this.ws.ping();
                    console.log('💓 Heartbeat ping sent');
                } catch (error) {
                    console.error('❌ Heartbeat failed:', error.message);
                }
            }
        }, 10000); // Every 10 seconds
        
        console.log('💓 Heartbeat started (10s interval)');
    }

    /**
     * Stop heartbeat
     */
    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
            console.log('💓 Heartbeat stopped');
        }
    }

    /**
     * Attempt to reconnect with exponential backoff
     */
    async attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('❌ [RECONNECT] Max attempts reached');
            this.emit('reconnect_failed');
            return;
        }

        this.reconnectAttempts++;
        const delay = this.reconnectDelay * this.reconnectAttempts;
        
        console.log(`🔄 [RECONNECT] Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
        console.log(`⏳ [RECONNECT] Waiting ${delay}ms...`);
        
        await this.sleep(delay);
        
        try {
            await this.connect();
            if (this.email && this.password) {
                console.log('🔑 [RECONNECT] Auto-login after reconnect...');
                await this.login(this.email, this.password);
            }
        } catch (error) {
            console.error('❌ [RECONNECT] Failed:', error.message);
        }
    }

    /**
     * Send message to WebSocket with deep debug logging
     * Returns the messageId for tracking
     */
    sendMessage(name, msg, options = {}) {
        if (!this.ws || this.ws.readyState !== 1) {
            throw new Error('WebSocket not connected (readyState: ' + (this.ws ? this.ws.readyState : 'null') + ')');
        }
        
        const messageId = this.generateMessageId();
        
        const message = {
            name: name,
            msg: msg,
            request_id: messageId
        };
        
        const messageStr = JSON.stringify(message);
        
        // Deep debug logging
        console.log('📤 SENDING RAW:', messageStr.slice(0, 500));
        console.log(`🧠 MESSAGE ID GENERATED: ${messageId}`);
        console.log(`📤 Sending: ${name}`, JSON.stringify(msg, null, 2).slice(0, 200));
        
        this.ws.send(messageStr);
        
        return messageId;
    }

    /**
     * Send SSID - NO request_id for auth messages
     * CRITICAL: IQ Option doesn't accept request_id in ssid message
     */
    async sendSSID(ssid) {
        // Try multiple SSID formats
        
        // Format 1: Simple string message (NO request_id, NO name wrapper)
        console.log('📤 Trying SSID Format 1: Direct string...');
        this.ws.send(ssid);
        
        // Format 2: Object with name (backup)
        await this.sleep(500);
        console.log('📤 Trying SSID Format 2: Object with name...');
        const payload = {
            name: 'ssid',
            msg: ssid
        };
        this.ws.send(JSON.stringify(payload));
        
        console.log('✅ SSID sent in multiple formats');
    }

    /**
     * Handle incoming messages with deep debug logging
     * CRITICAL: Check request_id matching first for request-response pattern
     */
    handleMessage(data) {
        try {
            const rawStr = data.toString();
            console.log('📥 RECEIVED RAW:', rawStr.slice(0, 500));
            
            const message = JSON.parse(rawStr);
            const { name, msg, request_id } = message;
            
            console.log(`📥 PARSED: name=${name}, request_id=${request_id}`);

            // CRITICAL: Check if this is a response to a pending request
            if (request_id && this.pendingRequests.has(request_id)) {
                console.log(`🎯 MATCHED REQUEST: ${request_id} for ${name}`);
                const pending = this.pendingRequests.get(request_id);
                clearTimeout(pending.timeout);
                this.pendingRequests.delete(request_id);
                
                // Resolve with the full message including name and msg
                pending.resolve({
                    name: name,
                    msg: msg,
                    request_id: request_id
                });
                return; // Handled as response
            }

            switch (name) {
                case 'timeSync':
                    // Only respond to timeSync AFTER login success
                    if (this.authenticated) {
                        this.sendMessage('timeSync', msg);
                    } else {
                        console.log('⏳ timeSync ignored (not authenticated yet)');
                    }
                    break;
                case 'ssid':
                    this.handleSsid(msg);
                    break;
                case 'profile':
                    // Deep debug logging for profile
                    console.log('📥 PROFILE RAW DATA:', JSON.stringify(msg, null, 2));
                    this.emit('profile', msg);
                    break;
                case 'candles':
                    this.handleCandles(msg);
                    break;
                case 'candle-generated':
                    this.handleNewCandle(msg);
                    break;
                case 'buy-complete':
                    this.handleBuyComplete(msg);
                    break;
                case 'option':
                    // Handle option response which may match pending requests
                    console.log('🔥 HARD PROOF: 📥 OPTION EVENT:', JSON.stringify(msg, null, 2));
                    this.handleOptionResponse(msg, request_id);
                    break;
                case 'binary-options.open-option':
                    // Handle trade open response
                    console.log('🔥 HARD PROOF: 📥 TRADE OPEN RESPONSE:', JSON.stringify(msg, null, 2));
                    this.handleBuyComplete(msg);
                    break;
                case 'portfolio.position-changed':
                    this.handlePortfolioPositionChanged(msg);
                    break;
                case 'option-closed':
                    this.handleOptionClosed(msg);
                    break;
                case 'balance-changed':
                    this.emit('balance', msg);
                    break;
                case 'error':
                    console.error('❌ API Error:', msg);
                    this.emit('api_error', msg);
                    break;
                case 'heartbeat':
                    // Send heartbeat response only if authenticated
                    if (this.authenticated) {
                        this.sendMessage('heartbeat', { heartbeat: Date.now() });
                    }
                    break;
                default:
                    // Try to handle as response if has request_id (fallback)
                    if (request_id) {
                        console.log(`⚠️ Unhandled message with request_id: ${name}, treating as response`);
                        // Could be a response we weren't expecting
                    }
                    this.emit(name, msg);
            }
        } catch (error) {
            console.error('❌ Failed to parse message:', error.message);
            console.error('❌ Raw data:', data.toString().slice(0, 200));
        }
    }

    /**
     * Login to IQ Option via HTTP API first, then use WebSocket with SSID
     * Supports multiple SSID formats and retry logic
     */
    async login(email, password) {
        this.email = email;
        this.password = password;

        return new Promise(async (resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Login timeout'));
            }, 30000);

            const maxRetries = 3;
            let retryCount = 0;
            
            const attemptLogin = async () => {
                try {
                    // Step 1: HTTP Login to get SSID
                    console.log(`🔑 STEP 1: HTTP Login to get SSID (attempt ${retryCount + 1}/${maxRetries})...`);
                    
                    // 🔥 CRITICAL: Use proxy agent if configured
                    const proxyAgent = this.getProxyAgent();
                    const axiosConfig = {
                        headers: {
                            'Content-Type': 'application/json',
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                            'Origin': 'https://iqoption.com',
                            'Referer': 'https://iqoption.com/'
                        },
                        timeout: 10000
                    };
                    
                    if (proxyAgent) {
                        console.log('🌐 [PROXY] Using proxy for HTTP login');
                        axiosConfig.httpsAgent = proxyAgent;
                        axiosConfig.proxy = false; // Disable axios default proxy, use our agent
                    }
                    
                    const loginResponse = await axios.post(
                        'https://auth.iqoption.com/api/v2/login',
                        {
                            identifier: email,
                            password: password
                        },
                        axiosConfig
                    );

                    console.log('🔑 HTTP Login Response:', JSON.stringify(loginResponse.data, null, 2));

                    if (loginResponse.data && loginResponse.data.ssid) {
                        const ssid = loginResponse.data.ssid;
                        console.log('🔑 GOT SSID from HTTP:', ssid.substring(0, 20) + '...');
                        
                        // Extract ALL cookies from response headers
                        const rawCookies = loginResponse.headers['set-cookie'] || [];
                        console.log('🔥 RAW SET-COOKIE HEADERS:', rawCookies);
                        
                        // Parse all cookie components (including HttpOnly, Secure, etc)
                        this.authCookies = rawCookies
                            .map(cookie => cookie.split(';')[0].trim())
                            .join('; ');
                        
                        // Store full cookie data for reference
                        this.fullCookieData = rawCookies;
                        
                        console.log('🍪 Parsed Cookie Header:', this.authCookies);
                        console.log('🍪 Number of cookies:', rawCookies.length);
                        
                        // Step 2: Reconnect WebSocket with cookies
                        if (!this.connected || !this.ws) {
                            console.log('🔌 Reconnecting WebSocket with session cookies...');
                            await this.connectWithCookies();
                        }
                        
                        // Step 3: Wait 1000ms after WebSocket open before sending SSID
                        console.log('⏳ STEP 3: Waiting 1000ms before sending SSID...');
                        await this.sleep(1000);
                        
                        // Step 4: Send SSID (NO request_id for auth)
                        console.log('📤 STEP 4: Sending SSID to WebSocket...');
                        await this.sendSSID(ssid);
                        
                        // Step 5: BLOCK and wait for profile (with timeout)
                        console.log('⏳ STEP 5: Waiting for profile...');
                        
                        try {
                            const profileResult = await this.waitForProfile(10000);
                            
                            // Step 6: Only after profile success, send context and subscribe
                            console.log('📤 STEP 6: Setting context and subscribing...');
                            
                            if (!this.connected || !this.ws || this.ws.readyState !== 1) {
                                throw new Error('WebSocket not connected after profile received');
                            }
                            
                            // Handle profile - select balance based on account mode
                            this.handleProfile(profileResult);
                            
                            // Start heartbeat only after successful login
                            this.startHeartbeat();
                            
                            this.authenticated = true;
                            this.ssid = ssid;
                            clearTimeout(timeout);
                            console.log('✅ Authentication complete');
                            resolve(ssid);
                            
                        } catch (profileError) {
                            console.error('❌ Profile error:', profileError.message);
                            
                            // Retry logic: if profile is false, try again with different format
                            if (retryCount < maxRetries - 1) {
                                retryCount++;
                                console.log(`🔄 Retrying login with different approach (attempt ${retryCount + 1})...`);
                                
                                // Disconnect and reconnect
                                this.disconnect();
                                await this.sleep(1000);
                                
                                return attemptLogin();
                            } else {
                                throw profileError;
                            }
                        }
                        
                    } else {
                        console.error('❌ HTTP Login failed - no SSID:', loginResponse.data);
                        throw new Error('HTTP Login failed - no SSID');
                    }
                } catch (error) {
                    console.error('❌ Login error:', error.message);
                    if (error.response) {
                        console.error('❌ Response status:', error.response.status);
                        console.error('❌ Response data:', error.response.data);
                    }
                    
                    // Retry logic
                    if (retryCount < maxRetries - 1 && !error.message.includes('HTTP Login failed')) {
                        retryCount++;
                        console.log(`🔄 Retrying login (attempt ${retryCount + 1}/${maxRetries})...`);
                        await this.sleep(2000 * retryCount);
                        return attemptLogin();
                    }
                    
                    this.authenticated = false;
                    clearTimeout(timeout);
                    reject(error);
                }
            };
            
            // Start login attempt
            attemptLogin();
        });
    }
    
    /**
     * Wait for profile with timeout
     */
    async waitForProfile(timeoutMs = 10000) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Profile timeout - no profile received'));
            }, timeoutMs);
            
            const onProfileReceived = (profileData) => {
                clearTimeout(timeout);
                
                // Deep debug logging
                console.log('📥 PROFILE RECEIVED RAW:', JSON.stringify(profileData, null, 2));
                
                // Check if profile is valid
                if (profileData === false) {
                    console.error('❌ LOGIN FAILED - Profile is false (authentication rejected)');
                    reject(new Error('Authentication failed - profile is false'));
                } else if (profileData === null || profileData === undefined) {
                    console.error('❌ LOGIN FAILED - Profile is null/undefined');
                    reject(new Error('Authentication failed - profile is null'));
                } else if (typeof profileData === 'object' && profileData.email) {
                    console.log('✅ LOGIN SUCCESS - Profile valid:', profileData.email);
                    resolve(profileData);
                } else {
                    console.warn('⚠️ Profile received but format unexpected:', profileData);
                    // Still resolve if we got something
                    resolve(profileData);
                }
            };
            
            // Listen for profile event (once)
            this.once('profile', onProfileReceived);
        });
    }

    /**
     * Handle SSID (session ID) response
     */
    handleSsid(msg) {
        if (msg && msg.ssid) {
            console.log('🔑 SSID Received');
            this.emit('ssid', msg.ssid);
        } else {
            console.error('❌ Login failed:', msg);
            this.emit('ssid', null);
        }
    }

    /**
     * Handle profile - select balance based on account mode (DEMO/REAL)
     * CRITICAL: Must be called after profile received
     */
    async handleProfile(profile) {
        console.log('📥 PROFILE RECEIVED');
        console.log(`🎯 MODE: ${this.accountMode}`);
        
        // 🔥 CRITICAL: Check account status
        console.log('🔍 ACCOUNT STATUS CHECK:');
        console.log('  - account_status:', profile.account_status);
        console.log('  - status:', profile.status);
        console.log('  - email:', profile.email);
        console.log('  - is_demo:', profile.is_demo);
        
        // Check if account is ACTIVE
        if (profile.account_status && profile.account_status !== 'ACTIVE' && profile.account_status !== 'NONE') {
            console.error(`❌ ACCOUNT STATUS INVALID: ${profile.account_status}`);
            console.error('❌ Cannot trade with this account status');
        }
        
        // Store profile data
        this.profileData = profile;
        
        // Balance type: 1 = REAL, 4 = DEMO
        const targetType = this.accountMode === 'DEMO' ? 4 : 1;
        
        if (!profile.balances || !Array.isArray(profile.balances)) {
            console.error('❌ No balances found in profile');
            throw new Error('No balances found in profile');
        }
        
        const selectedBalance = profile.balances.find(b => b.type === targetType);
        
        if (!selectedBalance) {
            console.error(`❌ Balance ${this.accountMode} (type ${targetType}) not found`);
            console.error('Available balances:', profile.balances.map(b => `type ${b.type}: $${b.amount}`).join(', '));
            throw new Error(`Balance ${this.accountMode} not found`);
        }
        
        this.balanceId = selectedBalance.id;
        
        console.log(`💰 Using ${this.accountMode}: $${selectedBalance.amount} (ID: ${this.balanceId})`);
        
        // Set context with selected balance
        this.setBalance(this.balanceId);
        
        // CRITICAL: Wait for setContext to be processed
        console.log('⏳ Waiting for setContext to be processed...');
        await this.sleep(2000);
        
        // Subscribe to portfolio updates for this balance type
        this.subscribePortfolioUpdates();
        
        // CRITICAL: Wait for subscriptions to be processed
        console.log('⏳ Waiting for subscriptions to be processed...');
        await this.sleep(3000);
        
        console.log('✅ Profile setup complete - ready to trade');
    }
    
    /**
     * Set balance context - CRITICAL for orders
     */
    setBalance(balanceId) {
        if (!balanceId) {
            console.error('❌ Cannot set balance: balanceId is null');
            return;
        }
        
        console.log(`📤 setContext balance_id=${balanceId}`);
        
        this.sendMessage('setContext', {
            balance_id: balanceId,
            client_platform_id: 1
        });
    }
    
    /**
     * Subscribe to portfolio updates for order tracking
     */
    subscribePortfolioUpdates() {
        const instrumentType = 'turbo-option'; // For turbo trades
        
        console.log(`📤 Subscribing to portfolio.position-changed (${instrumentType})`);
        
        this.sendMessage('subscribeMessage', {
            name: 'portfolio.position-changed',
            params: {
                routingFilters: {
                    instrument_type: instrumentType
                }
            }
        });
        
        // CRITICAL: Also subscribe to instrument quotes for the asset
        console.log(`📤 Subscribing to instrument-quotes-generated`);
        this.sendMessage('subscribeMessage', {
            name: 'instrument-quotes-generated',
            params: {
                routingFilters: {
                    active_id: this.getAssetId('EURUSD-OTC'),
                    instrument_type: 'digital-option'
                }
            }
        });
    }
    
    /**
     * Switch account mode (DEMO/REAL) at runtime
     */
    switchAccount(mode) {
        if (!['DEMO', 'REAL'].includes(mode)) {
            throw new Error('Invalid mode. Use DEMO or REAL');
        }
        
        console.log(`🔄 Switching from ${this.accountMode} to ${mode}`);
        
        this.accountMode = mode;
        
        // If we have profile data, re-select balance
        if (this.profileData) {
            this.handleProfile(this.profileData);
        } else {
            console.log('⚠️ No profile data available. Balance will be set after next login.');
        }
    }

    /**
     * Generate message ID for WebSocket requests
     */
    generateMessageId() {
        return Date.now() + '_' + Math.floor(Math.random() * 1000000);
    }

    /**
     * Generate device ID
     */
    generateDeviceId() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    /**
     * Subscribe to candle data
     */
    subscribeCandles(asset, timeframe) {
        const key = `${asset}-${timeframe}`;
        
        console.log(`📊 Subscribing to ${asset} ${timeframe}s candles`);
        
        this.sendMessage('subscribeMessage', {
            name: 'candle-generated',
            params: {
                routingFilters: {
                    active_id: this.getAssetId(asset),
                    size: timeframe
                }
            }
        });

        // Request historical candles
        this.sendMessage('sendMessage', {
            name: 'get-candles',
            body: {
                active_id: this.getAssetId(asset),
                size: timeframe,
                count: 100,
                to: Math.floor(Date.now() / 1000)
            }
        });

        this.subscriptions.set(key, { asset, timeframe });
        return key;
    }

    /**
     * Get asset ID mapping
     */
    getAssetId(asset) {
        const mapping = {
            'EURUSD': 1,
            'EURUSD-OTC': 76,
            'GBPUSD': 2,
            'USDJPY': 3,
            'AUDUSD': 4,
            'USDCAD': 5,
            'EURGBP': 6,
            'USDCHF': 7,
            'EURJPY': 8,
            'NZDUSD': 9,
            'GBPJPY': 10
        };
        return mapping[asset] || 1;
    }

    /**
     * Handle candle data - supports both array format and single candle
     */
    handleCandles(msg) {
        if (!msg) return;
        
        // Support both formats: msg.candles (array) or single candle in msg directly
        const candles = msg.candles || (msg.open ? [msg] : null);
        
        if (!candles || !Array.isArray(candles) || candles.length === 0) {
            console.warn('⚠️ No valid candles in message:', JSON.stringify(msg).slice(0, 200));
            return;
        }

        const { active_id, size } = msg;
        const asset = this.getAssetName(active_id);
        const key = `${asset}-${size}`;

        this.candles.set(key, candles.map(c => ({
            open: c.open,
            high: c.max,
            low: c.min,
            close: c.close,
            volume: c.volume || 0,
            timestamp: c.at
        })));

        const lastCandle = candles[candles.length - 1];
        console.log('📊 LIVE CANDLE:', {
            asset: asset,
            timestamp: lastCandle.at,
            open: lastCandle.open,
            close: lastCandle.close,
            high: lastCandle.max,
            low: lastCandle.min
        });
        console.log('💹 LIVE PRICE:', lastCandle.close);

        this.emit('candles', { asset, timeframe: size, candles: this.candles.get(key) });
    }

    /**
     * Handle new candle - IQ Option format: msg has properties directly (no nested 'candle' object)
     */
    handleNewCandle(msg) {
        if (!msg) return;
        
        // Safe guard: Check if msg has required properties
        if (!msg.open || !msg.close || msg.open === undefined || msg.close === undefined) {
            console.warn('⚠️ Invalid candle data (missing open/close):', JSON.stringify(msg));
            return;
        }

        const { active_id, size } = msg;
        const asset = this.getAssetName(active_id);
        const key = `${asset}-${size}`;

        // IQ Option format: properties are in msg directly, not in msg.candle
        const candleData = {
            open: msg.open,
            high: msg.max,
            low: msg.min,
            close: msg.close,
            volume: msg.volume || 0,
            timestamp: msg.at
        };
        
        console.log('📊 NEW CANDLE:', JSON.stringify(candleData));

        // Update stored candles
        let candles = this.candles.get(key) || [];
        candles.push(candleData);
        if (candles.length > 100) candles.shift();
        this.candles.set(key, candles);

        this.emit('newCandle', { asset, timeframe: size, candle: candleData });
    }

    /**
     * Get asset name from ID
     */
    getAssetName(id) {
        const mapping = {
            1: 'EURUSD',
            76: 'EURUSD-OTC',
            2: 'GBPUSD',
            3: 'USDJPY',
            4: 'AUDUSD',
            5: 'USDCAD',
            6: 'EURGBP',
            7: 'USDCHF',
            8: 'EURJPY',
            9: 'NZDUSD',
            10: 'GBPJPY'
        };
        return mapping[id] || 'EURUSD';
    }

    /**
     * Get cached candles
     */
    getCandles(asset, timeframe) {
        const key = `${asset}-${timeframe}`;
        return this.candles.get(key) || [];
    }

    /**
     * Send message and wait for response with request_id matching
     * CRITICAL for buyV2 and other operations that need confirmation
     * 
     * @param {string} name - Message name
     * @param {object} msg - Message body (if it has 'name' and 'version', it's treated as raw message)
     * @param {number} timeoutMs - Timeout in milliseconds
     */
    async sendMessageAndWait(name, msg, timeoutMs = 30000) {
        let messageId;
        let messageStr;
        
        console.log('🔍 DEBUG sendMessageAndWait:', { 
            name, 
            hasMsgName: msg && msg.name, 
            hasMsgVersion: msg && msg.version,
            msgKeys: msg ? Object.keys(msg) : 'null'
        });
        
        // Check if msg is a raw message (has name and version fields)
        if (msg && msg.name && msg.version) {
            console.log('✅ Detected RAW message format');
            // Raw message format - add request_id directly
            messageId = this.generateMessageId();
            const rawMessage = {
                ...msg,
                request_id: messageId
            };
            messageStr = JSON.stringify(rawMessage);
            console.log('📤 SENDING RAW MESSAGE:', messageStr.slice(0, 500));
            
            // Send the message
            if (!this.ws || this.ws.readyState !== 1) {
                throw new Error('WebSocket not connected');
            }
            console.log(`🔍 WS STATE before send: readyState=${this.ws.readyState}, connected=${this.connected}`);
            this.ws.send(messageStr);
            console.log('✅ Message sent via WebSocket');
        } else {
            console.log('📤 Using STANDARD message format');
            // Standard format - wrap in sendMessage
            messageId = this.sendMessage(name, msg);
        }
        
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.pendingRequests.delete(messageId);
                reject(new Error(`${name} response timeout (request_id: ${messageId})`));
            }, timeoutMs);
            
            // Store pending request
            this.pendingRequests.set(messageId, {
                resolve: resolve,
                reject: reject,
                timeout: timeout,
                name: name,
                sentAt: Date.now()
            });
            
            console.log(`⏳ WAITING for ${name} response (request_id: ${messageId})`);
        });
    }

    /**
     * Place a trade - FIXED with request-response matching
     */
    async placeTrade(asset, direction, amount, expiration) {
        // Check for duplicate/simultaneous trades
        if (this.hasOpenOrder()) {
            console.log('⛔ BLOCKED: Cannot place trade - waiting for previous result');
            throw new Error('Cannot place trade - another trade is active');
        }
        
        // Check minimum trade interval
        const now = Date.now();
        if (now - this.lastTradeTime < this.minTradeInterval) {
            const waitTime = this.minTradeInterval - (now - this.lastTradeTime);
            console.log(`⏳ COOLDOWN: Wait ${waitTime}ms more`);
            throw new Error(`Trade cooldown: wait ${waitTime}ms`);
        }
        
        // Check if balance is set - CRITICAL VALIDATION
        console.log('🔍 BALANCE_ID CHECK:', {
            balanceId: this.balanceId,
            type: typeof this.balanceId,
            isNull: this.balanceId === null,
            isUndefined: this.balanceId === undefined,
            isZero: this.balanceId === 0,
            isEmpty: this.balanceId === ''
        });
        
        if (!this.balanceId) {
            console.error('❌ Cannot trade: balance_id not set');
            throw new Error('Balance not set. Call switchAccount() first');
        }
        
        // Validate balance_id is a number
        const balanceIdNum = parseInt(this.balanceId);
        if (isNaN(balanceIdNum) || balanceIdNum <= 0) {
            console.error('❌ Invalid balance_id:', this.balanceId);
            throw new Error(`Invalid balance_id: ${this.balanceId}`);
        }
        
        this.lastTradeTime = now;
        
        try {
            // Send buy order with balance_id and wait for response
            const type = direction === 'call' ? 'buy' : 'sell';
            
            // IQ Option binary-options.open-option format - CORRECT!
            const now_ts = Math.floor(Date.now() / 1000);
            const currentMinute = Math.floor(now_ts / 60) * 60;
            const nextMinute = currentMinute + 60;
            const expirationTime = nextMinute + (parseInt(expiration) * 60);
            
            console.log('🔍 EXPIRATION CHECK:', {
                now_ts,
                currentMinute,
                nextMinute,
                expirationTime,
                expirationDate: new Date(expirationTime * 1000).toISOString()
            });
            
            const order = {
                name: 'binary-options.open-option',
                version: '1.0',
                body: {
                    user_balance_id: balanceIdNum,
                    active_id: this.getAssetId(asset),
                    option_type_id: 3, // 3 = turbo
                    direction: type, // 'buy' or 'sell'
                    expired: expirationTime, // Unix timestamp
                    price: parseFloat(amount),
                    refund_value: 0
                }
            };
            
            // 🔥 CRITICAL: Dump complete order body
            console.log('='.repeat(80));
            console.log('🔥 ORDER BODY DUMP:');
            console.log('='.repeat(80));
            console.log(JSON.stringify(order, null, 2));
            console.log('='.repeat(80));
            console.log('🔥 BODY FIELDS CHECK:');
            console.log('  - user_balance_id:', order.body.user_balance_id, `(type: ${typeof order.body.user_balance_id})`);
            console.log('  - active_id:', order.body.active_id, `(type: ${typeof order.body.active_id})`);
            console.log('  - option_type_id:', order.body.option_type_id, `(type: ${typeof order.body.option_type_id})`);
            console.log('  - direction:', order.body.direction, `(type: ${typeof order.body.direction})`);
            console.log('  - expired:', order.body.expired, `(type: ${typeof order.body.expired})`);
            console.log('  - price:', order.body.price, `(type: ${typeof order.body.price})`);
            console.log('  - refund_value:', order.body.refund_value, `(type: ${typeof order.body.refund_value})`);
            console.log('='.repeat(80));
            
            console.log(`💰 Placing ${direction.toUpperCase()} order: $${amount} on ${asset}`);
            console.log(`💰 Using ${this.accountMode} balance: ${this.balanceId}`);
            console.log(`⏰ Expiration: ${new Date(expirationTime * 1000).toISOString()}`);
            
            // CRITICAL: Use sendMessageAndWait for request-response matching
            const response = await this.sendMessageAndWait('binary-options.open-option', order, 30000);
            
            console.log('🔥 HARD PROOF: 📥 ORDER RESPONSE:', JSON.stringify(response, null, 2));
            
            // Handle the response
            const msg = response.msg;
            
            if (msg && msg.id) {
                console.log(`✅ Order placed: ${msg.id}`);
                
                // Store order in tracking map
                this.orders.set(msg.id, {
                    id: msg.id,
                    status: 'OPEN',
                    amount: msg.amount || amount,
                    direction: direction,
                    asset: asset,
                    timestamp: Date.now(),
                    result: null,
                    profit: 0
                });
                this.pendingResults.add(msg.id);
                
                console.log(`📊 ORDER MAP SIZE: ${this.orders.size}`);
                
                return {
                    success: true,
                    order_id: msg.id,
                    asset: msg.active || asset,
                    amount: msg.amount || amount,
                    direction: direction
                };
            } else {
                // Response has no ID - treat as failure
                console.error('❌ Order response missing ID:', response);
                this.lastTradeTime = 0; // Reset cooldown
                throw new Error('Trade placement failed - no order ID in response');
            }
            
        } catch (error) {
            // Reset cooldown on failure
            this.lastTradeTime = 0;
            console.error('❌ Trade failed:', error.message);
            throw error;
        }
    }

    /**
     * Handle option response - may resolve pending requests
     */
    handleOptionResponse(msg, request_id) {
        // If this has a request_id, try to match with pending requests
        if (request_id && this.pendingRequests.has(request_id)) {
            console.log(`🎯 OPTION MATCHED REQUEST: ${request_id}`);
            const pending = this.pendingRequests.get(request_id);
            clearTimeout(pending.timeout);
            this.pendingRequests.delete(request_id);
            
            pending.resolve({
                name: 'option',
                msg: msg,
                request_id: request_id
            });
            return;
        }
        
        // Also check if any pending request is waiting for an order response
        // and this option message has an order ID
        if (msg && msg.id) {
            console.log(`📊 OPTION EVENT: Order ${msg.id} | Status: ${msg.status || 'unknown'}`);
            
            // Store in orders map
            if (!this.orders.has(msg.id)) {
                this.orders.set(msg.id, {
                    id: msg.id,
                    status: 'OPEN',
                    amount: msg.amount || msg.price,
                    direction: msg.direction,
                    asset: msg.active,
                    timestamp: Date.now(),
                    result: null,
                    profit: 0
                });
                this.pendingResults.add(msg.id);
            }
        }
        
        this.emit('option', msg);
    }
    handlePortfolioPositionChanged(msg) {
        console.log('🔥 HARD PROOF: 📥 PORTFOLIO UPDATE:', JSON.stringify(msg, null, 2));
        
        // IQ Option sends position updates when orders are placed/modified
        if (msg && msg.id) {
            const orderId = msg.id;
            const status = msg.status || 'open';
            
            // Store or update order in tracking map
            const existingOrder = this.orders.get(orderId);
            
            if (!existingOrder) {
                // New order - add to tracking
                this.orders.set(orderId, {
                    id: orderId,
                    status: status.toUpperCase() === 'CLOSED' ? 'CLOSED' : 'OPEN',
                    amount: msg.amount || msg.price || msg.invest_amount,
                    direction: msg.direction || (msg.raw && msg.raw.direction),
                    asset: msg.active || msg.instrument_id,
                    timestamp: Date.now(),
                    result: null,
                    profit: 0
                });
                this.pendingResults.add(orderId);
                
                console.log(`📊 NEW ORDER FROM PORTFOLIO: ${orderId} | Status: ${status}`);
                console.log(`📊 ORDER MAP SIZE: ${this.orders.size}`);
            } else {
                // Update existing order
                if (status.toUpperCase() === 'CLOSED') {
                    existingOrder.status = 'CLOSED';
                    console.log(`📊 ORDER CLOSED: ${orderId}`);
                }
            }
            
            // Emit buy-complete event for the order placement promise to resolve
            // This is critical - IQ Option may not send 'buy-complete', but portfolio update instead
            this.emit('buy-complete', msg);
            
            // Also emit position-changed for result tracking
            this.emit('position-changed', msg);
        }
    }

    /**
     * Handle buy complete response
     */
    handleBuyComplete(msg) {
        console.log('🔥 HARD PROOF: 📥 ORDER RESPONSE:', JSON.stringify(msg, null, 2));
        console.log('🔥 HARD PROOF: 🆔 ORDER ID:', msg.id);
        
        // Store order in tracking map
        if (msg && msg.id) {
            this.orders.set(msg.id, {
                id: msg.id,
                status: 'OPEN',
                amount: msg.amount || msg.price,
                direction: msg.direction,
                asset: msg.active,
                timestamp: Date.now(),
                result: null,
                profit: 0
            });
            this.pendingResults.add(msg.id);
            
            console.log(`📊 ORDER MAP SIZE: ${this.orders.size}`);
            console.log(`📤 ORDER SENT: ${msg.id} | Status: OPEN`);
        }
        
        this.emit('buy-complete', msg);
    }

    /**
     * Check trade result
     */
    async checkResult(orderId) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Result check timeout'));
            }, 60000);

            const onOptionClosed = (msg) => {
                if (msg && msg.id === orderId) {
                    clearTimeout(timeout);
                    
                    const result = {
                        success: true,
                        order_id: msg.id,
                        status: msg.win ? 'won' : 'lost',
                        profit: msg.win ? msg.profit : -msg.amount,
                        amount: msg.amount,
                        win_amount: msg.win ? msg.profit : 0
                    };
                    
                    console.log(`🎯 Trade ${orderId} result: ${result.status}, Profit: ${result.profit}`);
                    resolve(result);
                }
            };

            this.once('option-closed', onOptionClosed);

            // Request order info
            this.sendMessage('sendMessage', {
                name: 'get-order-info',
                body: {
                    order_id: orderId
                }
            });
        });
    }

    /**
     * Handle option closed - CRITICAL for result tracking (EVENT-DRIVEN)
     */
    handleOptionClosed(msg) {
        console.log('🔥 HARD PROOF: 🎯 RESULT EVENT:', JSON.stringify(msg, null, 2));
        console.log(`🔥 HARD PROOF: 💰 RESULT: ${msg.win ? 'WIN' : 'LOSS'} ${msg.profit ? '+$' + msg.profit : '-$' + msg.amount}`);
        
        // Map result to order in tracking system
        if (msg && msg.id) {
            const order = this.orders.get(msg.id);
            
            if (order) {
                // Prevent duplicate result bug
                if (order.status === 'CLOSED') {
                    console.warn(`⚠️ DUPLICATE RESULT IGNORED: ${msg.id} already closed`);
                    return; // Exit early - already handled
                }
                
                // Update order with result from server ONLY
                order.status = 'CLOSED';
                order.result = msg.win ? 'WIN' : 'LOSS';
                order.profit = msg.win ? msg.profit : -msg.amount;
                order.closedAt = Date.now();
                order.win = msg.win;
                
                // Remove from pending
                this.pendingResults.delete(msg.id);
                
                console.log(`📥 RESULT RECEIVED: ${msg.id} | ${order.result} | Profit: $${order.profit}`);
                console.log(`📊 PENDING RESULTS: ${this.pendingResults.size} | ORDER MAP: ${this.orders.size}`);
                
                // EVENT-DRIVEN: Resolve waiting promise
                const resolver = this.resultResolvers.get(msg.id);
                if (resolver) {
                    console.log(`🎯 RESOLVING WAITER for ${msg.id}`);
                    resolver({
                        orderId: msg.id,
                        result: order.result,
                        profit: order.profit,
                        amount: order.amount,
                        win: order.win,
                        closedAt: order.closedAt
                    });
                    this.resultResolvers.delete(msg.id);
                }
            } else {
                console.warn(`⚠️ UNKNOWN ORDER: ${msg.id}`);
                console.warn(`⚠️ Available orders: ${Array.from(this.orders.keys()).join(', ')}`);
                
                // Still try to resolve if there's a resolver (race condition recovery)
                const resolver = this.resultResolvers.get(msg.id);
                if (resolver) {
                    console.log(`🎯 RESOLVING UNKNOWN ORDER for ${msg.id}`);
                    resolver({
                        orderId: msg.id,
                        result: msg.win ? 'WIN' : 'LOSS',
                        profit: msg.win ? msg.profit : -msg.amount,
                        amount: msg.amount,
                        win: msg.win,
                        closedAt: Date.now()
                    });
                    this.resultResolvers.delete(msg.id);
                }
            }
        }
        
        this.emit('option-closed', msg);
    }

    /**
     * Check if there's any open order - prevent duplicate trades
     */
    hasOpenOrder() {
        for (const [id, order] of this.orders) {
            if (order.status === 'OPEN') {
                return true;
            }
        }
        return false;
    }

    /**
     * Get order status by ID
     */
    getOrderStatus(orderId) {
        const order = this.orders.get(orderId);
        return order ? order.status : 'UNKNOWN';
    }

    /**
     * Get all pending orders
     */
    getPendingOrders() {
        return Array.from(this.pendingResults);
    }

    /**
     * Force check missing results with re-fetch
     */
    async checkMissingResults() {
        console.log('🔍 Checking for missing results...');
        const missing = [];
        
        for (const orderId of this.pendingResults) {
            const order = this.orders.get(orderId);
            if (order && order.status === 'OPEN') {
                const elapsed = Date.now() - order.timestamp;
                
                // If order has been open for more than 70 seconds, re-fetch
                if (elapsed > 70000) {
                    console.log(`⚠️ Missing result for order ${orderId}, re-fetching...`);
                    missing.push(orderId);
                    
                    // Request order info again
                    this.sendMessage('sendMessage', {
                        name: 'get-order-info',
                        body: {
                            order_id: orderId
                        }
                    });
                }
            }
        }
        
        return missing;
    }

    /**
     * Get all orders summary
     */
    getOrdersSummary() {
        let open = 0, closed = 0, wins = 0, losses = 0, totalProfit = 0;
        
        for (const [id, order] of this.orders) {
            if (order.status === 'OPEN') {
                open++;
            } else {
                closed++;
                if (order.result === 'WIN') wins++;
                if (order.result === 'LOSS') losses++;
                totalProfit += order.profit || 0;
            }
        }
        
        return {
            total: this.orders.size,
            open,
            closed,
            pending: this.pendingResults.size,
            wins,
            losses,
            winRate: closed > 0 ? ((wins / closed) * 100).toFixed(2) : '0.00',
            totalProfit: totalProfit.toFixed(2)
        };
    }

    /**
     * Wait for order result - EVENT-DRIVEN (CRITICAL)
     * 
     * This uses resultResolvers Map for instant event-driven resolution
     * instead of polling every 500ms
     */
    async waitForResult(orderId, timeoutMs = 120000) {
        console.log(`⏳ WAITING for result: ${orderId}`);
        
        // Check if already closed (fast path)
        const order = this.orders.get(orderId);
        if (order && order.status === 'CLOSED') {
            console.log(`✅ RESULT ALREADY AVAILABLE: ${orderId} | ${order.result} | $${order.profit}`);
            return {
                orderId: orderId,
                result: order.result,
                profit: order.profit,
                amount: order.amount,
                win: order.win,
                closedAt: order.closedAt
            };
        }
        
        // EVENT-DRIVEN: Register resolver for when result comes
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            
            // Register resolver
            this.resultResolvers.set(orderId, resolve);
            console.log(`📝 RESOLVER REGISTERED for ${orderId}`);
            
            // Timeout fallback (safety net)
            const timeoutId = setTimeout(() => {
                // Check if already resolved
                if (!this.resultResolvers.has(orderId)) {
                    return; // Already resolved
                }
                
                this.resultResolvers.delete(orderId);
                const order = this.orders.get(orderId);
                
                if (order && order.status === 'CLOSED') {
                    // Result came but resolver was cleaned up
                    console.log(`✅ TIMEOUT FALLBACK: ${orderId} already closed`);
                    resolve({
                        orderId: orderId,
                        result: order.result,
                        profit: order.profit,
                        amount: order.amount,
                        win: order.win,
                        closedAt: order.closedAt
                    });
                } else {
                    console.error(`❌ TIMEOUT: Result not received for ${orderId} after ${timeoutMs}ms`);
                    
                    // Debug info
                    if (order) {
                        console.error(`   Order status: ${order.status}`);
                        console.error(`   Order age: ${Date.now() - order.timestamp}ms`);
                    } else {
                        console.error(`   Order not found in map!`);
                    }
                    
                    reject(new Error(`Timeout waiting for result: ${orderId}`));
                }
            }, timeoutMs);
            
            // Also try polling as backup (every 2 seconds for 5 checks)
            let pollCount = 0;
            const maxPolls = 5;
            const pollInterval = setInterval(() => {
                pollCount++;
                const order = this.orders.get(orderId);
                
                if (order && order.status === 'CLOSED' && this.resultResolvers.has(orderId)) {
                    console.log(`🎯 POLL RESOLVED: ${orderId}`);
                    clearTimeout(timeoutId);
                    clearInterval(pollInterval);
                    this.resultResolvers.delete(orderId);
                    resolve({
                        orderId: orderId,
                        result: order.result,
                        profit: order.profit,
                        amount: order.amount,
                        win: order.win,
                        closedAt: order.closedAt
                    });
                    return;
                }
                
                if (pollCount >= maxPolls) {
                    clearInterval(pollInterval);
                }
            }, 2000);
        });
    }

    /**
     * Get real balance from server (API only)
     */
    async getRealBalance() {
        try {
            const balance = await this.getBalance();
            console.log(`💰 BALANCE FROM API: ${JSON.stringify(balance)}`);
            return balance;
        } catch (error) {
            console.error('❌ Failed to get balance:', error.message);
            throw error;
        }
    }

    /**
     * Get order from IQ Option history/portfolio (REAL SERVER RESULT)
     * This fetches the actual result from IQ Option server for verification
     */
    async getOrderFromHistory(orderId, timeoutMs = 10000) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(`Timeout getting order ${orderId} from history`));
            }, timeoutMs);

            let resolved = false;

            // Handler for portfolio position updates
            const onPositionChanged = (msg) => {
                if (msg && msg.id === orderId) {
                    clearTimeout(timeout);
                    this.off('position-changed', onPositionChanged);
                    
                    if (!resolved) {
                        resolved = true;
                        
                        // Extract result from position data
                        const result = {
                            orderId: orderId,
                            result: msg.win ? 'WIN' : 'LOSS',
                            profit: msg.win ? msg.profit : -(msg.amount || msg.price),
                            amount: msg.amount || msg.price,
                            status: msg.status || 'closed',
                            timestamp: Date.now()
                        };
                        
                        console.log(`📊 HISTORY RESULT: ${orderId} | ${result.result} | $${result.profit}`);
                        resolve(result);
                    }
                }
            };

            // Listen for position updates
            this.on('position-changed', onPositionChanged);

            // Request order info from server
            this.sendMessage('sendMessage', {
                name: 'get-order-info',
                body: {
                    order_id: orderId
                }
            });

            // Also try requesting portfolio
            this.sendMessage('sendMessage', {
                name: 'get-portfolio',
                body: {}
            });
        });
    }

    /**
     * Clear old closed orders (keep last 100)
     */
    cleanupOldOrders() {
        const closedOrders = [];
        
        for (const [id, order] of this.orders) {
            if (order.status === 'CLOSED') {
                closedOrders.push({ id, closedAt: order.closedAt });
            }
        }
        
        // Sort by closed time, oldest first
        closedOrders.sort((a, b) => a.closedAt - b.closedAt);
        
        // Remove old orders if more than 100
        if (closedOrders.length > 100) {
            const toRemove = closedOrders.length - 100;
            for (let i = 0; i < toRemove; i++) {
                this.orders.delete(closedOrders[i].id);
                console.log(`🧹 Cleaned up old order: ${closedOrders[i].id}`);
            }
        }
    }

    /**
     * Debug order map - print all orders
     */
    debugOrderMap() {
        console.log('\n📋 ORDER MAP DEBUG:');
        console.log('='.repeat(60));
        
        for (const [id, order] of this.orders) {
            console.log(`ID: ${id} | Status: ${order.status} | ${order.result || 'N/A'} | $${order.profit || 0}`);
        }
        
        console.log('='.repeat(60));
        console.log(`Total: ${this.orders.size} | Pending: ${this.pendingResults.size}`);
        console.log('');
    }

    async getBalance() {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Balance check timeout'));
            }, 10000);

            const onBalance = (msg) => {
                clearTimeout(timeout);
                resolve(msg);
            };

            this.once('balance', onBalance);
            this.sendMessage('sendMessage', {
                name: 'get-balances'
            });
        });
    }

    /**
     * Disconnect
     */
    disconnect() {
        if (this.ws) {
            this.ws.close(1000, 'Manual disconnect');
            this.ws = null;
        }
        this.connected = false;
        this.authenticated = false;
        this.stopHeartbeat();
        if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
        }
        console.log('📡 [DISCONNECT] Disconnected from IQ Option');
    }
}

module.exports = IQOptionClient;
