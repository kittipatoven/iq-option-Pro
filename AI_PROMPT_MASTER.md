# 🤖 AI PROMPT - ฉบับสมบูรณ์สำหรับแก้ไข IQ Option Bot 100%

## 🎯 สรุปภารกิจ (ONE SENTENCE)

แก้ไข IQ Option Trading Bot ให้เชื่อมต่อ API และเทรดได้จริง 100% โดยแก้ปัญหา IP ถูก block และบั๊กในโค้ด พร้อม deploy บน VPS Ubuntu 24.04

---

## 🔥 สถานะปัจจุบัน (CURRENT STATE)

```
VPS: 185.84.161.174 (Ubuntu 24.04)
User: xver
Path: /root/iq-option-Pro หรือ /home/xver/iq-option-Pro

❌ curl https://iqoption.com → timeout (134 วินาที)
❌ HTTPS: BLOCKED
❌ WebSocket: BLOCKED
❌ IP ถูก IQ Option บล็อก 100%
```

---

## 📂 โครงสร้างไฟล์หลัก (CRITICAL FILES)

```
/root/iq-option-Pro/ หรือ ~/iq-option-Pro/
├── src/
│   ├── api/
│   │   └── iqOptionClient.js      # 🎯 ไฟล์สำคัญที่สุด - จัดการ WebSocket, Login, Trading
│   ├── network/
│   │   ├── proxyManager.js        # 🎯 ระบบ Proxy Rotation
│   │   └── networkTester.js       # 🎯 ทดสอบการเชื่อมต่อ
│   ├── core/
│   │   └── bot.engine.js          # 🎯 กลไกการเทรดหลัก
│   └── filters/
│       └── newsFilter.js          # กรองข่าว
├── test_network.js                # 🎯 ทดสอบเครือข่าย
├── minimal_test.js                # 🎯 ทดสอบการเชื่อมต่อขั้นต่ำ
├── validate_proxies.js            # 🎯 ตรวจสอบ proxy
├── detect_vpn.js                  # ตรวจหา VPN
├── vps_setup.sh                   # สคริปต์ติดตั้ง VPS
├── proxies.txt                    # รายการ proxy
├── .env                           # 🎯 ตัวแปรสภาพแวดล้อม (สำคัญมาก)
└── ecosystem.config.js            # ค่า PM2
```

---

## 🔍 ปัญหาที่ต้องแก้ไข (PROBLEMS TO FIX)

### ปัญหา #1: IP ถูก Block (CRITICAL - แก้ก่อน)

**อาการ:**
```
curl: (28) Failed to connect to iqoption.com port 443 after 134493 ms
HTTPS Connection: ❌ BLOCKED
WebSocket Connection: ❌ BLOCKED
```

**สาเหตุ:**
- IQ Option บล็อก IP VPS 185.84.161.174
- ต้องใช้ Proxy/VPN เพื่อเปลี่ยน IP

**วิธีแก้ (ต้องลองทุกวิธีจนกว่าจะได้):**

#### วิธี A: Cloudflare WARP (ฟรี - ลองก่อน)
```bash
# ติดตั้ง
sudo apt update
sudo apt install -y curl gpg

curl -fsSL https://pkg.cloudflareclient.com/pubkey.gpg | sudo gpg --yes --dearmor --output /usr/share/keyrings/cloudflare-warp-archive-keyring.gpg

echo "deb [arch=amd64 signed-by=/usr/share/keyrings/cloudflare-warp-archive-keyring.gpg] https://pkg.cloudflareclient.com/ $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/cloudflare-client.list

sudo apt update
sudo apt install -y cloudflare-warp

# ลงทะเบียนและเชื่อมต่อ
sudo warp-cli register
sudo warp-cli connect
sudo warp-cli status

# ทดสอบ
ping 1.1.1.1 -c 3
curl https://iqoption.com
```

#### วิธี B: Proxy ภายนอก (ถ้ามี)
```bash
# แก้ไข .env
nano /root/iq-option-Pro/.env

# เพิ่มบรรทัด (ใส่ proxy ที่มีจริง)
HTTPS_PROXY=http://proxy_host:port
# หรือ
HTTPS_PROXY=http://user:pass@proxy_host:port

# บันทึก: Ctrl+X, Y, Enter
```

#### วิธี C: Squid Proxy บน localhost
```bash
# ติดตั้ง Squid
sudo apt install -y squid

# ตั้งค่า Squid ให้ฟัง port 3128
sudo nano /etc/squid/squid.conf
# เพิ่ม: http_port 3128
# เพิ่ม: acl all src all
# เพิ่ม: http_access allow all

sudo systemctl restart squid

# ตั้งค่าใน .env
HTTPS_PROXY=http://127.0.0.1:3128
```

#### วิธี D: Shadowsocks + Proxy Chain
```bash
# ติดตั้ง shadowsocks-libev
sudo apt install -y shadowsocks-libev

# ตั้งค่า client
sudo nano /etc/shadowsocks-libev/config.json
# ใส่ server ที่มี

sudo systemctl restart shadowsocks-libev

# ตั้งค่า proxy chain
HTTPS_PROXY=socks5://127.0.0.1:1080
```

#### วิธี E: WireGuard VPN
```bash
# ถ้ามี VPN config
sudo apt install -y wireguard
sudo wg-quick up ./your-config.conf
```

---

### ปัญหา #2: โค้ดไม่รองรับ Proxy อย่างสมบูรณ์ (CRITICAL)

**ไฟล์ที่ต้องแก้:**

#### 1. `src/api/iqOptionClient.js` (แก้หลายจุด)

**จุดที่ 1: ตรวจสอบ `getProxyAgent()`**
```javascript
// ต้องอยู่บรรทัด ~331-344
// ตรวจสอบว่าสร้าง proxy agent ได้ถูกต้อง

getProxyAgent() {
    const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
    if (proxyUrl) {
        console.log('🌐 [PROXY] Using proxy:', proxyUrl);
        try {
            const proxyAgent = new HttpsProxyAgent(proxyUrl);
            console.log('✅ [PROXY] Agent created successfully');
            return proxyAgent;
        } catch (error) {
            console.error('❌ [PROXY] Failed to create proxy agent:', error.message);
            return null;
        }
    }
    console.log('⚠️ [PROXY] No proxy configured');
    return null;
}
```

**จุดที่ 2: ตรวจสอบ `tryConnect()` ในบรรทัด ~725-795**
```javascript
// ต้องใช้ proxy agent ใน wsOptions ถ้ามี proxy
async tryConnect(strategy) {
    return new Promise((resolve, reject) => {
        try {
            const wsOptions = {
                headers: strategy.headers || this.getDefaultHeaders(),
                handshakeTimeout: 15000,
                rejectUnauthorized: false,
                followRedirects: true,
                maxRedirects: 10
            };

            // 🔥 สำคัญมาก: ต้องใช้ proxy agent
            if (strategy.proxy) {
                try {
                    wsOptions.agent = new HttpsProxyAgent(strategy.proxy);
                    console.log(`🌐 [PROXY] WebSocket using proxy: ${strategy.proxy}`);
                } catch (error) {
                    reject(new Error(`Invalid proxy: ${error.message}`));
                    return;
                }
            } else {
                // ใช้ proxy จาก environment ถ้าไม่มีใน strategy
                const envProxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
                if (envProxy) {
                    try {
                        wsOptions.agent = new HttpsProxyAgent(envProxy);
                        console.log(`🌐 [PROXY] WebSocket using env proxy: ${envProxy}`);
                    } catch (error) {
                        console.warn(`⚠️ [PROXY] Failed to use env proxy: ${error.message}`);
                    }
                }
            }

            const ws = new WebSocket(strategy.endpoint, wsOptions);
            // ... rest of code
        } catch (error) {
            reject(error);
        }
    });
}
```

**จุดที่ 3: ตรวจสอบ `sendMessageAndWait()` บรรทัด ~2024-2077**
```javascript
// ต้องตรวจสอบ WebSocket state ก่อนส่ง
async sendMessageAndWait(name, msg, timeoutMs = 30000) {
    // 🔥 ตรวจสอบ connection ก่อน
    if (!this.ws || this.ws.readyState !== 1) {
        throw new Error('WebSocket not connected (readyState: ' + (this.ws ? this.ws.readyState : 'null') + ')');
    }
    
    let messageId;
    let messageStr;
    
    if (msg && msg.name && msg.version) {
        messageId = this.generateMessageId();
        const rawMessage = {
            ...msg,
            request_id: messageId
        };
        messageStr = JSON.stringify(rawMessage);
        console.log('📤 SENDING RAW MESSAGE:', messageStr.slice(0, 500));
        
        // 🔥 ตรวจสอบอีกครั้งก่อนส่ง
        if (!this.ws || this.ws.readyState !== 1) {
            throw new Error('WebSocket disconnected before send');
        }
        
        this.ws.send(messageStr);
        console.log('✅ Message sent via WebSocket');
    } else {
        messageId = this.sendMessage(name, msg);
    }
    
    // ... rest of promise code
}
```

**จุดที่ 4: เพิ่ม Auto-Recovery System**
```javascript
// เพิ่ม method ใหม่หลังบรรทัด ~230

/**
 * 🔥 ANTI-BLOCK: Enhanced Auto Recovery with Proxy Support
 */
async autoRecover() {
    console.log('🔄 [RECOVERY] Starting enhanced auto recovery...');
    this.connectionState = 'RECONNECTING';
    
    const maxRecoveryAttempts = 15;
    let attempt = 0;
    
    while (attempt < maxRecoveryAttempts && this.autoReconnectEnabled) {
        attempt++;
        console.log(`\n🔄 [RECOVERY] Attempt ${attempt}/${maxRecoveryAttempts}`);
        
        try {
            // Disconnect current
            this.disconnect();
            
            // Apply rate limit
            await this.applyRateLimit();
            
            // 🔥 ลอง proxy ตัวถัดไป
            const newProxy = this.proxyManager.getNextProxy();
            if (newProxy) {
                console.log(`🌐 [RECOVERY] Trying proxy: ${newProxy}`);
                process.env.HTTPS_PROXY = newProxy;
                process.env.HTTP_PROXY = newProxy;
            }
            
            // Try connect
            const result = await this.connect();
            if (result) {
                console.log('✅ [RECOVERY] Connection restored!');
                this.connectionState = 'CONNECTED';
                this.proxyManager.markProxySuccess();
                return { success: true, attempts: attempt };
            }
        } catch (error) {
            console.error(`❌ [RECOVERY] Attempt ${attempt} failed:`, error.message);
            
            // Mark proxy as failed
            if (this.proxyManager.currentProxy) {
                this.proxyManager.markProxyFailed(this.proxyManager.currentProxy);
            }
            
            // Wait before retry
            await this.sleep(10000 + (attempt * 2000));
        }
    }
    
    console.error('❌ [RECOVERY] All attempts failed');
    this.connectionState = 'FAILED';
    return { success: false, attempts: attempt };
}
```

#### 2. `src/network/proxyManager.js` (ตรวจสอบ)

**ตรวจสอบว่ามี:**
- `getNextProxy()` - สลับ proxy ถัดไป
- `markProxyFailed()` -  mark proxy ที่ fail
- `markProxySuccess()` - mark proxy ที่ใช้ได้
- `createProxyAgent()` - สร้าง proxy agent

**ถ้าขาดให้เพิ่ม:**
```javascript
/**
 * Get next available proxy (rotation)
 */
getNextProxy() {
    if (this.proxies.length === 0) {
        return null;
    }
    
    // Find next working proxy
    for (let i = 0; i < this.proxies.length; i++) {
        this.currentIndex = (this.currentIndex + 1) % this.proxies.length;
        const proxy = this.proxies[this.currentIndex];
        
        // Skip failed proxies
        if (!this.failedProxies.has(proxy)) {
            this.currentProxy = proxy;
            return proxy;
        }
    }
    
    // All proxies failed, reset and try again
    console.warn('⚠️ [PROXY] All proxies marked as failed, resetting...');
    this.failedProxies.clear();
    this.currentIndex = 0;
    this.currentProxy = this.proxies[0];
    return this.currentProxy;
}

/**
 * Create proxy agent for current proxy
 */
createProxyAgent() {
    if (!this.currentProxy) {
        return null;
    }
    
    try {
        const agent = new HttpsProxyAgent(this.currentProxy);
        return agent;
    } catch (error) {
        console.error('❌ [PROXY] Failed to create agent:', error.message);
        return null;
    }
}
```

#### 3. `test_network.js` (ต้องแก้ให้รองรับ proxy)

**แก้ให้ทดสอบผ่าน proxy:**
```javascript
const https = require('https');
const { HttpsProxyAgent } = require('https-proxy-agent');

async function testWithProxy() {
    const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
    
    if (proxyUrl) {
        console.log(`🧪 Testing with proxy: ${proxyUrl}`);
        const agent = new HttpsProxyAgent(proxyUrl);
        
        return new Promise((resolve) => {
            https.get('https://iqoption.com', { agent, timeout: 10000 }, (res) => {
                console.log(`✅ HTTPS via proxy: ${res.statusCode}`);
                resolve(true);
            }).on('error', (err) => {
                console.log(`❌ HTTPS via proxy failed: ${err.message}`);
                resolve(false);
            });
        });
    }
    
    return false;
}
```

---

### ปัญหา #3: Message Format อาจผิด (HIGH)

**ตรวจสอบ `placeTrade()` บรรทัด ~2082-2219:**

```javascript
// ✅ ต้องเป็น format นี้เท่านั้น
const order = {
    name: 'binary-options.open-option',  // ชื่อ message
    version: '1.0',                      // เวอร์ชัน
    body: {                              // body ไม่ซ้อน
        user_balance_id: parseInt(this.balanceId),
        active_id: this.getAssetId(asset),
        option_type_id: 3,              // 3 = turbo
        direction: type,                // 'buy' หรือ 'sell'
        expired: expirationTime,        // Unix timestamp
        price: parseFloat(amount),
        refund_value: 0
    }
};

// ❌ ห้าม nested แบบนี้
// {
//     name: 'sendMessage',
//     body: {
//         name: 'binary-options.open-option',  // ซ้อนเกินไป
//         ...
//     }
// }
```

---

## 🧪 ขั้นตอนการทดสอบ (TESTING PROTOCOL)

### Test 1: Network Connectivity (ต้องผ่านก่อน)
```bash
cd /root/iq-option-Pro
node test_network.js
```
**ผลที่ต้องการ:**
```
✅ HTTPS Connection: WORKING
✅ WebSocket Connection: WORKING
🌐 Proxy Used: http://xxx.xxx.xxx.xxx:xxxx
```

### Test 2: Proxy Validation
```bash
node validate_proxies.js
```
**ผลที่ต้องการ:**
```
✅ WORKING PROXIES: 1+ proxies
```

### Test 3: Minimal Connection
```bash
node minimal_test.js
```
**ผลที่ต้องการ:**
```
✅ Connected to IQ Option
✅ Logged in successfully
✅ WebSocket authenticated
```

### Test 4: Real Trade (DEMO เท่านั้น)
```bash
node realTradeTest.js
```
**ผลที่ต้องการ:**
```
✅ Order placed successfully
✅ Order ID: xxxxxxx
✅ Result: WIN/LOSS (after 1-5 min)
```

---

## 🚀 Deployment Checklist

- [ ] IP ไม่ถูก block (curl https://iqoption.com ผ่าน)
- [ ] Proxy/VPN ทำงานได้
- [ ] `node test_network.js` ผ่านทั้งหมด
- [ ] `node minimal_test.js` login สำเร็จ
- [ ] ส่ง order ได้ (มี order_id)
- [ ] ได้ผลลัพธ์ภายใน 5 นาที
- [ ] Bot รัน 1 ชม. ไม่ crash
- [ ] PM2 auto-restart ทำงาน
- [ ] Logs บันทึกครบถ้วน

---

## 🆘 Emergency Fixes

### ถ้า WARP ไม่ทำงาน:
```bash
# ลองใช้ wgcf (WireGuard + Cloudflare)
wgcf register
wgcf generate
sudo cp wgcf-profile.conf /etc/wireguard/
sudo wg-quick up wgcf-profile
```

### ถ้า Proxy ไม่เสถียร:
```bash
# ใช้ proxy chain
HTTPS_PROXY=http://proxy1:port
# ถ fail → สลับไป proxy2 อัตโนมัติ
```

### ถ้า WebSocket disconnect บ่อย:
```javascript
// เพิ่มใน iqOptionClient.js
this.ws.on('close', () => {
    console.log('🔌 WebSocket closed, auto-reconnecting...');
    this.autoRecover();
});
```

---

## 🎯 Success Metrics

ต้องพิสูจน์ด้วย logs:
1. ✅ `curl https://iqoption.com` ได้ status 200
2. ✅ `node test_network.js` ขึ้น WORKING
3. ✅ Login success: "✅ Logged in successfully"
4. ✅ Trade success: "✅ Order placed: [ID]"
5. ✅ Result received: "✅ RESULT: WIN/LOSS"
6. ✅ รัน 24 ชม. โดยไม่ crash

---

## ⚠️ WARNINGS

1. **อย่าเทรด REAL จนกว่าจะทดสอบ DEMO สำเร็จ 10+ ครั้ง**
2. **ตรวจสอบ proxy ว่าเชื่อถือได้ (ไม่ใช่ public proxy)**
3. **อย่าเทรดถี่เกินไป (rate limiting)**
4. **ตรวจสอบ balance ก่อนเทรดทุกครั้ง**
5. **บันทึก logs ทุกครั้งที่มีปัญหา**

---

## 🔧 Useful Commands

```bash
# VPS
sudo warp-cli status          # ตรวจสอบ WARP
curl -x $HTTPS_PROXY https://iqoption.com  # ทดสอบ proxy
ping 1.1.1.1 -c 3            # ทดสอบ internet

# Bot
pm2 logs iqoption-bot         # ดู logs
pm2 status                   # ตรวจสอบสถานะ
pm2 restart iqoption-bot     # รีสตาร์ท
pm2 monit                    # Dashboard

# Debug
node -e "console.log(require('./src/api/iqOptionClient.js'))"  # ตรวจสอบ module
```

---

## 🎓 AI Instructions

**คุณคือ AI ที่ถูกสร้างมาเพื่อแก้ปัญหานี้โดยเฉพาะ**

**คำสั่ง:**
1. อ่านทุกไฟล์ที่เกี่ยวข้องให้เข้าใจ 100%
2. แก้ปัญหา IP ถูก block ก่อน (ด้วย WARP/Proxy/VPN)
3. แก้ไขโค้ดให้รองรับ proxy อย่างสมบูรณ์
4. เพิ่ม error handling และ auto-recovery
5. ทดสอบทุกขั้นตอนจนกว่าจะผ่าน
6. ถ้าผิดพลาด → debug → แก้ไข → ทดสอบซ้ำ
7. ทำจนกว่าจะ "เทรดได้จริง 100%"

**ห้าม:**
- ห้ามเดาสาเหตุ
- ห้ามข้ามการทดสอบ
- ห้ามหยุดแค่ "น่าจะได้"

**ต้อง:**
- ต้องมี logs ยืนยันทุกขั้นตอน
- ต้องผ่านการทดสอบทั้งหมด
- ต้องเทรดได้จริง (มี order_id)

---

**🔥 เป้าหมายสูงสุด: BOT เทรดได้จริง ไม่มีข้อแม้! 🔥**
