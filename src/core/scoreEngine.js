const logger = require('../utils/logger');

class ScoreEngine {
    constructor() {
        this.name = 'ScoreEngine';
        this.weights = {
            rsi: 1,
            macd: 1,
            bollingerBands: 1,
            trend: 1,
            strategy: 2,
            marketCondition: 1.5
        };
        this.threshold = 5.5; // Minimum score to enter trade (reduced from 7 to reduce over-filtering)
    }

    calculateScore(indicators, marketCondition, strategyAnalysis) {
        try {
            const scores = {
                rsi: 0,
                macd: 0,
                bollingerBands: 0,
                trend: 0,
                strategy: 0,
                marketCondition: 0
            };

            // Calculate individual indicator scores
            if (indicators.rsi) {
                scores.rsi = indicators.rsi.getScore();
            }

            if (indicators.macd) {
                scores.macd = indicators.macd.getScore();
            }

            if (indicators.bollingerBands) {
                scores.bollingerBands = indicators.bollingerBands.getScore();
            }

            if (indicators.movingAverages) {
                scores.trend = indicators.movingAverages.getScore(
                    indicators.movingAverages.currentPrice,
                    indicators.movingAverages.ema50.current,
                    indicators.movingAverages.ema200.current
                );
            }

            // Strategy confidence score
            if (strategyAnalysis && strategyAnalysis.recommended) {
                scores.strategy = (strategyAnalysis.confidence / 100) * 2; // Scale to 0-2
            }

            // Market condition score
            if (marketCondition) {
                scores.marketCondition = this.getMarketConditionScore(marketCondition);
            }

            // Calculate weighted total score
            const totalScore = this.calculateWeightedScore(scores);
            
            const result = {
                individualScores: scores,
                totalScore: totalScore,
                weightedScore: totalScore,
                passesThreshold: totalScore >= this.threshold,
                recommendation: this.getRecommendation(totalScore, strategyAnalysis),
                confidence: this.calculateConfidence(totalScore, strategyAnalysis)
            };

            logger.debug('Score calculation completed', result);
            return result;
        } catch (error) {
            logger.error('Score calculation failed', error);
            throw error;
        }
    }

    calculateWeightedScore(scores) {
        try {
            let weightedScore = 0;
            
            // Apply weights to each score
            weightedScore += scores.rsi * this.weights.rsi;
            weightedScore += scores.macd * this.weights.macd;
            weightedScore += scores.bollingerBands * this.weights.bollingerBands;
            weightedScore += scores.trend * this.weights.trend;
            weightedScore += scores.strategy * this.weights.strategy;
            weightedScore += scores.marketCondition * this.weights.marketCondition;
            
            return Math.round(weightedScore * 10) / 10; // Round to 1 decimal place
        } catch (error) {
            logger.error('Weighted score calculation failed', error);
            return 0;
        }
    }

    getMarketConditionScore(marketCondition) {
        try {
            let score = 0;
            
            // Trend strength scoring
            if (marketCondition.trend.includes('STRONG')) {
                score += 1;
            } else if (marketCondition.trend.includes('WEAK')) {
                score += 0.5;
            }
            
            // Volatility scoring
            if (marketCondition.volatility === 'NORMAL') {
                score += 0.5;
            } else if (marketCondition.volatility === 'HIGH') {
                score += 0.3;
            }
            
            // Momentum scoring
            if (marketCondition.momentum.includes('STRONG')) {
                score += 0.5;
            } else if (marketCondition.momentum === 'BULLISH' || marketCondition.momentum === 'BEARISH') {
                score += 0.3;
            }
            
            // Overall condition bonus
            if (marketCondition.overall.includes('TRENDING')) {
                score += 0.5;
            } else if (marketCondition.overall === 'BREAKOUT') {
                score += 0.7;
            } else if (marketCondition.overall === 'SIDEWAYS') {
                score += 0.2;
            }
            
            return Math.min(1.5, score); // Cap at 1.5
        } catch (error) {
            logger.error('Market condition scoring failed', error);
            return 0;
        }
    }

    getRecommendation(totalScore, strategyAnalysis) {
        try {
            if (totalScore >= 4.5) {
                return 'STRONG_BUY';
            } else if (totalScore >= 3.5) {
                return 'BUY';
            } else if (totalScore >= this.threshold) {
                return 'WEAK_BUY';
            } else if (totalScore >= 2) {
                return 'HOLD';
            } else {
                return 'NO_TRADE';
            }
        } catch (error) {
            logger.error('Recommendation generation failed', error);
            return 'NO_TRADE';
        }
    }

    calculateConfidence(totalScore, strategyAnalysis) {
        try {
            let confidence = (totalScore / 5) * 100; // Base confidence from score
            
            // Adjust based on strategy confidence
            if (strategyAnalysis && strategyAnalysis.confidence) {
                confidence = (confidence + strategyAnalysis.confidence) / 2;
            }
            
            // Boost confidence for high scores
            if (totalScore >= 4) {
                confidence += 10;
            } else if (totalScore <= 2) {
                confidence -= 20;
            }
            
            return Math.max(0, Math.min(100, confidence));
        } catch (error) {
            logger.error('Confidence calculation failed', error);
            return 0;
        }
    }

    updateWeights(newWeights) {
        try {
            this.weights = { ...this.weights, ...newWeights };
            logger.info('Score weights updated', this.weights);
        } catch (error) {
            logger.error('Weight update failed', error);
        }
    }

    setThreshold(newThreshold) {
        try {
            if (newThreshold >= 0 && newThreshold <= 5) {
                this.threshold = newThreshold;
                logger.info(`Score threshold updated to ${this.threshold}`);
            } else {
                throw new Error('Threshold must be between 0 and 5');
            }
        } catch (error) {
            logger.error('Threshold update failed', error);
        }
    }

    getScoreBreakdown(scoreResult) {
        try {
            const breakdown = {
                totalScore: scoreResult.totalScore,
                threshold: this.threshold,
                passesThreshold: scoreResult.passesThreshold,
                components: []
            };

            // Add individual components with weights
            for (const [component, score] of Object.entries(scoreResult.individualScores)) {
                const weight = this.weights[component] || 1;
                const weightedScore = score * weight;
                
                breakdown.components.push({
                    name: component,
                    score: score,
                    weight: weight,
                    weightedScore: weightedScore,
                    percentage: (weightedScore / scoreResult.weightedScore * 100).toFixed(1)
                });
            }

            // Sort by contribution
            breakdown.components.sort((a, b) => b.weightedScore - a.weightedScore);

            return breakdown;
        } catch (error) {
            logger.error('Score breakdown generation failed', error);
            return null;
        }
    }

    validateScore(scoreResult) {
        try {
            const issues = [];
            
            // Check for missing components
            const requiredComponents = ['rsi', 'macd', 'bollingerBands', 'trend'];
            for (const component of requiredComponents) {
                if (scoreResult.individualScores[component] === undefined) {
                    issues.push(`Missing ${component} score`);
                }
            }
            
            // Check for zero scores (potential data issues)
            for (const [component, score] of Object.entries(scoreResult.individualScores)) {
                if (score === 0 && component !== 'strategy') {
                    issues.push(`${component} score is zero`);
                }
            }
            
            // Check threshold logic
            if (scoreResult.passesThreshold && scoreResult.totalScore < this.threshold) {
                issues.push('Threshold logic inconsistency');
            }
            
            return {
                isValid: issues.length === 0,
                issues: issues
            };
        } catch (error) {
            logger.error('Score validation failed', error);
            return { isValid: false, issues: ['Validation error'] };
        }
    }
}

module.exports = ScoreEngine;
