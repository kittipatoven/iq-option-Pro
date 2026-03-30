const logger = require('../utils/logger');

class MTFFilter {
    constructor() {
        this.name = 'MTFFilter';
        this.timeframes = {
            M1: 1,
            M5: 5,
            M15: 15,
            H1: 60
        };
        this.alignmentThreshold = 0.7; // 70% of timeframes should align
    }

    async analyzeMultiTimeframe(pair, api, timeframes = null) {
        try {
            const targetTimeframes = timeframes || Object.keys(this.timeframes);
            const analysis = {};
            
            for (const tf of targetTimeframes) {
                const period = this.timeframes[tf];
                const candles = await api.getCandles(pair, period * 60, 100);
                
                analysis[tf] = {
                    timeframe: tf,
                    period: period,
                    candles: candles,
                    trend: this.detectTrend(candles),
                    momentum: this.detectMomentum(candles),
                    volatility: this.detectVolatility(candles)
                };
            }
            
            const alignment = this.checkTimeframeAlignment(analysis);
            const recommendation = this.getMTFRecommendation(analysis, alignment);
            
            return {
                pair,
                analysis,
                alignment,
                recommendation,
                summary: this.getMTFSummary(analysis, alignment)
            };
        } catch (error) {
            logger.error(`Multi-timeframe analysis failed for ${pair}`, error);
            throw error;
        }
    }

    detectTrend(candles) {
        try {
            if (!candles || candles.length < 20) {
                return 'UNKNOWN';
            }
            
            const recent = candles.slice(-20);
            const firstPrice = recent[0].close;
            const lastPrice = recent[recent.length - 1].close;
            const priceChange = (lastPrice - firstPrice) / firstPrice;
            
            // Simple trend detection based on price movement
            if (priceChange > 0.01) {
                return 'UPTREND';
            } else if (priceChange < -0.01) {
                return 'DOWNTREND';
            } else {
                return 'SIDEWAYS';
            }
        } catch (error) {
            logger.error('Trend detection failed', error);
            return 'UNKNOWN';
        }
    }

    detectMomentum(candles) {
        try {
            if (!candles || candles.length < 10) {
                return 'UNKNOWN';
            }
            
            const recent = candles.slice(-10);
            const changes = [];
            
            for (let i = 1; i < recent.length; i++) {
                const change = (recent[i].close - recent[i-1].close) / recent[i-1].close;
                changes.push(change);
            }
            
            const avgChange = changes.reduce((sum, change) => sum + change, 0) / changes.length;
            
            if (avgChange > 0.001) {
                return 'BULLISH';
            } else if (avgChange < -0.001) {
                return 'BEARISH';
            } else {
                return 'NEUTRAL';
            }
        } catch (error) {
            logger.error('Momentum detection failed', error);
            return 'UNKNOWN';
        }
    }

    detectVolatility(candles) {
        try {
            if (!candles || candles.length < 10) {
                return 'UNKNOWN';
            }
            
            const recent = candles.slice(-10);
            const ranges = recent.map(candle => 
                (candle.high - candle.low) / candle.close
            );
            
            const avgRange = ranges.reduce((sum, range) => sum + range, 0) / ranges.length;
            
            if (avgRange > 0.02) {
                return 'HIGH';
            } else if (avgRange < 0.005) {
                return 'LOW';
            } else {
                return 'NORMAL';
            }
        } catch (error) {
            logger.error('Volatility detection failed', error);
            return 'UNKNOWN';
        }
    }

    checkTimeframeAlignment(analysis) {
        try {
            const trends = {};
            const momentums = {};
            
            // Count trends and momentums across timeframes
            for (const [tf, data] of Object.entries(analysis)) {
                trends[data.trend] = (trends[data.trend] || 0) + 1;
                momentums[data.momentum] = (momentums[data.momentum] || 0) + 1;
            }
            
            const totalTf = Object.keys(analysis).length;
            
            // Find dominant trend and momentum
            const dominantTrend = Object.entries(trends)
                .sort(([,a], [,b]) => b - a)[0] || ['UNKNOWN', 0];
            
            const dominantMomentum = Object.entries(momentums)
                .sort(([,a], [,b]) => b - a)[0] || ['UNKNOWN', 0];
            
            const trendAlignment = dominantTrend[1] / totalTf;
            const momentumAlignment = dominantMomentum[1] / totalTf;
            
            return {
                trend: {
                    dominant: dominantTrend[0],
                    count: dominantTrend[1],
                    alignment: trendAlignment,
                    aligned: trendAlignment >= this.alignmentThreshold
                },
                momentum: {
                    dominant: dominantMomentum[0],
                    count: dominantMomentum[1],
                    alignment: momentumAlignment,
                    aligned: momentumAlignment >= this.alignmentThreshold
                },
                overall: {
                    aligned: (trendAlignment >= this.alignmentThreshold && 
                              momentumAlignment >= this.alignmentThreshold),
                    score: (trendAlignment + momentumAlignment) / 2
                }
            };
        } catch (error) {
            logger.error('Timeframe alignment check failed', error);
            return { trend: { aligned: false }, momentum: { aligned: false }, overall: { aligned: false } };
        }
    }

    getMTFRecommendation(analysis, alignment) {
        try {
            let recommendation = 'HOLD';
            let confidence = 0;
            let reasons = [];
            
            // Check for strong alignment
            if (alignment.overall.aligned) {
                if (alignment.trend.dominant === 'UPTREND' && 
                    alignment.momentum.dominant === 'BULLISH') {
                    recommendation = 'BUY';
                    confidence = alignment.overall.score * 100;
                    reasons.push(`Strong uptrend alignment across ${alignment.trend.count} timeframes`);
                } else if (alignment.trend.dominant === 'DOWNTREND' && 
                          alignment.momentum.dominant === 'BEARISH') {
                    recommendation = 'SELL';
                    confidence = alignment.overall.score * 100;
                    reasons.push(`Strong downtrend alignment across ${alignment.trend.count} timeframes`);
                } else {
                    recommendation = 'HOLD';
                    reasons.push('Mixed signals - hold position');
                }
            } else {
                // Check for conflicting signals
                const hasConflict = this.detectConflict(analysis);
                if (hasConflict.conflict) {
                    recommendation = 'AVOID';
                    confidence = 20;
                    reasons = hasConflict.reasons;
                } else {
                    recommendation = 'HOLD';
                    reasons.push('Insufficient alignment for entry');
                }
            }
            
            // Adjust confidence based on higher timeframe confirmation
            const h1Data = analysis.H1;
            if (h1Data) {
                if ((recommendation === 'BUY' && h1Data.trend === 'UPTREND') ||
                    (recommendation === 'SELL' && h1Data.trend === 'DOWNTREND')) {
                    confidence = Math.min(100, confidence + 20);
                    reasons.push('Higher timeframe (H1) confirmation');
                } else if (h1Data.trend === 'SIDEWAYS') {
                    confidence = Math.max(0, confidence - 30);
                    reasons.push('Higher timeframe shows sideways - reduced confidence');
                }
            }
            
            return {
                recommendation,
                confidence: Math.max(0, Math.min(100, confidence)),
                reasons,
                alignmentScore: alignment.overall.score
            };
        } catch (error) {
            logger.error('MTF recommendation failed', error);
            return { recommendation: 'HOLD', confidence: 0, reasons: ['Analysis error'] };
        }
    }

    detectConflict(analysis) {
        try {
            const conflicts = [];
            
            // Check for trend conflicts between timeframes
            const trends = Object.entries(analysis).map(([tf, data]) => ({
                timeframe: tf,
                trend: data.trend
            }));
            
            const uptrends = trends.filter(t => t.trend === 'UPTREND').length;
            const downtrends = trends.filter(t => t.trend === 'DOWNTREND').length;
            
            if (uptrends > 0 && downtrends > 0) {
                conflicts.push(`Trend conflict: ${uptrends} uptrends vs ${downtrends} downtrends`);
            }
            
            // Check for momentum conflicts
            const momentums = Object.entries(analysis).map(([tf, data]) => ({
                timeframe: tf,
                momentum: data.momentum
            }));
            
            const bullish = momentums.filter(m => m.momentum === 'BULLISH').length;
            const bearish = momentums.filter(m => m.momentum === 'BEARISH').length;
            
            if (bullish > 0 && bearish > 0) {
                conflicts.push(`Momentum conflict: ${bullish} bullish vs ${bearish} bearish`);
            }
            
            // Check for extreme volatility differences
            const volatilities = Object.entries(analysis).map(([tf, data]) => data.volatility);
            const hasHighVol = volatilities.includes('HIGH');
            const hasLowVol = volatilities.includes('LOW');
            
            if (hasHighVol && hasLowVol) {
                conflicts.push('Volatility inconsistency across timeframes');
            }
            
            return {
                conflict: conflicts.length > 0,
                reasons: conflicts
            };
        } catch (error) {
            logger.error('Conflict detection failed', error);
            return { conflict: false, reasons: [] };
        }
    }

    getMTFSummary(analysis, alignment) {
        try {
            const summary = {
                timeframesAnalyzed: Object.keys(analysis).length,
                dominantTrend: alignment.trend.dominant,
                dominantMomentum: alignment.momentum.dominant,
                alignmentScore: alignment.overall.score,
                trendAlignment: alignment.trend.alignment,
                momentumAlignment: alignment.momentum.alignment,
                timeframeDetails: {}
            };
            
            // Add specific timeframe details
            for (const [tf, data] of Object.entries(analysis)) {
                summary.timeframeDetails[tf] = {
                    trend: data.trend,
                    momentum: data.momentum,
                    volatility: data.volatility
                };
            }
            
            return summary;
        } catch (error) {
            logger.error('MTF summary generation failed', error);
            return null;
        }
    }

    shouldAllowEntry(mtfAnalysis, entryDirection = null) {
        try {
            if (!mtfAnalysis || !mtfAnalysis.alignment) {
                return { allow: false, reason: 'No MTF analysis available' };
            }
            
            const { alignment, recommendation } = mtfAnalysis;
            
            // Check for overall alignment
            if (!alignment.overall.aligned) {
                return { 
                    allow: false, 
                    reason: 'Insufficient timeframe alignment',
                    score: alignment.overall.score
                };
            }
            
            // Check if recommendation matches entry direction
            if (entryDirection) {
                const directionMatches = 
                    (entryDirection === 'CALL' && recommendation.recommendation === 'BUY') ||
                    (entryDirection === 'PUT' && recommendation.recommendation === 'SELL');
                
                if (!directionMatches) {
                    return { 
                        allow: false, 
                        reason: `MTF recommendation (${recommendation.recommendation}) doesn't match entry direction (${entryDirection})`,
                        score: alignment.overall.score
                    };
                }
            }
            
            // Check confidence threshold
            if (recommendation.confidence < 60) {
                return { 
                    allow: false, 
                    reason: `Low MTF confidence: ${recommendation.confidence}%`,
                    score: alignment.overall.score
                };
            }
            
            return { 
                allow: true, 
                reason: recommendation.reasons.join(', '),
                score: alignment.overall.score,
                confidence: recommendation.confidence
            };
        } catch (error) {
            logger.error('MTF entry check failed', error);
            return { allow: false, reason: 'MTF filter error' };
        }
    }

    setAlignmentThreshold(threshold) {
        try {
            if (threshold >= 0 && threshold <= 1) {
                this.alignmentThreshold = threshold;
                logger.info(`MTF alignment threshold set to ${threshold}`);
            } else {
                throw new Error('Threshold must be between 0 and 1');
            }
        } catch (error) {
            logger.error('Failed to set alignment threshold', error);
        }
    }
}

module.exports = new MTFFilter();
