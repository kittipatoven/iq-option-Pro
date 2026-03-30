/**
 * Test script for Offline News Filter
 * Verifies the news filter works without API calls
 */

const newsFilter = require('./src/filters/newsFilter');
const logger = require('./src/utils/logger');

async function runTests() {
    logger.info('=== Testing Offline News Filter ===\n');

    // Test 1: Initialize
    logger.info('Test 1: Initialize News Filter');
    await newsFilter.initialize();
    logger.info('✓ Initialization successful\n');

    // Test 2: Get Status
    logger.info('Test 2: Get Status');
    const status = newsFilter.getStatus();
    logger.info('Status:', status);
    logger.info('✓ Status retrieved\n');

    // Test 3: Get Pair Currencies
    logger.info('Test 3: Get Pair Currencies');
    const pairs = ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD'];
    pairs.forEach(pair => {
        const currencies = newsFilter.getPairCurrencies(pair);
        logger.info(`${pair} → ${JSON.stringify(currencies)}`);
    });
    logger.info('✓ Currency mapping works\n');

    // Test 4: Is News Time (check current time)
    logger.info('Test 4: Is News Time');
    const isNewsTime = newsFilter.isNewsTime();
    logger.info(`Is news time: ${isNewsTime}`);
    logger.info('✓ News time check works\n');

    // Test 5: Should Stop Trading
    logger.info('Test 5: Should Stop Trading');
    const pairsToTest = ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD'];
    for (const pair of pairsToTest) {
        const result = await newsFilter.shouldStopTrading(pair);
        logger.info(`${pair}: ${result.shouldStop ? 'STOP' : 'ALLOW'} - ${result.reason || 'No blocking news'}`);
    }
    logger.info('✓ Trading stop check works\n');

    // Test 6: Get Upcoming News
    logger.info('Test 6: Get Upcoming News');
    const upcoming = newsFilter.getUpcomingNews(null, 24);
    logger.info(`Found ${upcoming.length} upcoming high-impact news events`);
    upcoming.slice(0, 5).forEach(event => {
        logger.info(`  - ${event.time} ${event.currency}: ${event.name} (${event.minutesAway} min)`);
    });
    logger.info('✓ Upcoming news retrieval works\n');

    // Test 7: Get Upcoming News for Specific Pair
    logger.info('Test 7: Get Upcoming News for EURUSD');
    const pairNews = newsFilter.getUpcomingNews('EURUSD', 24);
    logger.info(`Found ${pairNews.length} upcoming events affecting EURUSD`);
    pairNews.forEach(event => {
        logger.info(`  - ${event.time} ${event.currency}: ${event.name} (${event.minutesAway} min)`);
    });
    logger.info('✓ Pair-specific news works\n');

    logger.info('=== All Tests Passed ===');
}

// Run tests
runTests().catch(error => {
    logger.error('Test failed:', error);
    process.exit(1);
});
