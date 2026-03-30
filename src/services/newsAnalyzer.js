const logger = require('../utils/logger');

/**
 * News Analyzer Service
 * Rule-based NLP for sentiment analysis, currency detection, and impact calculation
 * No paid APIs - uses keyword scoring
 */
class NewsAnalyzer {
    constructor() {
        // Positive keywords (bullish)
        this.positiveKeywords = [
            'growth', 'bullish', 'strong', 'increase', 'rise', 'up', 'surge', 'rally',
            'gain', 'positive', 'optimistic', 'boost', 'expand', 'improve', 'advance',
            'soar', 'jump', 'climb', 'hike', 'upgrade', 'outperform'
        ];

        // Negative keywords (bearish)
        this.negativeKeywords = [
            'crash', 'recession', 'bearish', 'decline', 'inflation', 'drop', 'fall',
            'down', 'plunge', 'tumble', 'slump', 'weak', 'negative', 'pessimistic',
            'cut', 'reduce', 'shrink', 'worsen', 'deteriorate', 'retreat', 'slide',
            'sink', 'plummet', 'crash', 'crisis', 'underperform', 'downgrade'
        ];

        // Currency mappings
        this.currencyPatterns = {
            'USD': ['USD', 'dollar', 'dollars', 'greenback', 'buck', 'federal reserve', 'fed'],
            'EUR': ['EUR', 'euro', 'ecb', 'european central bank'],
            'GBP': ['GBP', 'pound', 'sterling', 'cable', 'boe', 'bank of england'],
            'JPY': ['JPY', 'yen', 'japanese', 'boj', 'bank of japan'],
            'AUD': ['AUD', 'aussie', 'australian dollar', 'rba'],
            'CAD': ['CAD', 'loonie', 'canadian dollar', 'boc'],
            'CHF': ['CHF', 'swiss franc', 'swissy', 'snb'],
            'NZD': ['NZD', 'kiwi', 'new zealand dollar', 'rbnz']
        };

        // High impact keywords
        this.highImpactKeywords = [
            'interest rate', 'rate decision', 'nfp', 'non-farm', 'non farm', 'payrolls',
            'cpi', 'inflation', 'gdp', 'central bank', 'fomc', 'fed ', 'federal reserve',
            'ecb ', 'european central bank', 'boe ', 'bank of england', 'boj ', 'bank of japan',
            'recession', 'crisis', 'quantitative easing', 'qe', 'rate cut', 'rate hike'
        ];

        // Medium impact keywords
        this.mediumImpactKeywords = [
            'employment', 'unemployment', 'jobs', 'retail sales', 'pmi', 'manufacturing',
            'services', 'consumer confidence', 'business confidence', 'trade balance',
            'current account', 'housing', 'home sales', 'construction', 'industrial production'
        ];
    }

    /**
     * Analyze news item
     * @param {Object} item - News item from RSS
     * @returns {Object} Analyzed news with sentiment, currencies, impact
     */
    analyze(item) {
        const text = `${item.title} ${item.description}`.toLowerCase();
        
        return {
            title: item.title,
            description: item.description,
            pubDate: item.pubDate,
            source: item.source,
            sentiment: this.getSentiment(text),
            currencies: this.detectCurrency(text),
            impact: this.calculateImpact(text),
            analyzedAt: new Date().toISOString()
        };
    }

    /**
     * Get sentiment score using keyword matching
     * @param {string} text - Text to analyze
     * @returns {string} 'positive', 'negative', or 'neutral'
     */
    getSentiment(text) {
        let score = 0;
        
        // Count positive keywords
        for (const keyword of this.positiveKeywords) {
            if (text.includes(keyword.toLowerCase())) {
                score++;
            }
        }
        
        // Count negative keywords
        for (const keyword of this.negativeKeywords) {
            if (text.includes(keyword.toLowerCase())) {
                score--;
            }
        }
        
        if (score > 0) return 'positive';
        if (score < 0) return 'negative';
        return 'neutral';
    }

    /**
     * Detect currencies mentioned in text
     * @param {string} text - Text to analyze
     * @returns {Array} Array of currency codes
     */
    detectCurrency(text) {
        const detected = new Set();
        
        for (const [currency, patterns] of Object.entries(this.currencyPatterns)) {
            for (const pattern of patterns) {
                if (text.includes(pattern.toLowerCase())) {
                    detected.add(currency);
                    break;
                }
            }
        }
        
        return Array.from(detected);
    }

    /**
     * Calculate impact level based on keywords
     * @param {string} text - Text to analyze
     * @returns {string} 'HIGH', 'MEDIUM', or 'LOW'
     */
    calculateImpact(text) {
        // Check high impact keywords
        for (const keyword of this.highImpactKeywords) {
            if (text.includes(keyword.toLowerCase())) {
                return 'HIGH';
            }
        }
        
        // Check medium impact keywords
        for (const keyword of this.mediumImpactKeywords) {
            if (text.includes(keyword.toLowerCase())) {
                return 'MEDIUM';
            }
        }
        
        return 'LOW';
    }

    /**
     * Analyze multiple news items
     * @param {Array} items - Array of news items
     * @returns {Array} Array of analyzed news
     */
    analyzeBatch(items) {
        return items.map(item => this.analyze(item));
    }

    /**
     * Filter high impact news
     * @param {Array} analyzedItems - Array of analyzed news
     * @returns {Array} Only HIGH impact items
     */
    filterHighImpact(analyzedItems) {
        return analyzedItems.filter(item => item.impact === 'HIGH');
    }
}

// Export singleton
module.exports = new NewsAnalyzer();
