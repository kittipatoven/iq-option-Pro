/**
 * Test Real-time Price Stream
 * ทดสอบการดึงราคา real-time จาก IQ Option
 */
const iqoptionAPI = require('./src/api/unifiediqoption');

async function testPriceStream() {
    console.log('🔍 TEST: Real-time Price Stream\n');
    
    try {
        // Set credentials
        iqoptionAPI.setCredentials(
            process.env.IQ_OPTION_EMAIL,
            process.env.IQ_OPTION_PASSWORD,
            process.env.ACCOUNT_TYPE || 'PRACTICE'
        );
        
        // Connect
        console.log('🔌 Connecting to IQ Option...');
        const connected = await iqoptionAPI.connect();
        
        if (!connected) {
            console.log('❌ Connection failed');
            process.exit(1);
        }
        
        console.log('✅ Connected!\n');
        
        // Subscribe to price stream
        const pair = 'EURUSD-OTC';
        console.log(`📡 Subscribing to ${pair} price stream...`);
        await iqoptionAPI.subscribePrice(pair);
        
        // Listen for price updates
        let updateCount = 0;
        iqoptionAPI.on('priceUpdate', ({ pair: p, price, timestamp }) => {
            updateCount++;
            console.log(`📈 Price Update #${updateCount}: ${p} = ${price} (${new Date(timestamp).toLocaleTimeString()})`);
        });
        
        // Wait and collect price updates
        console.log('\n⏳ Waiting for price updates (5 seconds)...\n');
        
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Get current price
        const currentPrice = iqoptionAPI.getCurrentPrice(pair);
        console.log(`\n💵 Current Price: ${currentPrice || 'N/A'}`);
        
        // Get all prices
        const allPrices = iqoptionAPI.getAllCurrentPrices();
        console.log(`\n📊 All Prices:`, allPrices);
        
        // Test getCandles
        console.log('\n📊 Testing getCandles...');
        const candles = await iqoptionAPI.getCandles(pair, 60, 10);
        console.log(`✅ Got ${candles.length} candles`);
        
        // Disconnect
        iqoptionAPI.disconnect();
        console.log('\n✅ Test completed successfully!');
        console.log(`📈 Total price updates received: ${updateCount}`);
        
    } catch (error) {
        console.error('\n❌ ERROR:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

testPriceStream();
