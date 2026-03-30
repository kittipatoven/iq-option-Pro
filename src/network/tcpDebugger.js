/**
 * TCP Debugger - Low-level TCP Connection Analysis
 * Deep network diagnostics for IQ Option connection issues
 */

const net = require('net');
const dns = require('dns').promises;

class TCPDebugger {
    constructor() {
        this.results = [];
        this.timeoutMs = 10000;
    }

    /**
     * Run comprehensive TCP diagnostics
     */
    async runDiagnostics() {
        console.log('\n');
        console.log('╔══════════════════════════════════════════════════════════════╗');
        console.log('║          TCP DEBUGGER - Low-Level Network Analysis           ║');
        console.log('╚══════════════════════════════════════════════════════════════╝');
        console.log('\n');

        const host = 'iqoption.com';
        const port = 443;

        // Test 1: DNS Resolution
        console.log('🔍 TEST 1: DNS Resolution');
        console.log('────────────────────────────');
        const dnsResult = await this.testDNS(host);
        this.results.push({ test: 'DNS', result: dnsResult });

        // Test 2: Direct IP Connection (if DNS succeeded)
        if (dnsResult.success && dnsResult.addresses.length > 0) {
            console.log('\n🔍 TEST 2: Direct IP Connection');
            console.log('─────────────────────────────────');
            for (const ip of dnsResult.addresses.slice(0, 2)) {
                const tcpResult = await this.testDirectTCP(ip, port);
                this.results.push({ test: `TCP-${ip}`, result: tcpResult });
            }
        }

        // Test 3: TCP Connection Analysis
        console.log('\n🔍 TEST 3: TCP Connection Analysis');
        console.log('─────────────────────────────────────');
        const analysis = await this.analyzeTCPConnection(host, port);
        this.results.push({ test: 'TCP-Analysis', result: analysis });

        // Test 4: Port Scan (common proxy ports)
        console.log('\n🔍 TEST 4: Local Proxy Port Scan');
        console.log('──────────────────────────────────');
        const proxyScan = await this.scanProxyPorts();
        this.results.push({ test: 'Proxy-Scan', result: proxyScan });

        return this.compileReport();
    }

    /**
     * Test DNS resolution
     */
    async testDNS(hostname) {
        try {
            console.log(`   Resolving ${hostname}...`);
            
            // IPv4
            const ipv4 = await dns.resolve4(hostname).catch(() => []);
            console.log(`   IPv4 addresses: ${ipv4.length > 0 ? ipv4.join(', ') : 'None'}`);
            
            // IPv6
            const ipv6 = await dns.resolve6(hostname).catch(() => []);
            console.log(`   IPv6 addresses: ${ipv6.length > 0 ? ipv6.join(', ') : 'None'}`);

            const allAddresses = [...ipv4, ...ipv6];
            
            if (allAddresses.length === 0) {
                console.log('   ❌ DNS Resolution: FAILED');
                return { success: false, error: 'No addresses resolved' };
            }

            console.log(`   ✅ DNS Resolution: SUCCESS (${allAddresses.length} addresses)`);
            return { 
                success: true, 
                addresses: allAddresses,
                ipv4: ipv4,
                ipv6: ipv6
            };
        } catch (error) {
            console.log(`   ❌ DNS Resolution: ERROR - ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Test direct TCP connection to IP
     */
    async testDirectTCP(ip, port) {
        return new Promise((resolve) => {
            console.log(`   Testing TCP to ${ip}:${port}...`);
            
            const socket = new net.Socket();
            let resolved = false;
            const startTime = Date.now();

            const timeout = setTimeout(() => {
                if (!resolved) {
                    socket.destroy();
                    const elapsed = Date.now() - startTime;
                    console.log(`   ❌ TCP ${ip}:${port}: TIMEOUT (${elapsed}ms)`);
                    resolved = true;
                    resolve({ 
                        success: false, 
                        error: 'Connection timeout',
                        timeout: true,
                        elapsed: elapsed
                    });
                }
            }, this.timeoutMs);

            socket.connect(port, ip, () => {
                if (!resolved) {
                    clearTimeout(timeout);
                    const elapsed = Date.now() - startTime;
                    console.log(`   ✅ TCP ${ip}:${port}: SUCCESS (${elapsed}ms)`);
                    socket.destroy();
                    resolved = true;
                    resolve({ 
                        success: true, 
                        elapsed: elapsed,
                        ip: ip,
                        port: port
                    });
                }
            });

            socket.on('error', (error) => {
                if (!resolved) {
                    clearTimeout(timeout);
                    const elapsed = Date.now() - startTime;
                    console.log(`   ❌ TCP ${ip}:${port}: ERROR - ${error.code} (${elapsed}ms)`);
                    resolved = true;
                    resolve({ 
                        success: false, 
                        error: error.message,
                        code: error.code,
                        elapsed: elapsed
                    });
                }
            });
        });
    }

    /**
     * Analyze TCP connection behavior
     */
    async analyzeTCPConnection(host, port) {
        console.log(`   Analyzing TCP behavior for ${host}:${port}...`);
        
        const attempts = [];
        const numAttempts = 3;

        for (let i = 0; i < numAttempts; i++) {
            const result = await this.testConnectionAttempt(host, port, i + 1);
            attempts.push(result);
            
            if (i < numAttempts - 1) {
                await this.sleep(1000);
            }
        }

        // Analyze patterns
        const timeouts = attempts.filter(a => a.timeout).length;
        const refusals = attempts.filter(a => a.code === 'ECONNREFUSED').length;
        const resets = attempts.filter(a => a.code === 'ECONNRESET').length;

        console.log(`   Analysis:`);
        console.log(`     Timeouts: ${timeouts}/${numAttempts}`);
        console.log(`     Connection Refused: ${refusals}/${numAttempts}`);
        console.log(`     Connection Reset: ${resets}/${numAttempts}`);

        let diagnosis = 'Unknown';
        if (timeouts === numAttempts) {
            diagnosis = 'ISP/Firewall BLOCK - All attempts timed out';
        } else if (refusals > 0) {
            diagnosis = 'Server actively rejecting connections';
        } else if (resets > 0) {
            diagnosis = 'Connection reset - Possible middlebox interference';
        }

        console.log(`     Diagnosis: ${diagnosis}`);

        return {
            success: false,
            attempts: attempts,
            diagnosis: diagnosis,
            pattern: this.identifyPattern(attempts)
        };
    }

    /**
     * Single connection attempt
     */
    async testConnectionAttempt(host, port, attemptNum) {
        return new Promise((resolve) => {
            const socket = new net.Socket();
            let resolved = false;
            const startTime = Date.now();

            const timeout = setTimeout(() => {
                if (!resolved) {
                    socket.destroy();
                    resolved = true;
                    resolve({ 
                        timeout: true,
                        elapsed: Date.now() - startTime
                    });
                }
            }, 5000);

            socket.connect(port, host, () => {
                if (!resolved) {
                    clearTimeout(timeout);
                    socket.destroy();
                    resolved = true;
                    resolve({ 
                        success: true,
                        elapsed: Date.now() - startTime
                    });
                }
            });

            socket.on('error', (error) => {
                if (!resolved) {
                    clearTimeout(timeout);
                    resolved = true;
                    resolve({ 
                        error: error.message,
                        code: error.code,
                        elapsed: Date.now() - startTime
                    });
                }
            });
        });
    }

    /**
     * Scan for local proxy ports
     */
    async scanProxyPorts() {
        const commonProxyPorts = [
            7890,  // Clash
            8080,  // Common HTTP proxy
            1080,  // SOCKS
            3128,  // Squid
            8888,  // Alternative
            8118,  // Privoxy
        ];

        console.log('   Scanning for local proxy servers...');
        const found = [];

        for (const port of commonProxyPorts) {
            const result = await this.testLocalPort('127.0.0.1', port);
            if (result.success) {
                found.push(port);
                console.log(`     ✅ Port ${port}: OPEN (possible proxy)`);
            } else {
                console.log(`     ❌ Port ${port}: ${result.error}`);
            }
        }

        if (found.length === 0) {
            console.log('   No local proxy servers detected');
        } else {
            console.log(`   Found ${found.length} potential proxy ports: ${found.join(', ')}`);
        }

        return { success: found.length > 0, ports: found };
    }

    /**
     * Test local port
     */
    async testLocalPort(host, port) {
        return new Promise((resolve) => {
            const socket = new net.Socket();
            let resolved = false;

            const timeout = setTimeout(() => {
                if (!resolved) {
                    socket.destroy();
                    resolved = true;
                    resolve({ success: false, error: 'Timeout' });
                }
            }, 2000);

            socket.connect(port, host, () => {
                if (!resolved) {
                    clearTimeout(timeout);
                    socket.destroy();
                    resolved = true;
                    resolve({ success: true });
                }
            });

            socket.on('error', (error) => {
                if (!resolved) {
                    clearTimeout(timeout);
                    resolved = true;
                    resolve({ success: false, error: error.code });
                }
            });
        });
    }

    /**
     * Identify connection pattern
     */
    identifyPattern(attempts) {
        const codes = attempts.map(a => a.code).filter(Boolean);
        const uniqueCodes = [...new Set(codes)];
        
        if (uniqueCodes.length === 1) {
            return `Consistent: ${uniqueCodes[0]}`;
        } else if (uniqueCodes.length > 1) {
            return `Mixed: ${uniqueCodes.join(', ')}`;
        }
        
        return 'No pattern identified';
    }

    /**
     * Compile final report
     */
    compileReport() {
        console.log('\n');
        console.log('╔══════════════════════════════════════════════════════════════╗');
        console.log('║          TCP DIAGNOSTIC REPORT                               ║');
        console.log('╚══════════════════════════════════════════════════════════════╝');
        console.log('\n');

        const dnsResult = this.results.find(r => r.test === 'DNS');
        const tcpResults = this.results.filter(r => r.test.startsWith('TCP-'));
        const analysis = this.results.find(r => r.test === 'TCP-Analysis');
        const proxyScan = this.results.find(r => r.test === 'Proxy-Scan');

        // Overall assessment
        let canConnect = false;
        let recommendation = '';

        if (dnsResult && !dnsResult.result.success) {
            recommendation = 'DNS resolution failed. Check DNS settings or use IP directly.';
        } else if (analysis && analysis.result.diagnosis.includes('BLOCK')) {
            recommendation = 'Network is actively blocking connections. VPN or advanced proxy required.';
        } else if (proxyScan && proxyScan.result.success) {
            recommendation = `Local proxy detected on port(s) ${proxyScan.result.ports.join(', ')}. Configure proxy settings.`;
            canConnect = true;
        } else {
            recommendation = 'Network connectivity issue. Try VPN or contact network administrator.';
        }

        console.log(`🎯 OVERALL ASSESSMENT`);
        console.log(`   Can Connect: ${canConnect ? 'YES' : 'NO'}`);
        console.log(`   Recommendation: ${recommendation}`);
        console.log('\n');

        return {
            canConnect,
            recommendation,
            results: this.results
        };
    }

    /**
     * Sleep utility
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Quick TCP test
     */
    async quickTest() {
        console.log('\n⚡ Quick TCP Test\n');
        
        const result = await this.testDirectTCP('iqoption.com', 443);
        
        if (result.success) {
            console.log('✅ TCP Connection: OK');
            return { ready: true };
        } else {
            console.log(`❌ TCP Connection: ${result.error}`);
            return { 
                ready: false, 
                reason: result.error,
                code: result.code 
            };
        }
    }
}

module.exports = TCPDebugger;

// Run if called directly
if (require.main === module) {
    const tcpDebugger = new TCPDebugger();
    tcpDebugger.runDiagnostics().then(report => {
        process.exit(report.canConnect ? 0 : 1);
    }).catch(error => {
        console.error('💥 Diagnostic error:', error);
        process.exit(1);
    });
}
