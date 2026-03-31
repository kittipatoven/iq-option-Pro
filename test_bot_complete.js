/**
 * COMPREHENSIVE BOT TEST
 * Tests all critical components before running the bot
 */

require('dotenv').config();

const config = require('./src/config/config');
const logger = require('./src/utils/logger');

console.log('========================================');
console.log('   IQ OPTION BOT - COMPREHENSIVE TEST   ');
console.log('========================================\n');

// Test Results
const results = {
    config: false,
    env: false,
    api: false,
    connection: false,
    network: false
};

// Test 1: Environment Variables
console.log('[TEST 1] Environment Variables');
console.log('----------------------------------------');
try {
    const email = config.IQ_OPTION_EMAIL;
    const password = config.IQ_OPTION_PASSWORD;
    const accountType = config.ACCOUNT_TYPE;
    
    console.log('✓ Config loaded');
    console.log('  Email:', email ? '***' + email.slice(-10) : 'NOT SET');
    console.log('  Password:', password ? '***SET***' : 'NOT SET');
    console.log('  Account Type:', accountType);
    console.log('  Trading Pairs:', config.TRADING_PAIRS.join(', '));
    console.log('  Trade Amount:', config.TRADE_AMOUNT);
    
    if (email && password) {
        results.env = true;
        console.log('✅ PASS: Credentials configured\n');
    } else {
        console.log('❌ FAIL: Missing credentials\n');
        console.log('Please create .env file with:');
        console.log('  IQ_EMAIL=your_email@example.com');
        console.log('  IQ_PASSWORD=your_password');
        console.log('  ACCOUNT_TYPE=PRACTICE');
    }
} catch (error) {
    console.log('❌ FAIL:', error.message, '\n');
}

// Test 2: Configuration Module
console.log('[TEST 2] Configuration Module');
console.log('----------------------------------------');
try {
    const required = ['IQ_OPTION_EMAIL', 'IQ_OPTION_PASSWORD', 'ACCOUNT_TYPE', 'TRADING_PAIRS', 'TRADE_AMOUNT'];
    let allPresent = true;
    
    for (const key of required) {
        if (!config[key]) {
            console.log('❌ Missing:', key);
            allPresent = false;
        }
    }
    
    if (allPresent) {
        results.config = true;
        console.log('✅ PASS: All required config present\n');
    } else {
        console.log('❌ FAIL: Some config missing\n');
    }
} catch (error) {
    console.log('❌ FAIL:', error.message, '\n');
}

// Test 3: IQ Option API Module
console.log('[TEST 3] IQ Option API Module');
console.log('----------------------------------------');
try {
    const api = require('./src/api/unifiediqoption');
    
    console.log('✓ API module loaded');
    console.log('  Methods:', Object.getOwnPropertyNames(api.__proto__).filter(m => typeof api[m] === 'function').join(', '));
    
    results.api = true;
    console.log('✅ PASS: API module loaded\n');
} catch (error) {
    console.log('❌ FAIL:', error.message, '\n');
    console.log('Stack:', error.stack);
}

// Test 4: Network Connectivity
console.log('[TEST 4] Network Connectivity');
console.log('----------------------------------------');
const https = require('https');

function testConnection(host) {
    return new Promise((resolve) => {
        const req = https.request({
            hostname: host,
            port: 443,
            method: 'HEAD',
            timeout: 5000
        }, (res) => {
            resolve({ success: true, status: res.statusCode });
        });
        
        req.on('error', (err) => {
            resolve({ success: false, error: err.message });
        });
        
        req.on('timeout', () => {
            req.destroy();
            resolve({ success: false, error: 'Timeout' });
        });
        
        req.end();
    });
}

(async () => {
    try {
        const iqTest = await testConnection('iqoption.com');
        const authTest = await testConnection('auth.iqoption.com');
        
        if (iqTest.success) {
            console.log('✓ iqoption.com: HTTP', iqTest.status);
        } else {
            console.log('❌ iqoption.com:', iqTest.error);
        }
        
        if (authTest.success) {
            console.log('✓ auth.iqoption.com: HTTP', authTest.status);
        } else {
            console.log('❌ auth.iqoption.com:', authTest.error);
        }
        
        if (iqTest.success && authTest.success) {
            results.network = true;
            console.log('✅ PASS: Network connectivity OK\n');
        } else {
            console.log('⚠️  WARNING: Network issues detected\n');
        }
        
        // Test 5: API Connection (if credentials available)
        if (results.env && results.api) {
            console.log('[TEST 5] API Authentication Test');
            console.log('----------------------------------------');
            
            try {
                const api = require('./src/api/unifiediqoption');
                
                api.setCredentials(config.IQ_OPTION_EMAIL, config.IQ_OPTION_PASSWORD, config.ACCOUNT_TYPE);
                console.log('✓ Credentials set');
                
                console.log('\n🔄 Attempting connection...');
                const connected = await api.connect();
                
                if (connected) {
                    results.connection = true;
                    console.log('✅ PASS: Successfully connected to IQ Option API\n');
                    
                    // Get balance
                    const balance = await api.getBalance();
                    console.log('💰 Balance:', balance);
                    
                    // Disconnect
                    api.disconnect();
                    console.log('🔌 Disconnected\n');
                } else {
                    console.log('❌ FAIL: Connection returned false\n');
                }
            } catch (error) {
                console.log('❌ FAIL:', error.message, '\n');
                
                if (error.message.includes('credentials')) {
                    console.log('💡 Tip: Check your email and password in .env file');
                } else if (error.message.includes('network') || error.message.includes('timeout')) {
                    console.log('💡 Tip: Check your internet connection or try using a VPN');
                }
            }
        }
        
        // Summary
        console.log('========================================');
        console.log('              TEST SUMMARY              ');
        console.log('========================================');
        console.log('');
        
        const allPassed = Object.values(results).every(r => r === true);
        const passedCount = Object.values(results).filter(r => r === true).length;
        const totalCount = Object.keys(results).length;
        
        console.log('Results:');
        console.log('  Environment:', results.env ? '✅ PASS' : '❌ FAIL');
        console.log('  Configuration:', results.config ? '✅ PASS' : '❌ FAIL');
        console.log('  API Module:', results.api ? '✅ PASS' : '❌ FAIL');
        console.log('  Network:', results.network ? '✅ PASS' : '❌ FAIL');
        console.log('  Connection:', results.connection ? '✅ PASS' : '❌ FAIL');
        console.log('');
        console.log(`Total: ${passedCount}/${totalCount} tests passed`);
        console.log('');
        
        if (allPassed) {
            console.log('🎉 ALL TESTS PASSED! Bot is ready to run.');
            console.log('');
            console.log('Run the bot with:');
            console.log('  node app.js start');
            console.log('  or');
            console.log('  node main.js');
            process.exit(0);
        } else {
            console.log('⚠️  Some tests failed. Please fix the issues above.');
            process.exit(1);
        }
        
    } catch (error) {
        console.log('❌ Test suite error:', error.message);
        process.exit(1);
    }
})();
