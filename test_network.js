const https = require('https');
const WebSocket = require('ws');
const { HttpsProxyAgent } = require('https-proxy-agent');

// Network diagnostics
async function networkDiagnostics() {
    console.log('🔥 NETWORK DIAGNOSTICS');
    console.log('='.repeat(80));
    
    const results = {
        https: false,
        websocket: false,
        proxy: null,
        errors: []
    };
    
    // Test 1: HTTPS connectivity
    console.log('\n1️⃣ Testing HTTPS connectivity to iqoption.com...');
    try {
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('HTTPS timeout')), 10000);
            
            https.get('https://iqoption.com', { timeout: 10000 }, (res) => {
                clearTimeout(timeout);
                console.log('   ✅ HTTPS Status:', res.statusCode);
                results.https = true;
                resolve();
            }).on('error', (err) => {
                clearTimeout(timeout);
                console.error('   ❌ HTTPS Error:', err.message);
                results.errors.push(`HTTPS: ${err.message}`);
                reject(err);
            });
        });
    } catch (e) {
        // Continue to proxy test
    }
    
    // Test 2: WebSocket connectivity
    console.log('\n2️⃣ Testing WebSocket connectivity...');
    try {
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('WS timeout')), 10000);
            
            const ws = new WebSocket('wss://iqoption.com/echo/websocket', {
                handshakeTimeout: 10000
            });
            
            ws.on('open', () => {
                clearTimeout(timeout);
                console.log('   ✅ WebSocket connected');
                results.websocket = true;
                ws.close();
                resolve();
            });
            
            ws.on('error', (err) => {
                clearTimeout(timeout);
                console.error('   ❌ WebSocket Error:', err.message);
                results.errors.push(`WebSocket: ${err.message}`);
                ws.terminate();
                reject(err);
            });
        });
    } catch (e) {
        // Continue to proxy test
    }
    
    // Test 3: Proxy connection (if configured)
    const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
    if (proxyUrl) {
        console.log('\n3️⃣ Testing with Proxy:', proxyUrl);
        try {
            const proxyAgent = new HttpsProxyAgent(proxyUrl);
            
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Proxy timeout')), 15000);
                
                https.get('https://iqoption.com', { agent: proxyAgent, timeout: 15000 }, (res) => {
                    clearTimeout(timeout);
                    console.log('   ✅ Proxy HTTPS Status:', res.statusCode);
                    results.proxy = proxyUrl;
                    results.https = true;
                    resolve();
                }).on('error', (err) => {
                    clearTimeout(timeout);
                    console.error('   ❌ Proxy Error:', err.message);
                    results.errors.push(`Proxy: ${err.message}`);
                    reject(err);
                });
            });
            
            // Test WebSocket with proxy
            console.log('\n4️⃣ Testing WebSocket with Proxy...');
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Proxy WS timeout')), 15000);
                
                const ws = new WebSocket('wss://iqoption.com/echo/websocket', {
                    agent: proxyAgent,
                    handshakeTimeout: 15000
                });
                
                ws.on('open', () => {
                    clearTimeout(timeout);
                    console.log('   ✅ Proxy WebSocket connected');
                    results.websocket = true;
                    results.proxy = proxyUrl;
                    ws.close();
                    resolve();
                });
                
                ws.on('error', (err) => {
                    clearTimeout(timeout);
                    console.error('   ❌ Proxy WebSocket Error:', err.message);
                    results.errors.push(`Proxy WS: ${err.message}`);
                    ws.terminate();
                    reject(err);
                });
            });
            
        } catch (e) {
            console.error('   ❌ Proxy test failed');
        }
    } else {
        console.log('\n3️⃣ No proxy configured (set HTTPS_PROXY in .env)');
    }
    
    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('📊 DIAGNOSTICS SUMMARY');
    console.log('='.repeat(80));
    console.log('HTTPS Connection:', results.https ? '✅ WORKING' : '❌ BLOCKED');
    console.log('WebSocket Connection:', results.websocket ? '✅ WORKING' : '❌ BLOCKED');
    console.log('Proxy Used:', results.proxy || '❌ NONE');
    
    if (results.errors.length > 0) {
        console.log('\n❌ ERRORS:');
        results.errors.forEach(err => console.log('   -', err));
    }
    
    if (!results.https && !results.proxy) {
        console.log('\n🔧 RECOMMENDATION:');
        console.log('   Your IP appears to be blocked by IQ Option.');
        console.log('   Solutions:');
        console.log('   1. Set HTTPS_PROXY in .env file');
        console.log('   2. Use VPN');
        console.log('   3. Wait 1 hour and retry');
        console.log('   4. Deploy to VPS with different IP');
    }
    
    return results;
}

// Export for use in other modules
module.exports = networkDiagnostics;

// Run if called directly
if (require.main === module) {
    networkDiagnostics().then(() => {
        process.exit(0);
    }).catch(() => {
        process.exit(1);
    });
}
