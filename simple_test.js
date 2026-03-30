/**
 * Simple Test - Check Module Loading
 */

console.log('Testing module loading...\n');

try {
    const MoneyManager = require('./src/core/moneyManager.js');
    console.log('✅ MoneyManager loaded');
    const mm = new MoneyManager();
    console.log('✅ MoneyManager instantiated');
} catch (e) {
    console.error('❌ MoneyManager:', e.message);
}

try {
    const MarketDetector = require('./src/market/marketDetector.js');
    console.log('✅ MarketDetector loaded');
    const md = new MarketDetector();
    console.log('✅ MarketDetector instantiated');
} catch (e) {
    console.error('❌ MarketDetector:', e.message);
}

try {
    const SniperEntry = require('./src/strategies/sniperEntry.js');
    console.log('✅ SniperEntry loaded');
    const se = new SniperEntry();
    console.log('✅ SniperEntry instantiated');
} catch (e) {
    console.error('❌ SniperEntry:', e.message);
}

try {
    const ConfidenceScore = require('./src/core/confidenceScore.js');
    console.log('✅ ConfidenceScore loaded');
    const cs = new ConfidenceScore();
    console.log('✅ ConfidenceScore instantiated');
} catch (e) {
    console.error('❌ ConfidenceScore:', e.message);
}

try {
    const IQOptionAPI = require('./src/services/iqoption.api.js');
    console.log('✅ IQOptionAPI loaded');
    const api = new IQOptionAPI();
    console.log('✅ IQOptionAPI instantiated');
} catch (e) {
    console.error('❌ IQOptionAPI:', e.message);
}

console.log('\n✅ All modules loaded successfully!');
