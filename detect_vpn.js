/**
 * VPN/Proxy Auto-Detection & Connection Helper
 * ตรวจหาและใช้ VPN/Proxy อัตโนมัติ
 */

const https = require('https');
const { HttpsProxyAgent } = require('https-proxy-agent');
const fs = require('fs');
const { execSync } = require('child_process');

class VPNHelper {
    constructor() {
        this.vpnInterfaces = ['tun', 'tap', 'ppp', 'wg', 'utun'];
        this.proxyPorts = [7890, 8080, 1080, 10808, 8118, 3128];
    }

    /**
     * ตรวจหา VPN ที่กำลังทำงาน
     */
    detectVPN() {
        console.log('🔍 Detecting VPN...');
        
        try {
            // Windows: ตรวจหา network interfaces
            const result = execSync('ipconfig /all', { encoding: 'utf8' });
            
            // ตรวจหา VPN indicators
            const vpnKeywords = ['VPN', 'TAP-Windows', 'Tun', 'WireGuard', 'OpenVPN', 'NordVPN', 'ExpressVPN', 'ProtonVPN'];
            
            for (const keyword of vpnKeywords) {
                if (result.includes(keyword)) {
                    console.log(`✅ VPN detected: ${keyword}`);
                    return { detected: true, type: keyword };
                }
            }
            
            // ตรวจหา Proxy settings จาก Windows
            const proxyResult = this.detectSystemProxy();
            if (proxyResult.found) {
                return { detected: true, type: 'System Proxy', proxy: proxyResult.proxy };
            }
            
        } catch (error) {
            console.log('⚠️ Could not detect VPN:', error.message);
        }
        
        return { detected: false };
    }

    /**
     * ตรวจหา System Proxy จาก Windows Registry
     */
    detectSystemProxy() {
        try {
            // ตรวจหา proxy จาก environment
            const proxy = process.env.HTTP_PROXY || process.env.HTTPS_PROXY;
            if (proxy) {
                return { found: true, proxy };
            }
            
            // ตรวจหา localhost proxy ports
            for (const port of this.proxyPorts) {
                if (this.isPortOpen('127.0.0.1', port)) {
                    const proxyUrl = `http://127.0.0.1:${port}`;
                    console.log(`🔍 Found potential proxy at ${proxyUrl}`);
                    return { found: true, proxy: proxyUrl };
                }
            }
            
        } catch (error) {
            console.log('⚠️ Could not detect system proxy:', error.message);
        }
        
        return { found: false };
    }

    /**
     * ตรวจสอบว่า port เปิดอยู่หรือไม่
     */
    isPortOpen(host, port) {
        try {
            const net = require('net');
            const socket = new net.Socket();
            socket.setTimeout(1000);
            
            let isOpen = false;
            
            socket.on('connect', () => {
                isOpen = true;
                socket.destroy();
            });
            
            socket.on('error', () => {
                isOpen = false;
            });
            
            socket.connect(port, host);
            
            // Wait a bit
            const start = Date.now();
            while (Date.now() - start < 1000) {
                if (isOpen) return true;
            }
            
            return isOpen;
        } catch {
            return false;
        }
    }

    /**
     * Test connection ผ่าน VPN/Proxy
     */
    async testConnection() {
        const vpn = this.detectVPN();
        
        if (!vpn.detected) {
            console.log('❌ No VPN or proxy detected!');
            console.log('\n🔧 SOLUTIONS:');
            console.log('   1. Connect VPN (NordVPN, ExpressVPN, ProtonVPN)');
            console.log('   2. Start proxy (Clash, V2Ray, Shadowsocks)');
            console.log('   3. Use mobile hotspot');
            console.log('   4. Deploy to VPS\n');
            return false;
        }
        
        console.log(`\n✅ Using: ${vpn.type}`);
        
        if (vpn.proxy) {
            // Test ผ่าน proxy
            return await this.testWithProxy(vpn.proxy);
        } else {
            // Test โดยตรง (ผ่าน VPN)
            return await this.testDirect();
        }
    }

    /**
     * Test direct connection (ผ่าน VPN)
     */
    async testDirect() {
        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                resolve(false);
            }, 10000);
            
            https.get('https://iqoption.com', { timeout: 10000 }, (res) => {
                clearTimeout(timeout);
                const success = res.statusCode === 200 || res.statusCode === 301 || res.statusCode === 302;
                console.log(`🧪 Direct test (via VPN): ${success ? '✅ PASS' : '❌ FAIL'} (${res.statusCode})`);
                resolve(success);
            }).on('error', (err) => {
                clearTimeout(timeout);
                console.log(`🧪 Direct test: ❌ FAIL (${err.message})`);
                resolve(false);
            });
        });
    }

    /**
     * Test ผ่าน proxy
     */
    async testWithProxy(proxyUrl) {
        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                resolve(false);
            }, 10000);
            
            try {
                const agent = new HttpsProxyAgent(proxyUrl);
                
                https.get('https://iqoption.com', { agent, timeout: 10000 }, (res) => {
                    clearTimeout(timeout);
                    const success = res.statusCode === 200 || res.statusCode === 301 || res.statusCode === 302;
                    console.log(`🧪 Proxy test: ${success ? '✅ PASS' : '❌ FAIL'} (${res.statusCode})`);
                    resolve(success);
                }).on('error', (err) => {
                    clearTimeout(timeout);
                    console.log(`🧪 Proxy test: ❌ FAIL (${err.message})`);
                    resolve(false);
                });
            } catch (error) {
                clearTimeout(timeout);
                console.log(`🧪 Proxy test: ❌ FAIL (${error.message})`);
                resolve(false);
            }
        });
    }

    /**
     * สร้าง .env สำหรับ VPN/Proxy
     */
    async setupEnvironment() {
        const vpn = this.detectVPN();
        
        if (vpn.detected && vpn.proxy) {
            // อ่าน .env ปัจจุบัน
            let envContent = '';
            if (fs.existsSync('.env')) {
                envContent = fs.readFileSync('.env', 'utf8');
            }
            
            // เพิ่ม proxy ถ้ายังไม่มี
            if (!envContent.includes('HTTPS_PROXY')) {
                envContent += `\n# Auto-detected proxy\nHTTPS_PROXY=${vpn.proxy}\n`;
                fs.writeFileSync('.env', envContent);
                console.log(`✅ Added HTTPS_PROXY=${vpn.proxy} to .env`);
            }
            
            return true;
        }
        
        return false;
    }
}

// Main
async function main() {
    const helper = new VPNHelper();
    
    console.log('\n🔥 VPN/PROXY AUTO-DETECTION');
    console.log('='.repeat(60));
    
    const connected = await helper.testConnection();
    
    if (connected) {
        console.log('\n✅ Network is ready for IQ Option!');
        await helper.setupEnvironment();
    } else {
        console.log('\n❌ Network is NOT ready');
        console.log('\n⚠️ You MUST:');
        console.log('   1. Connect to a VPN');
        console.log('   2. Or start a proxy server');
        console.log('   3. Or use different network\n');
    }
    
    return connected;
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = VPNHelper;
