#!/usr/bin/env node
/**
 * Log Analyzer - AI ช่วยวิเคราะห์ log เมื่อมี mismatch
 * 
 * รัน: node test/logAnalyzer.js [logFile]
 * 
 * จะวิเคราะห์:
 * - mismatch pattern
 * - root cause
 * - แนะนำวิธีแก้
 */

const fs = require('fs');
const path = require('path');

class LogAnalyzer {
    constructor() {
        this.analysis = {
            mismatches: [],
            patterns: {},
            rootCauses: [],
            recommendations: []
        };
    }

    analyze(filePath) {
        console.log('\n🔍 ANALYZING LOG:', filePath);
        console.log('='.repeat(80));

        if (!fs.existsSync(filePath)) {
            console.error('❌ File not found:', filePath);
            return null;
        }

        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        
        // 1. วิเคราะห์ mismatch pattern
        this.analyzeMismatches(data);
        
        // 2. หา root cause
        this.findRootCauses(data);
        
        // 3. สร้าง recommendations
        this.generateRecommendations();

        // 4. แสดงผล
        this.printReport();

        return this.analysis;
    }

    analyzeMismatches(data) {
        const trades = data.trades || [];
        
        trades.forEach(trade => {
            if (!trade.matched) {
                const pattern = this.classifyPattern(trade);
                
                this.analysis.mismatches.push({
                    orderId: trade.orderId,
                    botResult: trade.botResult,
                    serverResult: trade.serverResult,
                    botProfit: trade.botProfit,
                    serverProfit: trade.serverProfit,
                    pattern: pattern,
                    timestamp: trade.timestamp
                });

                this.analysis.patterns[pattern] = (this.analysis.patterns[pattern] || 0) + 1;
            }
        });
    }

    classifyPattern(trade) {
        const bot = trade.botResult;
        const server = trade.serverResult;

        if (!bot && server) return 'MISSING_BOT_RESULT';
        if (bot && !server) return 'MISSING_SERVER_RESULT';
        if (bot === 'WIN' && server === 'LOSS') return 'WIN_LOSS_MISMATCH';
        if (bot === 'LOSS' && server === 'WIN') return 'LOSS_WIN_MISMATCH';
        if (bot !== server) return 'RESULT_MISMATCH';
        return 'UNKNOWN';
    }

    findRootCauses(data) {
        const patterns = Object.keys(this.analysis.patterns);
        
        patterns.forEach(pattern => {
            switch (pattern) {
                case 'MISSING_BOT_RESULT':
                    this.analysis.rootCauses.push({
                        pattern: pattern,
                        cause: 'handleOptionClosed ไม่ทำงาน หรือ order ไม่ถูก update',
                        files: ['src/api/iqOptionClient.js'],
                        functions: ['handleOptionClosed', 'waitForResult']
                    });
                    break;
                    
                case 'WIN_LOSS_MISMATCH':
                case 'LOSS_WIN_MISMATCH':
                    this.analysis.rootCauses.push({
                        pattern: pattern,
                        cause: 'result มาช้า หรือ resolve ผิด timing',
                        files: ['src/api/iqOptionClient.js'],
                        functions: ['handleOptionClosed', 'resultResolvers']
                    });
                    break;
                    
                case 'MISSING_SERVER_RESULT':
                    this.analysis.rootCauses.push({
                        pattern: pattern,
                        cause: 'getOrderFromHistory ไม่พบ order',
                        files: ['src/api/iqOptionClient.js'],
                        functions: ['getOrderFromHistory']
                    });
                    break;
            }
        });
    }

    generateRecommendations() {
        const rootCauses = this.analysis.rootCauses;
        
        rootCauses.forEach(cause => {
            switch (cause.pattern) {
                case 'MISSING_BOT_RESULT':
                    this.analysis.recommendations.push({
                        priority: 'HIGH',
                        action: 'เพิ่ม debug log ใน handleOptionClosed',
                        code: `
    handleOptionClosed(msg) {
        console.log('🎯 RAW option-closed:', JSON.stringify(msg));
        console.log('🎯 Order ID:', msg.id);
        console.log('🎯 Win:', msg.win);
        
        // ...existing code...
    }`
                    });
                    break;
                    
                case 'WIN_LOSS_MISMATCH':
                case 'LOSS_WIN_MISMATCH':
                    this.analysis.recommendations.push({
                        priority: 'HIGH',
                        action: 'ตรวจสอบ resolver timing และ duplicate handling',
                        code: `
    // ใน handleOptionClosed - เพิ่ม logging
    const resolver = this.resultResolvers.get(msg.id);
    console.log('🔍 Resolver found:', !!resolver);
    console.log('🔍 Available resolvers:', Array.from(this.resultResolvers.keys()));
    
    if (resolver) {
        console.log('🎯 Resolving:', msg.id);
        resolver({...});
        this.resultResolvers.delete(msg.id);
        console.log('🗑️ Resolver deleted');
    }`
                    });
                    break;
                    
                case 'MISSING_SERVER_RESULT':
                    this.analysis.recommendations.push({
                        priority: 'MEDIUM',
                        action: 'เพิ่ม timeout ใน getOrderFromHistory',
                        code: `
    // เพิ่ม timeout เป็น 30 วินาที
    async getOrderFromHistory(orderId, timeoutMs = 30000) {
        // ...existing code...
    }`
                    });
                    break;
            }
        });
    }

    printReport() {
        console.log('\n📊 ANALYSIS REPORT');
        console.log('='.repeat(80));
        
        // 1. Summary
        const totalMismatches = this.analysis.mismatches.length;
        console.log(`\nTotal Mismatches: ${totalMismatches}`);
        
        if (totalMismatches === 0) {
            console.log('✅ No mismatches found!');
            return;
        }

        // 2. Pattern breakdown
        console.log('\n📈 PATTERN BREAKDOWN:');
        Object.entries(this.analysis.patterns).forEach(([pattern, count]) => {
            console.log(`   ${pattern}: ${count} cases`);
        });

        // 3. Root Causes
        console.log('\n🔍 ROOT CAUSES:');
        this.analysis.rootCauses.forEach((cause, i) => {
            console.log(`\n   ${i + 1}. ${cause.pattern}`);
            console.log(`      Cause: ${cause.cause}`);
            console.log(`      Files: ${cause.files.join(', ')}`);
            console.log(`      Functions: ${cause.functions.join(', ')}`);
        });

        // 4. Recommendations
        console.log('\n🔧 RECOMMENDATIONS:');
        this.analysis.recommendations.forEach((rec, i) => {
            console.log(`\n   ${i + 1}. [${rec.priority}] ${rec.action}`);
            console.log('      Code to add:');
            console.log(rec.code.split('\n').map(l => '      ' + l).join('\n'));
        });

        // 5. Mismatch details
        console.log('\n❌ MISMATCH DETAILS:');
        this.analysis.mismatches.forEach((m, i) => {
            console.log(`\n   ${i + 1}. Order ID: ${m.orderId}`);
            console.log(`      Pattern: ${m.pattern}`);
            console.log(`      Bot: ${m.botResult} ($${m.botProfit})`);
            console.log(`      Server: ${m.serverResult} ($${m.serverProfit})`);
            console.log(`      Time: ${m.timestamp}`);
        });

        // 6. Next steps
        console.log('\n👉 NEXT STEPS:');
        console.log('   1. เพิ่ม debug logs ตาม recommendations');
        console.log('   2. รัน test ใหม่: node test/realTradeTest.js 5');
        console.log('   3. ส่ง log ใหม่มาให้วิเคราะห์');
        console.log('   4. ทำซ้ำจนกว่าจะไม่มี mismatch');

        console.log('\n' + '='.repeat(80) + '\n');
    }
}

// Main
const logFile = process.argv[2];

if (!logFile) {
    // หาไฟล์ล่าสุด
    const logsDir = 'logs';
    if (!fs.existsSync(logsDir)) {
        console.error('❌ logs/ directory not found');
        process.exit(1);
    }

    const reports = fs.readdirSync(logsDir)
        .filter(f => f.startsWith('test_report_') && f.endsWith('.json'))
        .sort()
        .reverse();

    if (reports.length === 0) {
        console.error('❌ No test reports found in logs/');
        process.exit(1);
    }

    const latestReport = path.join(logsDir, reports[0]);
    console.log('📁 Using latest report:', latestReport);
    
    const analyzer = new LogAnalyzer();
    analyzer.analyze(latestReport);
} else {
    const analyzer = new LogAnalyzer();
    analyzer.analyze(logFile);
}
