# Debugging Procedure - When Mismatch Detected

## 🔍 Step-by-Step Debug Guide

### Step 1: Identify Mismatch Pattern

เปิด `logs/mismatch_debug_[orderId]_[timestamp].json`

ดูว่า mismatch เป็นแบบไหน:

| Pattern | อาการ | สาเหตุที่เป็นไปได้ |
|---------|-------|-------------------|
| A | Bot=WIN, Server=LOSS | result มาช้า / resolve ผิด |
| B | Bot=LOSS, Server=WIN | result มาช้า / resolve ผิด |
| C | Bot=undefined, Server=WIN/LOSS | handleOptionClosed ไม่ทำงาน |
| D | Order not found | handleBuyComplete ไม่ทำงาน |

---

### Step 2: Check Event Flow

ดู log ตามลำดับ:

```
1. 📤 SENDING ORDER - order ถูกส่ง?
2. 📥 ORDER RESPONSE - order ถูกตอบกลับ?
3. 📊 ORDER MAP SIZE - บันทึกใน map?
4. 📝 RESOLVER REGISTERED - resolver ถูก register?
5. 🎯 RESULT EVENT - option-closed มาจริง?
6. 🎯 RESOLVING WAITER - resolve ทำงาน?
7. ✅ RESULT FOUND - waitForResult return?
```

**Missing step = root cause**

---

### Step 3: Common Issues & Fixes

#### Issue 1: handleOptionClosed ไม่ถูกเรียก
**เช็ค:** มี log `🔥 HARD PROOF: 🎯 RESULT EVENT` ไหม?

**ถ้าไม่มี:**
- WebSocket message handler ไม่ทำงาน
- ตรวจสอบ `handleMessage()` switch case
- เพิ่ม log ใน `case 'option-closed'`

**Fix:**
```javascript
// เพิ่มใน handleMessage
case 'option-closed':
    console.log('🎯 RAW option-closed:', JSON.stringify(msg));
    this.handleOptionClosed(msg);
    break;
```

---

#### Issue 2: Order ไม่อยู่ใน Map
**เช็ค:** มี log `📊 ORDER MAP SIZE` ไหม?

**ถ้าไม่มี:**
- `handleBuyComplete` ไม่ทำงาน
- buy-complete message ไม่มา

**Fix:**
```javascript
// เพิ่มใน placeTrade ตอน resolve
console.log('📤 Order placed, waiting for buy-complete...');
// ถ้าไม่มี buy-complete ใน 30s → timeout
```

---

#### Issue 3: Resolver ไม่ถูก Resolve
**เช็ค:** มี log `🎯 RESOLVING WAITER` ไหม?

**ถ้าไม่มี:**
- resolver ไม่มีใน map
- orderId ไม่ตรงกัน

**Fix:**
```javascript
// เพิ่ม debug ใน waitForResult
console.log(`📝 RESOLVER REGISTERED for ${orderId}`);
console.log(`   Available resolvers: ${Array.from(this.resultResolvers.keys())}`);

// เพิ่ม debug ใน handleOptionClosed
console.log(`🔍 Looking for resolver: ${msg.id}`);
console.log(`   Available: ${Array.from(this.resultResolvers.keys())}`);
```

---

#### Issue 4: Duplicate Result
**เช็ค:** มี log `⚠️ DUPLICATE RESULT IGNORED` ไหม?

**ถ้ามี:**
- ระบบทำงานถูกต้องแล้ว (ป้องกัน duplicate)
- แต่ตรวจสอบว่า profit/result ถูกต้องไหม

---

#### Issue 5: Timeout ก่อน Result มา
**เช็ค:** มี log `❌ TIMEOUT` ไหม?

**ถ้ามี:**
- result มาช้ากว่า timeout (120s)
- หรือ result ไม่มาเลย

**Fix:**
```javascript
// เพิ่ม timeout เป็น 180s
await this.api.waitForResult(orderId, 180000);
```

---

### Step 4: Verify Data Integrity

รันคำสั่ง:
```javascript
// ใน console หรือเพิ่มใน test
console.log('Order Map:', this.api.orders);
console.log('Pending:', this.api.pendingResults);
console.log('Resolvers:', this.api.resultResolvers);
```

ต้องได้:
- orders มี orderId ที่ test
- order.status === 'CLOSED'
- pendingResults ไม่มี orderId นั้น
- resultResolvers ไม่มี orderId นั้น

---

### Step 5: Compare with Server

```javascript
// ดึง result จาก server โดยตรง
const realResult = await this.api.getOrderFromHistory(orderId);
console.log('Server says:', realResult);

// เทียบกับ order map
const order = this.api.orders.get(orderId);
console.log('Bot says:', order);
```

---

## 🔧 Quick Fix Commands

### Fix 1: Clear Order Map
```javascript
this.api.orders.clear();
this.api.pendingResults.clear();
this.api.resultResolvers.clear();
```

### Fix 2: Force Reconnect
```javascript
this.api.disconnect();
await this.api.connect();
await this.api.login(email, password);
```

### Fix 3: Check Specific Order
```javascript
const orderId = 'YOUR_ORDER_ID';
console.log('Order:', this.api.orders.get(orderId));
console.log('Pending:', this.api.pendingResults.has(orderId));
console.log('Resolver:', this.api.resultResolvers.has(orderId));
```

---

## 📊 Debug Report Template

ถ้าต้องขอความช่วยเหลือ ให้ส่ง:

```
1. Order ID ที่ mismatch:
2. Pattern (A/B/C/D):
3. Log files:
   - logs/test_report_*.json
   - logs/mismatch_debug_*.json
4. Order Map state:
   - Total orders:
   - Pending count:
   - Resolver count:
5. ขั้นตอนที่ missing จาก Event Flow:
```

---

## 🎯 Prevention Checklist

หลังแก้ bug ต้องเช็ค:

- [ ] รัน test 5 trades ผ่าน
- [ ] รัน test 20 trades ผ่าน
- [ ] รัน stress test ผ่าน
- [ ] ไม่มี orphaned orders
- [ ] ไม่มี resolver leak
- [ ] Balance sync ตรง
- [ ] Order map healthy

---

## 🚀 Final Verification

```bash
# รันทั้งหมด
node test/realTradeTest.js 50
node test/stressTest.js

# ตรวจสอบ logs
ls -la logs/
cat logs/test_report_*.json | tail -20
```

ผ่านเมื่อ:
- `mismatched: 0`
- `accuracy: 100%`
- `balanceSync: OK`
- `orderIntegrity: HEALTHY`
