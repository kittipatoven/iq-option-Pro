# IQ Option Smart Bot - Production Setup Guide

## 🚀 ขั้นตอนการตั้งค่าและใช้งานจริง

### 1. ติดตั้ง Dependencies

```bash
npm install
```

### 2. ตั้งค่า API Credentials

สร้างไฟล์ `.env` ใน root directory:

```env
# IQ Option API Credentials
IQ_OPTION_EMAIL=your_email@example.com
IQ_OPTION_PASSWORD=your_password

# Trading Settings
INITIAL_BALANCE=1000
TRADE_PERCENT=1
MAX_DAILY_LOSS_PERCENT=5
HARD_STOP_DRAWDOWN=10

# Risk Management
ENABLE_KILL_SWITCH=true
KILL_SWITCH_BALANCE_PERCENT=90
ENABLE_EQUITY_PROTECTION=true
MAX_CONSECUTIVE_LOSSES=7
```

### 3. ตั้งค่า Risk Management

แก้ไข `src/config/risk.config.js`:

```javascript
module.exports = {
    // ความเสี่ยงต่อการเทรด (% ของ balance)
    tradePercent: 1, // 1% ต่อการเทรด
    
    // ขีดจำกัดการขาดทุนต่อวัน
    maxDailyLossPercent: 5, // 5% ของ initial balance
    
    // Hard stop drawdown
    hardStopDrawdown: 10, // หยุดเทรดเมื่อ drawdown >= 10%
    
    // Kill switch
    enableKillSwitch: true,
    killSwitchBalancePercent: 90, // หยุดเมื่อ balance < 90% ของ initial
    
    // Equity protection
    enableEquityProtection: true,
    losingStreakThresholds: {
        3: 0.50, // ลด size 50% เมื่อแพ้ 3 ครั้งติด
        5: 0.25, // ลด size 75% เมื่อแพ้ 5 ครั้งติด
        7: 0     // หยุดเทรดเมื่อแพ้ 7 ครั้งติด
    }
};
```

### 4. เลือก Strategy

แก้ไข `src/config/trading.config.js`:

```javascript
module.exports = {
    // Strategy: 'SNIPER_ENTRY' | 'TREND_FOLLOWING' | 'REVERSAL'
    strategy: 'SNIPER_ENTRY',
    
    // Asset
    asset: 'EURUSD',
    
    // Timeframe (minutes)
    timeframe: 1,
    
    // Trade duration (minutes)
    duration: 5,
    
    // Minimum score to trade
    minScore: 3.0,
    
    // Market filters
    filters: {
        skipVolatileMarket: true,
        skipHighImpactNews: true,
        minVolatility: 0.001,
        maxVolatility: 0.005
    }
};
```

### 5. เริ่มใช้งาน

```bash
# Development mode (paper trading)
npm run dev

# Production mode (real trading - ระวัง!)
npm start
```

---

## ⚙️ การทำงานของระบบ

### Risk Management อัตโนมัติ

1. **Hard Stop Drawdown**: หยุดเทรดทันทีเมื่อ drawdown >= 10%
2. **Kill Switch**: หยุดเทรดเมื่อ balance < 90% ของ initial
3. **Daily Loss Limit**: หยุดเทรดเมื่อขาดทุนต่อวัน >= 5%
4. **Equity Protection**: ลด size เมื่อแพ้ติดต่อกัน

### Signal Flow

1. ดึงข้อมูลตลาด (Market Data)
2. คำนวณ Indicators (RSI, BB, MACD)
3. ตรวจจับ Market Condition
4. วิเคราะห์ Sniper Entry
5. คำนวณ Confidence Score
6. ตรวจสอบ Risk Management
7. Execute Trade
8. บันทึกผลและปรับ Money Management

---

## 🔍 การ Monitor

### ดู Logs

```bash
# Real-time logs
tail -f logs/trading.log

# Daily report
cat logs/daily_report_$(date +%Y%m%d).json
```

### Metrics สำคัญ

- **Winrate**: เปอร์เซ็นต์การชนะ
- **Profit Factor**: กำไร/ขาดทุน
- **Max Drawdown**: การลดลงสูงสุดจาก peak
- **Sharpe Ratio**: อัตราส่วนความเสี่ยง/ผลตอบแทน

---

## ⚠️ คำเตือนสำคัญ

1. **ทดสอบบน Demo ก่อนเสมอ** อย่างน้อย 1 สัปดาห์
2. **เริ่มด้วยเงินน้อย** แนะนำ $100-500 ก่อน
3. **อย่าเทรดเกิน 1% ต่อครั้ง**
4. **หยุดทันที** ถ้า daily loss >= 5%
5. **ไม่เทรด** ช่วงข่าวแรง (High Impact News)

---

## 🆘 การหยุดระบบฉุกเฉิน

กด `Ctrl+C` หรือสร้างไฟล์ `STOP` ใน root directory:

```bash
touch STOP
```

ระบบจะหยุดหลังจากปิด trade ปัจจุบัน
