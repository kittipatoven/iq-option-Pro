const axios = require('axios');
const xml2js = require('xml2js');
const logger = require('../utils/logger');
const rssSources = require('../config/rssSources');

/**
 * RSS Fetcher Service
 * Fetches and parses RSS feeds from multiple sources
 * Fault-tolerant: returns empty array on failure
 */
class RssFetcher {
    constructor() {
        this.timeout = 5000; // 5 seconds timeout
        this.parser = new xml2js.Parser({ explicitArray: false });
    }

    /**
     * Fetch all RSS feeds
     * @returns {Promise<Array>} Array of news items
     */
    async fetchAllFeeds() {
        const allItems = [];
        
        for (const source of rssSources) {
            try {
                const items = await this.fetchFeed(source);
                allItems.push(...items);
                logger.debug(`RSS fetch success: ${source.name}`, { items: items.length });
            } catch (error) {
                logger.warn(`RSS fetch failed: ${source.name}`, { error: error.message });
                // Continue with other sources - don't crash
            }
        }
        
        logger.info('RSS fetch completed', { 
            sources: rssSources.length, 
            totalItems: allItems.length 
        });
        
        return allItems;
    }

    /**
     * Fetch single RSS feed
     * @param {Object} source - RSS source config
     * @returns {Promise<Array>} Array of parsed items
     */
    async fetchFeed(source) {
        try {
            const response = await axios.get(source.url, {
                timeout: this.timeout,
                headers: {
                    'User-Agent': 'IQ-Option-Trading-Bot/1.0'
                }
            });

            if (!response.data) {
                return [];
            }

            const parsed = await this.parser.parseStringPromise(response.data);
            
            if (!parsed || !parsed.rss || !parsed.rss.channel || !parsed.rss.channel.item) {
                return [];
            }

            const items = Array.isArray(parsed.rss.channel.item) 
                ? parsed.rss.channel.item 
                : [parsed.rss.channel.item];

            return items.map(item => ({
                title: item.title || '',
                description: item.description || '',
                pubDate: item.pubDate || item['dc:date'] || new Date().toISOString(),
                link: item.link || '',
                source: source.name
            }));

        } catch (error) {
            logger.debug(`RSS parse error: ${source.name}`, { error: error.message });
            return []; // Return empty on error - don't crash
        }
    }
}

// Export singleton
module.exports = new RssFetcher();
