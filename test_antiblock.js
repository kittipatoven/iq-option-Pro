/**
 * Anti-Block System Test
 * ทดสอบระบบป้องกันการถูก Block พร้อม Proxy Rotation
 */

const IQOptionClient = require('./src/api/iqOptionClient');
const ProxyManager = require('./src/network/proxyManager');
const dotenv = require('dotenv');
dotenv.config();

async function testAntiBlockSystem() {
    console.log('🔥 ANTI-BLOCK SYSTEM TEST');
    console.log('='.repeat(80));
    
    const client = new IQOptionClient();
    
    // Test 1: Proxy Manager
    console.log('\n1️⃣ Testing Proxy Manager...');
    console.log('   Proxy Stats:', client.proxyManager.getStats());
    
    // Test 2: Health Check
    console.log('\n2️⃣ Testing Proxy Health Check...');
    const proxy = client.proxyManager.getCurrentProxy();
    if (proxy) {
        console.log(`   Testing proxy: ${proxy}`);
        const agent = client.proxyManager.createProxyAgent();
        const health = await client.testProxyConnection(agent);
        console.log(`   Health check: ${health ? '✅ PASS' : '❌ FAIL'}`);
    } else {
        console.log('   No proxy configured, testing direct connection...');
    }
    
    // Test 3: Connection with Auto Recovery
    console.log('\n3️⃣ Testing Connection with Anti-Block...');
    try {
        await client.connectWithAntiBlock();
        console.log('   ✅ Connection successful');
        client.printAntiBlockStatus();
    } catch (error) {
        console.error('   ❌ Connection failed:', error.message);
        client.printAntiBlockStatus();
        
        // Test 4: Auto Recovery
        console.log('\n4️⃣ Testing Auto Recovery...');
        const recovery = await client.autoRecover();
        console.log(`   Recovery result: ${recovery.success ? '✅ SUCCESS' : '❌ FAILED'}`);
        if (recovery.attempts) {
            console.log(`   Attempts: ${recovery.attempts}`);
        }
    }
    
    // Test 5: Status Report
    console.log('\n5️⃣ Final Status Report...');
    client.printAntiBlockStatus();
    
    console.log('\n' + '='.repeat(80));
    console.log('✅ Anti-Block System Test Complete');
    
    client.disconnect();
}

// Extend IQOptionClient with anti-block connect method
IQOptionClient.prototype.connectWithAntiBlock = async function() {
    console.log('🔥 [ANTI-BLOCK] Starting connection with protection...');
    
    const maxAttempts = 5;
    let attempt = 0;
    
    while (attempt < maxAttempts) {
        attempt++;
        console.log(`\n   Attempt ${attempt}/${maxAttempts}`);
        
        try {
            // Try to find working proxy first
            const workingProxy = await this.proxyManager.findWorkingProxy();
            
            if (workingProxy) {
                console.log(`   Using working proxy: ${workingProxy}`);
            }
            
            // Connect
            await this.connect();
            
            // Success!
            this.connectionState = 'CONNECTED';
            this.proxyManager.markProxySuccess();
            return true;
            
        } catch (error) {
            console.error(`   ❌ Attempt ${attempt} failed: ${error.message}`);
            
            // Handle error and switch proxy
            const switchResult = await this.handleConnectionError(error, 'anti-block');
            
            if (!switchResult.switched && attempt === maxAttempts) {
                throw new Error('All attempts failed, no working proxy found');
            }
            
            // Wait before retry
            await this.applyRateLimit();
        }
    }
    
    return false;
};

// Run test
if (require.main === module) {
    testAntiBlockSystem().catch(console.error);
}

module.exports = testAntiBlockSystem;
