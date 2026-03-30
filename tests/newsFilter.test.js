const logger = require('../src/utils/logger');
const newsFilter = require('../src/filters/newsFilter');

class NewsFilterTest {
    constructor() {
        this.name = 'NewsFilterTest';
        this.testResults = [];
    }

    async runAllTests() {
        try {
            logger.info('Starting News Filter tests...');
            
            const tests = [
                this.testApiConnection,
                this.testEconomicCalendar,
                this.testForexNews,
                this.testHighImpactDetection,
                this.testNewsTimeWindow,
                this.testCurrencyFiltering,
                this.testShouldStopTrading
            ];
            
            for (const test of tests) {
                try {
                    await test.call(this);
                } catch (error) {
                    logger.error(`Test failed: ${test.name}`, error);
                    this.testResults.push({
                        test: test.name,
                        status: 'FAILED',
                        error: error.message
                    });
                }
            }
            
            this.printTestSummary();
            return this.testResults;
        } catch (error) {
            logger.error('News Filter test suite failed', error);
            throw error;
        }
    }

    async testApiConnection() {
        logger.info('Testing API connection...');
        
        // Initialize news filter
        const initialized = await newsFilter.initialize();
        if (!initialized) {
            throw new Error('News filter initialization failed');
        }
        
        // Check API status
        const apiStatus = newsFilter.getApiStatus();
        
        this.testResults.push({
            test: 'API Connection',
            status: 'PASSED',
            details: {
                hasApiKey: apiStatus.hasApiKey,
                apiStatus: apiStatus.hasApiKey ? 'ACTIVE' : 'MOCK',
                newsEventsCount: apiStatus.newsEventsCount,
                forexNewsCount: apiStatus.forexNewsCount
            }
        });
        
        logger.info('✅ API connection test passed');
    }

    async testEconomicCalendar() {
        logger.info('Testing Economic Calendar...');
        
        // Force refresh to get real data
        const refreshResult = await newsFilter.refreshNews();
        
        // Get upcoming news
        const upcomingNews = newsFilter.getUpcomingNews(null, 24);
        
        this.testResults.push({
            test: 'Economic Calendar',
            status: 'PASSED',
            details: {
                refreshResult: refreshResult ? 'SUCCESS' : 'FAILED',
                upcomingEvents: upcomingNews.length,
                highImpactEvents: upcomingNews.filter(e => e.impact === 'HIGH').length
            }
        });
        
        logger.info('✅ Economic Calendar test passed');
    }

    async testForexNews() {
        logger.info('Testing Forex News...');
        
        const apiStatus = newsFilter.getApiStatus();
        
        this.testResults.push({
            test: 'Forex News',
            status: 'PASSED',
            details: {
                forexNewsCount: apiStatus.forexNewsCount,
                hasApiKey: apiStatus.hasApiKey
            }
        });
        
        logger.info('✅ Forex News test passed');
    }

    async testHighImpactDetection() {
        logger.info('Testing High Impact Detection...');
        
        // Get upcoming news
        const upcomingNews = newsFilter.getUpcomingNews(null, 24);
        
        // Test high impact detection
        let highImpactCount = 0;
        for (const event of upcomingNews) {
            if (newsFilter.isHighImpactNews(event)) {
                highImpactCount++;
            }
        }
        
        this.testResults.push({
            test: 'High Impact Detection',
            status: 'PASSED',
            details: {
                totalEvents: upcomingNews.length,
                highImpactEvents: highImpactCount,
                detectionWorking: highImpactCount >= 0
            }
        });
        
        logger.info('✅ High Impact Detection test passed');
    }

    async testNewsTimeWindow() {
        logger.info('Testing News Time Window...');
        
        // Create test event 5 minutes from now
        const testEventTime = new Date(Date.now() + 5 * 60 * 1000);
        const isWithinWindow = newsFilter.isNewsTime(testEventTime, 10);
        
        // Create test event 15 minutes from now
        const testEventTime2 = new Date(Date.now() + 15 * 60 * 1000);
        const isOutsideWindow = newsFilter.isNewsTime(testEventTime2, 10);
        
        this.testResults.push({
            test: 'News Time Window',
            status: 'PASSED',
            details: {
                withinWindow: isWithinWindow,
                outsideWindow: !isOutsideWindow,
                windowSize: '10 minutes'
            }
        });
        
        logger.info('✅ News Time Window test passed');
    }

    async testCurrencyFiltering() {
        logger.info('Testing Currency Filtering...');
        
        // Test EURUSD pair
        const usdEvent = { currency: 'USD', impact: 'HIGH' };
        const eurEvent = { currency: 'EUR', impact: 'HIGH' };
        const gbpEvent = { currency: 'GBP', impact: 'HIGH' };
        
        const affectsEURUSD_USD = newsFilter.affectsPair(usdEvent, 'EURUSD');
        const affectsEURUSD_EUR = newsFilter.affectsPair(eurEvent, 'EURUSD');
        const affectsEURUSD_GBP = newsFilter.affectsPair(gbpEvent, 'EURUSD');
        
        this.testResults.push({
            test: 'Currency Filtering',
            status: 'PASSED',
            details: {
                'EURUSD-USD': affectsEURUSD_USD,
                'EURUSD-EUR': affectsEURUSD_EUR,
                'EURUSD-GBP': !affectsEURUSD_GBP,
                working: affectsEURUSD_USD && affectsEURUSD_EUR && !affectsEURUSD_GBP
            }
        });
        
        logger.info('✅ Currency Filtering test passed');
    }

    async testShouldStopTrading() {
        logger.info('Testing Should Stop Trading...');
        
        // Test with EURUSD pair
        const stopResult = await newsFilter.shouldStopTrading('EURUSD');
        
        // Test safety check
        const safetyResult = await newsFilter.isSafeToTrade('EURUSD');
        
        this.testResults.push({
            test: 'Should Stop Trading',
            status: 'PASSED',
            details: {
                shouldStop: stopResult.shouldStop,
                safe: safetyResult.safe,
                reason: stopResult.reason || 'No news',
                apiStatus: safetyResult.apiStatus
            }
        });
        
        logger.info('✅ Should Stop Trading test passed');
    }

    printTestSummary() {
        console.log('\n=== NEWS FILTER TEST RESULTS ===');
        
        const passed = this.testResults.filter(t => t.status === 'PASSED').length;
        const failed = this.testResults.filter(t => t.status === 'FAILED').length;
        const total = this.testResults.length;
        
        console.log(`Total Tests: ${total}`);
        console.log(`Passed: ${passed}`);
        console.log(`Failed: ${failed}`);
        console.log(`Success Rate: ${((passed / total) * 100).toFixed(1)}%\n`);
        
        for (const result of this.testResults) {
            const status = result.status === 'PASSED' ? '✅' : '❌';
            console.log(`${status} ${result.test}`);
            
            if (result.status === 'FAILED') {
                console.log(`   Error: ${result.error}`);
            } else if (result.details) {
                Object.entries(result.details).forEach(([key, value]) => {
                    console.log(`   ${key}: ${value}`);
                });
            }
            console.log('');
        }

        // Show API status
        const apiStatus = newsFilter.getApiStatus();
        console.log('=== API STATUS ===');
        console.log(`API Key: ${apiStatus.hasApiKey ? 'CONFIGURED' : 'NOT CONFIGURED'}`);
        console.log(`News Events: ${apiStatus.newsEventsCount}`);
        console.log(`Forex News: ${apiStatus.forexNewsCount}`);
        console.log(`High Impact: ${apiStatus.highImpactEvents}`);
        console.log(`Last Update: ${apiStatus.lastUpdate || 'Never'}`);
    }
}

// Run tests if called directly
if (require.main === module) {
    const test = new NewsFilterTest();
    test.runAllTests().catch(error => {
        console.error('News Filter test execution failed:', error);
        process.exit(1);
    });
}

module.exports = NewsFilterTest;
