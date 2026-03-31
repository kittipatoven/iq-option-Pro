/**
 * Transformer Price Prediction Engine
 * Lightweight transformer model for price prediction
 */

const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');

class TransformerPrediction {
    constructor() {
        this.name = 'TransformerPrediction';
        
        // ═══════════════════════════════════════════════════════════════
        // 🧠 TRANSFORMER CONFIGURATION
        // ═══════════════════════════════════════════════════════════════
        this.config = {
            sequenceLength: 50,     // Input sequence length
            dModel: 32,             // Model dimension
            numHeads: 4,            // Attention heads
            numLayers: 2,           // Transformer layers
            dropout: 0.1,
            
            // Prediction thresholds
            confidenceThreshold: 0.7,
            directionThreshold: 0.65,
            
            // Feature weights
            weights: {
                price: 0.25,
                volume: 0.15,
                rsi: 0.20,
                macd: 0.15,
                bbPosition: 0.10,
                tickMomentum: 0.10,
                orderFlowDelta: 0.05
            }
        };
        
        // ═══════════════════════════════════════════════════════════════
        // 📊 MODEL WEIGHTS (Simulated Transformer)
        // ═══════════════════════════════════════════════════════════════
        this.weights = {
            // Attention weights (learned)
            attention: {
                W_q: this.initializeMatrix(this.config.dModel, this.config.dModel),
                W_k: this.initializeMatrix(this.config.dModel, this.config.dModel),
                W_v: this.initializeMatrix(this.config.dModel, this.config.dModel),
                W_o: this.initializeMatrix(this.config.dModel, this.config.dModel)
            },
            // Feed-forward weights
            ffn: {
                W1: this.initializeMatrix(this.config.dModel, this.config.dModel * 2),
                W2: this.initializeMatrix(this.config.dModel * 2, this.config.dModel)
            },
            // Output layer
            output: {
                W: this.initializeMatrix(this.config.dModel, 2),  // UP, DOWN
                b: [0, 0]
            }
        };
        
        // ═══════════════════════════════════════════════════════════════
        // 📈 PREDICTION HISTORY
        // ═══════════════════════════════════════════════════════════════
        this.predictionHistory = [];
        this.maxHistory = 100;
        
        // ═══════════════════════════════════════════════════════════════
        // 🎯 PERFORMANCE TRACKING
        // ═══════════════════════════════════════════════════════════════
        this.performance = {
            totalPredictions: 0,
            correctPredictions: 0,
            accuracy: 0,
            avgConfidence: 0,
            recentErrors: []
        };
        
        // Sequence buffer
        this.sequenceBuffer = new Map();  // pair -> Array of features
        
        // Load previous weights
        this.loadFromDisk();
    }
    
    /**
     * Initialize matrix with small random values
     */
    initializeMatrix(rows, cols) {
        const matrix = [];
        for (let i = 0; i < rows; i++) {
            const row = [];
            for (let j = 0; j < cols; j++) {
                // Xavier initialization
                row.push((Math.random() - 0.5) * Math.sqrt(2.0 / (rows + cols)));
            }
            matrix.push(row);
        }
        return matrix;
    }
    
    /**
     * ═══════════════════════════════════════════════════════════════
     * 🎯 FEATURE EXTRACTION
     * ═══════════════════════════════════════════════════════════════
     */
    extractFeatures(candles, indicators, orderFlow) {
        if (!candles || candles.length < 10) return null;
        
        const recent = candles.slice(-10);
        
        // Price features
        const closePrices = recent.map(c => c.close);
        const volumes = recent.map(c => c.volume || 1);
        
        // Technical indicators
        const rsi = indicators?.rsi || 50;
        const macd = this.calculateMACD(closePrices);
        const bbPosition = this.calculateBBPosition(candles);
        
        // Tick momentum
        const tickMomentum = indicators?.tickMomentum?.strength || 0;
        
        // Order flow delta
        const orderFlowDelta = orderFlow?.delta || 0;
        
        return {
            prices: closePrices,
            volume: volumes[volumes.length - 1],
            rsi,
            macd,
            bbPosition,
            tickMomentum,
            orderFlowDelta
        };
    }
    
    /**
     * Calculate MACD
     */
    calculateMACD(prices) {
        if (prices.length < 26) return { macd: 0, signal: 0, histogram: 0 };
        
        const ema12 = this.calculateEMA(prices, 12);
        const ema26 = this.calculateEMA(prices, 26);
        const macdLine = ema12 - ema26;
        const signalLine = this.calculateEMA([macdLine], 9);
        
        return {
            macd: macdLine,
            signal: signalLine,
            histogram: macdLine - signalLine
        };
    }
    
    /**
     * Calculate EMA
     */
    calculateEMA(values, period) {
        if (values.length === 0) return 0;
        const k = 2 / (period + 1);
        let ema = values[0];
        for (let i = 1; i < values.length; i++) {
            ema = values[i] * k + ema * (1 - k);
        }
        return ema;
    }
    
    /**
     * Calculate Bollinger Band position (0-1)
     */
    calculateBBPosition(candles) {
        if (candles.length < 20) return 0.5;
        
        const prices = candles.slice(-20).map(c => c.close);
        const sma = prices.reduce((a, b) => a + b, 0) / prices.length;
        
        const squaredDiffs = prices.map(p => Math.pow(p - sma, 2));
        const stdDev = Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / prices.length);
        
        const upper = sma + (stdDev * 2);
        const lower = sma - (stdDev * 2);
        const current = candles[candles.length - 1].close;
        
        // Normalize to 0-1 range
        return Math.max(0, Math.min(1, (current - lower) / (upper - lower)));
    }
    
    /**
     * ═══════════════════════════════════════════════════════════════
     * 🔮 TRANSFORMER FORWARD PASS (Simplified)
     * ═══════════════════════════════════════════════════════════════
     */
    predict({ candles, pair, currentPrice, tickData, orderFlow }) {
        // Extract features
        const features = this.extractFeatures(candles, tickData?.[0], orderFlow);
        if (!features) {
            return {
                direction: 'NEUTRAL',
                confidence: 0,
                directionProb: { UP: 0.5, DOWN: 0.5 },
                shouldTrade: false,
                nextPrice: currentPrice,
                positionSize: 0
            };
        }
        
        // Update sequence buffer
        this.updateSequenceBuffer(pair, features);
        
        // Get sequence for this pair
        const sequence = this.sequenceBuffer.get(pair);
        if (!sequence || sequence.length < this.config.sequenceLength / 2) {
            return {
                direction: 'NEUTRAL',
                confidence: 0,
                directionProb: { UP: 0.5, DOWN: 0.5 },
                shouldTrade: false,
                nextPrice: currentPrice,
                positionSize: 0,
                reason: 'Insufficient sequence data'
            };
        }
        
        // Compute weighted features
        const weightedFeatures = this.computeWeightedFeatures(sequence);
        
        // Simplified transformer attention mechanism
        const attentionOutput = this.multiHeadAttention(weightedFeatures);
        
        // Feed-forward network
        const ffnOutput = this.feedForward(attentionOutput);
        
        // Output projection
        const logits = this.projectOutput(ffnOutput);
        
        // Softmax for probabilities
        const probs = this.softmax(logits);
        
        // Calculate confidence
        const upProb = probs[0];
        const downProb = probs[1];
        const confidence = Math.abs(upProb - downProb);
        const maxProb = Math.max(upProb, downProb);
        
        // Determine direction
        let direction = 'NEUTRAL';
        if (upProb > downProb && upProb > this.config.directionThreshold) {
            direction = 'UP';
        } else if (downProb > upProb && downProb > this.config.directionThreshold) {
            direction = 'DOWN';
        }
        
        // Predict next price
        const priceChange = (upProb - downProb) * 0.001 * currentPrice;
        const nextPrice = currentPrice + priceChange;
        
        // Calculate position size based on confidence
        const positionSize = confidence > this.config.confidenceThreshold 
            ? Math.min(1, confidence)
            : 0;
        
        // Should we trade?
        const shouldTrade = direction !== 'NEUTRAL' && 
                          confidence >= this.config.confidenceThreshold;
        
        // Store prediction
        const prediction = {
            direction,
            confidence: confidence * 10,  // Scale to 0-10
            directionProb: { UP: upProb, DOWN: downProb },
            shouldTrade,
            nextPrice,
            positionSize,
            features: {
                rsi: features.rsi,
                macd: features.macd.histogram,
                bbPosition: features.bbPosition,
                tickMomentum: features.tickMomentum,
                orderFlowDelta: features.orderFlowDelta
            },
            timestamp: Date.now()
        };
        
        this.recordPrediction(pair, prediction);
        
        return prediction;
    }
    
    /**
     * Update sequence buffer for a pair
     */
    updateSequenceBuffer(pair, features) {
        if (!this.sequenceBuffer.has(pair)) {
            this.sequenceBuffer.set(pair, []);
        }
        
        const buffer = this.sequenceBuffer.get(pair);
        
        // Normalize features to vector
        const featureVector = [
            features.prices[features.prices.length - 1] / 1000,  // Normalized price
            features.volume / 1000,  // Normalized volume
            features.rsi / 100,  // Normalized RSI
            (features.macd.histogram + 1) / 2,  // Normalize MACD to 0-1
            features.bbPosition,
            features.tickMomentum,
            (features.orderFlowDelta + 1) / 2  // Normalize to 0-1
        ];
        
        buffer.push(featureVector);
        
        // Keep only last N sequences
        if (buffer.length > this.config.sequenceLength) {
            buffer.shift();
        }
    }
    
    /**
     * Compute weighted features
     */
    computeWeightedFeatures(sequence) {
        const weights = this.config.weights;
        const lastFeature = sequence[sequence.length - 1];
        
        // Apply weights
        return lastFeature.map((val, i) => {
            const weightKeys = Object.keys(weights);
            const weight = weights[weightKeys[i]] || 0.1;
            return val * weight;
        });
    }
    
    /**
     * Multi-head attention (simplified)
     */
    multiHeadAttention(features) {
        // Simplified attention: weighted sum of recent features
        const output = new Array(features.length).fill(0);
        
        for (let i = 0; i < features.length; i++) {
            let attentionScore = 0;
            
            // Self-attention: how much does this position attend to others
            for (let j = 0; j < features.length; j++) {
                const score = Math.abs(features[i] - features[j]);
                attentionScore += score;
            }
            
            // Normalize and apply
            output[i] = features[i] * (1 / (1 + attentionScore));
        }
        
        return output;
    }
    
    /**
     * Feed-forward network
     */
    feedForward(features) {
        // Simplified FFN: linear transformation with ReLU
        return features.map(x => Math.max(0, x * 1.5 + 0.1));
    }
    
    /**
     * Project to output space
     */
    projectOutput(features) {
        // Simple linear projection
        const sum = features.reduce((a, b) => a + b, 0);
        return [
            sum + this.weights.output.b[0],
            -sum + this.weights.output.b[1]
        ];
    }
    
    /**
     * Softmax function
     */
    softmax(logits) {
        const expScores = logits.map(x => Math.exp(x));
        const sumExp = expScores.reduce((a, b) => a + b, 0);
        return expScores.map(x => x / sumExp);
    }
    
    /**
     * Record prediction for tracking
     */
    recordPrediction(pair, prediction) {
        this.predictionHistory.push({
            pair,
            ...prediction,
            actualResult: null  // Will be updated later
        });
        
        // Maintain max size
        if (this.predictionHistory.length > this.maxHistory) {
            this.predictionHistory.shift();
        }
        
        // Update performance stats
        this.performance.totalPredictions++;
        this.performance.avgConfidence = 
            (this.performance.avgConfidence * (this.performance.totalPredictions - 1) + 
             prediction.confidence) / this.performance.totalPredictions;
    }
    
    /**
     * Update prediction with actual result
     */
    updatePredictionResult(pair, direction, result) {
        // Find pending prediction
        const pendingPred = this.predictionHistory.find(
            p => p.pair === pair && p.actualResult === null
        );
        
        if (!pendingPred) return;
        
        // Update result
        pendingPred.actualResult = result;
        
        // Check if prediction was correct
        const predictedUp = pendingPred.direction === 'UP';
        const predictedDown = pendingPred.direction === 'DOWN';
        const actualWin = result === 'win';
        
        // A prediction is "correct" if:
        // - Predicted UP and result was win (assuming CALL trade)
        // - Predicted DOWN and result was win (assuming PUT trade)
        const isCorrect = (predictedUp && actualWin) || (predictedDown && actualWin);
        
        if (isCorrect) {
            this.performance.correctPredictions++;
        } else {
            this.performance.recentErrors.push({
                predicted: pendingPred.direction,
                result,
                confidence: pendingPred.confidence,
                timestamp: Date.now()
            });
            
            // Keep only last 20 errors
            if (this.performance.recentErrors.length > 20) {
                this.performance.recentErrors.shift();
            }
        }
        
        // Update accuracy
        this.performance.accuracy = 
            this.performance.correctPredictions / this.performance.totalPredictions;
        
        // Train on result (update weights)
        this.train(pendingPred, result);
    }
    
    /**
     * Train model on result
     */
    train(prediction, result) {
        // Simplified gradient descent
        const learningRate = 0.01;
        
        // Calculate gradient (simplified)
        const targetProb = result === 'win' ? 1 : 0;
        const currentProb = prediction.direction === 'UP' 
            ? prediction.directionProb.UP 
            : prediction.directionProb.DOWN;
        
        const gradient = (currentProb - targetProb) * learningRate;
        
        // Update output bias (simplified backprop)
        if (prediction.direction === 'UP') {
            this.weights.output.b[0] -= gradient;
            this.weights.output.b[1] += gradient;
        } else {
            this.weights.output.b[0] += gradient;
            this.weights.output.b[1] -= gradient;
        }
        
        // Save periodically
        if (this.performance.totalPredictions % 10 === 0) {
            this.saveToDisk();
        }
    }
    
    /**
     * Get learning statistics
     */
    getLearningStats() {
        return {
            accuracy: (this.performance.accuracy * 100).toFixed(1) + '%',
            totalPredictions: this.performance.totalPredictions,
            correctPredictions: this.performance.correctPredictions,
            avgConfidence: this.performance.avgConfidence.toFixed(2),
            recentErrors: this.performance.recentErrors.length,
            sequenceBuffers: this.sequenceBuffer.size
        };
    }
    
    /**
     * Save model to disk
     */
    saveToDisk() {
        try {
            const data = {
                weights: this.weights,
                performance: this.performance,
                config: this.config,
                savedAt: new Date().toISOString()
            };
            
            const dataPath = path.join(__dirname, '../../data');
            if (!fs.existsSync(dataPath)) {
                fs.mkdirSync(dataPath, { recursive: true });
            }
            
            fs.writeFileSync(
                path.join(dataPath, 'transformer_model.json'),
                JSON.stringify(data, null, 2)
            );
        } catch (error) {
            logger.error('Failed to save transformer model:', error);
        }
    }
    
    /**
     * Load model from disk
     */
    loadFromDisk() {
        try {
            const filePath = path.join(__dirname, '../../data/transformer_model.json');
            
            if (!fs.existsSync(filePath)) {
                logger.info('No previous transformer model found, starting fresh');
                return;
            }
            
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            
            if (data.weights) this.weights = data.weights;
            if (data.performance) this.performance = { ...this.performance, ...data.performance };
            if (data.config) this.config = { ...this.config, ...data.config };
            
            console.log(`🔮 TRANSFORMER MODEL LOADED: ${this.performance.totalPredictions} predictions, ${(this.performance.accuracy * 100).toFixed(1)}% accuracy`);
            
        } catch (error) {
            logger.error('Failed to load transformer model:', error);
        }
    }
    
    /**
     * Generate prediction report
     */
    generateReport() {
        const stats = this.getLearningStats();
        
        console.log(`\n╔══════════════════════════════════════════════════════════╗`);
        console.log(`║          🔮 TRANSFORMER PREDICTION REPORT                  ║`);
        console.log(`╠══════════════════════════════════════════════════════════╣`);
        console.log(`║ Accuracy: ${stats.accuracy} (${stats.correctPredictions}/${stats.totalPredictions})`);
        console.log(`║ Avg Confidence: ${stats.avgConfidence}/10`);
        console.log(`║ Recent Errors: ${stats.recentErrors}`);
        console.log(`║ Active Pairs: ${stats.sequenceBuffers}`);
        console.log(`╚══════════════════════════════════════════════════════════╝\n`);
        
        return stats;
    }
}

module.exports = new TransformerPrediction();
