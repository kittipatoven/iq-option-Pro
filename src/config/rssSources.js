/**
 * RSS Feed Sources Configuration
 * Free RSS feeds for forex and financial news
 */

const rssSources = [
    {
        name: 'ForexFactory',
        url: 'https://www.forexfactory.com/rss',
        type: 'forex',
        priority: 1
    },
    {
        name: 'Investing',
        url: 'https://www.investing.com/rss/news_25.rss',
        type: 'forex',
        priority: 2
    },
    {
        name: 'DailyFX',
        url: 'https://www.dailyfx.com/feeds/forex-news',
        type: 'forex',
        priority: 3
    },
    {
        name: 'FXStreet',
        url: 'https://www.fxstreet.com/rss/news',
        type: 'forex',
        priority: 4
    }
];

module.exports = rssSources;
