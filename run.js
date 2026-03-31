#!/usr/bin/env node
/**
 * IQ Option Trading Bot - Production Launcher
 * รันระบบเทรดจริง ใช้งานง่าย ไม่ต้องจำคำสั่งยาวๆ
 */

const { execSync } = require('child_process');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log(`
╔════════════════════════════════════════════════════════════════╗
║                                                                ║
║           🤖 IQ OPTION AI TRADING BOT                         ║
║              Production Launcher v1.0                          ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
`);

const menu = `
📋 เลือกโหมดการใช้งาน:

1️⃣  [1] รันด้วย CLI (ป้อน credentials เอง)
     👉 ใช้เมื่อยังไม่มีไฟล์ .env

2️⃣  [2] รันอัตโนมัติ (ใช้ .env)
     👉 ใช้เมื่อตั้งค่า .env แล้ว

3️⃣  [3] ทดสอบระบบทั้งหมด
     👉 ตรวจสอบว่าทุกอย่างทำงานได้

4️⃣  [4] ดูสถานะ AI
     👉 ดู win rate และ statistics

5️⃣  [5] เปิดไฟล์ .env แก้ไข
     👉 ตั้งค่า credentials

6️⃣  [6] คู่มือการใช้งาน
     👉 อ่านวิธีใช้งาน

7️⃣  [7] หยุด Bot (ถ้ากำลังรัน)

0️⃣  [0] ออก

`;

function showMenu() {
    console.log(menu);
    rl.question('🔢 เลือกหมายเลข (0-7): ', (choice) => {
        handleChoice(choice.trim());
    });
}

function handleChoice(choice) {
    switch(choice) {
        case '1':
            console.log('\n🚀 เริ่มโหมด CLI...\n');
            runCommand('node app.js start', true);
            break;
            
        case '2':
            console.log('\n🚀 เริ่มโหมดอัตโนมัติ...\n');
            checkEnv().then(hasEnv => {
                if (hasEnv) {
                    runCommand('node main.js', true);
                } else {
                    console.log('\n⚠️ ไม่พบไฟล์ .env หรือตั้งค่าไม่ครบ');
                    console.log('👉 กรุณาเลือก [5] เพื่อตั้งค่าก่อน\n');
                    showMenu();
                }
            });
            break;
            
        case '3':
            console.log('\n🧪 กำลังทดสอบระบบ...\n');
            runCommand('node test_full_system.js', false);
            break;
            
        case '4':
            showAIStatus();
            break;
            
        case '5':
            editEnv();
            break;
            
        case '6':
            showGuide();
            break;
            
        case '7':
            console.log('\n🛑 หยุด Bot...\n');
            runCommand('node app.js stop', false);
            break;
            
        case '0':
            console.log('\n👋 ลาก่อน!\n');
            rl.close();
            process.exit(0);
            break;
            
        default:
            console.log('\n❌ ตัวเลือกไม่ถูกต้อง กรุณาเลือก 0-7\n');
            showMenu();
    }
}

function runCommand(cmd, waitForExit) {
    try {
        if (waitForExit) {
            execSync(cmd, { stdio: 'inherit' });
        } else {
            const result = execSync(cmd, { encoding: 'utf-8', stdio: 'pipe' });
            console.log(result);
        }
    } catch (error) {
        console.log('\n❌ เกิดข้อผิดพลาด:', error.message);
    }
    
    if (!waitForExit) {
        console.log('\nกด Enter เพื่อกลับเมนู...');
        rl.question('', () => showMenu());
    }
}

function checkEnv() {
    return new Promise((resolve) => {
        try {
            const envContent = require('fs').readFileSync('.env', 'utf8');
            const hasEmail = envContent.includes('IQ_OPTION_EMAIL=') && 
                           !envContent.includes('IQ_OPTION_EMAIL=your_email');
            const hasPassword = envContent.includes('IQ_OPTION_PASSWORD=') && 
                              !envContent.includes('IQ_OPTION_PASSWORD=your_password');
            resolve(hasEmail && hasPassword);
        } catch (error) {
            resolve(false);
        }
    });
}

function showAIStatus() {
    try {
        const data = require('./data/ai_analysis.json');
        const stats = data.stats || {};
        
        console.log(`
╔════════════════════════════════════════════════════════════════╗
║                    🤖 AI SYSTEM STATUS                         ║
╚════════════════════════════════════════════════════════════════╝

📊 OVERALL PERFORMANCE
─────────────────────────────────────────────────────────────────
Total Trades: ${stats.totalTrades || 0}
Wins: ${stats.wins || 0} | Losses: ${stats.losses || 0}
Win Rate: ${((stats.winRate || 0) * 100).toFixed(2)}%
Profit Factor: ${(stats.profitFactor || 0).toFixed(2)}
Max Consecutive Losses: ${stats.maxConsecutiveLosses || 0}

📈 CURRENT STREAK: ${stats.consecutiveLosses > 0 ? 'L' + stats.consecutiveLosses : 'W' + stats.consecutiveWins}

💡 คำแนะนำ:
${(stats.winRate || 0) > 0.55 ? '✅ AI กำลังทำงานได้ดี (Win rate > 55%)' : '⚠️ Win rate ต่ำกว่า 55% - ควรรอช่วงที่ดีกว่า'}
${(stats.consecutiveLosses || 0) >= 3 ? '🛑 AI แนะนำให้หยุดเทรดชั่วคราว' : ''}

`);
    } catch (error) {
        console.log('\n⚠️ ยังไม่มีข้อมูล AI หรือไม่ได้รันระบบมาก่อน\n');
    }
    
    console.log('กด Enter เพื่อกลับเมนู...');
    rl.question('', () => showMenu());
}

function editEnv() {
    const fs = require('fs');
    const path = './.env';
    
    const template = `# IQ Option Trading Bot Configuration
# แก้ไขค่าด้านล่างแล้วบันทึกไฟล์

# 🔐 IQ Option Credentials (จำเป็น)
IQ_OPTION_EMAIL=your_email@example.com
IQ_OPTION_PASSWORD=your_password

# 💰 Account Settings
ACCOUNT_TYPE=PRACTICE
BASE_AMOUNT=1
MAX_DAILY_LOSS=50
MAX_DAILY_PROFIT_PERCENT=10
RISK_PERCENTAGE=2

# 📊 Trading Settings
TIMEFRAME=1m
TRADING_PAIRS=EURUSD-OTC,GBPUSD-OTC,USDJPY-OTC

# 🌐 News Filter (optional)
NEWS_MODE=off
NEWS_API_KEY=your_newsapi_key

# 📝 Logging
LOG_LEVEL=INFO
`;

    if (!fs.existsSync(path)) {
        fs.writeFileSync(path, template);
        console.log('\n✅ สร้างไฟล์ .env ใหม่แล้ว');
    }
    
    console.log('\n📝 กรุณาแก้ไขไฟล์ .env ด้วยตนเอง');
    console.log('📂 ไฟล์อยู่ที่:', require('path').resolve(path));
    console.log('\n👉 เปิดไฟล์ใน VS Code แล้วแก้ไข:');
    console.log('   1. IQ_OPTION_EMAIL: ใส่อีเมล IQ Option');
    console.log('   2. IQ_OPTION_PASSWORD: ใส่รหัสผ่าน');
    console.log('   3. ACCOUNT_TYPE: PRACTICE (ทดลอง) หรือ REAL (จริง)');
    console.log('   4. BASE_AMOUNT: จำนวนเงินเทรดต่อครั้ง');
    console.log('\n⚠️ อย่าลืมบันทึกไฟล์หลังแก้ไข!\n');
    
    console.log('กด Enter เพื่อกลับเมนู...');
    rl.question('', () => showMenu());
}

function showGuide() {
    console.log(`
╔════════════════════════════════════════════════════════════════╗
║                    📚 QUICK START GUIDE                          ║
╚════════════════════════════════════════════════════════════════╝

🎯 วิธีใช้งานครั้งแรก:
─────────────────────────────────────────────────────────────────

1️⃣  ตั้งค่า .env (เลือก [5] จากเมนู)
    • ใส่อีเมลและรหัสผ่าน IQ Option
    • เลือก PRACTICE (ทดลอง) หรือ REAL (จริง)
    • ตั้งจำนวนเงินเทรด (BASE_AMOUNT)

2️⃣  ทดสอบระบบ (เลือก [3] จากเมนู)
    • ตรวจสอบว่าทุกอย่างทำงานได้
    • ดู AI report ว่าเรียนรู้อะไรบ้าง

3️⃣  เริ่มเทรดจริง (เลือก [2] จากเมนู)
    • ใช้ .env ที่ตั้งค่าไว้
    • Bot จะเทรดอัตโนมัติตาม AI

⚠️  คำเตือนสำคัญ:
─────────────────────────────────────────────────────────────────
• เริ่มจาก PRACTICE account ก่อนเสมอ
• ตั้ง MAX_DAILY_LOSS เพื่อ limit ความเสี่ยง
• ติดตาม AI status ว่า win rate ดีหรือไม่
• หยุดเทรดถ้า AI แนะนำ (consecutive losses ≥ 3)

🛑 วิธีหยุด Bot:
• กด Ctrl+C ใน terminal
• หรือเลือก [7] จากเมนู

📊 ดูผลการเทรด:
• ไฟล์ data/ai_analysis.json - ข้อมูล AI
• ไฟล์ logs/ - log ทั้งหมด

`);
    
    console.log('กด Enter เพื่อกลับเมนู...');
    rl.question('', () => showMenu());
}

// Start
showMenu();
