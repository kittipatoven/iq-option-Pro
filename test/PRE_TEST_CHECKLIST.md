# Pre-Test Checklist

## ✅ ก่อนรัน Real Trade Test

### 1. Environment Setup
- [ ] `.env` file มี `IQ_OPTION_EMAIL` และ `IQ_OPTION_PASSWORD`
- [ ] รันช่วง market เปิด (ไม่ใช่ weekend)
- [ ] มีเงินใน account พอสำหรับ test ($1 x 50 trades = $50+ buffer)
- [ ] Network connection เสถียร

### 2. Connection Test
```bash
node -e "const IQ = require('./src/api/iqOptionClient.js'); const c = new IQ(); c.connect().then(() => console.log('OK')).catch(e => console.log('FAIL:', e.message))"
```

### 3. Quick Sanity Check (3 trades)
```bash
node test/realTradeTest.js 3
```

ต้องได้:
- ✅ 3/3 matched
- ❌ 0 mismatch

ถ้าผ่าน → รัน test เต็ม

---

## 🚨 STOP Conditions

หยุดทันทีถ้า:
- เกิด mismatch > 3 ครั้งติด
- Balance ไม่ตรง
- Order map มี orphaned orders
- Connection หลุดบ่อย

---

## 📊 Success Criteria

```
Trades: 50
Matched: 50
Mismatch: 0
Accuracy: 100%
Balance Sync: OK
Order Integrity: HEALTHY
```

---

## 🔧 Debug Tools Available

1. **realTradeTest.js** - Test หลัก
2. **stressTest.js** - Edge cases
3. **autoFixLoop.js** - Auto debug + fix
4. **logs/mismatch_debug_*.json** - Debug info
5. **logs/test_report_*.json** - รายงานผล

---

## 📝 Log Files Location

```
logs/
├── test_report_[timestamp].json
├── mismatch_debug_[orderId]_[ts].json
├── test_errors_[timestamp].json
├── stress_test_[timestamp].json
└── autofix_final_report_[ts].json
```

---

## 🎯 Expected Output

### Good:
```
📊 TRADE 1/50
📤 ORDER SENT: 12345
📥 BOT RESULT: WIN | $85
📊 SERVER RESULT: WIN | $85
✅ MATCHED
```

### Bad (Need Debug):
```
📊 TRADE 5/50
📤 ORDER SENT: 12349
📥 BOT RESULT: WIN | $85
📊 SERVER RESULT: LOSS | -$100
❌ MISMATCH!
🔧 AUTO-DEBUG...
```

---

## 🚀 Run Commands

```bash
# Test 5 trades (เร็ว)
node test/realTradeTest.js 5

# Test 20 trades (standard)
node test/realTradeTest.js 20

# Test 50 trades (full)
node test/realTradeTest.js 50

# Stress test
node test/stressTest.js

# Auto-fix loop
node test/autoFixLoop.js
```

---

## ⚠️ Warnings

1. **ใช้เงินจริง** - ระวังจำนวน trade
2. **IQ Option อาจ block** - ถ้า trade ถี่เกิน
3. **Network ต้องเสถียร** - อย่าใช้ WiFi ที่ไม่แน่นอน
4. **ห้าม interrupt** - อย่ากด Ctrl+C ตอนรอ result

---

## 📞 When To Ask For Help

ถ้า:
- Test fail ซ้ำ ๆ หลายรอบ
- Debug แล้วหา root cause ไม่เจอ
- Mismatch pattern ไม่ชัดเจน
- ไม่เข้าใจ log

ให้ส่ง:
1. `logs/test_report_*.json` ล่าสุด
2. `logs/mismatch_debug_*.json` (ถ้ามี)
3. Screenshot ของ console output
