/**
 * IQ Option Connection Test Script
 * Tests WebSocket connectivity without full bot initialization
 * 
 * Usage: node test_connection.js
 */

require('dotenv').config();
const IQOptionClient = require('./src/api/iqOptionClient.js');

async function main() {
    console.log('\n');
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║          IQ OPTION WEBSOCKET CONNECTION TEST                 ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log('\n');

    const client = new IQOptionClient();

    // Test 1: Basic connection test
    console.log('📋 TEST 1: Basic Connection Test');
    console.log('─────────────────────────────────');
    const testResult = await client.testConnection();

    if (!testResult.success) {
        console.log('\n❌ CONNECTION FAILED');
        console.log('\n🔍 Possible solutions:');
        console.log('   1. Check your internet connection');
        console.log('   2. Try using a VPN or proxy:');
        console.log('      set HTTPS_PROXY=http://proxy:port');
        console.log('   3. Disable firewall temporarily for testing');
        console.log('   4. Contact your ISP about WebSocket blocking');
        console.log('\n');
        process.exit(1);
    }

    console.log('✅ TEST 1: PASSED - WebSocket connected\n');

    // Test 2: Login test (if credentials available)
    const email = process.env.IQ_OPTION_EMAIL;
    const password = process.env.IQ_OPTION_PASSWORD;

    if (email && password) {
        console.log('📋 TEST 2: Login Test');
        console.log('───────────────────────');
        console.log('🔑 Attempting login with credentials...');

        try {
            const ssid = await client.login(email, password);
            console.log('✅ TEST 2: PASSED - Login successful');
            console.log(`   SSID: ${ssid.substring(0, 20)}...\n`);

            // Test 3: Subscribe to candles
            console.log('📋 TEST 3: Market Data Subscription');
            console.log('─────────────────────────────────────');
            client.subscribeCandles('EURUSD-OTC', 60);
            
            // Wait for candle data
            console.log('⏳ Waiting for candle data (5 seconds)...');
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            const candles = client.getCandles('EURUSD-OTC', 60);
            if (candles.length > 0) {
                console.log(`✅ TEST 3: PASSED - Received ${candles.length} candles`);
                console.log(`   Last price: ${candles[candles.length - 1].close}\n`);
            } else {
                console.log('⚠️ TEST 3: WARNING - No candles received yet\n');
            }

        } catch (error) {
            console.error('❌ TEST 2: FAILED - Login error:', error.message);
            console.log('\n🔍 Possible causes:');
            console.log('   1. Invalid email/password in .env');
            console.log('   2. Account requires 2FA');
            console.log('   3. Account locked or suspended');
            console.log('\n');
        }
    } else {
        console.log('⚠️ TEST 2: SKIPPED - No credentials in .env');
        console.log('   Add IQ_OPTION_EMAIL and IQ_OPTION_PASSWORD to .env\n');
    }

    // Cleanup
    console.log('🧹 Cleaning up...');
    client.disconnect();
    
    console.log('\n✅ All tests completed!\n');
    process.exit(0);
}

main().catch(error => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
});
