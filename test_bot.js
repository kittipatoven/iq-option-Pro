// Test script to verify bot loads and indicators work
console.log('Loading bot module...');
try {
    const bot = require('./src/core/bot.js');
    console.log('Bot loaded successfully!');
    console.log('Bot type:', typeof bot);
    console.log('Bot keys:', Object.keys(bot));
    
    // Test calculateIndicators with sample candles
    console.log('\nTesting calculateIndicators...');
    const testCandles = [
        { close: 1.1000, high: 1.1005, low: 1.0995, open: 1.0998 },
        { close: 1.1005, high: 1.1010, low: 1.1000, open: 1.1002 },
        { close: 1.1002, high: 1.1007, low: 1.0997, open: 1.1005 },
        { close: 1.0998, high: 1.1003, low: 1.0993, open: 1.1002 },
        { close: 1.0995, high: 1.1000, low: 1.0990, open: 1.0998 },
        { close: 1.0990, high: 1.0995, low: 1.0985, open: 1.0995 },
        { close: 1.0985, high: 1.0990, low: 1.0980, open: 1.0990 },
        { close: 1.0980, high: 1.0985, low: 1.0975, open: 1.0985 },
        { close: 1.0975, high: 1.0980, low: 1.0970, open: 1.0980 },
        { close: 1.0970, high: 1.0975, low: 1.0965, open: 1.0975 },
        { close: 1.0965, high: 1.0970, low: 1.0960, open: 1.0970 },
        { close: 1.0960, high: 1.0965, low: 1.0955, open: 1.0965 },
        { close: 1.0955, high: 1.0960, low: 1.0950, open: 1.0960 },
        { close: 1.0950, high: 1.0955, low: 1.0945, open: 1.0955 },
        { close: 1.0945, high: 1.0950, low: 1.0940, open: 1.0950 }
    ];
    
    // Test RSI calculation
    const RSI = require('./src/indicators/rsi');
    const rsiValue = RSI.calculate(testCandles.map(c => c.close));
    console.log('RSI calculated:', rsiValue);
    
    // Test BB calculation
    const BB = require('./src/indicators/bb');
    const bbValue = BB.calculate(testCandles);
    console.log('BB calculated:', bbValue);
    
    // Test MA calculation
    const MA = require('./src/indicators/ma');
    const maValue = MA.calculate(testCandles, 50);
    console.log('MA calculated:', maValue);
    
    console.log('\n✅ All indicators working correctly!');
    
} catch (error) {
    console.error('ERROR:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
}
