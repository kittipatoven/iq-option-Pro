const logger = require('../src/utils/logger');

class SimulationTest {
    constructor() {
        this.name = 'SimulationTest';
        this.testResults = [];
    }

    async runAllTests() {
        try {
            logger.info('Starting simulation tests...');
            
            const tests = [
                this.testIndicatorCalculations,
                this.testMarketDetection,
                this.testStrategySelection,
                this.testScoreSystem,
                this.testRiskManagement,
                this.testFilterSystem
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
            logger.error('Simulation test suite failed', error);
            throw error;
        }
    }

    async testIndicatorCalculations() {
        logger.info('Testing indicator calculations...');
        
        // Mock candle data
        const mockCandles = this.generateMockCandles(200);
        
        // Test RSI
        const RSIIndicator = require('../src/indicators/rsi');
        const rsi = new RSIIndicator();
        const rsiResult = rsi.calculate(mockCandles);
        
        if (!rsiResult || rsiResult.current === undefined) {
            throw new Error('RSI calculation failed');
        }
        
        // Test MACD
        const MACDIndicator = require('../src/indicators/macd');
        const macd = new MACDIndicator();
        const macdResult = macd.calculate(mockCandles);
        
        if (!macdResult || !macdResult.current) {
            throw new Error('MACD calculation failed');
        }
        
        // Test Bollinger Bands
        const BollingerBandsIndicator = require('../src/indicators/bb');
        const bb = new BollingerBandsIndicator();
        const bbResult = bb.calculate(mockCandles);
        
        if (!bbResult || !bbResult.current) {
            throw new Error('Bollinger Bands calculation failed');
        }
        
        // Test Moving Averages
        const MovingAverageIndicator = require('../src/indicators/ma');
        const ma = new MovingAverageIndicator();
        const maResult = ma.calculateMultiple(mockCandles);
        
        if (!maResult || !maResult.ema50 || !maResult.ema200) {
            throw new Error('Moving Averages calculation failed');
        }
        
        this.testResults.push({
            test: 'Indicator Calculations',
            status: 'PASSED',
            details: {
                rsi: rsiResult.current.toFixed(2),
                macd: macdResult.current.MACD.toFixed(6),
                bb: bbResult.current.upper.toFixed(5),
                ema50: maResult.ema50.current.toFixed(5),
                ema200: maResult.ema200.current.toFixed(5)
            }
        });
        
        logger.info('✅ Indicator calculations test passed');
    }

    async testMarketDetection() {
        logger.info('Testing market detection...');
        
        const mockCandles = this.generateMockCandles(200);
        const mockIndicators = this.generateMockIndicators(mockCandles);
        
        const MarketDetector = require('../src/market/marketDetector');
        const detector = new MarketDetector();
        const result = detector.detectMarketCondition(mockIndicators);
        
        if (!result || !result.overall) {
            throw new Error('Market detection failed');
        }
        
        this.testResults.push({
            test: 'Market Detection',
            status: 'PASSED',
            details: {
                overall: result.overall,
                trend: result.trend,
                volatility: result.volatility
            }
        });
        
        logger.info('✅ Market detection test passed');
    }

    async testStrategySelection() {
        logger.info('Testing strategy selection...');
        
        const mockCandles = this.generateMockCandles(200);
        const mockIndicators = this.generateMockIndicators(mockCandles);
        const mockMarketCondition = {
            overall: 'SIDEWAYS',
            trend: 'SIDEWAYS',
            volatility: 'NORMAL',
            momentum: 'NEUTRAL'
        };
        
        // Test Reversal Strategy
        const ReversalStrategy = require('../src/strategy/reversal');
        const reversal = new ReversalStrategy();
        const reversalResult = reversal.analyze(mockIndicators, mockMarketCondition);
        
        if (!reversalResult || !reversalResult.signals) {
            throw new Error('Reversal strategy analysis failed');
        }
        
        // Test Trend Strategy
        const TrendStrategy = require('../src/strategy/trend');
        const trend = new TrendStrategy();
        const trendResult = trend.analyze(mockIndicators, mockMarketCondition);
        
        if (!trendResult || !trendResult.signals) {
            throw new Error('Trend strategy analysis failed');
        }
        
        // Test Breakout Strategy
        const BreakoutStrategy = require('../src/strategy/breakout');
        const breakout = new BreakoutStrategy();
        const breakoutResult = breakout.analyze(mockIndicators, mockMarketCondition, mockCandles);
        
        if (!breakoutResult || !breakoutResult.signals) {
            throw new Error('Breakout strategy analysis failed');
        }
        
        this.testResults.push({
            test: 'Strategy Selection',
            status: 'PASSED',
            details: {
                reversal: reversalResult.recommended,
                trend: trendResult.recommended,
                breakout: breakoutResult.recommended
            }
        });
        
        logger.info('✅ Strategy selection test passed');
    }

    async testScoreSystem() {
        logger.info('Testing score system...');
        
        const mockIndicators = this.generateMockIndicators();
        const mockMarketCondition = {
            overall: 'SIDEWAYS',
            trend: 'SIDEWAYS',
            volatility: 'NORMAL',
            momentum: 'NEUTRAL'
        };
        const mockStrategyAnalysis = {
            recommended: true,
            confidence: 75,
            signals: { entry: 'BUY', direction: 'CALL', strength: 3 }
        };
        
        const ScoreEngine = require('../src/core/scoreEngine');
        const scoreEngine = new ScoreEngine();
        const result = scoreEngine.calculateScore(mockIndicators, mockMarketCondition, mockStrategyAnalysis);
        
        if (!result || result.totalScore === undefined) {
            throw new Error('Score system calculation failed');
        }
        
        this.testResults.push({
            test: 'Score System',
            status: 'PASSED',
            details: {
                totalScore: result.totalScore,
                passesThreshold: result.passesThreshold,
                recommendation: result.recommendation,
                confidence: result.confidence
            }
        });
        
        logger.info('✅ Score system test passed');
    }

    async testRiskManagement() {
        logger.info('Testing risk management...');
        
        const riskManager = require('../src/core/riskManager');
        
        // Initialize with test balance
        const initialized = riskManager.initialize(1000);
        if (!initialized) {
            throw new Error('Risk manager initialization failed');
        }
        
        // Test position sizing
        const positionSize = riskManager.calculatePositionSize(0.8, 75);
        if (!positionSize || positionSize.positionSize <= 0) {
            throw new Error('Position sizing calculation failed');
        }
        
        // Test trade recording
        const tradeResult = {
            pair: 'EURUSD',
            direction: 'CALL',
            amount: 10,
            result: 'WIN',
            profit: 8
        };
        
        const recorded = riskManager.recordTrade(tradeResult);
        if (!recorded) {
            throw new Error('Trade recording failed');
        }
        
        // Test risk metrics
        const metrics = riskManager.getRiskMetrics();
        if (!metrics || metrics.totalTrades !== 1) {
            throw new Error('Risk metrics calculation failed');
        }
        
        this.testResults.push({
            test: 'Risk Management',
            status: 'PASSED',
            details: {
                initialBalance: 1000,
                positionSize: positionSize.positionSize,
                totalTrades: metrics.totalTrades,
                winRate: metrics.winRate,
                netProfit: metrics.netProfit
            }
        });
        
        logger.info('✅ Risk management test passed');
    }

    async testFilterSystem() {
        logger.info('Testing filter system...');
        
        // Test Time Filter
        const timeFilter = require('../src/filters/timeFilter');
        const timeResult = timeFilter.shouldAllowTrading('EURUSD');
        
        if (!timeResult || timeResult.allow === undefined) {
            throw new Error('Time filter failed');
        }
        
        // Test Volatility Filter
        const volatilityFilter = require('../src/filters/volatilityFilter');
        const mockCandles = this.generateMockCandles(50);
        const volatilityResult = volatilityFilter.shouldAllowTrading(mockCandles, 'REVERSAL');
        
        if (!volatilityResult || volatilityResult.allow === undefined) {
            throw new Error('Volatility filter failed');
        }
        
        // Test News Filter
        const newsFilter = require('../src/filters/newsFilter');
        await newsFilter.initialize();
        const newsResult = await newsFilter.isSafeToTrade('EURUSD');
        
        if (!newsResult || newsResult.safe === undefined) {
            throw new Error('News filter failed');
        }
        
        this.testResults.push({
            test: 'Filter System',
            status: 'PASSED',
            details: {
                timeFilter: timeResult.allow ? 'ALLOW' : 'BLOCK',
                volatilityFilter: volatilityResult.allow ? 'ALLOW' : 'BLOCK',
                newsFilter: newsResult.safe ? 'SAFE' : 'UNSAFE',
                timeReasons: timeResult.reasons || []
            }
        });
        
        logger.info('✅ Filter system test passed');
    }

    generateMockCandles(count = 200) {
        const candles = [];
        let price = 1.1000;
        
        for (let i = 0; i < count; i++) {
            const volatility = 0.0001 + Math.random() * 0.0005;
            const change = (Math.random() - 0.5) * volatility;
            
            const open = price;
            const close = price + change;
            const high = Math.max(open, close) + Math.random() * volatility;
            const low = Math.min(open, close) - Math.random() * volatility;
            
            candles.push({
                open: parseFloat(open.toFixed(5)),
                high: parseFloat(high.toFixed(5)),
                low: parseFloat(low.toFixed(5)),
                close: parseFloat(close.toFixed(5)),
                volume: Math.floor(Math.random() * 1000),
                timestamp: new Date(Date.now() - (count - i) * 60000)
            });
            
            price = close;
        }
        
        return candles;
    }

    generateMockIndicators(candles = null) {
        const mockCandles = candles || this.generateMockCandles(200);
        
        return {
            rsi: {
                current: 50 + Math.random() * 20 - 10,
                getScore: () => Math.random(),
                isOverbought: (current, threshold = 70) => (current || this.current) > threshold,
                isOversold: (current, threshold = 30) => (current || this.current) < threshold,
                isBullish: (current) => (current || this.current) > 50,
                isBearish: (current) => (current || this.current) < 50
            },
            macd: {
                current: { MACD: 0.0001, signal: 0.0001, histogram: 0 },
                previous: { MACD: 0.0001, signal: 0.0001, histogram: 0 },
                getScore: () => Math.random(),
                isBullishCross: () => Math.random() > 0.8,
                isBearishCross: () => Math.random() > 0.8,
                isAboveSignal: () => Math.random() > 0.5,
                isBelowSignal: () => Math.random() > 0.5
            },
            bollingerBands: {
                current: { upper: 1.1050, middle: 1.1000, lower: 1.0950, price: 1.1000 },
                width: 2.5,
                position: 'NORMAL',
                getScore: () => Math.random(),
                isAtUpperBand: () => Math.random() > 0.9,
                isAtLowerBand: () => Math.random() > 0.9,
                isNarrow: (width) => (width || this.width) < 2,
                isWide: (width) => (width || this.width) > 4
            },
            movingAverages: {
                currentPrice: 1.1000,
                ema50: { current: 1.0995 },
                ema200: { current: 1.0980 },
                trend: 'SIDEWAYS',
                getScore: () => Math.random(),
                isPriceAboveEMA50: (price, ema50) => (price || this.currentPrice) > (ema50 || this.ema50.current),
                isPriceAboveEMA200: (price, ema200) => (price || this.currentPrice) > (ema200 || this.ema200.current),
                isGoldenCross: (ema50, ema200) => (ema50 || this.ema50.current) > (ema200 || this.ema200.current),
                isDeathCross: (ema50, ema200) => (ema50 || this.ema50.current) < (ema200 || this.ema200.current)
            }
        };
    }

    printTestSummary() {
        console.log('\n=== SIMULATION TEST RESULTS ===');
        
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
    }
}

// Run tests if called directly
if (require.main === module) {
    const test = new SimulationTest();
    test.runAllTests().catch(error => {
        console.error('Test execution failed:', error);
        process.exit(1);
    });
}

module.exports = SimulationTest;
