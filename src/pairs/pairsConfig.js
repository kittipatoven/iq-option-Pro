const logger = require('../utils/logger');

class PairsConfig {
    constructor() {
        this.name = 'PairsConfig';
        this.availablePairs = {
            // Major pairs
            'EURUSD': {
                name: 'EUR/USD',
                category: 'MAJOR',
                active: true,
                priority: 1,
                sessions: ['LONDON', 'NEW_YORK'],
                volatility: 'MEDIUM',
                spread: 1.0,
                description: 'Euro vs US Dollar'
            },
            'GBPUSD': {
                name: 'GBP/USD',
                category: 'MAJOR',
                active: true,
                priority: 2,
                sessions: ['LONDON', 'NEW_YORK'],
                volatility: 'HIGH',
                spread: 1.5,
                description: 'British Pound vs US Dollar'
            },
            'USDJPY': {
                name: 'USD/JPY',
                category: 'MAJOR',
                active: true,
                priority: 3,
                sessions: ['TOKYO', 'NEW_YORK'],
                volatility: 'MEDIUM',
                spread: 0.8,
                description: 'US Dollar vs Japanese Yen'
            },
            'AUDUSD': {
                name: 'AUD/USD',
                category: 'MAJOR',
                active: true,
                priority: 4,
                sessions: ['SYDNEY', 'TOKYO', 'NEW_YORK'],
                volatility: 'MEDIUM',
                spread: 1.2,
                description: 'Australian Dollar vs US Dollar'
            },
            
            // Cross pairs
            'EURGBP': {
                name: 'EUR/GBP',
                category: 'CROSS',
                active: false,
                priority: 5,
                sessions: ['LONDON'],
                volatility: 'LOW',
                spread: 2.0,
                description: 'Euro vs British Pound'
            },
            'EURJPY': {
                name: 'EUR/JPY',
                category: 'CROSS',
                active: false,
                priority: 6,
                sessions: ['TOKYO', 'LONDON'],
                volatility: 'HIGH',
                spread: 2.5,
                description: 'Euro vs Japanese Yen'
            },
            'GBPJPY': {
                name: 'GBP/JPY',
                category: 'CROSS',
                active: false,
                priority: 7,
                sessions: ['TOKYO', 'LONDON'],
                volatility: 'VERY_HIGH',
                spread: 3.0,
                description: 'British Pound vs Japanese Yen'
            },
            
            // Commodity pairs
            'USDCAD': {
                name: 'USD/CAD',
                category: 'COMMODITY',
                active: false,
                priority: 8,
                sessions: ['NEW_YORK'],
                volatility: 'MEDIUM',
                spread: 1.8,
                description: 'US Dollar vs Canadian Dollar'
            },
            'NZDUSD': {
                name: 'NZD/USD',
                category: 'COMMODITY',
                active: false,
                priority: 9,
                sessions: ['SYDNEY', 'NEW_YORK'],
                volatility: 'MEDIUM',
                spread: 2.2,
                description: 'New Zealand Dollar vs US Dollar'
            }
        };
        
        this.pairSettings = {
            defaultTimeframe: 60, // 1 minute
            analysisDepth: 100,    // Number of candles for analysis
            maxConcurrentTrades: 1, // Max trades per pair
            cooldownPeriod: 300000, // 5 minutes between trades
            minScoreThreshold: 3.0,
            minConfidenceThreshold: 60
        };
    }

    getActivePairs() {
        try {
            return Object.entries(this.availablePairs)
                .filter(([pair, config]) => config.active)
                .sort(([,a], [,b]) => a.priority - b.priority)
                .map(([pair, config]) => ({
                    pair,
                    ...config
                }));
        } catch (error) {
            logger.error('Failed to get active pairs', error);
            return [];
        }
    }

    getPairsByCategory(category) {
        try {
            return Object.entries(this.availablePairs)
                .filter(([pair, config]) => config.category === category && config.active)
                .sort(([,a], [,b]) => a.priority - b.priority)
                .map(([pair, config]) => ({
                    pair,
                    ...config
                }));
        } catch (error) {
            logger.error(`Failed to get pairs by category ${category}`, error);
            return [];
        }
    }

    getPairsBySession(session) {
        try {
            return Object.entries(this.availablePairs)
                .filter(([pair, config]) => config.active && config.sessions.includes(session))
                .sort(([,a], [,b]) => a.priority - b.priority)
                .map(([pair, config]) => ({
                    pair,
                    ...config
                }));
        } catch (error) {
            logger.error(`Failed to get pairs by session ${session}`, error);
            return [];
        }
    }

    getPairConfig(pair) {
        try {
            const config = this.availablePairs[pair];
            if (!config) {
                logger.warn(`Pair ${pair} not found in configuration`);
                return null;
            }
            return {
                pair,
                ...config
            };
        } catch (error) {
            logger.error(`Failed to get config for pair ${pair}`, error);
            return null;
        }
    }

    activatePair(pair) {
        try {
            if (this.availablePairs[pair]) {
                this.availablePairs[pair].active = true;
                logger.info(`Pair ${pair} activated`);
                return true;
            } else {
                logger.warn(`Pair ${pair} not found`);
                return false;
            }
        } catch (error) {
            logger.error(`Failed to activate pair ${pair}`, error);
            return false;
        }
    }

    deactivatePair(pair) {
        try {
            if (this.availablePairs[pair]) {
                this.availablePairs[pair].active = false;
                logger.info(`Pair ${pair} deactivated`);
                return true;
            } else {
                logger.warn(`Pair ${pair} not found`);
                return false;
            }
        } catch (error) {
            logger.error(`Failed to deactivate pair ${pair}`, error);
            return false;
        }
    }

    updatePairConfig(pair, updates) {
        try {
            if (this.availablePairs[pair]) {
                this.availablePairs[pair] = { ...this.availablePairs[pair], ...updates };
                logger.info(`Pair ${pair} configuration updated`, updates);
                return true;
            } else {
                logger.warn(`Pair ${pair} not found`);
                return false;
            }
        } catch (error) {
            logger.error(`Failed to update config for pair ${pair}`, error);
            return false;
        }
    }

    addCustomPair(pair, config) {
        try {
            if (this.availablePairs[pair]) {
                logger.warn(`Pair ${pair} already exists, updating instead`);
                return this.updatePairConfig(pair, config);
            }
            
            const defaultConfig = {
                name: pair,
                category: 'CUSTOM',
                active: true,
                priority: 999,
                sessions: ['NEW_YORK'],
                volatility: 'MEDIUM',
                spread: 2.0,
                description: `Custom pair ${pair}`
            };
            
            this.availablePairs[pair] = { ...defaultConfig, ...config };
            logger.info(`Custom pair ${pair} added`);
            return true;
        } catch (error) {
            logger.error(`Failed to add custom pair ${pair}`, error);
            return false;
        }
    }

    removePair(pair) {
        try {
            if (this.availablePairs[pair]) {
                delete this.availablePairs[pair];
                logger.info(`Pair ${pair} removed`);
                return true;
            } else {
                logger.warn(`Pair ${pair} not found`);
                return false;
            }
        } catch (error) {
            logger.error(`Failed to remove pair ${pair}`, error);
            return false;
        }
    }

    getOptimalPairs(currentSession, maxPairs = 4) {
        try {
            // Get pairs that are active and match current session
            const sessionPairs = this.getPairsBySession(currentSession);
            
            // Sort by priority and volatility (prefer medium volatility for stability)
            const sortedPairs = sessionPairs.sort((a, b) => {
                // Priority first
                if (a.priority !== b.priority) {
                    return a.priority - b.priority;
                }
                
                // Then volatility preference
                const volatilityOrder = { 'MEDIUM': 0, 'LOW': 1, 'HIGH': 2, 'VERY_HIGH': 3 };
                const aVolScore = volatilityOrder[a.volatility] || 999;
                const bVolScore = volatilityOrder[b.volatility] || 999;
                
                return aVolScore - bVolScore;
            });
            
            return sortedPairs.slice(0, maxPairs);
        } catch (error) {
            logger.error('Failed to get optimal pairs', error);
            return [];
        }
    }

    validatePairSettings() {
        try {
            const issues = [];
            
            for (const [pair, config] of Object.entries(this.availablePairs)) {
                // Check required fields
                const requiredFields = ['name', 'category', 'active', 'priority', 'sessions', 'volatility', 'spread'];
                for (const field of requiredFields) {
                    if (config[field] === undefined) {
                        issues.push(`Pair ${pair}: Missing field ${field}`);
                    }
                }
                
                // Check priority range
                if (config.priority < 1 || config.priority > 999) {
                    issues.push(`Pair ${pair}: Invalid priority ${config.priority}`);
                }
                
                // Check spread
                if (config.spread < 0) {
                    issues.push(`Pair ${pair}: Invalid spread ${config.spread}`);
                }
                
                // Check sessions
                if (!Array.isArray(config.sessions) || config.sessions.length === 0) {
                    issues.push(`Pair ${pair}: Invalid sessions`);
                }
            }
            
            return {
                valid: issues.length === 0,
                issues
            };
        } catch (error) {
            logger.error('Pair settings validation failed', error);
            return { valid: false, issues: ['Validation error'] };
        }
    }

    getPairsSummary() {
        try {
            const summary = {
                totalPairs: Object.keys(this.availablePairs).length,
                activePairs: Object.values(this.availablePairs).filter(p => p.active).length,
                categories: {},
                volatilities: {},
                averageSpread: 0
            };
            
            let totalSpread = 0;
            
            for (const config of Object.values(this.availablePairs)) {
                // Count categories
                summary.categories[config.category] = (summary.categories[config.category] || 0) + 1;
                
                // Count volatilities
                summary.volatilities[config.volatility] = (summary.volatilities[config.volatility] || 0) + 1;
                
                // Sum spreads
                totalSpread += config.spread;
            }
            
            summary.averageSpread = totalSpread / summary.totalPairs;
            
            return summary;
        } catch (error) {
            logger.error('Pairs summary generation failed', error);
            return null;
        }
    }

    updatePairSettings(newSettings) {
        try {
            this.pairSettings = { ...this.pairSettings, ...newSettings };
            logger.info('Pair settings updated', this.pairSettings);
        } catch (error) {
            logger.error('Failed to update pair settings', error);
        }
    }

    getPairSettings() {
        return { ...this.pairSettings };
    }

    exportConfig() {
        try {
            return {
                pairs: this.availablePairs,
                settings: this.pairSettings,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            logger.error('Config export failed', error);
            return null;
        }
    }

    importConfig(config) {
        try {
            if (config.pairs) {
                this.availablePairs = { ...this.availablePairs, ...config.pairs };
            }
            
            if (config.settings) {
                this.pairSettings = { ...this.pairSettings, ...config.settings };
            }
            
            logger.info('Configuration imported successfully');
            return true;
        } catch (error) {
            logger.error('Config import failed', error);
            return false;
        }
    }
}

module.exports = new PairsConfig();
