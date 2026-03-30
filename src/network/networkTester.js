/**
 * Network Diagnostic & Auto-Fix System
 * Comprehensive network testing for IQ Option WebSocket
 * 
 * Features:
 * - DNS resolution test
 * - TCP connection test
 * - WebSocket connection test
 * - Auto proxy detection and switching
 * - Multi-endpoint fallback
 * - Network problem analysis
 */

const dns = require('dns').promises;
const net = require('net');
const WebSocket = require('ws');
const https = require('https');
const { HttpsProxyAgent } = require('https-proxy-agent');

class NetworkTester {
    constructor() {
        this.results = {
            dns: null,
            tcp: null,
            websocket: null,
            proxy: null
        };
        this.defaultProxies = [
            process.env.HTTPS_PROXY,
            process.env.HTTP_PROXY,
            'http://127.0.0.1:7890',  // Clash default
            'http://127.0.0.1:8080',   // Common proxy
            'http://127.0.0.1:1080',   // SOCKS proxy
            'http://localhost:7890',
            'http://localhost:8080',
            'http://localhost:1080'
        ].filter(Boolean);
        
        this.endpoints = [
            'wss://iqoption.com/echo/websocket',
            'wss://iqoption.com/echo/websocket/',
            'wss://iqoption.com/ws',
            'wss://app.iqoption.com/echo/websocket'
        ];
        
        this.timeoutMs = 10000;
    }

    /**
     * Run complete network diagnostic
     */
    async runFullTest() {
        console.log('\n');
        console.log('╔══════════════════════════════════════════════════════════════╗');
        console.log('║          NETWORK DIAGNOSTIC SYSTEM                           ║');
        console.log('╚══════════════════════════════════════════════════════════════╝');
        console.log('\n');

        // Test 1: DNS Resolution
        console.log('🔍 STEP 1: DNS Resolution Test');
        console.log('─────────────────────────────────');
        this.results.dns = await this.testDNS();
        
        // Test 2: TCP Connection
        console.log('\n🔍 STEP 2: TCP Connection Test');
        console.log('─────────────────────────────────');
        this.results.tcp = await this.testTCP();
        
        // Test 3: WebSocket Direct
        console.log('\n🔍 STEP 3: WebSocket Direct Test');
        console.log('─────────────────────────────────');
        this.results.websocket = await this.testWebSocketDirect();
        
        // Test 4: WebSocket with Proxy
        console.log('\n🔍 STEP 4: WebSocket with Proxy Test');
        console.log('─────────────────────────────────');
        this.results.proxy = await this.testWebSocketWithProxy();
        
        // Analysis
        console.log('\n🔍 STEP 5: Network Analysis');
        console.log('─────────────────────────────────');
        const analysis = this.analyzeResults();
        
        return {
            results: this.results,
            analysis: analysis,
            canConnect: this.results.websocket.success || this.results.proxy.success,
            recommendedMethod: this.getRecommendedMethod()
        };
    }

    /**
     * Test DNS resolution
     */
    async testDNS() {
        try {
            console.log('🌐 Resolving iqoption.com...');
            const addresses = await dns.lookup('iqoption.com', { all: true });
            
            console.log('✅ DNS Resolution: SUCCESS');
            console.log(`   IPs found: ${addresses.length}`);
            addresses.forEach((addr, i) => {
                console.log(`   ${i + 1}. ${addr.address} (${addr.family})`);
            });
            
            return {
                success: true,
                addresses: addresses.map(a => a.address),
                primary: addresses[0]?.address
            };
        } catch (error) {
            console.log('❌ DNS Resolution: FAILED');
            console.log(`   Error: ${error.message}`);
            console.log(`   Code: ${error.code}`);
            
            return {
                success: false,
                error: error.message,
                code: error.code
            };
        }
    }

    /**
     * Test TCP connection to port 443
     */
    async testTCP() {
        return new Promise((resolve) => {
            const host = 'iqoption.com';
            const port = 443;
            
            console.log(`🔌 Testing TCP connection to ${host}:${port}...`);
            
            const socket = new net.Socket();
            let resolved = false;
            
            // Timeout
            const timeout = setTimeout(() => {
                if (!resolved) {
                    socket.destroy();
                    console.log('❌ TCP Connection: TIMEOUT');
                    console.log(`   Could not connect within ${this.timeoutMs}ms`);
                    console.log('   Likely causes:');
                    console.log('   • Firewall blocking outbound connections');
                    console.log('   • ISP blocking the destination');
                    console.log('   • Network connectivity issues');
                    
                    resolved = true;
                    resolve({
                        success: false,
                        error: 'Connection timeout',
                        timeout: true
                    });
                }
            }, this.timeoutMs);
            
            socket.connect(port, host, () => {
                if (!resolved) {
                    clearTimeout(timeout);
                    console.log('✅ TCP Connection: SUCCESS');
                    console.log(`   Connected to ${host}:${port}`);
                    
                    socket.destroy();
                    resolved = true;
                    resolve({
                        success: true,
                        host: host,
                        port: port
                    });
                }
            });
            
            socket.on('error', (error) => {
                if (!resolved) {
                    clearTimeout(timeout);
                    console.log('❌ TCP Connection: FAILED');
                    console.log(`   Error: ${error.message}`);
                    console.log(`   Code: ${error.code}`);
                    
                    resolved = true;
                    resolve({
                        success: false,
                        error: error.message,
                        code: error.code
                    });
                }
            });
        });
    }

    /**
     * Test WebSocket connection directly (no proxy)
     */
    async testWebSocketDirect() {
        return new Promise((resolve) => {
            const endpoint = this.endpoints[0];
            
            console.log(`🌐 Testing WebSocket: ${endpoint}`);
            console.log('   (Direct connection, no proxy)');
            
            let resolved = false;
            
            try {
                const ws = new WebSocket(endpoint, {
                    handshakeTimeout: this.timeoutMs,
                    rejectUnauthorized: false,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    }
                });
                
                // Timeout
                const timeout = setTimeout(() => {
                    if (!resolved) {
                        ws.terminate();
                        console.log('❌ WebSocket Direct: TIMEOUT');
                        console.log('   Connection could not be established');
                        
                        resolved = true;
                        resolve({
                            success: false,
                            error: 'Connection timeout',
                            timeout: true
                        });
                    }
                }, this.timeoutMs);
                
                ws.on('open', () => {
                    if (!resolved) {
                        clearTimeout(timeout);
                        console.log('✅ WebSocket Direct: SUCCESS');
                        console.log('   Connected to IQ Option WebSocket');
                        
                        ws.close();
                        resolved = true;
                        resolve({
                            success: true,
                            endpoint: endpoint
                        });
                    }
                });
                
                ws.on('error', (error) => {
                    if (!resolved) {
                        clearTimeout(timeout);
                        console.log('❌ WebSocket Direct: FAILED');
                        console.log(`   Error: ${error.message}`);
                        console.log(`   Code: ${error.code || 'N/A'}`);
                        
                        resolved = true;
                        resolve({
                            success: false,
                            error: error.message,
                            code: error.code
                        });
                    }
                });
                
            } catch (error) {
                if (!resolved) {
                    console.log('❌ WebSocket Direct: CRITICAL ERROR');
                    console.log(`   Error: ${error.message}`);
                    
                    resolve({
                        success: false,
                        error: error.message
                    });
                }
            }
        });
    }

    /**
     * Test WebSocket with proxy auto-detection
     */
    async testWebSocketWithProxy() {
        console.log('🌐 Testing WebSocket with Auto-Proxy Detection');
        console.log(`   Checking ${this.defaultProxies.length} proxy configurations...`);
        
        for (let i = 0; i < this.defaultProxies.length; i++) {
            const proxy = this.defaultProxies[i];
            console.log(`\n   [${i + 1}/${this.defaultProxies.length}] Trying proxy: ${proxy}`);
            
            const result = await this.testSingleProxy(proxy);
            
            if (result.success) {
                console.log(`   ✅ PROXY SUCCESS: ${proxy}`);
                return {
                    success: true,
                    proxy: proxy,
                    endpoint: result.endpoint
                };
            } else {
                console.log(`   ❌ PROXY FAILED: ${proxy}`);
                console.log(`      Error: ${result.error}`);
            }
        }
        
        console.log('\n❌ All proxy attempts failed');
        return {
            success: false,
            error: 'No working proxy found',
            tried: this.defaultProxies.length
        };
    }

    /**
     * Test single proxy
     */
    async testSingleProxy(proxyUrl) {
        return new Promise((resolve) => {
            const endpoint = this.endpoints[0];
            let resolved = false;
            
            try {
                const agent = new HttpsProxyAgent(proxyUrl);
                
                const ws = new WebSocket(endpoint, {
                    handshakeTimeout: this.timeoutMs,
                    rejectUnauthorized: false,
                    agent: agent,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    }
                });
                
                const timeout = setTimeout(() => {
                    if (!resolved) {
                        ws.terminate();
                        resolved = true;
                        resolve({
                            success: false,
                            error: 'Connection timeout'
                        });
                    }
                }, this.timeoutMs);
                
                ws.on('open', () => {
                    if (!resolved) {
                        clearTimeout(timeout);
                        ws.close();
                        resolved = true;
                        resolve({
                            success: true,
                            proxy: proxyUrl,
                            endpoint: endpoint
                        });
                    }
                });
                
                ws.on('error', (error) => {
                    if (!resolved) {
                        clearTimeout(timeout);
                        resolved = true;
                        resolve({
                            success: false,
                            error: error.message,
                            code: error.code
                        });
                    }
                });
                
            } catch (error) {
                if (!resolved) {
                    resolve({
                        success: false,
                        error: error.message
                    });
                }
            }
        });
    }

    /**
     * Try multiple endpoints
     */
    async testMultipleEndpoints() {
        console.log('\n🌐 Testing Multiple Endpoints');
        console.log('─────────────────────────────────');
        
        for (const endpoint of this.endpoints) {
            console.log(`\n   Trying: ${endpoint}`);
            
            const result = await this.testEndpoint(endpoint);
            
            if (result.success) {
                console.log(`   ✅ ENDPOINT SUCCESS: ${endpoint}`);
                return {
                    success: true,
                    endpoint: endpoint
                };
            } else {
                console.log(`   ❌ ENDPOINT FAILED: ${endpoint}`);
            }
        }
        
        return {
            success: false,
            error: 'All endpoints failed'
        };
    }

    /**
     * Test single endpoint
     */
    async testEndpoint(endpoint) {
        return new Promise((resolve) => {
            let resolved = false;
            
            try {
                const ws = new WebSocket(endpoint, {
                    handshakeTimeout: this.timeoutMs,
                    rejectUnauthorized: false
                });
                
                const timeout = setTimeout(() => {
                    if (!resolved) {
                        ws.terminate();
                        resolved = true;
                        resolve({ success: false, error: 'Timeout' });
                    }
                }, this.timeoutMs);
                
                ws.on('open', () => {
                    if (!resolved) {
                        clearTimeout(timeout);
                        ws.close();
                        resolved = true;
                        resolve({ success: true });
                    }
                });
                
                ws.on('error', (error) => {
                    if (!resolved) {
                        clearTimeout(timeout);
                        resolved = true;
                        resolve({ success: false, error: error.message });
                    }
                });
                
            } catch (error) {
                if (!resolved) {
                    resolve({ success: false, error: error.message });
                }
            }
        });
    }

    /**
     * Analyze all test results
     */
    analyzeResults() {
        const { dns, tcp, websocket, proxy } = this.results;
        
        console.log('\n📊 DIAGNOSTIC SUMMARY');
        console.log('═══════════════════════════════════════════════════════════');
        console.log(`   DNS Resolution:  ${dns.success ? '✅ OK' : '❌ FAIL'}`);
        console.log(`   TCP Connection:  ${tcp.success ? '✅ OK' : '❌ FAIL'}`);
        console.log(`   WebSocket Direct: ${websocket.success ? '✅ OK' : '❌ FAIL'}`);
        console.log(`   WebSocket Proxy:  ${proxy.success ? '✅ OK' : '❌ FAIL'}`);
        console.log('═══════════════════════════════════════════════════════════');
        
        let diagnosis = '';
        let severity = 'info';
        let recommendation = '';
        
        // Scenario 1: Everything works
        if (dns.success && tcp.success && websocket.success) {
            diagnosis = 'Network is fully functional';
            severity = 'success';
            recommendation = 'No action needed - proceed with live trading';
        }
        // Scenario 2: DNS fails
        else if (!dns.success) {
            diagnosis = 'DNS resolution failed';
            severity = 'critical';
            recommendation = 'Check DNS settings, try using Google DNS (8.8.8.8) or Cloudflare (1.1.1.1)';
        }
        // Scenario 3: DNS OK but TCP fails
        else if (dns.success && !tcp.success) {
            diagnosis = 'Network blocking detected (TCP blocked)';
            severity = 'critical';
            recommendation = 'Firewall/ISP is blocking the connection. Try VPN or proxy.';
        }
        // Scenario 4: TCP OK but WebSocket fails
        else if (dns.success && tcp.success && !websocket.success) {
            diagnosis = 'WebSocket protocol blocked';
            severity = 'high';
            recommendation = 'WebSocket protocol may be blocked. Try proxy or VPN.';
        }
        // Scenario 5: Direct fails but proxy works
        else if (!websocket.success && proxy.success) {
            diagnosis = 'Proxy required for connection';
            severity = 'warning';
            recommendation = `Use proxy: ${proxy.proxy}`;
        }
        // Scenario 6: Everything fails
        else if (!dns.success && !tcp.success && !websocket.success && !proxy.success) {
            diagnosis = 'Complete network blockage';
            severity = 'critical';
            recommendation = 'Major network issue. Check internet connection, disable firewall, or use VPN.';
        }
        // Default
        else {
            diagnosis = 'Partial network connectivity';
            severity = 'warning';
            recommendation = 'Some tests passed. Try proxy connection or check network settings.';
        }
        
        console.log(`\n🔍 DIAGNOSIS: ${diagnosis}`);
        console.log(`   Severity: ${severity.toUpperCase()}`);
        console.log(`   Recommendation: ${recommendation}`);
        
        return {
            diagnosis,
            severity,
            recommendation,
            canConnect: websocket.success || proxy.success
        };
    }

    /**
     * Get recommended connection method
     */
    getRecommendedMethod() {
        if (this.results.websocket.success) {
            return {
                method: 'direct',
                config: {},
                description: 'Direct WebSocket connection (no proxy needed)'
            };
        } else if (this.results.proxy.success) {
            return {
                method: 'proxy',
                config: { proxy: this.results.proxy.proxy },
                description: `Use proxy: ${this.results.proxy.proxy}`
            };
        } else {
            return {
                method: 'none',
                config: null,
                description: 'No connection method available - use DEMO mode'
            };
        }
    }

    /**
     * Auto-configure IQ Option client with best settings
     */
    getAutoConfig() {
        const recommendation = this.getRecommendedMethod();
        
        return {
            canConnect: recommendation.method !== 'none',
            method: recommendation.method,
            config: recommendation.config,
            description: recommendation.description,
            fallbackToDemo: recommendation.method === 'none'
        };
    }

    /**
     * Quick test function
     */
    async quickTest() {
        console.log('\n⚡ QUICK NETWORK TEST\n');
        
        // Quick DNS
        try {
            await dns.lookup('iqoption.com');
            console.log('✅ DNS: OK');
        } catch (e) {
            console.log('❌ DNS: FAIL');
            return { ready: false, reason: 'DNS failed' };
        }
        
        // Quick TCP
        const tcpResult = await this.testTCP();
        if (!tcpResult.success) {
            console.log('❌ TCP: FAIL');
            return { ready: false, reason: 'TCP blocked' };
        }
        console.log('✅ TCP: OK');
        
        // Quick WebSocket
        const wsResult = await this.testWebSocketDirect();
        if (wsResult.success) {
            console.log('✅ WebSocket: OK');
            return { ready: true, method: 'direct' };
        }
        
        // Try proxy
        const proxyResult = await this.testWebSocketWithProxy();
        if (proxyResult.success) {
            console.log('✅ WebSocket (via proxy): OK');
            return { ready: true, method: 'proxy', proxy: proxyResult.proxy };
        }
        
        console.log('❌ WebSocket: FAIL');
        return { ready: false, reason: 'WebSocket blocked' };
    }
}

// Export for use in other modules
module.exports = NetworkTester;

// Run if called directly
if (require.main === module) {
    const tester = new NetworkTester();
    tester.runFullTest().then(results => {
        console.log('\n');
        console.log('╔══════════════════════════════════════════════════════════════╗');
        console.log('║          TEST COMPLETE                                       ║');
        console.log('╚══════════════════════════════════════════════════════════════╝');
        console.log('\n');
        
        if (results.canConnect) {
            console.log('✅ Network is ready for IQ Option trading');
            console.log(`   Method: ${results.recommendedMethod.method}`);
            if (results.recommendedMethod.config?.proxy) {
                console.log(`   Proxy: ${results.recommendedMethod.config.proxy}`);
            }
        } else {
            console.log('❌ Network is NOT ready for IQ Option trading');
            console.log('   Please check your network settings or use VPN/Proxy');
        }
        
        console.log('\n');
        process.exit(results.canConnect ? 0 : 1);
    }).catch(error => {
        console.error('💥 Test error:', error);
        process.exit(1);
    });
}
