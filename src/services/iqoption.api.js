/**
 * REAL IQ Option API Service
 * Uses WebSocket for live trading
 * 
 * IMPORTANT: This uses the unofficial IQ Option API
 * For production, consider using official APIs or broker partnerships
 */

const WebSocket = require('ws');
const axios = require('axios');
const EventEmitter = require('events');

class IQOptionAPI extends EventEmitter {
    constructor() {
        super();
        this.connected = false;
        this.authenticated = false;
        this.ws = null;
        this.balance = 0;
        this.balanceType = 'PRACTICE'; // or 'REAL'
        this.activeOrders = new Map();
        this.candles = new Map();
        this.ssid = null; // Session ID after login
        this.userProfile = null;
        this.latency = 0;
        this.lastPing = Date.now();
        
        // API endpoints
        this.apiUrl = 'wss://iqoption.com/echo/websocket';
        this.authUrl = 'https://auth.iqoption.com/api/v2/login';
    }

    /**
     * 1. LOGIN - Authenticate with email/password
     */
    async login(email, password) {
        console.log('� Logging in to IQ Option...');
        
        try {
            // Step 1: Get SSID via HTTP login
            const response = await axios.post(this.authUrl, {
                identifier: email,
                password: password
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            if (response.data.ssid) {
                this.ssid = response.data.ssid;
                console.log('✅ Login successful');
                
                // Step 2: Connect WebSocket with SSID
                await this.connectWebSocket();
                return true;
            } else {
                throw new Error('Login failed: No SSID received');
            }
            
        } catch (error) {
            console.error('❌ Login failed:', error.message);
            throw error;
        }
    }

    /**
     * 2. CONNECT WEBSOCKET - Real-time connection
     */
    async connectWebSocket() {
        return new Promise((resolve, reject) => {
            console.log('🔌 Connecting WebSocket...');
            
            this.ws = new WebSocket(this.apiUrl, {
                headers: {
                    'Cookie': `ssid=${this.ssid}`,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            this.ws.on('open', () => {
                console.log('✅ WebSocket connected');
                this.connected = true;
                
                // Authenticate with SSID
                this.sendMessage({
                    name: 'ssid',
                    msg: this.ssid
                });
                
                // Start heartbeat
                this.startHeartbeat();
                
                resolve(true);
            });

            this.ws.on('message', (data) => {
                this.handleMessage(JSON.parse(data));
            });

            this.ws.on('error', (error) => {
                console.error('❌ WebSocket error:', error.message);
                reject(error);
            });

            this.ws.on('close', () => {
                console.log('🔌 WebSocket closed');
                this.connected = false;
                this.authenticated = false;
            });
        });
    }

    /**
     * 3. GET BALANCE - Real balance from server
     */
    async getBalance() {
        if (!this.authenticated) {
            throw new Error('Not authenticated');
        }

        // Request profile to get balance
        this.sendMessage({
            name: 'profile',
            msg: null
        });

        // Wait for response
        return new Promise((resolve) => {
            const checkBalance = () => {
                if (this.balance > 0) {
                    resolve(this.balance);
                } else {
                    setTimeout(checkBalance, 100);
                }
            };
            checkBalance();
        });
    }

    /**
     * 4. GET CANDLES - Real market data
     */
    async getCandles(pair, interval, count) {
        if (!this.connected) {
            throw new Error('Not connected');
        }

        const activeId = this.getActiveId(pair);
        const requestId = Date.now().toString();

        this.sendMessage({
            name: 'candles',
            request_id: requestId,
            msg: {
                active_id: activeId,
                size: interval,
                to: Math.floor(Date.now() / 1000),
                count: count
            }
        });

        return new Promise((resolve) => {
            const checkCandles = () => {
                const candles = this.candles.get(`${pair}_${interval}`);
                if (candles && candles.length >= count) {
                    resolve(candles);
                } else {
                    setTimeout(checkCandles, 200);
                }
            };
            
            // Timeout after 5 seconds
            setTimeout(() => {
                const candles = this.candles.get(`${pair}_${interval}`) || [];
                resolve(candles);
            }, 5000);
            
            checkCandles();
        });
    }

    /**
     * 5. PLACE TRADE - Real order execution
     */
    async placeTrade({ pair, direction, amount, duration = 1 }) {
        const startTime = Date.now(); // LATENCY CHECK START
        
        if (!this.authenticated) {
            throw new Error('Not authenticated');
        }

        // Check balance
        const balance = await this.getBalance();
        if (balance < amount) {
            throw new Error(`Insufficient balance: $${balance} < $${amount}`);
        }

        const activeId = this.getActiveId(pair);
        const userBalanceId = this.getUserBalanceId();

        // LATENCY CHECK: If taking too long, skip
        const elapsed = Date.now() - startTime;
        if (elapsed > 300) {
            console.log(`⚠️ High latency (${elapsed}ms) - skipping trade`);
            return { success: false, error: 'High latency' };
        }

        const tradeId = Date.now().toString();

        this.sendMessage({
            name: 'buy',
            request_id: tradeId,
            msg: {
                price: amount,
                act: activeId,
                time: duration * 60, // Convert to seconds
                direction: direction.toLowerCase(),
                user_balance_id: userBalanceId,
                exp_value: 85 // Expected payout percentage
            }
        });

        return new Promise((resolve) => {
            const checkResult = () => {
                const order = this.activeOrders.get(tradeId);
                if (order && order.status === 'closed') {
                    const profit = order.profit || 0;
                    const outcome = profit > 0 ? 'win' : profit < 0 ? 'loss' : 'tie';
                    
                    // Update balance
                    this.balance += profit;
                    
                    resolve({
                        success: true,
                        id: tradeId,
                        outcome: outcome,
                        profit: profit,
                        latency: Date.now() - startTime
                    });
                } else {
                    setTimeout(checkResult, 100);
                }
            };
            
            // Timeout after duration + 5 seconds
            setTimeout(() => {
                resolve({
                    success: true,
                    id: tradeId,
                    outcome: 'pending',
                    profit: 0,
                    latency: Date.now() - startTime
                });
            }, (duration * 60 + 5) * 1000);
            
            checkResult();
        });
    }

    /**
     * 6. HANDLE INCOMING MESSAGES
     */
    handleMessage(message) {
        const { name, msg, request_id } = message;

        switch (name) {
            case 'profile':
                this.userProfile = msg;
                if (msg.balance) {
                    this.balance = msg.balance;
                    this.balanceType = msg.balance_type || 'PRACTICE';
                }
                this.authenticated = true;
                this.emit('authenticated', msg);
                break;

            case 'candles':
                if (msg.candles) {
                    const key = `${msg.active_id}_${msg.size}`;
                    this.candles.set(key, msg.candles);
                }
                break;

            case 'buyComplete':
                if (request_id) {
                    this.activeOrders.set(request_id, {
                        id: request_id,
                        status: 'open',
                        ...msg
                    });
                }
                break;

            case 'optionClosed':
                if (msg.id) {
                    const order = this.activeOrders.get(msg.id.toString());
                    if (order) {
                        order.status = 'closed';
                        order.profit = msg.profit || 0;
                        order.win = msg.win;
                        this.emit('tradeClosed', order);
                    }
                }
                break;

            case 'heartbeat':
                this.lastPing = Date.now();
                break;

            case 'error':
                console.error('❌ API Error:', msg);
                this.emit('error', msg);
                break;
        }
    }

    /**
     * SEND MESSAGE TO SERVER
     */
    sendMessage(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        }
    }

    /**
     * HEARTBEAT - Keep connection alive
     */
    startHeartbeat() {
        // Clear any existing heartbeat
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }
        
        this.heartbeatInterval = setInterval(() => {
            if (this.connected) {
                this.sendMessage({ name: 'heartbeat', msg: Date.now() });
            }
        }, 30000); // Every 30 seconds
    }
    
    /**
     * Stop heartbeat
     */
    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    /**
     * UTILITY: Convert pair name to active ID
     */
    getActiveId(pair) {
        const mapping = {
            'EURUSD': 1,
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
        return mapping[pair] || 1;
    }

    /**
     * UTILITY: Get user balance ID
     */
    getUserBalanceId() {
        if (this.userProfile && this.userProfile.balances) {
            const balance = this.userProfile.balances.find(
                b => b.type === this.balanceType
            );
            return balance ? balance.id : null;
        }
        return null;
    }

    /**
     * CHECK CONNECTION
     */
    isConnected() {
        return this.connected && this.authenticated;
    }

    /**
     * DISCONNECT with proper cleanup
     */
    disconnect() {
        this.stopHeartbeat();
        if (this.ws) {
            this.ws.close();
        }
        this.connected = false;
        this.authenticated = false;
    }
}

module.exports = IQOptionAPI;
