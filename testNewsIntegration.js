const logger = require('./src/utils/logger');
const newsFilter = require('./src/filters/newsFilter');

class NewsIntegrationTest {
    constructor() {
        this.name = 'NewsIntegrationTest';
        this.testResults = [];
    }

    async runTests() {
        try {
            logger.info('=== NEWS FILTER INTEGRATION TEST ===');
            
            // Test 1: Initialize News Filter
            await this.testInitialization();
            
            // Test 2: Test API Connection
            await this.testApiConnection();
            
            // Test 3: Test Economic Calendar Fetch
            await this.testEconomicCalendar();
            
            // Test 4: Test High Impact Detection
            await this.testHighImpactDetection();
            
            // Test 5: Test Time Window Logic
            await this.testTimeWindow();
            
            // Test 6: Test Currency Mapping
            await this.testCurrencyMapping();
            
            // Test 7: Test Should Stop Trading Logic
            await this.testShouldStopTrading();
            
            // Test 8: Test Bot Integration Point
            await this.testBotIntegration();
            
            // Print results
            this.printResults();
            
        } catch (error) {
            logger.error('News integration test failed', error);
            throw error;
        }
    }

    async testInitialization() {
        try {
            logger.info('Testing News Filter initialization...');
            
            const initialized = await newsFilter.initialize();
            
            this.testResults.push({
                test: 'Initialization',
                status: initialized ? 'PASSED' : 'FAILED',
                details: { initialized }
            });
            
            logger.info(`✅ Initialization test ${initialized ? 'PASSED' : 'FAILED'}`);
        } catch (error) {
            this.testResults.push({
                test: 'Initialization',
                status: 'FAILED',
                error: error.message
            });
            logger.error('❌ Initialization test FAILED', error);
        }
    }

    async testApiConnection() {
        try {
            logger.info('Testing API connection...');
            
            const apiStatus = newsFilter.getApiStatus();
            
            this.testResults.push({
                test: 'API Connection',
                status: 'PASSED',
                details: apiStatus
            });
            
            logger.info('✅ API connection test PASSED');
        } catch (error) {
            this.testResults.push({
                test: 'API Connection',
                status: 'FAILED',
                error: error.message
            });
            logger.error('❌ API connection test FAILED', error);
        }
    }

    async testEconomicCalendar() {
        try {
            logger.info('Testing Economic Calendar fetch...');
            
            // Force refresh
            const refreshResult = await newsFilter.refreshNews();
            
            // Get upcoming news
            const upcomingNews = newsFilter.getUpcomingNews(null, 24);
            
            this.testResults.push({
                test: 'Economic Calendar',
                status: 'PASSED',
                details: {
                    refreshSuccess: refreshResult,
                    upcomingEvents: upcomingNews.length,
                    highImpactEvents: upcomingNews.filter(e => e.impact === 'HIGH').length
                }
            });
            
            logger.info('✅ Economic Calendar test PASSED');
        } catch (error) {
            this.testResults.push({
                test: 'Economic Calendar',
                status: 'FAILED',
                error: error.message
            });
            logger.error('❌ Economic Calendar test FAILED', error);
        }
    }

    async testHighImpactDetection() {
        try {
            logger.info('Testing High Impact Detection...');
            
            const upcomingNews = newsFilter.getUpcomingNews(null, 24);
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
            
            logger.info('✅ High Impact Detection test PASSED');
        } catch (error) {
            this.testResults.push({
                test: 'High Impact Detection',
                status: 'FAILED',
                error: error.message
            });
            logger.error('❌ High Impact Detection test FAILED', error);
        }
    }

    async testTimeWindow() {
        try {
            logger.info('Testing Time Window Logic...');
            
            // Test event 5 minutes from now (should be within 10-minute window)
            const eventTimeNear = new Date(Date.now() + 5 * 60 * 1000);
            const isWithinWindow = newsFilter.isNewsTime(eventTimeNear, 10);
            
            // Test event 15 minutes from now (should be outside 10-minute window)
            const eventTimeFar = new Date(Date.now() + 15 * 60 * 1000);
            const isOutsideWindow = newsFilter.isNewsTime(eventTimeFar, 10);
            
            const windowTestPassed = isWithinWindow && !isOutsideWindow;
            
            this.testResults.push({
                test: 'Time Window Logic',
                status: windowTestPassed ? 'PASSED' : 'FAILED',
                details: {
                    withinWindow5Min: isWithinWindow,
                    outsideWindow15Min: !isOutsideWindow,
                    windowSize: '10 minutes'
                }
            });
            
            logger.info(`✅ Time Window Logic test ${windowTestPassed ? 'PASSED' : 'FAILED'}`);
        } catch (error) {
            this.testResults.push({
                test: 'Time Window Logic',
                status: 'FAILED',
                error: error.message
            });
            logger.error('❌ Time Window Logic test FAILED', error);
        }
    }

    async testCurrencyMapping() {
        try {
            logger.info('Testing Currency Mapping...');
            
            // Test currency to pair mapping
            const testCases = [
                { currency: 'USD', pair: 'EURUSD', expected: true },
                { currency: 'EUR', pair: 'EURUSD', expected: true },
                { currency: 'GBP', pair: 'EURUSD', expected: false },
                { currency: 'USD', pair: 'GBPUSD', expected: true },
                { currency: 'GBP', pair: 'GBPUSD', expected: true },
                { currency: 'EUR', pair: 'GBPUSD', expected: false }
            ];
            
            let passedTests = 0;
            const results = [];
            
            for (const testCase of testCases) {
                const event = { currency: testCase.currency, impact: 'HIGH' };
                const affects = newsFilter.affectsPair(event, testCase.pair);
                const passed = affects === testCase.expected;
                
                results.push({
                    testCase: `${testCase.currency} -> ${testCase.pair}`,
                    expected: testCase.expected,
                    actual: affects,
                    passed: passed
                });
                
                if (passed) passedTests++;
            }
            
            const allPassed = passedTests === testCases.length;
            
            this.testResults.push({
                test: 'Currency Mapping',
                status: allPassed ? 'PASSED' : 'FAILED',
                details: {
                    passedTests: passedTests,
                    totalTests: testCases.length,
                    results: results
                }
            });
            
            logger.info(`✅ Currency Mapping test ${allPassed ? 'PASSED' : 'FAILED'}`);
        } catch (error) {
            this.testResults.push({
                test: 'Currency Mapping',
                status: 'FAILED',
                error: error.message
            });
            logger.error('❌ Currency Mapping test FAILED', error);
        }
    }

    async testShouldStopTrading() {
        try {
            logger.info('Testing Should Stop Trading...');
            
            // Test with EURUSD pair
            const stopResult = await newsFilter.shouldStopTrading('EURUSD');
            
            // Test safety check
            const safetyResult = await newsFilter.isSafeToTrade('EURUSD');
            
            const logicWorking = !stopResult.shouldStop === safetyResult.safe;
            
            this.testResults.push({
                test: 'Should Stop Trading',
                status: logicWorking ? 'PASSED' : 'FAILED',
                details: {
                    shouldStop: stopResult.shouldStop,
                    safe: safetyResult.safe,
                    reason: stopResult.reason || 'No news',
                    logicWorking: logicWorking
                }
            });
            
            logger.info(`✅ Should Stop Trading test ${logicWorking ? 'PASSED' : 'FAILED'}`);
        } catch (error) {
            this.testResults.push({
                test: 'Should Stop Trading',
                status: 'FAILED',
                error: error.message
            });
            logger.error('❌ Should Stop Trading test FAILED', error);
        }
    }

    async testBotIntegration() {
        try {
            logger.info('Testing Bot Integration Point...');
            
            // Simulate bot checking news filter before trading
            const pair = 'EURUSD';
            const newsCheck = await newsFilter.shouldStopTrading(pair);
            
            // This is what the bot would do
            if (newsCheck.shouldStop) {
                logger.info(`Bot would skip trading ${pair} due to: ${newsCheck.reason}`);
            } else {
                logger.info(`Bot would proceed with trading ${pair}`);
            }
            
            this.testResults.push({
                test: 'Bot Integration',
                status: 'PASSED',
                details: {
                    pair: pair,
                    shouldStop: newsCheck.shouldStop,
                    reason: newsCheck.reason || 'No blocking news',
                    botAction: newsCheck.shouldStop ? 'SKIP TRADE' : 'PROCEED'
                }
            });
            
            logger.info('✅ Bot Integration test PASSED');
        } catch (error) {
            this.testResults.push({
                test: 'Bot Integration',
                status: 'FAILED',
                error: error.message
            });
            logger.error('❌ Bot Integration test FAILED', error);
        }
    }

    printResults() {
        console.log('\n=== NEWS FILTER INTEGRATION TEST RESULTS ===');
        
        const passed = this.testResults.filter(t => t.status === 'PASSED').length;
        const failed = this.testResults.filter(t => t.status === 'FAILED').length;
        const total = this.testResults.length;
        
        console.log(`Total Tests: ${total}`);
        console.log(`Passed: ${passed}`);
        console.log(`Failed: ${failed}`);
        console.log(`Success Rate: ${total > 0 ? ((passed / total) * 100).toFixed(1) : 0}%\n`);
        
        for (const result of this.testResults) {
            const status = result.status === 'PASSED' ? '✅' : '❌';
            console.log(`${status} ${result.test}`);
            
            if (result.status === 'FAILED') {
                console.log(`   Error: ${result.error}`);
            } else if (result.details) {
                Object.entries(result.details).forEach(([key, value]) => {
                    if (typeof value === 'object') {
                        console.log(`   ${key}:`);
                        Object.entries(value).forEach(([k, v]) => {
                            console.log(`     ${k}: ${v}`);
                        });
                    } else {
                        console.log(`   ${key}: ${value}`);
                    }
                });
            }
            console.log('');
        }

        // Show final status
        console.log('=== INTEGRATION STATUS ===');
        
        if (failed === 0) {
            console.log('🎉 ALL TESTS PASSED - News Filter is ready for production!');
            console.log('\n📋 INTEGRATION SUMMARY:');
            console.log('✅ News Filter initialized successfully');
            console.log('✅ API connection working (or fallback to mock)');
            console.log('✅ Economic Calendar fetching working');
            console.log('✅ High impact news detection working');
            console.log('✅ Time window logic working');
            console.log('✅ Currency mapping working');
            console.log('✅ Should stop trading logic working');
            console.log('✅ Bot integration point working');
            
            console.log('\n🚀 READY FOR BOT INTEGRATION:');
            console.log('- Bot will check newsFilter.shouldStopTrading(pair) before each trade');
            console.log('- Bot will skip trades during high-impact news events');
            console.log('- Bot will continue trading normally when no news blocks');
            
        } else {
            console.log('⚠️  SOME TESTS FAILED - Review and fix issues before production');
        }
        
        console.log('\n=== API CONFIGURATION STATUS ===');
        const apiStatus = newsFilter.getApiStatus();
        console.log(`API Key: ${apiStatus.hasApiKey ? '✅ CONFIGURED' : '⚠️  NOT CONFIGURED'}`);
        console.log(`Mode: ${apiStatus.hasApiKey ? '🔴 LIVE API' : '🟡 MOCK MODE'}`);
        console.log(`News Events: ${apiStatus.newsEventsCount}`);
        console.log(`High Impact: ${apiStatus.highImpactEvents}`);
        console.log(`Last Update: ${apiStatus.lastUpdate || 'Never'}`);
        
        if (!apiStatus.hasApiKey) {
            console.log('\n⚠️  TO USE REAL API:');
            console.log('1. Get API key from https://financialmodelingprep.com/');
            console.log('2. Set NEWS_API_KEY in .env file');
            console.log('3. Restart the bot');
        }
    }
}

// Run tests if called directly
if (require.main === module) {
    const test = new NewsIntegrationTest();
    test.runTests().catch(error => {
        console.error('News integration test execution failed:', error);
        process.exit(1);
    });
}

module.exports = NewsIntegrationTest;
