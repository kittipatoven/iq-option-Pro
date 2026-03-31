/**
 * Test Candles - ทดสอบการดึง candles จาก IQ Option
 */
const iqoptionAPI = require('./src/api/unifiediqoption');

async function testCandles() {
    console.log('🔍 TEST: getCandles()\n');
    
    try {
        // Set credentials
        iqoptionAPI.setCredentials(
            process.env.IQ_OPTION_EMAIL,
            process.env.IQ_OPTION_PASSWORD,
            process.env.ACCOUNT_TYPE || 'PRACTICE'
        );
        
        // Connect
        console.log('🔌 Connecting...');
        const connected = await iqoptionAPI.connect();
        
        if (!connected) {
            console.log('❌ Connection failed');
            process.exit(1);
        }
        
        console.log('✅ Connected!\n');
        
        // Test getCandles
        console.log('📊 Testing getCandles...');
        const candles = await iqoptionAPI.getCandles('EURUSD-OTC', 60, 10);
        
        console.log('\n✅ SUCCESS!');
        console.log(`Got ${candles.length} candles`);
        console.log('\nFirst 3 candles:');
        candles.slice(0, 3).forEach((c, i) => {
            console.log(`  ${i + 1}. ${new Date(c.timestamp * 1000).toISOString()} O:${c.open} H:${c.high} L:${c.low} C:${c.close}`);
        });
        
        // Disconnect
        iqoptionAPI.disconnect();
        console.log('\n✅ Test completed successfully!');
        
    } catch (error) {
        console.error('\n❌ ERROR:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

testCandles();
