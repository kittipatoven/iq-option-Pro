const IQOptionClient = require('./src/api/iqOptionClient');
const dotenv = require('dotenv');
dotenv.config();

async function minimalTest() {
    console.log('🔥 MINIMAL TEST: Binary Options Open');
    console.log('='.repeat(80));
    
    const client = new IQOptionClient();
    
    try {
        // Connect
        console.log('1️⃣ Connecting...');
        await client.connect();
        console.log('✅ Connected');
        
        // Login
        console.log('2️⃣ Logging in...');
        const email = process.env.IQ_OPTION_EMAIL;
        const password = process.env.IQ_OPTION_PASSWORD;
        await client.login(email, password);
        console.log('✅ Logged in');
        
        // Wait a bit
        await new Promise(r => setTimeout(r, 3000));
        
        // Check balance
        console.log('3️⃣ Balance ID:', client.balanceId);
        console.log('3️⃣ Account Mode:', client.accountMode);
        
        if (!client.balanceId) {
            console.error('❌ No balance ID - cannot trade');
            return;
        }
        
        // Try to place minimal order
        console.log('4️⃣ Placing minimal order...');
        
        const order = {
            name: 'buy',
            version: '1.0',
            body: {
                price: 1.0,
                act: 76,
                exp: Math.floor(Date.now() / 1000) + 120,
                type: 'call',
                payout: 85,
                time: Math.floor(Date.now() / 1000)
            }
        };
        
        console.log('📤 ORDER:', JSON.stringify(order, null, 2));
        
        // Send and wait
        try {
            const response = await client.sendMessageAndWait('buy', order, 30000);
            console.log('✅ RESPONSE:', JSON.stringify(response, null, 2));
        } catch (error) {
            console.error('❌ TIMEOUT or ERROR:', error.message);
        }
        
    } catch (error) {
        console.error('❌ TEST FAILED:', error.message);
        console.error(error.stack);
    } finally {
        client.disconnect();
        console.log('\n✅ Test complete');
    }
}

minimalTest();
