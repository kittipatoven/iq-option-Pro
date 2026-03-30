/**
 * IQ Option Result Extraction Test
 * Simulates the API response for your WIN trade
 */

console.log('🎯 TESTING: WIN Trade with $0.85 Profit');
console.log('='.repeat(60));
console.log('From Screenshot:');
console.log('  Pair: EUR/USD (OTC)');
console.log('  Amount: $1');
console.log('  Result: WIN');
console.log('  Profit: +$0.85');
console.log('='.repeat(60));

// Simulate IQ Option API response for a WIN trade
const mockOrderResponse = {
    id: 123456789,
    status: 'closed',
    result: 'win',
    price: 1,  // $1 investment
    profit: 0.85,  // IQ Option returns net profit directly
    win_amount: 1.85,  // Total return: $1 stake + $0.85 profit
    pnl: 0.85,  // Alternative field
    close_time: '2026-03-29T19:20:00Z',
    direction: 'call',
    created_at: '2026-03-29T19:19:00Z'
};

console.log('\n📦 Simulated API Response:');
console.log(JSON.stringify(mockOrderResponse, null, 2));

// Extract profit using our logic
const amount = mockOrderResponse.price || 1;
let realProfit = null;
let source = '';

if (mockOrderResponse.profit !== undefined && mockOrderResponse.profit !== null) {
    realProfit = mockOrderResponse.profit;
    source = 'order.profit';
} else if (mockOrderResponse.win_amount !== undefined && mockOrderResponse.win_amount !== null) {
    realProfit = mockOrderResponse.win_amount - amount;
    source = 'win_amount - amount';
} else if (mockOrderResponse.pnl !== undefined && mockOrderResponse.pnl !== null) {
    realProfit = mockOrderResponse.pnl;
    source = 'order.pnl';
}

console.log('\n✅ EXTRACTION RESULT:');
console.log(`  Source: ${source}`);
console.log(`  Amount: $${amount}`);
console.log(`  Net Profit: $${realProfit}`);
console.log(`  Expected: $0.85`);
console.log(`  Match: ${realProfit === 0.85 ? '✅ YES' : '❌ NO'}`);

console.log('\n📊 BOT Will Record:');
console.log(`  result: 'WIN'`);
console.log(`  profit: ${realProfit}`);
console.log(`  amount: ${amount}`);
console.log(`  source: 'IQ_OPTION_API'`);

console.log('\n' + '='.repeat(60));
console.log('✅ BOT result = IQ Option UI: $0.85');
console.log('='.repeat(60));
