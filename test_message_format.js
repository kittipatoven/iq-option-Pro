const IQOptionClient = require('./src/api/iqOptionClient');

// Test message format detection
const order = {
    name: 'binary-options.open-option',
    version: '1.0',
    body: {
        user_balance_id: 12345,
        active_id: 1,
        option_type_id: 3,
        direction: 'buy',
        expired: 1774843800,
        price: 1.0,
        refund_value: 0
    }
};

console.log('🔍 TEST: Message format check');
console.log('Order object:', JSON.stringify(order, null, 2));
console.log('Check:');
console.log('  - has name:', !!order.name);
console.log('  - has version:', !!order.version);
console.log('  - has body:', !!order.body);
console.log('  - name value:', order.name);
console.log('  - version value:', order.version);

// Test condition
const isRaw = order && order.name && order.version;
console.log('\nIs RAW format:', isRaw);

if (isRaw) {
    console.log('✅ Should use RAW format (no double wrapping)');
    const rawMessage = {
        ...order,
        request_id: 'test_123'
    };
    console.log('\nFinal message structure:');
    console.log(JSON.stringify(rawMessage, null, 2));
} else {
    console.log('❌ Will use STANDARD format (double wrapping)');
    const standardMessage = {
        name: 'binary-options.open-option',
        msg: order,
        request_id: 'test_123'
    };
    console.log('\nFinal message structure:');
    console.log(JSON.stringify(standardMessage, null, 2));
}
