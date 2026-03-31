/**
 * UNIFIED IQ Option API
 * Single source of truth for all API interactions
 * Uses the iqoption library with WebSocket
 */

const IQOption = require('iqoption');
const logger = require('../utils/logger');
const EventEmitter = require('events');

class UnifiedIQOptionAPI extends EventEmitter {
    constructor() {
        super();
        this.api = null;
        this.isConnected = false;
        this.isAuthenticated = false;
        this.accountType = 'PRACTICE';
        this.email = null;
        this.password = null;
        this.balance = 0;
        this.balanceId = null;
        this.activeOrders = new Map();
        this.candles = new Map();
        this.ssid = null;
        this.userProfile = null;
        this.latency = 0;
        this.lastPing = Date.now();
        // SELF-HEALING SYSTEM
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectDelay = 1000;
        this.maxReconnectDelay = 30000;
        this.heartbeatInterval = null;
        this.heartbeatMs = 25000;
        this.connectionCheckInterval = null;
        this.connectionCheckMs = 5000;
        this.lastPong = Date.now();
        this.connectionTimeout = 60000;
        
        // Network recovery
        this.networkFailCount = 0;
        this.maxNetworkFailCount = 3;
        this.isReconnecting = false;
        
        // 🔥 NETWORK RESILIENCE MODE
        this.networkMode = 'ONLINE'; // ONLINE | OFFLINE | PROXY
        this.networkBlocked = false;
        this.proxyConfig = {
            enabled: process.env.PROXY_URL ? true : false,
            url: process.env.PROXY_URL || null
        };
        
        // Mock data for offline mode
        this.mockDataEnabled = false;
        this.mockPrices = new Map();
        this.mockCandles = new Map();
        
        // INTELLIGENT MONITORING SYSTEM
        this.statistics = {
            totalTrades: 0,
            successfulTrades: 0,
            failedTrades: 0,
            totalLatency: 0,
            avgLatency: 0,
            errors: new Map(),
            pairsPerformance: new Map(),
            hourlyStats: new Map(),
            lastTradeTime: null
        };
        this.latencyHistory = [];
        this.maxLatencyHistory = 100;
        
        // AUTO-FIX SYSTEM
        this.tradeRetries = 3;
        this.retryDelay = 500;
        this.activePairFallback = {
            'EURUSD': 'EURUSD-OTC',
            'GBPUSD': 'GBPUSD-OTC',
            'USDJPY': 'USDJPY-OTC'
        };
        
        // Pair mapping
        this.activeIdMap = {
            'EURUSD': 1,
            'EURUSD-OTC': 76,
            'GBPUSD': 2,
            'EURGBP': 3,
            'USDJPY': 4,
            'AUDUSD': 5,
            'USDCAD': 6,
            'USDCHF': 7,
            'EURJPY': 8,
            'GBPJPY': 9,
            'GOLD': 74,
            'SILVER': 75,
            'OIL': 76,
            'BTCUSD': 77
        };
        
        // Real-time price tracking
        this.activeSubscriptions = new Set();
        this.currentPrices = new Map(); // pair -> { price, timestamp }
        this.tickBuffer = new Map(); // pair -> tick array for momentum calculation
        
        // Candles cache with size limit to prevent memory leak
        this.maxCandlesCacheSize = 50; // Max 50 pair-interval combinations
        this.candlesAccessOrder = []; // Track access order for LRU eviction
    }

    /**
     * Handle real-time price update from WebSocket
     */
    handlePriceUpdate(data) {
        try {
            const msg = data.msg || data;
            
            // Extract price from various message formats
            let price = null;
            let activeId = null;
            let timestamp = Date.now();
            
            // Format 1: quote/spot/tick message
            if (msg.quote !== undefined) {
                price = parseFloat(msg.quote);
                activeId = msg.active_id || msg.id;
                timestamp = msg.time ? msg.time * 1000 : timestamp;
            }
            // Format 2: value message
            else if (msg.value !== undefined) {
                price = parseFloat(msg.value);
                activeId = msg.active_id || msg.id;
                timestamp = msg.time ? msg.time * 1000 : timestamp;
            }
            // Format 3: price message
            else if (msg.price !== undefined) {
                price = parseFloat(msg.price);
                activeId = msg.active_id || msg.id;
                timestamp = msg.time ? msg.time * 1000 : timestamp;
            }
            // Format 4: close price from candle (for streaming candles)
            else if (msg.close !== undefined && msg.streaming) {
                price = parseFloat(msg.close);
                activeId = msg.active_id || msg.id;
                timestamp = msg.at ? msg.at * 1000 : (msg.time ? msg.time * 1000 : timestamp);
            }
            
            if (price && activeId) {
                // Find pair name from activeId
                const pair = this.getPairFromActiveId(activeId);
                if (pair) {
                    // Check for duplicate (debounce - ignore if same price within 500ms)
                    const existing = this.currentPrices.get(pair);
                    if (existing && existing.price === price && (timestamp - existing.timestamp) < 500) {
                        return; // Skip duplicate
                    }
                    
                    this.currentPrices.set(pair, {
                        price: price,
                        timestamp: timestamp,
                        activeId: activeId
                    });
                    
                    // Log price update (throttled - only log every 5 seconds per pair)
                    const lastLog = this._lastPriceLog?.get?.(pair) || 0;
                    if (timestamp - lastLog > 5000) {
                        if (!this._lastPriceLog) this._lastPriceLog = new Map();
                        this._lastPriceLog.set(pair, timestamp);
                        logger.debug(`[API] Price: ${pair} = ${price}`);
                    }
                    
                    // Add to tick buffer for ultra-fast momentum calculation
                    if (!this.tickBuffer.has(pair)) {
                        this.tickBuffer.set(pair, []);
                    }
                    const buffer = this.tickBuffer.get(pair);
                    buffer.push({
                        price: price,
                        timestamp: Date.now()
                    });
                    // Keep only last 20 ticks for fast calculation
                    if (buffer.length > 20) buffer.shift();
                    
                    // Emit price update event
                    this.emit('priceUpdate', { pair, price, timestamp: Date.now() });
                }
            }
        } catch (error) {
            logger.error('[API] Price update error:', error);
        }
    }

    /**
     * Get tick momentum for a pair - ultra-fast calculation
     */
    getTickMomentum(pair) {
        if (!this.tickBuffer || !this.tickBuffer.has(pair)) {
            return { direction: 'neutral', strength: 0, velocity: 0 };
        }
        
        const ticks = this.tickBuffer.get(pair);
        if (ticks.length < 5) {
            return { direction: 'neutral', strength: 0, velocity: 0 };
        }
        
        // Calculate ultra-fast momentum from last 5 ticks
        const recent = ticks.slice(-5);
        const first = recent[0].price;
        const last = recent[recent.length - 1].price;
        const velocity = (last - first) / first;
        
        // Direction
        const direction = velocity > 0.0001 ? 'up' : velocity < -0.0001 ? 'down' : 'neutral';
        
        // Strength (0-1)
        const strength = Math.min(Math.abs(velocity) * 1000, 1);
        
        return { direction, strength, velocity };
    }

    /**
     * Check connection status - alias for isReady for compatibility
     */
    isReady() {
        return this.isConnected && this.isAuthenticated && this.api !== null;
    }

    /**
     * Get detailed statistics for health monitoring
     */
    getStatistics() {
        const successRate = this.statistics.totalTrades > 0 
            ? (this.statistics.successfulTrades / this.statistics.totalTrades * 100).toFixed(2)
            : 0;
            
        const recentLatencies = this.latencyHistory.slice(-10);
        const avgRecentLatency = recentLatencies.length > 0
            ? recentLatencies.reduce((sum, l) => sum + l.latency, 0) / recentLatencies.length
            : 0;
        
        return {
            ...this.statistics,
            successRate: `${successRate}%`,
            avgRecentLatency: `${avgRecentLatency.toFixed(0)}ms`,
            activeOrders: this.activeOrders.size,
            isConnected: this.isConnected,
            isAuthenticated: this.isAuthenticated,
            reconnectAttempts: this.reconnectAttempts,
            lastPong: this.lastPong,
            timeSinceLastPong: Date.now() - this.lastPong
        };
    }

    /**
     * Get pair name from active ID
     */
    getPairFromActiveId(activeId) {
        // Reverse lookup in activeIdMap
        for (const [pair, id] of Object.entries(this.activeIdMap)) {
            if (id === activeId) {
                return pair;
            }
        }
        return null;
    }

    /**
     * Subscribe to real-time price stream for a pair - OPTIMIZED
     */
    async subscribePrice(pair) {
        if (!this.isConnected) {
            throw new Error('Not connected');
        }
        
        const activeId = this.getActiveId(pair);
        
        // Check if already subscribed
        if (this.activeSubscriptions.has(pair)) {
            logger.debug(`[API] Already subscribed to ${pair}`);
            return true;
        }
        
        try {
            // Try different subscription formats in parallel
            const subscriptionFormats = [
                {
                    name: 'subscribeMessage',
                    params: { routingFilters: { active_id: activeId }}
                },
                {
                    name: 'candles',
                    body: { active_id: activeId, size: 1 }
                },
                {
                    name: 'subscribeQuotes',
                    params: { active_ids: [activeId] }
                }
            ];
            
            // Send all formats immediately without waiting
            for (const message of subscriptionFormats) {
                try {
                    this.api.send(message);
                } catch (err) {
                    logger.debug(`[API] Subscription format failed: ${err.message}`);
                }
            }
            
            this.activeSubscriptions.add(pair);
            logger.info(`[API] Subscribed to ${pair} price stream`);
            return true;
            
        } catch (error) {
            logger.error(`[API] Failed to subscribe to ${pair}`, error);
            return false;
        }
    }

    /**
     * Unsubscribe from price stream
     */
    async unsubscribePrice(pair) {
        if (!this.isConnected || !this.activeSubscriptions.has(pair)) {
            return false;
        }
        
        const activeId = this.getActiveId(pair);
        
        try {
            const message = {
                name: 'unsubscribeMessage',
                params: {
                    routingFilters: {
                        active_id: activeId
                    }
                }
            };
            
            this.api.send(message);
            this.activeSubscriptions.delete(pair);
            this.currentPrices.delete(pair);
            
            logger.info(`[API] Unsubscribed from ${pair}`);
            return true;
            
        } catch (error) {
            logger.error(`[API] Failed to unsubscribe from ${pair}`, error);
            return false;
        }
    }

    /**
     * Get current real-time price for a pair
     */
    getCurrentPrice(pair) {
        // 🔥 OFFLINE MODE: Return mock price
        if (this.networkMode === 'OFFLINE' || this.mockDataEnabled) {
            const mockPrice = this.getMockPrice(pair);
            console.log(`📴 [OFFLINE] Mock price for ${pair}: ${mockPrice}`);
            return mockPrice;
        }
        
        const priceData = this.currentPrices.get(pair);
        
        if (!priceData) {
            return null;
        }
        
        // Check if price is stale (older than 30 seconds)
        const age = Date.now() - priceData.timestamp;
        if (age > 30000) {
            logger.warn(`[API] Price for ${pair} is stale (${age}ms old)`);
            return null;
        }
        
        return priceData.price;
    }

    /**
     * Get all current prices
     */
    getAllCurrentPrices() {
        const prices = {};
        for (const [pair, data] of this.currentPrices.entries()) {
            prices[pair] = {
                price: data.price,
                timestamp: data.timestamp,
                age: Date.now() - data.timestamp
            };
        }
        return prices;
    }

    /**
     * Wait for price data with timeout - OPTIMIZED with event-based waiting
     */
    async waitForPrice(pair, timeout = 5000) {
        return new Promise((resolve, reject) => {
            // Check if we already have price
            const currentPrice = this.getCurrentPrice(pair);
            if (currentPrice) {
                resolve(currentPrice);
                return;
            }
            
            const startTime = Date.now();
            let timeoutId = null;
            
            // Create one-time listener for price updates
            const priceListener = (data) => {
                if (data.pair === pair) {
                    clearTimeout(timeoutId);
                    this.removeListener('priceUpdate', priceListener);
                    resolve(data.price);
                }
            };
            
            // Listen for price update event
            this.on('priceUpdate', priceListener);
            
            // Timeout handler
            timeoutId = setTimeout(() => {
                this.removeListener('priceUpdate', priceListener);
                
                // Check one last time
                const finalPrice = this.getCurrentPrice(pair);
                if (finalPrice) {
                    resolve(finalPrice);
                } else {
                    reject(new Error(`Timeout waiting for price: ${pair}`));
                }
            }, timeout);
        });
    }

    /**
     * Initialize with credentials
     */
    setCredentials(email, password, accountType = 'PRACTICE') {
        this.email = email?.trim();
        this.password = password;
        this.accountType = accountType?.toUpperCase() || 'PRACTICE';
        
        logger.info('Credentials set', { 
            email: this.email,
            accountType: this.accountType,
            hasPassword: !!this.password
        });
    }

    /**
     * Connect with Self-Healing System
     */
    async connect() {
        try {
            if (!this.email || !this.password) {
                throw new Error('Credentials not set. Call setCredentials() first.');
            }

            // Prevent multiple simultaneous connection attempts
            if (this.isReconnecting) {
                logger.warn('[API] Connection already in progress, waiting...');
                await this.waitForConnection(30000);
                return this.isConnected;
            }

            this.isReconnecting = true;
            logger.info('[API] Connecting to IQ Option API...');
            console.log('🔌 Connecting to IQ Option...');

            // Create IQOption instance
            this.api = new IQOption({
                email: this.email,
                password: this.password
            });

            // Login
            logger.info('[API] Logging in...');
            await this.api.login();
            logger.info('[API] Login successful');
            console.log('✅ Login successful');

            // Set up event listeners BEFORE connecting
            this.setupEventListeners();
            
            // Connect WebSocket
            logger.info('[API] Opening WebSocket connection...');
            await this.api.connect();
            logger.info('[API] WebSocket connected');
            console.log('✅ WebSocket connected');

            // WebSocket connected = authenticated
            this.isAuthenticated = true;
            this.lastPong = Date.now();
            
            // Try to get balance info but don't block on it
            try {
                await this.requestBalanceInfo(5000);
            } catch (error) {
                logger.warn('[API] Could not get balance info immediately', error.message);
                // Set default values - will be updated later
                this.balance = 0;
            }
            
            // Select account type
            await this.selectAccountType();
            
            // Reset counters on successful connection
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.reconnectDelay = 1000;
            this.networkFailCount = 0;
            this.isReconnecting = false;
            
            // Start Self-Healing Systems
            this.startHeartbeat();
            this.startConnectionCheck();
            
            logger.info('[API] Successfully connected', {
                accountType: this.accountType,
                balance: this.balance,
                balanceId: this.balanceId
            });
            console.log(`✅ Connected! Balance: $${this.balance}`);

            this.emit('connected', { balance: this.balance, accountType: this.accountType });
            return true;

        } catch (error) {
            this.isReconnecting = false;
            logger.error('[API] Connection failed', error);
            console.error('❌ Connection failed:', error.message);
            
            // Auto-retry if not max attempts
            if (this.reconnectAttempts < this.maxReconnectAttempts) {
                return this.scheduleReconnect();
            }
            
            throw error;
        }
    }

    /**
     * Set up WebSocket event listeners with cleanup tracking
     */
    setupEventListeners() {
        if (!this.api) return;
        
        // Clean up existing listeners first to prevent duplicates
        this.removeAllListeners();
        
        // Initialize message handlers map for waitForMessage
        this.messageHandlers = new Map();
        
        // Store bound handler references for cleanup
        this._boundHandlers = {
            message: this.handleApiMessage.bind(this),
            profile: this.handleProfileEvent.bind(this),
            error: this.handleApiError.bind(this),
            disconnect: this.handleApiDisconnect.bind(this)
        };
        
        // Add event listeners
        this.api.on('message', this._boundHandlers.message);
        this.api.on('profile', this._boundHandlers.profile);
        this.api.on('error', this._boundHandlers.error);
        this.api.on('disconnect', this._boundHandlers.disconnect);
    }
    
    /**
     * Handle API message events
     */
    handleApiMessage(msg) {
        try {
            const data = typeof msg === 'string' ? JSON.parse(msg) : msg;
            
            // Debug logging for all messages (only in debug mode)
            if (data.name && process.env.DEBUG === 'true') {
                logger.debug('[API] Raw WebSocket message', { name: data.name, hasData: !!data.msg });
                
                // Check for candle-related messages
                if (data.name.includes('candle') || data.name.includes('chart') || data.name.includes('candles')) {
                    logger.debug('[API] Candle message detected', { name: data.name });
                }
            }
            
            // Check for real-time price updates (quote/spot/tick) - always process these
            if (data.name === 'quote' || data.name === 'spot' || data.name === 'tick' || data.name === 'underlying') {
                this.handlePriceUpdate(data);
            }
            
            // For candles messages, only update price if it's a streaming candle (not a historical response)
            if (data.name === 'candles' || data.name === 'candle') {
                const msg = data.msg || data;
                // Check if this is a streaming update (has current timestamp) vs historical response
                const isStreaming = msg && (msg.at || msg.streaming || (msg.time && Math.abs(Date.now()/1000 - msg.time) < 120));
                if (isStreaming) {
                    this.handlePriceUpdate(data);
                }
                // Always resolve waiting promises for candles
                if (this.messageHandlers.has(data.name)) {
                    const handlers = this.messageHandlers.get(data.name);
                    handlers.forEach(handler => handler(msg));
                    this.messageHandlers.delete(data.name);
                }
                return; // Skip the generic handler below since we handled it
            }
            
            // Resolve waiting promises for other message types
            if (this.messageHandlers.has(data.name)) {
                const handlers = this.messageHandlers.get(data.name);
                handlers.forEach(handler => handler(data.msg || data));
                this.messageHandlers.delete(data.name);
            }
        } catch (e) {
            if (process.env.DEBUG === 'true') {
                logger.debug('[API] Raw message (not JSON)', { msg: msg.toString() });
            }
        }
    }
    
    /**
     * Handle profile events
     */
    handleProfileEvent(profile) {
        this.userProfile = profile;
        if (profile.balance !== undefined) {
            this.balance = profile.balance;
        }
        if (profile.balances && profile.balances.length > 0) {
            this.balances = profile.balances;
        }
        this.isAuthenticated = true;
        logger.info('Profile received via event', { 
            balance: this.balance,
            balancesCount: profile.balances?.length 
        });
    }
    
    /**
     * Handle API errors
     */
    handleApiError(error) {
        logger.error('WebSocket error', error);
    }
    
    /**
     * Handle API disconnect
     */
    handleApiDisconnect() {
        logger.warn('WebSocket disconnected');
        this.isConnected = false;
        this.isAuthenticated = false;
    }
    
    /**
     * Remove all API event listeners
     */
    removeAllListeners() {
        if (this.api && this._boundHandlers) {
            this.api.removeListener('message', this._boundHandlers.message);
            this.api.removeListener('profile', this._boundHandlers.profile);
            this.api.removeListener('error', this._boundHandlers.error);
            this.api.removeListener('disconnect', this._boundHandlers.disconnect);
        }
    }

    /**
     * Wait for a specific message type from WebSocket
     */
    waitForMessage(messageType, timeout = 15000) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                // Clean up handler
                if (this.messageHandlers.has(messageType)) {
                    const handlers = this.messageHandlers.get(messageType);
                    const index = handlers.indexOf(handler);
                    if (index > -1) handlers.splice(index, 1);
                    
                    // Clean up empty arrays
                    if (handlers.length === 0) {
                        this.messageHandlers.delete(messageType);
                    }
                }
                reject(new Error(`Timeout waiting for message: ${messageType}`));
            }, timeout);
            
            const handler = (data) => {
                clearTimeout(timer);
                resolve(data);
            };
            
            // Store handler
            if (!this.messageHandlers.has(messageType)) {
                this.messageHandlers.set(messageType, []);
            }
            this.messageHandlers.get(messageType).push(handler);
        });
    }

    /**
     * Handle disconnection with auto-reconnect
     */
    handleDisconnect() {
        if (!this.isConnected) return;
        
        this.isConnected = false;
        this.isAuthenticated = false;
        this.stopHeartbeat();
        this.stopConnectionCheck();
        
        this.emit('disconnected');
        
        if (this.email && this.password && this.reconnectAttempts < this.maxReconnectAttempts) {
            logger.info('[API] Scheduling auto-reconnect...');
            this.scheduleReconnect();
        }
    }

    /**
     * Schedule reconnection with exponential backoff
     */
    scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            logger.error('[API] Max reconnection attempts reached');
            this.emit('maxReconnectReached');
            return false;
        }
        
        this.reconnectAttempts++;
        const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), this.maxReconnectDelay);
        
        logger.info(`[API] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        console.log(`🔄 Reconnecting in ${delay/1000}s... (attempt ${this.reconnectAttempts})`);
        
        // Store subscriptions to restore after reconnect
        const subscriptionsToRestore = Array.from(this.activeSubscriptions);
        
        setTimeout(() => {
            this.connect().then(async () => {
                // Re-subscribe to price streams after successful reconnect
                if (subscriptionsToRestore.length > 0) {
                    logger.info('[API] Restoring price subscriptions after reconnect', { pairs: subscriptionsToRestore });
                    console.log(`📡 Restoring ${subscriptionsToRestore.length} price subscriptions...`);
                    
                    for (const pair of subscriptionsToRestore) {
                        try {
                            await this.subscribePrice(pair);
                            await this.sleep(500); // Small delay between subscriptions
                        } catch (err) {
                            logger.warn(`[API] Failed to restore subscription for ${pair}`, err.message);
                        }
                    }
                    
                    console.log(`✅ Price subscriptions restored`);
                }
            }).catch(error => {
                logger.error('[API] Reconnect failed', error);
            });
        }, delay);
        
        return true;
    }

    /**
     * Start heartbeat
     */
    startHeartbeat() {
        this.stopHeartbeat();
        
        this.heartbeatInterval = setInterval(() => {
            if (this.isConnected && this.api?.ping) {
                try {
                    this.api.ping();
                    logger.debug('[API] Heartbeat ping sent');
                } catch (error) {
                    logger.error('[API] Heartbeat failed', error);
                }
            }
        }, this.heartbeatMs);
        
        logger.info('[API] Heartbeat started');
    }

    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    startConnectionCheck() {
        this.stopConnectionCheck();
        
        this.connectionCheckInterval = setInterval(() => {
            if (!this.isConnected) return;
            
            const timeSinceLastPong = Date.now() - this.lastPong;
            if (timeSinceLastPong > this.connectionTimeout) {
                logger.warn(`[API] Connection stale, reconnecting...`);
                this.handleDisconnect();
            }
        }, this.connectionCheckMs);
    }

    stopConnectionCheck() {
        if (this.connectionCheckInterval) {
            clearInterval(this.connectionCheckInterval);
            this.connectionCheckInterval = null;
        }
    }

    async waitForConnection(timeout = 30000) {
        return new Promise((resolve) => {
            const startTime = Date.now();
            const check = () => {
                if (this.isConnected) {
                    resolve(true);
                    return;
                }
                if (Date.now() - startTime > timeout) {
                    resolve(false);
                    return;
                }
                setTimeout(check, 500);
            };
            check();
        });
    }

    getStats() {
        return {
            isConnected: this.isConnected,
            isAuthenticated: this.isAuthenticated,
            reconnectAttempts: this.reconnectAttempts,
            networkFailCount: this.networkFailCount,
            lastPong: this.lastPong,
            timeSinceLastPong: Date.now() - this.lastPong,
            balance: this.balance,
            accountType: this.accountType
        };
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 🔥 NETWORK RESILIENCE: Detect if network is blocked
     */
    async detectNetworkBlock() {
        console.log('🔍 Detecting network status...');
        
        const results = {
            dns: false,
            https: false,
            blocked: false,
            reason: null
        };
        
        // Test 1: DNS Lookup
        try {
            const dns = require('dns');
            await new Promise((resolve, reject) => {
                dns.lookup('iqoption.com', (err, address) => {
                    if (err) reject(err);
                    else {
                        results.dns = true;
                        results.dnsAddress = address;
                        resolve(address);
                    }
                });
            });
        } catch (err) {
            console.log('❌ DNS failed:', err.message);
            results.reason = 'DNS failed: ' + err.message;
        }
        
        // Test 2: HTTPS Connection
        try {
            const https = require('https');
            await new Promise((resolve, reject) => {
                const req = https.get('https://iqoption.com', {
                    timeout: 10000,
                    rejectUnauthorized: false
                }, (res) => {
                    results.https = true;
                    results.statusCode = res.statusCode;
                    resolve();
                });
                
                req.on('error', (err) => {
                    reject(err);
                });
                
                req.on('timeout', () => {
                    req.destroy();
                    reject(new Error('HTTPS timeout'));
                });
            });
        } catch (err) {
            console.log('❌ HTTPS failed:', err.message);
            if (!results.reason) {
                results.reason = 'HTTPS failed: ' + err.message;
            }
        }
        
        // Determine if blocked
        results.blocked = !results.dns || !results.https;
        
        if (results.blocked) {
            console.log('🚨 NETWORK BLOCKED:', results.reason);
            this.networkBlocked = true;
            this.networkMode = 'OFFLINE';
        } else {
            console.log('✅ Network OK');
            this.networkBlocked = false;
            this.networkMode = 'ONLINE';
        }
        
        return results;
    }

    /**
     * 🔥 NETWORK RESILIENCE: Switch to offline mode
     */
    enableOfflineMode() {
        console.log('📴 Enabling OFFLINE mode...');
        this.networkMode = 'OFFLINE';
        this.mockDataEnabled = true;
        this.isConnected = true; // Simulate connected
        this.isAuthenticated = true; // Simulate authenticated
        
        // Initialize mock prices
        this.initializeMockData();
        
        console.log('✅ Offline mode enabled - using mock data');
        this.emit('connected', { 
            balance: 10000, 
            accountType: 'PRACTICE',
            mode: 'OFFLINE'
        });
        
        return true;
    }

    /**
     * 🔥 NETWORK RESILIENCE: Initialize mock data
     */
    initializeMockData() {
        const pairs = ['EURUSD-OTC', 'GBPUSD-OTC', 'USDJPY-OTC', 'EURGBP-OTC'];
        
        pairs.forEach(pair => {
            // Set initial mock price
            const basePrice = this.getBasePriceForPair(pair);
            this.mockPrices.set(pair, {
                price: basePrice,
                timestamp: Date.now()
            });
            
            // Generate mock candles
            this.mockCandles.set(pair, this.generateMockCandles(pair, basePrice));
        });
        
        // Start mock price updater
        this.startMockPriceUpdater();
    }

    /**
     * 🔥 NETWORK RESILIENCE: Get base price for pair
     */
    getBasePriceForPair(pair) {
        const prices = {
            'EURUSD-OTC': 1.0850,
            'GBPUSD-OTC': 1.2650,
            'USDJPY-OTC': 148.50,
            'EURGBP-OTC': 0.8580,
            'AUDUSD-OTC': 0.6580,
            'USDCAD-OTC': 1.3580
        };
        return prices[pair] || 1.0000;
    }

    /**
     * 🔥 NETWORK RESILIENCE: Generate mock candles
     */
    generateMockCandles(pair, basePrice, count = 100) {
        const candles = [];
        let currentPrice = basePrice;
        const now = Date.now();
        const interval = 60000; // 1 minute
        
        for (let i = count - 1; i >= 0; i--) {
            const timestamp = now - (i * interval);
            
            // Generate realistic price movement
            const volatility = basePrice * 0.001; // 0.1% volatility
            const change = (Math.random() - 0.5) * volatility;
            
            const open = currentPrice;
            const close = currentPrice + change;
            const high = Math.max(open, close) + Math.random() * volatility * 0.5;
            const low = Math.min(open, close) - Math.random() * volatility * 0.5;
            const volume = Math.floor(Math.random() * 1000) + 100;
            
            candles.push({
                timestamp: Math.floor(timestamp / 1000),
                open,
                high,
                low,
                close,
                volume
            });
            
            currentPrice = close;
        }
        
        return candles;
    }

    /**
     * 🔥 NETWORK RESILIENCE: Start mock price updater
     */
    startMockPriceUpdater() {
        // Update mock prices every 5 seconds
        this.mockPriceInterval = setInterval(() => {
            for (const [pair, data] of this.mockPrices) {
                const volatility = data.price * 0.0002; // 0.02% per update
                const change = (Math.random() - 0.5) * volatility;
                const newPrice = data.price + change;
                
                this.mockPrices.set(pair, {
                    price: newPrice,
                    timestamp: Date.now()
                });
                
                // Emit price update event
                this.emit('priceUpdate', {
                    pair,
                    price: newPrice,
                    timestamp: Date.now()
                });
            }
        }, 5000);
        
        console.log('🔄 Mock price updater started');
    }

    /**
     * 🔥 NETWORK RESILIENCE: Stop mock price updater
     */
    stopMockPriceUpdater() {
        if (this.mockPriceInterval) {
            clearInterval(this.mockPriceInterval);
            this.mockPriceInterval = null;
        }
    }

    /**
     * 🔥 NETWORK RESILIENCE: Get mock candles
     */
    getMockCandles(pair, interval = 60, count = 100) {
        if (!this.mockCandles.has(pair)) {
            const basePrice = this.getBasePriceForPair(pair);
            this.mockCandles.set(pair, this.generateMockCandles(pair, basePrice, count));
        }
        
        let candles = this.mockCandles.get(pair);
        
        // If we need more candles, generate more
        if (candles.length < count) {
            const basePrice = this.getBasePriceForPair(pair);
            const newCandles = this.generateMockCandles(pair, basePrice, count);
            this.mockCandles.set(pair, newCandles);
            candles = newCandles;
        }
        
        // Return last 'count' candles
        return candles.slice(-count);
    }

    /**
     * 🔥 NETWORK RESILIENCE: Get mock price
     */
    getMockPrice(pair) {
        if (!this.mockPrices.has(pair)) {
            const basePrice = this.getBasePriceForPair(pair);
            this.mockPrices.set(pair, {
                price: basePrice,
                timestamp: Date.now()
            });
        }
        
        return this.mockPrices.get(pair).price;
    }

    /**
     * Check network connectivity to IQ Option
     */
    async checkNetwork() {
        try {
            console.log('🌐 Checking network connectivity...');
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);
            
            const response = await fetch('https://iqoption.com', { 
                signal: controller.signal,
                method: 'HEAD'
            });
            
            clearTimeout(timeout);
            
            if (response.ok) {
                console.log('✅ Network connectivity OK');
                return true;
            }
            throw new Error(`Network check failed: ${response.status}`);
        } catch (error) {
            console.log('⚠️ Network check warning:', error.message);
            // 🔥 FIX: Don't fail immediately - allow fallback
            // Network check might fail due to various reasons (proxy, firewall, etc.)
            // but the actual API might still work
            console.log('⚠️ Network check failed, but continuing... (will try direct connection)');
            return true; // Allow connection attempt anyway
        }
    }

    /**
     * Connect with Self-Healing System + Timeout + Retry + Network Detection
     */
    async connect() {
        // 🔥 FORCE RESET - Prevent deadlock from stuck state
        if (this.isReconnecting) {
            console.log('⚠️ Detected stuck connection state, forcing reset...');
            this.forceCleanup();
        }

        // 🔥 DEBUG STATE
        console.log('🔍 STATE:', {
            isReconnecting: this.isReconnecting,
            isConnected: this.isConnected,
            hasAPI: !!this.api,
            hasListeners: !!this._boundHandlers
        });

        // 🔥 DETECT NETWORK BLOCK FIRST
        console.log('\n🔍 Detecting network status...');
        const networkStatus = await this.detectNetworkBlock();
        
        if (networkStatus.blocked) {
            console.log('🚨 Network blocked detected! Switching to OFFLINE mode...');
            return this.enableOfflineMode();
        }

        // Retry loop for actual connection
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                console.log(`\n🔌 Connection attempt ${attempt}/3...`);

                const result = await this._doConnect();
                if (result) {
                    console.log('✅ Connection successful!');
                    this.networkMode = 'ONLINE';
                    return true;
                }
            } catch (error) {
                console.error(`❌ Attempt ${attempt} failed:`, error.message);
                
                // 🔥 FORCE CLEANUP ON FAILURE
                this.forceCleanup();
                
                if (attempt < 3) {
                    const delay = 2000 * attempt;
                    console.log(`🔄 Retrying in ${delay}ms...`);
                    await this.sleep(delay);
                } else {
                    console.error('❌ All connection attempts exhausted');
                    // 🔥 AUTO-SWITCH TO OFFLINE MODE
                    console.log('🔄 Switching to OFFLINE mode...');
                    return this.enableOfflineMode();
                }
            }
        }
        
        // If we get here, all attempts failed - use offline mode
        return this.enableOfflineMode();
    }

    /**
     * Force cleanup connection resources
     */
    forceCleanup() {
        console.log('🧹 Force cleaning up connection resources...');
        
        // Reset flags
        this.isReconnecting = false;
        this.isConnected = false;
        this.isAuthenticated = false;
        
        // Stop intervals
        this.stopHeartbeat();
        this.stopConnectionCheck();
        
        // Remove listeners
        if (this.api && this._boundHandlers) {
            try {
                this.api.removeListener('message', this._boundHandlers.message);
                this.api.removeListener('profile', this._boundHandlers.profile);
                this.api.removeListener('error', this._boundHandlers.error);
                this.api.removeListener('disconnect', this._boundHandlers.disconnect);
            } catch (e) {
                // Ignore errors during cleanup
            }
        }
        
        // Kill WebSocket
        if (this.api && this.api.ws) {
            try {
                this.api.ws.close();
            } catch (e) {
                // Ignore
            }
        }
        
        // Reset API instance
        this.api = null;
        this._boundHandlers = null;
        
        console.log('🧹 Cleanup complete');
    }

    /**
     * Internal connection with timeout
     */
    async _doConnect() {
        if (!this.email || !this.password) {
            throw new Error('Credentials not set. Call setCredentials() first.');
        }

        // Prevent multiple simultaneous connection attempts
        if (this.isReconnecting) {
            logger.warn('[API] Connection already in progress, waiting...');
            await this.waitForConnection(30000);
            return this.isConnected;
        }

        this.isReconnecting = true;
        
        // 🔥 ENSURE CLEANUP ON ANY ERROR
        try {
            logger.info('[API] Connecting to IQ Option API...');
            console.log('🔌 Creating API instance...');

            // Create IQOption instance
            this.api = new IQOption({
                email: this.email,
                password: this.password
            });

            // Login with timeout - INCREASED to 30s for slower networks
            console.log('⏳ Logging in... (30s timeout)');
            logger.info('[API] Logging in...');
            
            // 🔥 DEBUG: Track login promise state
            let loginResolved = false;
            const loginPromise = this.api.login().then(result => {
                loginResolved = true;
                console.log('✅ Login promise resolved');
                return result;
            }).catch(err => {
                loginResolved = true;
                console.log('❌ Login promise rejected:', err.message);
                throw err;
            });
            
            const loginTimeout = new Promise((_, reject) => 
                setTimeout(() => {
                    if (!loginResolved) {
                        reject(new Error('Login timeout after 30s - login promise never resolved'));
                    }
                }, 30000)
            );
            
            await Promise.race([loginPromise, loginTimeout]);
            console.log('✅ Login successful');
            logger.info('[API] Login successful');

            // Set up event listeners BEFORE connecting
            this.setupEventListeners();
            
            // Connect WebSocket - INCREASED to 30s
            console.log('⏳ Opening WebSocket... (30s timeout)');
            logger.info('[API] Opening WebSocket connection...');
            
            const wsPromise = this.api.connect();
            const wsTimeout = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('WebSocket timeout after 30s')), 30000)
            );
            
            await Promise.race([wsPromise, wsTimeout]);
            console.log('✅ WebSocket connected');
            logger.info('[API] WebSocket connected');

            // WebSocket connected = authenticated
            this.isAuthenticated = true;
            this.lastPong = Date.now();
            
            // Try to get balance info but don't block on it
            try {
                await this.requestBalanceInfo(5000);
            } catch (error) {
                logger.warn('[API] Could not get balance info immediately', error.message);
                this.balance = 0;
            }
            
            // Select account type
            await this.selectAccountType();
            
            // Reset counters on successful connection
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.reconnectDelay = 1000;
            this.networkFailCount = 0;
            
            // Start Self-Healing Systems
            this.startHeartbeat();
            this.startConnectionCheck();
            
            logger.info('[API] Successfully connected', {
                accountType: this.accountType,
                balance: this.balance,
                balanceId: this.balanceId
            });
            console.log(`✅ Connected! Balance: $${this.balance}`);

            this.emit('connected', { balance: this.balance, accountType: this.accountType });
            return true;
            
        } catch (error) {
            // 🔥 CRITICAL: Always reset flag on error
            this.isReconnecting = false;
            throw error;
        } finally {
            // 🔥 ALWAYS reset isReconnecting when done (success or fail)
            this.isReconnecting = false;
        }
    }

    /**
     * Wait for profile data from WebSocket
     */
    async waitForProfile(timeout = 30000) {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            
            const checkProfile = () => {
                if (this.isAuthenticated && this.userProfile) {
                    resolve(true);
                    return;
                }
                
                if (Date.now() - startTime > timeout) {
                    reject(new Error('Timeout waiting for profile'));
                    return;
                }
                
                setTimeout(checkProfile, 500);
            };
            
            checkProfile();
        });
    }

    /**
     * Select PRACTICE or REAL account
     */
    async selectAccountType() {
        if (!this.balances || this.balances.length === 0) {
            throw new Error('No balances available');
        }

        // Type 4 = PRACTICE, Type 1 = REAL
        const targetType = this.accountType === 'PRACTICE' ? 4 : 1;
        const balance = this.balances.find(b => b.type === targetType);

        if (!balance) {
            throw new Error(`${this.accountType} account not found`);
        }

        this.balanceId = balance.id;
        this.balance = balance.amount || 0;
        
        logger.info(`Account selected`, {
            type: this.accountType,
            balanceId: this.balanceId,
            balance: this.balance
        });
    }

    /**
     * Get current balance
     */
    async getBalance() {
        if (!this.isConnected) {
            throw new Error('Not connected');
        }
        
        // Refresh balance from profile
        const balance = this.balances?.find(b => b.id === this.balanceId);
        return balance?.amount || this.balance || 0;
    }

    /**
     * Get candles for a pair using WebSocket with cache management
     */
    async getCandles(pair, interval = 60, count = 100, attempt = 1) {
        // 🔥 OFFLINE MODE: Return mock candles
        if (this.networkMode === 'OFFLINE' || this.mockDataEnabled) {
            console.log(`📴 [OFFLINE] Getting mock candles for ${pair}`);
            return this.getMockCandles(pair, interval, count);
        }
        
        if (!this.isConnected) {
            throw new Error('Not connected');
        }

        const activeId = this.getActiveId(pair);
        const key = `${pair}_${interval}`;
        
        // Update cache access order for LRU
        this.updateCacheAccessOrder(key);
        
        logger.info(`[API] Getting candles for ${pair}`, { activeId, interval, count, attempt });

        try {
            // Calculate time range
            const now = Math.floor(Date.now() / 1000);
            const fromTime = now - (count * interval);

            // Try different message formats
            const messageFormats = [
                // Format 1: get-candles (most common for IQ Option)
                {
                    name: 'get-candles',
                    version: '2.0',
                    body: {
                        active_id: activeId,
                        size: interval,
                        to: now,
                        count: count
                    }
                },
                // Format 2: candles (alternative)
                {
                    name: 'candles',
                    version: '2.0',
                    body: {
                        active_id: activeId,
                        size: interval,
                        from: fromTime,
                        to: now
                    }
                },
                // Format 3: chart data request
                {
                    name: 'sendMessage',
                    msg: {
                        name: 'get-candles',
                        body: {
                            active_id: activeId,
                            size: interval,
                            to: now,
                            count: count
                        }
                    }
                }
            ];

            // Try each format
            for (let i = 0; i < messageFormats.length; i++) {
                const message = messageFormats[i];
                logger.debug(`[API] Trying candles format ${i + 1}/${messageFormats.length}`, { name: message.name });
                
                try {
                    // Start listening for response before sending
                    const responsePromise = this.waitForMessage('candles', 10000).catch(() => 
                        this.waitForMessage('chart', 10000).catch(() =>
                            this.waitForMessage('candle', 10000).catch(() => null)
                        )
                    );
                    
                    // Send the request
                    this.api.send(message);
                    
                    // Wait for response
                    const result = await responsePromise;
                    
                    if (result) {
                        logger.info(`[API] Got candles response with format ${i + 1}`);
                        
                        // Parse response
                        let candles = null;
                        
                        // Try to extract candles from result
                        if (result.candles && Array.isArray(result.candles)) {
                            candles = result.candles;
                        } else if (result.data && Array.isArray(result.data)) {
                            candles = result.data;
                        } else if (Array.isArray(result)) {
                            candles = result;
                        } else if (result.items && Array.isArray(result.items)) {
                            candles = result.items;
                        }
                        
                        if (candles && candles.length > 0) {
                            // Normalize candle format
                            const normalizedCandles = candles.map(c => ({
                                timestamp: c.time || c.timestamp || c.from || c.open_time || 0,
                                open: parseFloat(c.open) || 0,
                                high: parseFloat(c.high) || 0,
                                low: parseFloat(c.low) || 0,
                                close: parseFloat(c.close) || 0,
                                volume: parseFloat(c.volume) || 0
                            })).filter(c => c.timestamp > 0).sort((a, b) => a.timestamp - b.timestamp);

                            if (normalizedCandles.length > 0) {
                                this.setCandlesCache(key, normalizedCandles);
                                logger.info(`[API] Got ${normalizedCandles.length} candles for ${pair} (format ${i + 1})`);
                                return normalizedCandles;
                            }
                        }
                    }
                    
                } catch (formatError) {
                    logger.debug(`[API] Format ${i + 1} failed: ${formatError.message}`);
                }
            }
            
            // All formats failed, try using library's built-in method if available
            if (this.api.getCandles && typeof this.api.getCandles === 'function') {
                logger.info('[API] Trying library built-in getCandles()');
                const result = await this.api.getCandles(activeId, interval, count);
                if (result && Array.isArray(result) && result.length > 0) {
                    const normalizedCandles = result.map(c => ({
                        timestamp: c.time || c.timestamp || c.from || 0,
                        open: parseFloat(c.open) || 0,
                        high: parseFloat(c.high) || 0,
                        low: parseFloat(c.low) || 0,
                        close: parseFloat(c.close) || 0,
                        volume: parseFloat(c.volume) || 0
                    })).filter(c => c.timestamp > 0);
                    
                    this.setCandlesCache(key, normalizedCandles);
                    logger.info(`[API] Got ${normalizedCandles.length} candles from library`);
                    return normalizedCandles;
                }
            }
            
            // If we have cached candles, return them as fallback
            if (this.candles.has(key)) {
                this.updateCacheAccessOrder(key);
                const cached = this.candles.get(key);
                logger.info(`[API] Using ${cached.length} cached candles for ${pair}`);
                return cached;
            }
            
            throw new Error(`Unable to get candles for ${pair} - all methods failed`);
            
        } catch (error) {
            logger.error(`[API] Failed to get candles for ${pair} (attempt ${attempt})`, error);
            
            // Retry logic
            if (attempt < 3) {
                logger.info(`[API] Retrying candles request in 2000ms...`);
                await this.sleep(2000);
                return this.getCandles(pair, interval, count, attempt + 1);
            }
            
            // Return cached if available as last resort
            if (this.candles.has(key)) {
                this.updateCacheAccessOrder(key);
                const cached = this.candles.get(key);
                logger.info(`[API] Using cached candles after all retries failed`);
                return cached;
            }
            
            throw error;
        }
    }

    /**
     * Set candles cache with LRU eviction
     */
    setCandlesCache(key, candles) {
        // Check if we need to evict
        if (!this.candles.has(key) && this.candles.size >= this.maxCandlesCacheSize) {
            this.evictOldestCandles();
        }
        
        this.candles.set(key, candles);
        this.updateCacheAccessOrder(key);
    }
    
    /**
     * Update cache access order for LRU
     */
    updateCacheAccessOrder(key) {
        // Remove if exists
        const index = this.candlesAccessOrder.indexOf(key);
        if (index > -1) {
            this.candlesAccessOrder.splice(index, 1);
        }
        
        // Add to end (most recently used)
        this.candlesAccessOrder.push(key);
    }
    
    /**
     * Evict oldest candles from cache (LRU)
     */
    evictOldestCandles() {
        if (this.candlesAccessOrder.length > 0) {
            const oldestKey = this.candlesAccessOrder.shift();
            if (this.candles.has(oldestKey)) {
                this.candles.delete(oldestKey);
                logger.debug(`[API] Evicted oldest candles from cache: ${oldestKey}`);
            }
        }
    }

    /**
     * Place a trade with retry logic and statistics
     */
    async placeTrade({ pair, direction, amount, duration = 1 }, attempt = 1) {
        const startTime = Date.now();
        
        if (!this.isConnected) {
            throw new Error('Not connected');
        }

        if (!this.balanceId) {
            throw new Error('Balance not selected');
        }

        // Check for duplicate trade (within 5 seconds)
        const lastTrade = this.statistics.lastTradeTime;
        if (lastTrade && (Date.now() - lastTrade) < 5000) {
            logger.warn('[API] Duplicate trade prevention - too soon after last trade');
            return { success: false, error: 'Duplicate trade prevention' };
        }

        const activeId = this.getActiveId(pair);
        const normalizedDirection = direction.toLowerCase();
        
        logger.info(`[API] Placing trade (attempt ${attempt}/${this.tradeRetries})`, {
            pair, direction: normalizedDirection, amount, duration, activeId
        });

        try {
            // Calculate expiration time - optimized for speed
            const now = Math.floor(Date.now() / 1000);
            const currentMinute = Math.floor(now / 60) * 60;
            const nextMinute = currentMinute + 60;
            const expiration = nextMinute + (duration * 60);

            const message = {
                name: 'binary-options.open-option',
                version: '1.0',
                body: {
                    user_balance_id: this.balanceId,
                    active_id: activeId,
                    option_type_id: 3,
                    direction: normalizedDirection,
                    expired: expiration,
                    price: parseFloat(amount),
                    refund_value: 0
                }
            };

            logger.debug('[API] Sending trade message', { message });

            // Send via WebSocket with timeout
            const sendPromise = this.api.send(message, { returnMessage: true });
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Trade timeout')), 10000)
            );
            
            const result = await Promise.race([sendPromise, timeoutPromise]);

            const latency = Date.now() - startTime;
            this.recordLatency(latency);

            logger.debug('[API] Trade response', { result, latency: `${latency}ms` });

            // Check for errors
            if (result && result.message) {
                // Classify error
                const errorType = this.classifyError(result.message);
                
                logger.error('[API] Order rejected', { message: result.message, errorType });
                
                // Auto-fix: retry on certain errors
                if (errorType === 'RETRYABLE' && attempt < this.tradeRetries) {
                    logger.info(`[API] Retryable error, retrying in ${this.retryDelay}ms...`);
                    await this.sleep(this.retryDelay * attempt);
                    return this.placeTrade({ pair, direction, amount, duration }, attempt + 1);
                }
                
                // Auto-fix: switch to OTC pair if active suspended
                if (errorType === 'ACTIVE_SUSPENDED' && !pair.includes('-OTC')) {
                    const fallbackPair = this.activePairFallback[pair];
                    if (fallbackPair) {
                        logger.info(`[API] Switching to fallback pair: ${fallbackPair}`);
                        return this.placeTrade({ pair: fallbackPair, direction, amount, duration }, 1);
                    }
                }
                
                this.recordError(result.message);
                return { success: false, error: result.message, errorType };
            }

            // Get order ID
            const orderId = result?.id || result?.order_id;
            
            if (orderId) {
                this.statistics.lastTradeTime = Date.now();
                this.activeOrders.set(orderId.toString(), {
                    id: orderId,
                    pair,
                    direction: normalizedDirection,
                    amount,
                    status: 'open',
                    timestamp: Date.now(),
                    latency
                });
                
                this.recordTradeSuccess(pair, latency);
                
                logger.info('[API] Trade placed successfully', { orderId, latency: `${latency}ms` });
                return {
                    success: true,
                    id: orderId.toString(),
                    outcome: 'pending',
                    tradeId: orderId,
                    latency
                };
            }
            
            throw new Error('Trade placed but no order ID received');
            
        } catch (error) {
            const latency = Date.now() - startTime;
            this.recordLatency(latency);
            this.recordError(error.message);
            
            logger.error('[API] Trade execution failed', { error: error.message, latency: `${latency}ms` });
            
            // Retry on timeout or network errors
            if ((error.message.includes('timeout') || error.message.includes('network')) 
                && attempt < this.tradeRetries) {
                logger.info(`[API] Network error, retrying in ${this.retryDelay}ms...`);
                await this.sleep(this.retryDelay * attempt);
                return this.placeTrade({ pair, direction, amount, duration }, attempt + 1);
            }
            
            return { success: false, error: error.message };
        }
    }

    /**
     * Classify error for auto-fix system - OPTIMIZED with fast path for common errors
     */
    classifyError(errorMessage) {
        if (!errorMessage) return 'UNKNOWN';
        
        const msg = errorMessage.toLowerCase();
        
        // OPTIMIZED: Fast path check for most common errors first
        if (msg.includes('timeout')) return 'RETRYABLE';
        if (msg.includes('suspended')) return 'ACTIVE_SUSPENDED';
        if (msg.includes('balance')) return 'BALANCE_ERROR';
        if (msg.includes('network') || msg.includes('connection')) return 'RETRYABLE';
        if (msg.includes('rate limit')) return 'RATE_LIMIT';
        if (msg.includes('active')) return 'ACTIVE_SUSPENDED';
        if (msg.includes('insufficient')) return 'BALANCE_ERROR';
        if (msg.includes('too many')) return 'RATE_LIMIT';
        
        return 'OTHER';
    }

    /**
     * Record latency for statistics
     */
    recordLatency(latency) {
        this.latencyHistory.push({ latency, timestamp: Date.now() });
        
        // Keep only last N entries
        if (this.latencyHistory.length > this.maxLatencyHistory) {
            this.latencyHistory.shift();
        }
        
        // Update average
        this.statistics.totalLatency += latency;
        this.statistics.avgLatency = this.statistics.totalLatency / (this.statistics.totalTrades + 1);
    }

    /**
     * Record successful trade
     */
    recordTradeSuccess(pair, latency) {
        this.statistics.totalTrades++;
        this.statistics.successfulTrades++;
        
        // Track pair performance
        const pairStats = this.statistics.pairsPerformance.get(pair) || { trades: 0, successes: 0 };
        pairStats.trades++;
        pairStats.successes++;
        this.statistics.pairsPerformance.set(pair, pairStats);
        
        // Track hourly stats
        const hour = new Date().getHours();
        const hourStats = this.statistics.hourlyStats.get(hour) || { trades: 0, successes: 0 };
        hourStats.trades++;
        hourStats.successes++;
        this.statistics.hourlyStats.set(hour, hourStats);
    }

    /**
     * Record error for statistics
     */
    recordError(errorMessage) {
        this.statistics.totalTrades++;
        this.statistics.failedTrades++;
        
        const count = this.statistics.errors.get(errorMessage) || 0;
        this.statistics.errors.set(errorMessage, count + 1);
    }

    /**
     * Get detailed statistics
     */
    getStatistics() {
        const successRate = this.statistics.totalTrades > 0 
            ? (this.statistics.successfulTrades / this.statistics.totalTrades * 100).toFixed(2)
            : 0;
            
        const recentLatencies = this.latencyHistory.slice(-10);
        const avgRecentLatency = recentLatencies.length > 0
            ? recentLatencies.reduce((sum, l) => sum + l.latency, 0) / recentLatencies.length
            : 0;
        
        return {
            ...this.statistics,
            successRate: `${successRate}%`,
            avgRecentLatency: `${avgRecentLatency.toFixed(0)}ms`,
            activeOrders: this.activeOrders.size,
            isConnected: this.isConnected
        };
    }

    /**
     * Sell/close an order early (if supported by the option)
     */
    async sell(orderId) {
        if (!this.isConnected) {
            throw new Error('Not connected');
        }

        try {
            logger.info(`[API] Selling order ${orderId}`);
            
            const message = {
                name: 'binary-options.sell',
                version: '1.0',
                body: {
                    order_id: parseInt(orderId)
                }
            };

            const sendPromise = this.api.send(message, { returnMessage: true });
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Sell timeout')), 10000)
            );
            
            const result = await Promise.race([sendPromise, timeoutPromise]);

            if (result && result.success) {
                logger.info(`[API] Order ${orderId} sold successfully`);
                return { success: true, orderId };
            }
            
            return { success: false, error: result?.message || 'Sell failed' };
            
        } catch (error) {
            logger.error(`[API] Failed to sell order ${orderId}`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get order information with retry and fallback
     */
    async getOrderInfo(orderId, attempt = 1) {
        if (!this.isConnected) {
            throw new Error('Not connected');
        }

        // Validate orderId
        if (!orderId) {
            throw new Error('Order ID is required');
        }

        try {
            // Try multiple methods to get order info
            
            // Method 1: Try getPositions if available
            if (this.api && typeof this.api.getPositions === 'function') {
                try {
                    const positions = await this.api.getPositions();
                    if (Array.isArray(positions)) {
                        const position = positions.find(p => 
                            p && p.id && p.id.toString() === orderId.toString()
                        );
                        if (position) {
                            return {
                                success: true,
                                order_id: orderId,
                                status: position.status,
                                profit: position.profit || 0,
                                amount: position.amount || 0,
                                close_time: position.close_time,
                                win_amount: position.win_amount
                            };
                        }
                    }
                } catch (posError) {
                    logger.debug(`[API] getPositions failed: ${posError.message}`);
                }
            }
            
            // Method 2: Try getPositionHistory if available
            if (this.api && typeof this.api.getPositionHistory === 'function') {
                try {
                    const history = await this.api.getPositionHistory();
                    if (Array.isArray(history)) {
                        const position = history.find(p => 
                            p && p.id && p.id.toString() === orderId.toString()
                        );
                        if (position) {
                            return {
                                success: true,
                                order_id: orderId,
                                status: position.status || 'closed',
                                profit: position.profit || 0,
                                amount: position.amount || 0,
                                close_time: position.close_time
                            };
                        }
                    }
                } catch (histError) {
                    logger.debug(`[API] getPositionHistory failed: ${histError.message}`);
                }
            }
            
            // Method 3: Check active orders cache
            const cachedOrder = this.activeOrders.get(orderId.toString());
            if (cachedOrder) {
                return {
                    success: true,
                    order_id: orderId,
                    status: cachedOrder.status || 'pending',
                    profit: cachedOrder.profit || 0,
                    amount: cachedOrder.amount || 0,
                    cached: true
                };
            }
            
            // Retry logic
            if (attempt < 3) {
                await this.sleep(1000 * attempt);
                return this.getOrderInfo(orderId, attempt + 1);
            }
            
            return {
                success: false,
                error: 'Order not found in any source'
            };
            
        } catch (error) {
            logger.error(`[API] Failed to get order info for ${orderId}`, error);
            
            if (attempt < 3) {
                await this.sleep(1000 * attempt);
                return this.getOrderInfo(orderId, attempt + 1);
            }
            
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get active ID from pair name with validation
     */
    getActiveId(pair) {
        if (!pair || typeof pair !== 'string') {
            logger.error('[API] Invalid pair provided to getActiveId:', pair);
            return 1; // Default to EURUSD
        }
        
        // Check direct mapping
        if (this.activeIdMap[pair]) {
            return this.activeIdMap[pair];
        }
        
        // Try OTC format - direct lookup since pair already includes -OTC
        if (pair.includes('-OTC')) {
            if (this.activeIdMap[pair]) {
                return this.activeIdMap[pair];
            }
        }
        
        // Try to get from API assets with safety check
        if (this.api && this.api.assets && typeof this.api.assets === 'function') {
            try {
                const asset = this.api.assets(pair) || 
                             this.api.assets(pair.slice(0, 3) + '/' + pair.slice(3));
                if (asset && asset.active_id) {
                    return asset.active_id;
                }
            } catch (e) {
                logger.debug(`[API] assets() lookup failed for ${pair}:`, e.message);
            }
        }
        
        // Try common variations
        const variations = [
            pair.replace('-OTC', ''),
            pair + '-OTC',
            pair.replace('-', ''),
            pair.replace('-', '/')
        ];
        
        for (const variant of variations) {
            if (this.activeIdMap[variant]) {
                logger.info(`[API] Found mapping for ${pair} as ${variant}`);
                return this.activeIdMap[variant];
            }
        }
        
        logger.warn(`[API] Unknown pair: ${pair}, defaulting to EURUSD (1)`);
        return 1; // Default to EURUSD
    }

    /**
     * Check connection status
     */
    isReady() {
        return this.isConnected && this.isAuthenticated && this.api !== null;
    }

    /**
     * Disconnect safely with full cleanup
     */
    disconnect() {
        this.stopHeartbeat();
        this.stopConnectionCheck();
        this.removeAllListeners();
        
        try {
            if (this.api) {
                this.api.disconnect();
            }
        } catch (error) {
            logger.error('[API] Error during disconnect', error);
        }
        
        this.isConnected = false;
        this.isAuthenticated = false;
        this.api = null;
        
        logger.info('[API] Disconnected');
    }
}

// Export singleton instance
module.exports = new UnifiedIQOptionAPI();
