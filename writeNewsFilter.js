const fs = require('fs');

const content = `const logger = require('../utils/logger');
const newsSchedule = require('../config/newsSchedule');

class NewsFilter {
    constructor() {
        this.name = 'NewsFilter';
        this.blockWindow = 10 * 60 * 1000;
        this.todaySchedule = null;
        this.lastCacheDate = null;
        this.newsMode = process.env.NEWS_MODE || 'OFFLINE';
        logger.info('News Filter initialized (OFFLINE MODE)');
    }

    async initialize() {
        if (this.newsMode === 'DISABLED') {
            logger.info('News Filter disabled by config');
            return true;
        }
        this.cacheTodaySchedule();
        logger.info('News Filter initialized (offline mode)', {
            scheduleItems: newsSchedule.length,
            mode: this.newsMode
        });
        return true;
    }

    cacheTodaySchedule() {
        const today = new Date();
        const todayStr = today.toDateString();
        if (this.todaySchedule && this.lastCacheDate === todayStr) {
            return this.todaySchedule;
        }
        this.todaySchedule = newsSchedule.map(event => {
            const [hours, minutes] = event.time.split(':').map(Number);
            const eventTime = new Date(today);
            eventTime.setUTCHours(hours, minutes, 0, 0);
            return { ...event, timestamp: eventTime.getTime(), timeStr: event.time };
        });
        this.lastCacheDate = todayStr;
        logger.debug('Today\\'s news schedule cached', { items: this.todaySchedule.length, date: todayStr });
        return this.todaySchedule;
    }

    getPairCurrencies(pair) {
        if (!pair || pair.length < 6) return [];
        const base = pair.slice(0, 3).toUpperCase();
        const quote = pair.slice(3, 6).toUpperCase();
        return [base, quote];
    }

    isNewsTime() {
        if (this.newsMode === 'DISABLED') return false;
        const schedule = this.cacheTodaySchedule();
        const now = Date.now();
        for (const event of schedule) {
            if (event.impact !== 'HIGH') continue;
            const diff = Math.abs(now - event.timestamp);
            if (diff <= this.blockWindow) {
                logger.debug('News time detected', { currency: event.currency, time: event.timeStr, name: event.name, diffMinutes: Math.round(diff / 60000) });
                return true;
            }
        }
        return false;
    }

    affectsPair(pair, event) {
        const pairCurrencies = this.getPairCurrencies(pair);
        return pairCurrencies.includes(event.currency);
    }

    async shouldStopTrading(pair = null) {
        try {
            if (this.newsMode === 'DISABLED') {
                return { shouldStop: false, reason: null, eventTime: null, timeUntil: null, currency: null, impact: null };
            }
            const schedule = this.cacheTodaySchedule();
            const now = Date.now();
            for (const event of schedule) {
                if (event.impact !== 'HIGH') continue;
                if (pair && !this.affectsPair(pair, event)) continue;
                const diff = Math.abs(now - event.timestamp);
                const diffMin = Math.round(diff / 60000);
                if (diff <= this.blockWindow) {
                    const reason = pair ? \`High-impact \${event.currency} news: \${event.name} at \${event.timeStr}\` : \`High-impact news: \${event.name} at \${event.timeStr}\`;
                    logger.info('Trading blocked by news', { pair, currency: event.currency, time: event.timeStr, name: event.name, minutesAway: diffMin });
                    return { shouldStop: true, reason: reason, eventTime: new Date(event.timestamp), timeUntil: diffMin, currency: event.currency, impact: event.impact };
                }
            }
            return { shouldStop: false, reason: null, eventTime: null, timeUntil: null, currency: null, impact: null };
        } catch (error) {
            logger.error('News filter error (allowing trading)', error);
            return { shouldStop: false, reason: null, note: 'Filter error - trading allowed' };
        }
    }

    getUpcomingNews(pair = null, hours = 24) {
        try {
            const schedule = this.cacheTodaySchedule();
            const now = Date.now();
            const windowMs = hours * 60 * 60 * 1000;
            let upcoming = schedule.filter(event => {
                const diff = event.timestamp - now;
                return diff > 0 && diff <= windowMs && event.impact === 'HIGH';
            });
            if (pair) upcoming = upcoming.filter(event => this.affectsPair(pair, event));
            upcoming.sort((a, b) => a.timestamp - b.timestamp);
            return upcoming.map(event => ({ time: event.timeStr, currency: event.currency, impact: event.impact, name: event.name, minutesAway: Math.round((event.timestamp - now) / 60000) }));
        } catch (error) {
            logger.error('Failed to get upcoming news', error);
            return [];
        }
    }

    getStatus() {
        const schedule = this.cacheTodaySchedule();
        const now = Date.now();
        const upcoming = schedule.filter(e => e.timestamp > now && e.impact === 'HIGH').sort((a, b) => a.timestamp - b.timestamp)[0];
        return { mode: this.newsMode, isDisabled: this.newsMode === 'DISABLED', blockWindowMinutes: 10, totalScheduleItems: newsSchedule.length, cachedItems: this.todaySchedule?.length || 0, nextHighImpactNews: upcoming ? { time: upcoming.timeStr, currency: upcoming.currency, name: upcoming.name, minutesAway: Math.round((upcoming.timestamp - now) / 60000) } : null };
    }

    cleanup() {
        this.todaySchedule = null;
        this.lastCacheDate = null;
        logger.info('News Filter cleaned up');
    }
}

module.exports = new NewsFilter();
`;

fs.writeFileSync('src/filters/newsFilter.js', content, 'utf8');
console.log('newsFilter.js written successfully');
