console.log('Starting test...');
try {
    const bot = require('./src/core/bot.js');
    console.log('Bot loaded:', Object.keys(bot));
} catch (e) {
    console.error('Error:', e.message);
    console.error('Stack:', e.stack);
}
console.log('Test complete');
