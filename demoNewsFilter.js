const logger = require('./src/utils/logger');
const newsFilter = require('./src/filters/newsFilter');

class NewsFilterDemo {
    constructor() {
        this.name = 'NewsFilterDemo';
    }

    async runDemo() {
        try {
            console.log('🚀 IQ OPTION NEWS FILTER DEMO');
            console.log('=====================================\n');
            
            // Step 1: Initialize
            console.log('📡 Step 1: Initializing News Filter...');
            await newsFilter.initialize();
            console.log('✅ News Filter initialized\n');
            
            // Step 2: Show API Status
            console.log('🔍 Step 2: Checking API Status...');
            const apiStatus = newsFilter.getApiStatus();
            console.log(`API Key: ${apiStatus.hasApiKey ? '✅ CONFIGURED' : '❌ NOT CONFIGURED'}`);
            console.log(`Mode: ${apiStatus.hasApiKey ? '🔴 LIVE API' : '🟡 MOCK MODE'}`);
            console.log(`News Events: ${apiStatus.newsEventsCount}`);
            console.log(`High Impact: ${apiStatus.highImpactEvents}\n`);
            
            // Step 3: Show upcoming news
            console.log('📅 Step 3: Upcoming News Events (24 hours)...');
            const upcomingNews = newsFilter.getUpcomingNews(null, 24);
            
            if (upcomingNews.length === 0) {
                console.log('No upcoming news events found.\n');
            } else {
                upcomingNews.forEach((event, index) => {
                    const time = new Date(event.time).toLocaleString();
                    const impact = event.impact;
                    const currency = event.currency;
                    const symbol = impact === 'HIGH' ? '🔴' : impact === 'MEDIUM' ? '🟡' : '🟢';
                    
                    console.log(`${index + 1}. ${symbol} ${event.title}`);
                    console.log(`   Time: ${time}`);
                    console.log(`   Impact: ${impact}`);
                    console.log(`   Currency: ${currency}\n`);
                });
            }
            
            // Step 4: Test different pairs
            console.log('💱 Step 4: Testing Trading Safety for Different Pairs...');
            const pairs = ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD'];
            
            for (const pair of pairs) {
                const safetyCheck = await newsFilter.isSafeToTrade(pair);
                const status = safetyCheck.safe ? '✅ SAFE' : '🛑 BLOCKED';
                const reason = safetyCheck.reason || 'No blocking news';
                
                console.log(`${pair}: ${status} - ${reason}`);
            }
            console.log('');
            
            // Step 5: Simulate real-time check
            console.log('⏰ Step 5: Real-time Trading Check Simulation...');
            const pair = 'EURUSD';
            const stopResult = await newsFilter.shouldStopTrading(pair);
            
            console.log(`Checking ${pair}...`);
            if (stopResult.shouldStop) {
                console.log(`🛑 TRADING STOPPED!`);
                console.log(`Reason: ${stopResult.reason}`);
                console.log(`Event Time: ${new Date(stopResult.eventTime).toLocaleString()}`);
                console.log(`Time Until: ${stopResult.timeUntil} minutes`);
                console.log(`Currency: ${stopResult.currency}`);
                console.log(`Impact: ${stopResult.impact}`);
            } else {
                console.log(`✅ TRADING ALLOWED`);
                console.log('No high-impact news detected in the next 10 minutes');
            }
            console.log('');
            
            // Step 6: Show integration example
            console.log('🤖 Step 6: Bot Integration Example...');
            await this.showBotIntegration();
            
            // Step 7: Configuration guide
            console.log('⚙️ Step 7: Configuration Guide...');
            this.showConfigurationGuide();
            
        } catch (error) {
            logger.error('Demo failed', error);
            console.error('❌ Demo failed:', error.message);
        }
    }

    async showBotIntegration() {
        console.log('This is how the bot integrates with the news filter:\n');
        
        const pair = 'EURUSD';
        console.log(`// Bot analyzes ${pair}...`);
        console.log('const newsCheck = await newsFilter.shouldStopTrading(pair);');
        console.log('');
        console.log('if (newsCheck.shouldStop) {');
        console.log('    console.log(`Skipping trade for ${pair} due to: ${newsCheck.reason}`);');
        console.log('    return null; // Skip this trade');
        console.log('}');
        console.log('');
        console.log('// Continue with trading analysis...');
        console.log('console.log("Proceeding with trade analysis...");');
        console.log('');
        
        // Simulate the check
        const newsCheck = await newsFilter.shouldStopTrading(pair);
        if (newsCheck.shouldStop) {
            console.log(`🛑 BOT ACTION: Skipping trade for ${pair} due to: ${newsCheck.reason}`);
        } else {
            console.log(`✅ BOT ACTION: Proceeding with trade analysis for ${pair}`);
        }
        console.log('');
    }

    showConfigurationGuide() {
        console.log('📋 TO CONFIGURE REAL API:');
        console.log('1. Get API key from: https://financialmodelingprep.com/');
        console.log('2. Edit .env file:');
        console.log('   NEWS_API_KEY=your_actual_api_key_here');
        console.log('3. Restart the bot');
        console.log('');
        
        console.log('🔧 API ENDPOINTS USED:');
        const apiStatus = newsFilter.getApiStatus();
        console.log(`Economic Calendar: ${apiStatus.endpoints.economicCalendar}`);
        console.log(`Forex News: ${apiStatus.endpoints.forexNews}`);
        console.log('');
        
        console.log('⏱️ TIME WINDOW SETTINGS:');
        console.log('- High Impact Window: 10 minutes before/after news');
        console.log('- Update Interval: 15 minutes');
        console.log('- Retry Attempts: 3');
        console.log('- API Timeout: 10 seconds');
        console.log('');
        
        console.log('💱 SUPPORTED CURRENCIES:');
        console.log('USD (US Dollar) - Affects EURUSD, GBPUSD, USDJPY, AUDUSD');
        console.log('EUR (Euro) - Affects EURUSD');
        console.log('GBP (British Pound) - Affects GBPUSD');
        console.log('JPY (Japanese Yen) - Affects USDJPY');
        console.log('AUD (Australian Dollar) - Affects AUDUSD');
        console.log('');
        
        console.log('🎯 NEWS IMPACT LEVELS:');
        console.log('HIGH - Blocks trading (10 min before/after)');
        console.log('MEDIUM - Logged but does not block');
        console.log('LOW - Logged but does not block');
        console.log('');
    }
}

// Run demo if called directly
if (require.main === module) {
    const demo = new NewsFilterDemo();
    demo.runDemo().catch(error => {
        console.error('Demo execution failed:', error);
        process.exit(1);
    });
}

module.exports = NewsFilterDemo;
