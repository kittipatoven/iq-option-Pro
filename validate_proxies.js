/**
 * Proxy Validator & Tester
 * ทดสอบ proxy แต่ละตัวและคัดเฉพาะที่ใช้งานได้จริง
 */

const https = require('https');
const { HttpsProxyAgent } = require('https-proxy-agent');
const fs = require('fs');

class ProxyValidator {
    constructor() {
        this.workingProxies = [];
        this.testResults = [];
        this.timeout = 5000; // 5 seconds max
    }

    /**
     * Test ว่า proxy ใช้งานได้กับ IQ Option จริงไหม
     */
    async testProxy(proxyUrl) {
        return new Promise((resolve) => {
            const startTime = Date.now();
            
            const timeout = setTimeout(() => {
                resolve({ 
                    proxy: proxyUrl, 
                    working: false, 
                    error: 'timeout',
                    responseTime: null 
                });
            }, this.timeout);

            try {
                const agent = new HttpsProxyAgent(proxyUrl);
                
                https.get('https://iqoption.com', { 
                    agent, 
                    timeout: this.timeout 
                }, (res) => {
                    clearTimeout(timeout);
                    const responseTime = Date.now() - startTime;
                    
                    // ถ้าได้ 200/301/302 = ใช้ได้
                    const success = res.statusCode === 200 || 
                                   res.statusCode === 301 || 
                                   res.statusCode === 302;
                    
                    resolve({
                        proxy: proxyUrl,
                        working: success,
                        statusCode: res.statusCode,
                        responseTime: responseTime,
                        error: success ? null : `status ${res.statusCode}`
                    });
                }).on('error', (err) => {
                    clearTimeout(timeout);
                    resolve({
                        proxy: proxyUrl,
                        working: false,
                        error: err.message,
                        responseTime: null
                    });
                });
            } catch (error) {
                clearTimeout(timeout);
                resolve({
                    proxy: proxyUrl,
                    working: false,
                    error: error.message,
                    responseTime: null
                });
            }
        });
    }

    /**
     * ทดสอบ proxy หลายๆ ตัว
     */
    async testProxies(proxyList) {
        console.log('🔥 PROXY VALIDATION STARTED');
        console.log('='.repeat(60));
        console.log(`Testing ${proxyList.length} proxies...\n`);

        for (const proxy of proxyList) {
            process.stdout.write(`🧪 Testing ${proxy}... `);
            
            const result = await this.testProxy(proxy);
            this.testResults.push(result);
            
            if (result.working) {
                console.log(`✅ WORKING (${result.responseTime}ms)`);
                this.workingProxies.push(result);
            } else {
                console.log(`❌ FAIL (${result.error})`);
            }
            
            // Rate limiting - รอ 1 วินาทีระหว่าง test
            await new Promise(r => setTimeout(r, 1000));
        }

        return this.workingProxies;
    }

    /**
     * โหลด proxy จากไฟล์
     */
    loadProxiesFromFile(filename) {
        if (!fs.existsSync(filename)) {
            return [];
        }
        
        const content = fs.readFileSync(filename, 'utf8');
        return content
            .split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#'));
    }

    /**
     * บันทึก working proxies ลงไฟล์
     */
    saveWorkingProxies(filename = 'proxies_working.txt') {
        if (this.workingProxies.length === 0) {
            console.log('\n⚠️ No working proxies to save!');
            return false;
        }

        const lines = [
            '# Working Proxies for IQ Option',
            '# Validated on: ' + new Date().toISOString(),
            '# Format: http://ip:port or http://user:pass@ip:port',
            ''
        ];

        this.workingProxies.forEach(result => {
            lines.push(result.proxy);
        });

        fs.writeFileSync(filename, lines.join('\n'));
        console.log(`\n💾 Saved ${this.workingProxies.length} working proxies to ${filename}`);
        return true;
    }

    /**
     * แสดงผลลัพธ์สรุป
     */
    printSummary() {
        console.log('\n' + '='.repeat(60));
        console.log('📊 PROXY VALIDATION RESULTS');
        console.log('='.repeat(60));
        console.log(`Total tested: ${this.testResults.length}`);
        console.log(`Working: ${this.workingProxies.length}`);
        console.log(`Failed: ${this.testResults.length - this.workingProxies.length}`);
        
        if (this.workingProxies.length > 0) {
            console.log('\n✅ WORKING PROXIES:');
            this.workingProxies.forEach((result, i) => {
                console.log(`  ${i + 1}. ${result.proxy} (${result.responseTime}ms)`);
            });
            
            // หา proxy ที่เร็วที่สุด
            const fastest = this.workingProxies.reduce((prev, curr) => 
                prev.responseTime < curr.responseTime ? prev : curr
            );
            console.log(`\n🚀 FASTEST: ${fastest.proxy} (${fastest.responseTime}ms)`);
        } else {
            console.log('\n❌ NO WORKING PROXIES FOUND!');
            console.log('\n🔧 RECOMMENDATIONS:');
            console.log('   1. เพิ่ม proxy ที่น่าเชื่อถือ (ไม่ใช่ฟรี public)');
            console.log('   2. ใช้ VPN แทน');
            console.log('   3. ซื้อ proxy ที่มีคุณภาพ');
            console.log('   4. ใช้ VPS ที่ไม่ถูก block');
        }
        console.log('='.repeat(60));
    }

    /**
     * ดึง proxy ฟรีจาก proxy-list.download API
     */
    async fetchFreeProxies() {
        console.log('🔍 Fetching free proxy list...');
        
        const freeProxies = [
            // ตัวอย่าง proxy ฟรี (อาจไม่ทำงาน - ต้อง test ก่อนใช้)
            // คุณต้องหา proxy จริงจากแหล่งที่น่าเชื่อถือ
        ];

        console.log('⚠️ Note: Free public proxies are usually blocked by IQ Option.');
        console.log('   Recommended alternatives:');
        console.log('   1. Bright Data (formerly Luminati)');
        console.log('   2. Oxylabs');
        console.log('   3. Smartproxy');
        console.log('   4. Your own VPN');
        console.log('   5. VPS in different region');

        return freeProxies;
    }
}

// Main execution
async function main() {
    const validator = new ProxyValidator();

    // โหลด proxy จากไฟล์
    let proxies = validator.loadProxiesFromFile('proxies.txt');
    
    // ถ้าไฟล์ว่าง ให้ใช้ defaults
    if (proxies.length === 0) {
        console.log('⚠️ proxies.txt is empty, using default proxy list...');
        proxies = [
            'http://127.0.0.1:7890',   // Clash
            'http://127.0.0.1:8080',   // Common
            'http://127.0.0.1:1080',   // SOCKS
            'http://127.0.0.1:10808',  // Clash default
            'socks5://127.0.0.1:1080' // SOCKS5
        ];
    }

    // ทดสอบทั้งหมด
    await validator.testProxies(proxies);

    // แสดงผลลัพธ์
    validator.printSummary();

    // บันทึกผลลัพธ์
    validator.saveWorkingProxies();

    // Return results สำหรับใช้ต่อ
    return {
        working: validator.workingProxies,
        all: validator.testResults
    };
}

// Run if called directly
if (require.main === module) {
    main().catch(console.error);
}

module.exports = ProxyValidator;
