/**
 * Debug WebSocket Messages - ตรวจสอบ raw messages จาก IQ Option
 */
const iqoptionAPI = require('./src/api/unifiediqoption');

async function debugWebSocket() {
    console.log('🔍 DEBUG: WebSocket Raw Messages\n');
    
    // Override event listeners to capture all messages
    const originalSetup = iqoptionAPI.setupEventListeners.bind(iqoptionAPI);
    
    iqoptionAPI.setupEventListeners = function() {
        originalSetup();
        
        if (!this.api) return;
        
        // Add raw message listener
        this.api.on('message', (msg) => {
            try {
                const data = typeof msg === 'string' ? JSON.parse(msg) : msg;
                console.log('\n📨 RAW MESSAGE:', JSON.stringify(data, null, 2));
                
                // Check if it's candle data
                if (data.name && (data.name.includes('candle') || data.name.includes('chart'))) {
                    console.log('✅ CANDLE DATA DETECTED!');
                }
            } catch (e) {
                console.log('\n📨 RAW (not JSON):', msg.toString());
            }
        });
        
        // Listen for all events
        this.api.on('*', (event, data) => {
            console.log('\n📡 EVENT:', event, JSON.stringify(data, null, 2));
        });
    };
    
    // Connect
    try {
        iqoptionAPI.setCredentials(
            process.env.IQ_OPTION_EMAIL,
            process.env.IQ_OPTION_PASSWORD,
            process.env.ACCOUNT_TYPE || 'PRACTICE'
        );
        
        await iqoptionAPI.connect();
        console.log('\n✅ Connected! Testing candles...\n');
        
        // Test getCandles with debug
        setTimeout(async () => {
            try {
                console.log('📊 Sending candles request...');
                const candles = await iqoptionAPI.getCandles('EURUSD-OTC', 60, 10);
                console.log('\n✅ Got candles:', candles.length);
            } catch (error) {
                console.error('\n❌ Candles error:', error.message);
            }
        }, 3000);
        
    } catch (error) {
        console.error('❌ Connection failed:', error.message);
    }
}

debugWebSocket();
