const WebSocket = require('ws');
const axios = require('axios');

// Ultra minimal test - just connect, login, and see what happens
async function ultraMinimalTest() {
    console.log('🔥 ULTRA MINIMAL TEST');
    console.log('='.repeat(80));
    
    try {
        // 1. HTTP Login
        console.log('\n1️⃣ HTTP Login...');
        const loginRes = await axios.post(
            'https://auth.iqoption.com/api/v2/login',
            {
                identifier: process.env.IQ_OPTION_EMAIL,
                password: process.env.IQ_OPTION_PASSWORD
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                timeout: 30000
            }
        );
        
        console.log('✅ HTTP Login success');
        console.log('   Code:', loginRes.data.code);
        console.log('   User ID:', loginRes.data.user_id);
        
        const ssid = loginRes.data.ssid;
        
        // 2. WebSocket Connect
        console.log('\n2️⃣ WebSocket Connect...');
        const ws = new WebSocket('wss://iqoption.com/echo/websocket', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Cookie': `ssid=${ssid}`
            }
        });
        
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('WS timeout')), 15000);
            
            ws.on('open', () => {
                clearTimeout(timeout);
                console.log('✅ WebSocket connected');
                resolve();
            });
            
            ws.on('error', (err) => {
                clearTimeout(timeout);
                reject(err);
            });
        });
        
        // 3. Listen for ALL messages
        console.log('\n3️⃣ Listening for messages...');
        const messages = [];
        
        ws.on('message', (data) => {
            const msg = data.toString();
            console.log('📥 RAW:', msg.slice(0, 200));
            messages.push(msg);
        });
        
        // 4. Send SSID (simple format)
        console.log('\n4️⃣ Sending SSID (simple string)...');
        ws.send(ssid);
        
        // 5. Wait for profile
        console.log('⏳ Waiting 10s for profile...');
        await new Promise(r => setTimeout(r, 10000));
        
        // 6. Check results
        console.log('\n6️⃣ Results:');
        console.log('   Total messages received:', messages.length);
        
        const profileMsg = messages.find(m => m.includes('profile'));
        const errorMsg = messages.find(m => m.includes('error') || m.includes('false'));
        
        if (profileMsg) {
            console.log('✅ PROFILE received!');
            console.log('   Data:', profileMsg.slice(0, 300));
        } else if (errorMsg) {
            console.log('❌ ERROR received');
            console.log('   Data:', errorMsg.slice(0, 300));
        } else {
            console.log('⚠️ No profile or error - silent reject');
            console.log('   All messages:', messages.map(m => m.slice(0, 100)));
        }
        
        ws.close();
        console.log('\n✅ Test complete');
        
    } catch (error) {
        console.error('\n❌ TEST FAILED:', error.message);
        console.error(error.stack);
    }
}

ultraMinimalTest();
