# 🤖 AI PROMPT: IQ Option Trading Bot - Advanced Fix Protocol

## 🎯 ROLE DEFINITION

คุณคือ **Senior Backend Engineer + Network Engineer + WebSocket Specialist + Quant Developer**

เป้าหมาย: แก้ไข IQ Option Trading Bot ให้ทำงานได้ 100% แบบ Production-Ready

---

## ⚠️ CRITICAL RULES (ห้ามข้าม)

```
❌ ห้ามเดาว่า network เสีย - ต้องพิสูจน์ก่อน
❌ ห้าม patch แบบ workaround - ต้องแก้ root cause
❌ ห้ามหยุดทำงานจนกว่าจะสำเร็จ
✅ ต้อง loop ซ้ำจนกว่าจะใช้งานได้จริง
✅ ต้องมี fallback ทุกกรณี
✅ ต้อง log ทุก state change
```

---

## 📁 PROJECT STRUCTURE

```
c:\Code\iq-option-Pro\
├── src/
│   ├── api/
│   │   ├── unifiediqoption.js    # 🔥 MAIN TARGET - Connection & API
│   │   └── iqoption.js           # Backup API wrapper
│   ├── core/
│   │   └── bot.js                # 🔥 MAIN TARGET - Bot logic
│   └── config/
│       └── config.js             # Environment config
├── demoRunner.js                 # 🔥 MAIN TARGET - Demo test
├── main.js                       # Production entry
├── app.js                        # CLI entry
├── run.js                        # Launcher
├── package.json
└── .env                          # Credentials (ไม่ต้องแก้)
```

---

## 🔥 PRIORITY 1: NETWORK VERIFICATION SYSTEM

### ไฟล์: `src/api/unifiediqoption.js`

#### ✅ STEP 1.1: Real Network Test (DNS + HTTPS)

เพิ่ม method นี้:

```javascript
/**
 * Real network verification with multiple tests
 */
async verifyNetworkConnectivity() {
    const results = {
        dns: false,
        https: false,
        latency: null,
        error: null
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
        console.log('✅ DNS OK:', results.dnsAddress);
    } catch (err) {
        console.log('❌ DNS Failed:', err.message);
        results.error = err.message;
    }
    
    // Test 2: HTTPS Connection (real test)
    try {
        const https = require('https');
        const start = Date.now();
        await new Promise((resolve, reject) => {
            const req = https.get('https://iqoption.com', {
                timeout: 10000,
                rejectUnauthorized: false  // บางที cert มีปัญหา
            }, (res) => {
                results.latency = Date.now() - start;
                results.https = true;
                results.statusCode = res.statusCode;
                console.log('✅ HTTPS OK:', res.statusCode, `(${results.latency}ms)`);
                resolve();
            });
            
            req.on('error', (err) => {
                console.log('❌ HTTPS Failed:', err.message);
                results.error = err.message;
                reject(err);
            });
            
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('HTTPS timeout'));
            });
        });
    } catch (err) {
        results.error = err.message;
    }
    
    return results;
}
```

---

## 🔥 PRIORITY 2: FIX CONNECTION DEADLOCK

### ไฟล์: `src/api/unifiediqoption.js`

#### ✅ STEP 2.1: Force Reset State

แก้ไข `connect()` method:

```javascript
async connect() {
    // 🔥 CRITICAL: Force reset if stuck
    if (this.isReconnecting) {
        console.log('⚠️ Detected stuck state, forcing cleanup...');
        this.forceCleanup();
        await this.sleep(1000);
    }
    
    // Debug state
    console.log('🔍 Connection State:', {
        isReconnecting: this.isReconnecting,
        isConnected: this.isConnected,
        hasAPI: !!this.api,
        timestamp: new Date().toISOString()
    });
    
    // Verify network first
    const networkStatus = await this.verifyNetworkConnectivity();
    if (!networkStatus.dns) {
        console.log('⚠️ DNS failed - possible network issue');
    }
    
    // Retry loop
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            console.log(`\n🔌 Connection attempt ${attempt}/3...`);
            
            const result = await this._doConnect();
            if (result) {
                console.log('✅ Connection successful!');
                return true;
            }
        } catch (error) {
            console.error(`❌ Attempt ${attempt} failed:`, error.message);
            
            // 🔥 FORCE CLEANUP
            this.forceCleanup();
            
            if (attempt < 3) {
                const delay = 2000 * attempt;
                console.log(`🔄 Retrying in ${delay}ms...`);
                await this.sleep(delay);
            } else {
                throw error;
            }
        }
    }
    return false;
}
```

#### ✅ STEP 2.2: Force Cleanup Method

```javascript
/**
 * Force cleanup all connection resources
 */
forceCleanup() {
    console.log('🧹 Force cleanup starting...');
    
    // Reset flags
    this.isReconnecting = false;
    this.isConnected = false;
    this.isAuthenticated = false;
    
    // Stop intervals
    this.stopHeartbeat();
    this.stopConnectionCheck();
    
    // Remove event listeners
    if (this.api && this._boundHandlers) {
        try {
            this.api.removeListener('message', this._boundHandlers.message);
            this.api.removeListener('profile', this._boundHandlers.profile);
            this.api.removeListener('error', this._boundHandlers.error);
            this.api.removeListener('disconnect', this._boundHandlers.disconnect);
        } catch (e) {
            // Ignore cleanup errors
        }
    }
    
    // Kill WebSocket
    if (this.api && this.api.ws) {
        try {
            this.api.ws.terminate();  // ใช้ terminate แทน close
        } catch (e) {}
    }
    
    // Reset API
    this.api = null;
    this._boundHandlers = null;
    
    console.log('🧹 Cleanup complete');
}
```

---

## 🔥 PRIORITY 3: FIX LOGIN TIMEOUT

### ไฟล์: `src/api/unifiediqoption.js`

#### ✅ STEP 3.1: Safe Login with Timeout

```javascript
/**
 * Internal connection with guaranteed cleanup
 */
async _doConnect() {
    if (!this.email || !this.password) {
        throw new Error('Credentials not set');
    }
    
    if (this.isReconnecting) {
        logger.warn('[API] Connection in progress, waiting...');
        await this.waitForConnection(30000);
        return this.isConnected;
    }
    
    this.isReconnecting = true;
    
    try {
        console.log('🔌 Creating API instance...');
        
        // Create fresh instance
        this.api = new IQOption({
            email: this.email,
            password: this.password
        });
        
        // 🔥 SAFE LOGIN with timeout
        console.log('⏳ Logging in... (30s timeout)');
        
        const loginPromise = this.api.login();
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => {
                reject(new Error('Login timeout after 30s'));
            }, 30000);
        });
        
        const loginResult = await Promise.race([loginPromise, timeoutPromise]);
        console.log('✅ Login successful');
        
        // Setup listeners
        this.setupEventListeners();
        
        // 🔥 SAFE WEBSOCKET CONNECT
        console.log('⏳ Opening WebSocket... (30s timeout)');
        
        const wsPromise = this.api.connect();
        const wsTimeout = new Promise((_, reject) => {
            setTimeout(() => {
                reject(new Error('WebSocket timeout after 30s'));
            }, 30000);
        });
        
        await Promise.race([wsPromise, wsTimeout]);
        console.log('✅ WebSocket connected');
        
        // Success state
        this.isAuthenticated = true;
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.lastPong = Date.now();
        
        // Start monitoring
        this.startHeartbeat();
        this.startConnectionCheck();
        
        this.emit('connected', { balance: this.balance });
        return true;
        
    } catch (error) {
        console.error('❌ Connection failed:', error.message);
        throw error;
    } finally {
        // 🔥 ALWAYS reset flag
        this.isReconnecting = false;
    }
}
```

---

## 🔥 PRIORITY 4: FIX GETCANDLES WEBSOCKET

### ไฟล์: `src/api/unifiediqoption.js`

#### ✅ STEP 4.1: Safe Candles Fetch

```javascript
/**
 * Get candles with WebSocket and timeout
 */
async getCandles(pair, interval = 60, count = 100, attempt = 1) {
    if (!this.isConnected) {
        throw new Error('Not connected');
    }
    
    const activeId = this.getActiveId(pair);
    const key = `${pair}_${interval}`;
    
    console.log(`📊 Getting candles for ${pair} (attempt ${attempt})`);
    
    try {
        // Use WebSocket request
        const request = {
            name: 'get-candles',
            version: '2.0',
            body: {
                active_id: activeId,
                size: interval,
                to: Math.floor(Date.now() / 1000),
                count: count
            }
        };
        
        // Send request with timeout
        const responsePromise = this.waitForMessage('candles', 10000);
        this.api.send(request);
        
        const result = await responsePromise;
        
        if (result && result.candles) {
            const normalized = this.normalizeCandles(result.candles);
            this.setCandlesCache(key, normalized);
            return normalized;
        }
        
        throw new Error('Invalid candles response');
        
    } catch (error) {
        console.error(`❌ Candles failed (attempt ${attempt}):`, error.message);
        
        // Retry
        if (attempt < 3) {
            console.log(`🔄 Retrying candles...`);
            await this.sleep(2000 * attempt);
            return this.getCandles(pair, interval, count, attempt + 1);
        }
        
        // Return cached if available
        if (this.candles.has(key)) {
            console.log('📦 Using cached candles');
            return this.candles.get(key);
        }
        
        throw error;
    }
}

/**
 * Normalize candle format
 */
normalizeCandles(candles) {
    return candles.map(c => ({
        timestamp: c.time || c.timestamp || c.from || 0,
        open: parseFloat(c.open) || 0,
        high: parseFloat(c.high) || 0,
        low: parseFloat(c.low) || 0,
        close: parseFloat(c.close) || 0,
        volume: parseFloat(c.volume) || 0
    })).filter(c => c.timestamp > 0).sort((a, b) => a.timestamp - b.timestamp);
}
```

---

## 🔥 PRIORITY 5: FIX DEMO RUNNER CRASH

### ไฟล์: `demoRunner.js`

#### ✅ STEP 5.1: Safe Result Handling

```javascript
async run() {
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║          🤖 DEMO MODE - 100 TRADES VALIDATION                ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');
    
    try {
        // Initialize bot
        await this.initialize();
        
        // Run bot with timeout
        const botPromise = this.runBot();
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Demo timeout after 1h')), 3600000);
        });
        
        const result = await Promise.race([botPromise, timeoutPromise]);
        
        // 🔥 SAFE CHECK
        if (!result || !result.validation) {
            console.error('❌ Demo failed - invalid result');
            return {
                success: false,
                error: 'Invalid result',
                validation: { winRatePassed: false }
            };
        }
        
        return result;
        
    } catch (error) {
        console.error('❌ Demo failed:', error.message);
        return {
            success: false,
            error: error.message,
            validation: { winRatePassed: false }
        };
    }
}
```

---

## 🔥 PRIORITY 6: BOT INITIALIZATION FIX

### ไฟล์: `src/core/bot.js`

#### ✅ STEP 6.1: Safe Initialize

```javascript
async initialize() {
    console.log('🚀 Initializing Trading Bot...');
    
    try {
        // Set credentials
        this.iqoptionAPI.setCredentials(
            config.IQ_OPTION_EMAIL,
            config.IQ_OPTION_PASSWORD,
            config.ACCOUNT_TYPE || 'PRACTICE'
        );
        
        // Connect with retry
        let connected = false;
        for (let i = 0; i < 3; i++) {
            try {
                connected = await this.iqoptionAPI.connect();
                if (connected) break;
            } catch (err) {
                console.log(`❌ Connect attempt ${i+1} failed:`, err.message);
                if (i < 2) {
                    console.log('🔄 Retrying...');
                    await this.sleep(3000);
                }
            }
        }
        
        if (!connected) {
            throw new Error('Failed to connect after 3 attempts');
        }
        
        console.log('✅ Bot initialized successfully');
        return true;
        
    } catch (error) {
        console.error('❌ Bot initialization failed:', error);
        throw error;
    }
}
```

---

## 🔥 DEBUG MODE: STATE TRACKING

### เพิ่มทุกไฟล์:

```javascript
/**
 * Log current state for debugging
 */
logState(context = '') {
    const state = {
        context,
        timestamp: new Date().toISOString(),
        isConnecting: this.isConnecting,
        isConnected: this.isConnected,
        isAuthenticated: this.isAuthenticated,
        hasAPI: !!this.api,
        hasWS: !!(this.api && this.api.ws),
        reconnectAttempts: this.reconnectAttempts
    };
    
    console.log('🔍 STATE:', JSON.stringify(state, null, 2));
    return state;
}
```

---

## 🔁 EXECUTION LOOP (ห้ามหยุด)

```
while (!success) {
    1. รัน: node demoRunner.js
    2. อ่าน log ล่าสุด
    3. หา error จริง
    4. trace ไปที่ file + line
    5. แก้ root cause
    6. save file
    7. goto 1
}
```

---

## ✅ SUCCESS CRITERIA

ต้องได้ output:

```bash
✅ DNS OK: 45.88.36.129
✅ HTTPS OK: 200 (150ms)
🔌 Connection attempt 1/3...
✅ Login successful
✅ WebSocket connected
✅ Connected! Balance: $1000
📊 Getting candles for EURUSD-OTC...
✅ Got 100 candles
🤖 Bot running...
```

---

## 🎯 IMMEDIATE ACTIONS

1. แก้ไข `unifiediqoption.js` - ใส่ทุก fix ข้างบน
2. แก้ไข `demoRunner.js` - ใส่ safe result handling
3. แก้ไข `bot.js` - ใส่ safe initialize
4. รัน `node demoRunner.js`
5. ดู log
6. แก้ต่อจนกว่าจะสำเร็จ

---

## 💀 EMERGENCY FALLBACK

ถ้า API ไม่เชื่อมต่อได้เลย:

```javascript
// ใช้ mock data สำหรับ test
if (!this.isConnected) {
    console.log('⚠️ Using mock data mode');
    return this.getMockCandles(pair);
}
```

---

## 🚀 FINAL CHECKLIST

- [ ] DNS lookup ผ่าน
- [ ] HTTPS connection ผ่าน
- [ ] Login สำเร็จ
- [ ] WebSocket connected
- [ ] Candles ดึงได้
- [ ] Bot ไม่ crash
- [ ] Demo รันจบ 100 trades

---

# 🎬 START NOW

เริ่มจากไฟล์ `src/api/unifiediqoption.js` แล้วทำตามลำดับ priority

**อย่าหยุดจนกว่าจะสำเร็จ!**
