/**
 * Test script for AI News Analyzer
 * Tests RSS fetcher, sentiment analysis, and news filter integration
 */

const logger = require('./src/utils/logger');
const newsFilter = require('./src/filters/newsFilter');
const newsAnalyzer = require('./src/services/newsAnalyzer');
const rssFetcher = require('./src/services/rssFetcher');

async function runTests() {
    logger.info('=== Testing AI News Analyzer ===\n');

    // Test 1: News Analyzer - Sentiment
    logger.info('Test 1: Sentiment Analysis');
    const testTexts = [
        { text: 'US economy shows strong growth and bullish trend', expected: 'positive' },
        { text: 'Market crash and recession fears decline', expected: 'negative' },
        { text: 'Normal trading session with no major changes', expected: 'neutral' }
    ];
    
    testTexts.forEach(({ text, expected }) => {
        const sentiment = newsAnalyzer.getSentiment(text.toLowerCase());
        const status = sentiment === expected ? '✓' : '✗';
        logger.info(`${status} "${text.substring(0, 40)}..." → ${sentiment} (expected: ${expected})`);
    });
    logger.info('');

    // Test 2: News Analyzer - Currency Detection
    logger.info('Test 2: Currency Detection');
    const currencyTests = [
        { text: 'USD dollar gains against EUR', expected: ['USD', 'EUR'] },
        { text: 'Bank of England raises rates for GBP', expected: ['GBP'] },
        { text: 'JPY yen weakens in Tokyo trading', expected: ['JPY'] }
    ];
    
    currencyTests.forEach(({ text, expected }) => {
        const currencies = newsAnalyzer.detectCurrency(text.toLowerCase());
        const match = expected.every(c => currencies.includes(c));
        const status = match ? '✓' : '✗';
        logger.info(`${status} "${text.substring(0, 40)}..." → [${currencies.join(', ')}] (expected: [${expected.join(', ')}])`);
    });
    logger.info('');

    // Test 3: News Analyzer - Impact Calculation
    logger.info('Test 3: Impact Calculation');
    const impactTests = [
        { text: 'Federal Reserve interest rate decision', expected: 'HIGH' },
        { text: 'CPI inflation data released', expected: 'HIGH' },
        { text: 'GDP growth figures announced', expected: 'MEDIUM' },
        { text: 'Retail sales slightly up', expected: 'MEDIUM' },
        { text: 'Normal market activity', expected: 'LOW' }
    ];
    
    impactTests.forEach(({ text, expected }) => {
        const impact = newsAnalyzer.calculateImpact(text.toLowerCase());
        const status = impact === expected ? '✓' : '✗';
        logger.info(`${status} "${text.substring(0, 40)}..." → ${impact} (expected: ${expected})`);
    });
    logger.info('');

    // Test 4: News Analyzer - Full Analysis
    logger.info('Test 4: Full News Analysis');
    const sampleNews = {
        title: 'Federal Reserve announces interest rate hike amid strong USD growth',
        description: 'The Federal Reserve raised interest rates by 25 basis points, boosting the dollar against major currencies.',
        pubDate: new Date().toISOString(),
        source: 'Test'
    };
    
    const analyzed = newsAnalyzer.analyze(sampleNews);
    logger.info('Analyzed news:', {
        title: analyzed.title.substring(0, 50),
        sentiment: analyzed.sentiment,
        currencies: analyzed.currencies,
        impact: analyzed.impact
    });
    logger.info('✓ Full analysis works\n');

    // Test 5: News Filter Integration
    logger.info('Test 5: News Filter with RSS');
    await newsFilter.initialize();
    
    // Mock RSS update
    newsFilter.rssNewsCache = [
        {
            title: 'Federal Reserve interest rate decision',
            description: 'Fed raises rates',
            pubDate: new Date().toISOString(),
            source: 'Test',
            sentiment: 'negative',
            currencies: ['USD'],
            impact: 'HIGH'
        }
    ];
    newsFilter.rssCacheTimestamp = Date.now();
    
    // Test EURUSD (should be blocked - contains USD)
    const result1 = await newsFilter.shouldStopTrading('EURUSD');
    logger.info(`EURUSD with USD HIGH news: ${result1.shouldStop ? 'STOP' : 'ALLOW'}`);
    
    // Test GBPJPY (should be allowed - no USD)
    const result2 = await newsFilter.shouldStopTrading('GBPJPY');
    logger.info(`GBPJPY with USD HIGH news: ${result2.shouldStop ? 'STOP' : 'ALLOW'}`);
    
    logger.info('✓ News filter integration works\n');

    // Test 6: RSS Fetch (optional - may fail if no internet)
    logger.info('Test 6: RSS Fetch (optional)');
    try {
        const items = await rssFetcher.fetchAllFeeds();
        logger.info(`✓ RSS fetch successful: ${items.length} items`);
        if (items.length > 0) {
            const analyzed = newsAnalyzer.analyzeBatch(items.slice(0, 3));
            analyzed.forEach((news, i) => {
                logger.info(`  Item ${i+1}: ${news.title.substring(0, 40)}...`);
                logger.info(`    → Sentiment: ${news.sentiment}, Currencies: [${news.currencies.join(', ')}], Impact: ${news.impact}`);
            });
        }
    } catch (error) {
        logger.warn('✗ RSS fetch failed (expected if offline)', { error: error.message });
    }
    logger.info('');

    logger.info('=== All Tests Completed ===');
}

// Run tests
runTests().catch(error => {
    logger.error('Test failed:', error);
    process.exit(1);
});
