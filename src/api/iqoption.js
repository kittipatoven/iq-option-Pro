const IQOption = require('iqoption');
const logger = require('../utils/logger');

class IQOptionAPI {
    constructor() {
        this.api = null;
        this.isConnected = false;
        this.accountType = process.env.ACCOUNT_TYPE || 'PRACTICE';
        this.email = null;
        this.password = null;
    }

    /**
     * Set user credentials for IQ Option API
     * @param {string} email - User email
     * @param {string} password - User password (hidden from logs)
     * @param {string} accountType - Account type (PRACTICE/REAL)
     */
    setCredentials(email, password, accountType = null) {
        if (!email || !password) {
            throw new Error('Email and password are required');
        }
        
        this.email = email.trim();
        this.password = password;
        
        if (accountType) {
            this.accountType = accountType.toUpperCase();
        }
        
        // Security: Log only email, never password
        logger.info('IQ Option credentials set', { 
            email: this.email,
            accountType: this.accountType,
            hasPassword: true
        });
    }

    /**
     * Wait for balances to be loaded via WebSocket
     * @param {number} timeout - Timeout in milliseconds
     * @returns {Promise<Array>} Balances array
     */
    async waitForBalances(timeout = 10000) {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            
            const checkBalances = () => {
                // Check if balances are loaded
                if (this.api && this.api.balances && this.api.balances.length > 0) {
                    logger.info('Balances loaded', { 
                        count: this.api.balances.length,
                        balances: this.api.balances.map(b => ({ id: b.id, type: b.type, amount: b.amount }))
                    });
                    resolve(this.api.balances);
                    return;
                }
                
                // Check timeout
                if (Date.now() - startTime > timeout) {
                    reject(new Error('Timeout waiting for balances'));
                    return;
                }
                
                // Try again in 500ms
                setTimeout(checkBalances, 500);
            };
            
            checkBalances();
        });
    }

    async connect() {
        try {
            logger.info('Connecting to IQ Option API...');
            
            // Validate credentials before connecting
            if (!this.email || !this.password) {
                throw new Error('IQ Option credentials not set. Call setCredentials() first.');
            }

            // Debug log
            logger.info('Login attempt', { email: this.email, hasPassword: !!this.password });

            // STEP 1: Create instance with credentials
            this.api = new IQOption({
                email: this.email,
                password: this.password
            });
            
            // STEP 2: Login (HTTP request to get SSID)
            logger.info('Logging in...');
            await this.api.login();
            logger.info('Login successful, got SSID');
            console.log('✅ LOGIN SUCCESS');

            // STEP 3: Connect WebSocket
            logger.info('Opening WebSocket connection...');
            await this.api.connect();
            logger.info('WebSocket connected');

            // STEP 4: Wait for balances to be loaded
            logger.info('Waiting for balances...');
            const balances = await this.waitForBalances(10000);
            
            if (!balances || balances.length === 0) {
                throw new Error('No balances found after waiting');
            }

            logger.info('Balances received', {
                count: balances.length,
                types: balances.map(b => b.type)
            });
            
            // Log balance for debugging
            const selectedBalance = balances.find(b => b.id === this.api.balance_id);
            const balanceAmount = selectedBalance ? selectedBalance.amount : this.api.balance;
            console.log('✅ BALANCE:', balanceAmount || 'N/A');

            // STEP 5: Select account type (PRACTICE = type 4, REAL = type 1)
            const practiceBalance = balances.find(b => b.type === 4);
            const realBalance = balances.find(b => b.type === 1);

            logger.info('Account balances found', {
                hasPractice: !!practiceBalance,
                hasReal: !!realBalance
            });

            if (this.accountType === 'PRACTICE') {
                if (!practiceBalance) {
                    throw new Error('PRACTICE account not found in balances');
                }
                this.api.balance_id = practiceBalance.id;
                logger.info('PRACTICE account selected', { 
                    balanceId: practiceBalance.id,
                    balance: practiceBalance.amount 
                });
            } else if (this.accountType === 'REAL') {
                if (!realBalance) {
                    throw new Error('REAL account not found in balances');
                }
                this.api.balance_id = realBalance.id;
                logger.info('REAL account selected', { 
                    balanceId: realBalance.id,
                    balance: realBalance.amount 
                });
            } else {
                throw new Error(`Invalid account type: ${this.accountType}`);
            }

            this.isConnected = true;
            
            logger.info('Successfully connected to IQ Option API', {
                accountType: this.accountType,
                balanceId: this.api.balance_id
            });
            
            return true;
        } catch (error) {
            logger.error('Failed to connect to IQ Option API', error);
            // NO FALLBACK TO MOCK IN REAL MODE
            throw new Error(`Real API connection failed: ${error.message}`);
        }
    }

    async switchAccount(type) {
        try {
            // ใช้ balance_id แทน changeAccountType (type 4 = PRACTICE, type 1 = REAL)
            const balances = this.api.balances;
            const targetBalance = balances.find(b => 
                (type === 'PRACTICE' && b.type === 4) || 
                (type === 'REAL' && b.type === 1)
            );
            
            if (!targetBalance) {
                throw new Error(`${type} account not found in balances`);
            }
            
            this.api.balance_id = targetBalance.id;
            this.accountType = type;
            
            logger.info(`Switched to ${type} account`, { balanceId: targetBalance.id });
            return true;
        } catch (error) {
            logger.error('Account switch failed', error);
            throw error;
        }
    }

    async getBalance() {
        try {
            if (!this.isConnected || !this.api) {
                throw new Error('Not connected to API');
            }
            
            // Find current balance by balance_id
            const balances = this.api.balances || [];
            const currentBalance = balances.find(b => b.id === this.api.balance_id);
            
            if (!currentBalance) {
                logger.warn('Current balance not found', { balanceId: this.api.balance_id });
                return 0;
            }
            
            const amount = currentBalance.amount || 0;
            logger.debug('Current balance', { 
                amount, 
                balanceId: this.api.balance_id,
                type: currentBalance.type 
            });
            return amount;
        } catch (error) {
            logger.error('Failed to get balance', error);
            return 0;
        }
    }

    async getCandles(pair, timeframe = 60, count = 100) {
        try {
            if (!this.isConnected) {
                throw new Error('Not connected to API');
            }
            
            // Get active_id from pair name
            let active = this.api.constructor.assets(pair);
            
            // If not found, try various formats
            if (!active) {
                // Try with slash (EURUSD -> EUR/USD)
                if (!pair.includes('/')) {
                    const pairWithSlash = pair.slice(0, 3) + '/' + pair.slice(3);
                    active = this.api.constructor.assets(pairWithSlash);
                }
                
                // Try OTC format (EURUSD-OTC -> EUR/USD (OTC))
                if (!active && pair.includes('-OTC')) {
                    const basePair = pair.replace('-OTC', '');
                    const otcPair = basePair.slice(0, 3) + '/' + basePair.slice(3) + ' (OTC)';
                    active = this.api.constructor.assets(otcPair);
                }
                
                // Try direct OTC (EURUSD -> EURUSD (OTC))
                if (!active) {
                    const otcPair = pair + ' (OTC)';
                    active = this.api.constructor.assets(otcPair);
                }
            }
            
            if (!active) {
                throw new Error(`Unknown pair: ${pair}`);
            }
            
            logger.debug(`Collecting ${count} candles for ${pair} via subscription (active_id: ${active.active_id})`);
            
            // Use subscription to collect candles in real-time
            const candles = [];
            const maxWaitTime = 30000; // 30 seconds max
            const startTime = Date.now();
            
            return new Promise(async (resolve, reject) => {
                // Set timeout
                const timeout = setTimeout(() => {
                    if (candles.length >= count / 2) {
                        logger.warn(`Timeout reached, returning ${candles.length} candles`);
                        resolve(candles.slice(-count));
                    } else {
                        reject(new Error(`Timeout waiting for candles. Got ${candles.length}, needed ${count}`));
                    }
                }, maxWaitTime);
                
                // Subscribe to candles
                const handleCandle = (candle) => {
                    // Transform to standard format
                    candles.push({
                        open: candle.open,
                        high: candle.max,
                        low: candle.min,
                        close: candle.close,
                        volume: candle.volume || 0,
                        timestamp: Math.floor(candle.from)
                    });
                    
                    // Keep only last count candles
                    if (candles.length > count * 2) {
                        candles.shift();
                    }
                    
                    // Check if we have enough
                    if (candles.length >= count) {
                        clearTimeout(timeout);
                        this.api.off('candle-generated', handleCandle);
                        resolve(candles.slice(-count));
                    }
                };
                
                this.api.on('candle-generated', handleCandle);
                
                // Subscribe to the pair
                try {
                    await this.api.subscribe('candle-generated', {
                        active_id: active.active_id,
                        size: timeframe
                    });
                } catch (subError) {
                    clearTimeout(timeout);
                    reject(subError);
                }
            });
        } catch (error) {
            logger.error(`Failed to get candles for ${pair}`, error);
            throw error;
        }
    }

    async buy(pair, amount, direction, expiry = 1) {
        try {
            if (!this.isConnected || !this.api) {
                throw new Error('Not connected to API');
            }
            
            // Get active_id from pair name - try multiple formats
            let active = this.api.constructor.assets(pair);
            
            // If not found, try various formats
            if (!active) {
                // Try with slash (EURUSD -> EUR/USD)
                if (!pair.includes('/')) {
                    const pairWithSlash = pair.slice(0, 3) + '/' + pair.slice(3);
                    active = this.api.constructor.assets(pairWithSlash);
                }
                
                // Try OTC format (EURUSD-OTC -> EUR/USD (OTC))
                if (!active && pair.includes('-OTC')) {
                    const basePair = pair.replace('-OTC', '');
                    const otcPair = basePair.slice(0, 3) + '/' + basePair.slice(3) + ' (OTC)';
                    active = this.api.constructor.assets(otcPair);
                }
                
                // Try direct OTC (EURUSD -> EURUSD (OTC))
                if (!active) {
                    const otcPair = pair + ' (OTC)';
                    active = this.api.constructor.assets(otcPair);
                }
            }
            
            if (!active) {
                throw new Error(`Unknown pair: ${pair}. Available: EUR/USD, EUR/GBP, etc.`);
            }
            
            logger.info(`Placing order: ${pair} ${direction} $${amount}`, {
                pair,
                direction,
                amount,
                expiry,
                activeId: active.active_id
            });
            
            // Set up event listener to capture option data
            let optionData = null;
            const handleOption = (data) => {
                if (data && data.active_id === active.active_id) {
                    optionData = data;
                }
            };
            this.api.on('option', handleOption);
            
            // Calculate expiration time
            // Get current time and round up to next minute boundary
            const now = Math.floor(Date.now() / 1000);
            const currentMinute = Math.floor(now / 60) * 60;
            const nextMinute = currentMinute + 60;
            // Add expiry minutes
            const expiration = nextMinute + (expiry * 60);
            
            logger.debug('Calculated expiration', { now, currentMinute, nextMinute, expiration, expiry });
            
            // Use raw message format for binary-options.open-option
            const message = {
                name: 'binary-options.open-option',
                version: '1.0',
                body: {
                    user_balance_id: this.api.balance_id,
                    active_id: active.active_id,
                    option_type_id: 3,
                    direction: direction.toLowerCase(),
                    expired: expiration,
                    price: amount,
                    refund_value: 0
                }
            };
            
            logger.debug('Sending trade message', { message });
            
            const result = await this.api.send(message, { returnMessage: true });
            
            // Wait a bit for the option event to fire
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Remove event listener
            this.api.off('option', handleOption);
            
            // Check for error messages
            if (result && result.message) {
                logger.error('Order rejected', { message: result.message });
                return {
                    success: false,
                    message: result.message,
                    result
                };
            }
            
            // Use event data if available, otherwise use result
            const orderData = optionData || result;
            
            if (!orderData || !orderData.id) {
                logger.error('No order ID received', { result, optionData });
                return {
                    success: false,
                    message: 'Order placed but no confirmation received'
                };
            }
            
            logger.info('Order placed successfully', { orderId: orderData.id });
            
            return {
                success: true,
                id: orderData.id,
                order_id: orderData.id,
                message: 'Order placed',
                result: orderData
            };
        } catch (error) {
            logger.error(`Buy order failed for ${pair}`, error);
            return {
                success: false,
                message: error.message
            };
        }
    }

    async sell(orderId) {
        try {
            if (!this.isConnected || !this.api) {
                throw new Error('Not connected to API');
            }
            
            logger.info(`Selling order: ${orderId}`);
            
            const result = await this.api.send('sell-options', {
                options_ids: [parseInt(orderId)]
            }, { returnMessage: true });
            
            logger.info('Order sold successfully', { orderId, result });
            return {
                success: true,
                message: 'Order sold',
                result
            };
        } catch (error) {
            logger.error(`Sell failed for order ${orderId}`, error);
            return {
                success: false,
                message: error.message
            };
        }
    }

    /**
     * Place trade - Unified interface for opening a position
     * @param {Object} params - Trade parameters
     * @param {string} params.pair - Currency pair (e.g., 'EURUSD')
     * @param {string} params.direction - 'call' or 'put' (or 'BUY'/'SELL')
     * @param {number} params.amount - Trade amount
     * @param {number} params.duration - Trade duration in minutes
     * @returns {Promise<Object>} Trade result
     */
    async placeTrade(params) {
        try {
            const { pair, direction, amount, duration = 1 } = params;
            
            if (!this.isConnected) {
                throw new Error('Not connected to API');
            }
            
            // Normalize direction
            let normalizedDirection = direction.toLowerCase();
            if (normalizedDirection === 'buy') normalizedDirection = 'call';
            if (normalizedDirection === 'sell') normalizedDirection = 'put';
            
            logger.info(`Placing trade via placeTrade: ${pair} ${normalizedDirection} $${amount}`);
            
            // Use existing buy method
            const result = await this.buy(pair, amount, normalizedDirection, duration);
            
            // Normalize response format
            if (result.success) {
                return {
                    success: true,
                    id: result.id,
                    order_id: result.id,
                    outcome: 'pending',
                    profit: 0,
                    message: result.message,
                    result: result.result
                };
            } else {
                return {
                    success: false,
                    error: result.message,
                    message: result.message
                };
            }
        } catch (error) {
            logger.error('placeTrade failed', error);
            return {
                success: false,
                error: error.message,
                message: error.message
            };
        }
    }

    async getOrderInfo(orderId) {
        try {
            if (!this.isConnected) {
                throw new Error('Not connected to API');
            }
            
            if (!orderId) {
                throw new Error('Order ID is required');
            }
            
            console.log(`\n🔍 [getOrderInfo] Fetching order ${orderId}...`);
            
            // Use portfolio.get-positions to get order information
            const positions = await this.api.send('portfolio.get-positions', {
                offset: 0,
                limit: 30,
                user_balance_id: this.api.balances[1]?.id || 1,
                instrument_types: ['turbo-option', 'binary-option'],
                returnMessage: true
            });
            
            // FULL RESPONSE LOGGING
            console.log('\n📦 FULL API RESPONSE:');
            console.log(JSON.stringify(positions, null, 2));
            
            // Find the specific order by ID
            const position = positions.positions?.find(pos => pos.id === parseInt(orderId));
            
            if (!position) {
                // If not found in positions, try to get from orders
                console.log(`🔍 Order ${orderId} not in positions, checking orders...`);
                
                const orders = await this.api.send('portfolio.get-orders', {
                    user_balance_id: this.api.balances[1]?.id || 1,
                    returnMessage: true
                });
                
                const order = orders.items?.find(ord => ord.id === parseInt(orderId));
                
                if (!order) {
                    console.log(`❌ Order ${orderId} not found in orders either`);
                    return {
                        success: false,
                        error: 'Order not found',
                        status: 'not_found'
                    };
                }
                
                // PRINT EVERY FIELD
                console.log('\n📋 ORDER FIELDS:');
                console.log('  orderId:', orderId);
                console.log('  status:', order.status);
                console.log('  profit:', order.profit);
                console.log('  win_amount:', order.win_amount);
                console.log('  pnl:', order.pnl);
                console.log('  close_profit:', order.close_profit);
                console.log('  amount:', order.price || order.amount);
                console.log('  close_time:', order.close_time);
                console.log('  created_at:', order.created_at);
                console.log('  result:', order.result);
                console.log('  closed:', order.closed || order.status === 'closed');
                
                // CALCULATE NET PROFIT
                const amount = order.price || order.amount || 0;
                let realProfit = null;
                
                if (order.profit !== undefined && order.profit !== null) {
                    realProfit = order.profit;
                    console.log(`  ✅ Using order.profit: ${realProfit}`);
                } else if (order.win_amount !== undefined && order.win_amount !== null) {
                    realProfit = order.win_amount - amount;
                    console.log(`  ✅ Calculated from win_amount: ${order.win_amount} - ${amount} = ${realProfit}`);
                } else if (order.pnl !== undefined && order.pnl !== null) {
                    realProfit = order.pnl;
                    console.log(`  ✅ Using order.pnl: ${realProfit}`);
                } else if (order.close_profit !== undefined && order.close_profit !== null) {
                    realProfit = order.close_profit;
                    console.log(`  ✅ Using order.close_profit: ${realProfit}`);
                } else if (order.status === 'closed' || order.closed) {
                    if (order.result === 'win') {
                        // ❌ REMOVED FALLBACK - must have real profit from API
                        console.log(`  🚨 No profit data from API for win!`);
                        return null;
                    } else if (order.result === 'loss') {
                        realProfit = -amount;
                        console.log(`  ✅ Calculated loss: -${amount}`);
                    }
                }
                
                console.log(`\n💰 FINAL EXTRACTED PROFIT: ${realProfit}`);
                
                return {
                    success: true,
                    order_id: orderId,
                    status: this.mapOrderStatus(order.status),
                    profit: realProfit,
                    close_time: order.close_time || new Date(),
                    direction: order.direction || 'call',
                    amount: amount,
                    created_at: order.created_at,
                    raw_order: order  // Include full raw data for debugging
                };
            }
            
            // PRINT EVERY FIELD for position
            console.log('\n� POSITION FIELDS:');
            console.log('  orderId:', orderId);
            console.log('  status:', position.status);
            console.log('  profit:', position.profit);
            console.log('  win_amount:', position.win_amount);
            console.log('  pnl:', position.pnl);
            console.log('  close_profit:', position.close_profit);
            console.log('  amount:', position.price);
            console.log('  expired_at:', position.expired_at);
            console.log('  created_at:', position.created_at);
            console.log('  loose_amount:', position.loose_amount);
            console.log('  closed:', position.status === 'closed' || position.status === 'won' || position.status === 'lost');
            
            // CALCULATE NET PROFIT for position
            const amount = position.price || 0;
            let realProfit = null;
            
            if (position.profit !== undefined && position.profit !== null) {
                realProfit = position.profit;
                console.log(`  ✅ Using position.profit: ${realProfit}`);
            } else if (position.win_amount !== undefined && position.win_amount !== null && position.win_amount > 0) {
                realProfit = position.win_amount - amount;
                console.log(`  ✅ Calculated from win_amount: ${position.win_amount} - ${amount} = ${realProfit}`);
            } else if (position.pnl !== undefined && position.pnl !== null) {
                realProfit = position.pnl;
                console.log(`  ✅ Using position.pnl: ${realProfit}`);
            } else if (position.close_profit !== undefined && position.close_profit !== null) {
                realProfit = position.close_profit;
                console.log(`  ✅ Using position.close_profit: ${realProfit}`);
            } else if (position.loose_amount !== undefined && position.loose_amount > 0) {
                realProfit = -position.loose_amount;
                console.log(`  ✅ Calculated from loose_amount: -${position.loose_amount}`);
            } else if (position.status === 'won') {
                // ❌ REMOVED FALLBACK - must have real profit from API
                if (!position.win_amount) {
                    console.log(`  🚨 No win_amount from API!`);
                    return null;
                }
                realProfit = position.win_amount - amount;
                console.log(`  ✅ Calculated from win_amount: ${realProfit}`);
            } else if (position.status === 'lost') {
                realProfit = -amount;
                console.log(`  ✅ Calculated for lost: -${amount}`);
            }
            
            console.log(`\n💰 FINAL EXTRACTED PROFIT: ${realProfit}`);
            
            return {
                success: true,
                order_id: orderId,
                status: this.mapPositionStatus(position.status),
                profit: realProfit,
                close_time: position.expired_at || new Date(),
                direction: position.direction || 'call',
                amount: amount,
                created_at: position.created_at,
                win_amount: position.win_amount || 0,
                loose_amount: position.loose_amount || 0,
                raw_position: position  // Include full raw data for debugging
            };
            
        } catch (error) {
            logger.error(`Failed to get order info for ${orderId}`, error);
            console.log(`\n❌ ERROR getting order ${orderId}:`, error.message);
            throw error;
        }
    }

    mapOrderStatus(status) {
        const statusMap = {
            'open': 'active',
            'closed': 'closed',
            'won': 'won',
            'lost': 'lost',
            'canceled': 'canceled',
            'expired': 'expired'
        };
        return statusMap[status] || 'unknown';
    }

    mapPositionStatus(status) {
        const statusMap = {
            'open': 'active',
            'closed': 'closed',
            'won': 'won',
            'lost': 'lost',
            'canceled': 'canceled',
            'expired': 'expired'
        };
        return statusMap[status] || 'unknown';
    }

    async getActiveOrders() {
        try {
            if (!this.isConnected) {
                throw new Error('Not connected to API');
            }
            
            const positions = await this.api.send('portfolio.get-positions', {
                offset: 0,
                limit: 30,
                user_balance_id: this.api.balances[1]?.id || 1,
                instrument_types: ['turbo-option', 'binary-option'],
                returnMessage: true
            });
            
            return positions.positions || [];
        } catch (error) {
            logger.error('Failed to get active orders', error);
            throw error;
        }
    }

    async getClosedOrders() {
        try {
            if (!this.isConnected) {
                throw new Error('Not connected to API');
            }
            
            const orders = await this.api.send('portfolio.get-orders', {
                user_balance_id: this.api.balances[1]?.id || 1,
                returnMessage: true
            });
            
            return orders.items || [];
        } catch (error) {
            logger.error('Failed to get closed orders', error);
            throw error;
        }
    }

    async subscribeToCandles(pair, callback) {
        try {
            if (!this.isConnected) {
                throw new Error('Not connected to API');
            }
            
            await this.api.subscribeToCandles(pair, callback);
            logger.info(`Subscribed to real-time candles for ${pair}`);
        } catch (error) {
            logger.error(`Failed to subscribe to candles for ${pair}`, error);
            throw error;
        }
    }

    async unsubscribeFromCandles(pair) {
        try {
            if (!this.isConnected) {
                throw new Error('Not connected to API');
            }
            
            await this.api.unsubscribeFromCandles(pair);
            logger.info(`Unsubscribed from candles for ${pair}`);
        } catch (error) {
            logger.error(`Failed to unsubscribe from candles for ${pair}`, error);
            throw error;
        }
    }

    disconnect() {
        try {
            if (this.api) {
                this.api.disconnect();
            }
            this.isConnected = false;
            logger.info('Disconnected from IQ Option API');
        } catch (error) {
            logger.error('Error during disconnect', error);
        }
    }

    isReady() {
        return this.isConnected && this.api;
    }
}

module.exports = new IQOptionAPI();
