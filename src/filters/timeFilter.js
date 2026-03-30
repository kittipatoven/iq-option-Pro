const moment = require('moment-timezone');
const logger = require('../utils/logger');

class TimeFilter {
    constructor() {
        this.name = 'TimeFilter';
        this.timezone = 'UTC';
        this.activeSessions = {
            LONDON: { start: '08:00', end: '17:00', timezone: 'Europe/London' },
            NEW_YORK: { start: '08:00', end: '17:00', timezone: 'America/New_York' },
            TOKYO: { start: '09:00', end: '17:00', timezone: 'Asia/Tokyo' },
            SYDNEY: { start: '08:00', end: '17:00', timezone: 'Australia/Sydney' }
        };
        this.blackoutPeriods = [
            { start: '22:00', end: '23:59', reason: 'Weekend transition' },
            { start: '00:00', end: '02:00', reason: 'Low liquidity' }
        ];
        this.majorNewsTimes = [
            { day: 'Friday', time: '13:30', timezone: 'America/New_York', name: 'US NFP' },
            { day: 'Wednesday', time: '14:00', timezone: 'America/New_York', name: 'FOMC' }
        ];
    }

    getCurrentTime(timezone = this.timezone) {
        return moment().tz(timezone);
    }

    isSessionActive(sessionName, currentTime = null) {
        try {
            const time = currentTime || this.getCurrentTime();
            const session = this.activeSessions[sessionName];
            
            if (!session) {
                throw new Error(`Unknown session: ${sessionName}`);
            }
            
            // Convert to session's timezone
            const sessionTime = time.clone().tz(session.timezone);
            const currentHour = sessionTime.hour();
            const currentMinute = sessionTime.minute();
            const currentTimeValue = currentHour * 60 + currentMinute;
            
            // Parse start and end times
            const [startHour, startMinute] = session.start.split(':').map(Number);
            const [endHour, endMinute] = session.end.split(':').map(Number);
            const startTimeValue = startHour * 60 + startMinute;
            const endTimeValue = endHour * 60 + endMinute;
            
            // Check if current time is within session hours
            const isActive = currentTimeValue >= startTimeValue && currentTimeValue < endTimeValue;
            
            console.log(`🔍 Session Check: ${sessionName}`);
            console.log(`   Local Time: ${sessionTime.format('HH:mm')} ${session.timezone}`);
            console.log(`   Session Hours: ${session.start} - ${session.end}`);
            console.log(`   Is Active: ${isActive}`);
            
            return isActive;
        } catch (error) {
            logger.error(`Session active check failed for ${sessionName}`, error);
            return false;
        }
    }

    getActiveSessions(currentTime = null) {
        try {
            const time = currentTime || this.getCurrentTime();
            const activeSessions = [];
            
            for (const [sessionName, session] of Object.entries(this.activeSessions)) {
                if (this.isSessionActive(sessionName, time)) {
                    activeSessions.push({
                        name: sessionName,
                        timezone: session.timezone,
                        localTime: time.clone().tz(session.timezone).format('HH:mm:ss')
                    });
                }
            }
            
            return activeSessions;
        } catch (error) {
            logger.error('Active sessions check failed', error);
            return [];
        }
    }

    isInBlackoutPeriod(currentTime = null) {
        try {
            const time = currentTime || this.getCurrentTime();
            const currentTimeStr = time.format('HH:mm');
            
            for (const blackout of this.blackoutPeriods) {
                if (time.isBetween(
                    moment(time.format('YYYY-MM-DD') + ' ' + blackout.start, 'YYYY-MM-DD HH:mm'),
                    moment(time.format('YYYY-MM-DD') + ' ' + blackout.end, 'YYYY-MM-DD HH:mm'),
                    null,
                    '[)'
                )) {
                    return {
                        inBlackout: true,
                        reason: blackout.reason,
                        period: blackout
                    };
                }
            }
            
            return { inBlackout: false };
        } catch (error) {
            logger.error('Blackout period check failed', error);
            return { inBlackout: false };
        }
    }

    isNearMajorNews(currentTime = null, windowMinutes = 30) {
        try {
            const time = currentTime || this.getCurrentTime();
            const currentDay = time.format('dddd');
            const currentTimeStr = time.format('HH:mm');
            
            for (const newsEvent of this.majorNewsTimes) {
                if (newsEvent.day === currentDay) {
                    const newsTime = moment(time.format('YYYY-MM-DD') + ' ' + newsEvent.time, 'YYYY-MM-DD HH:mm');
                    const timeDiff = Math.abs(time.diff(newsTime));
                    
                    if (timeDiff <= windowMinutes * 60 * 1000) {
                        return {
                            nearNews: true,
                            eventName: newsEvent.name,
                            eventTime: newsTime.format('HH:mm'),
                            minutesUntil: Math.floor(newsTime.diff(time) / 60000),
                            windowMinutes: windowMinutes
                        };
                    }
                }
            }
            
            return { nearNews: false };
        } catch (error) {
            logger.error('Major news check failed', error);
            return { nearNews: false };
        }
    }

    isWeekend(currentTime = null) {
        try {
            const time = currentTime || this.getCurrentTime();
            const dayOfWeek = time.day();
            
            return {
                isWeekend: dayOfWeek === 0 || dayOfWeek === 6, // Sunday = 0, Saturday = 6
                dayName: time.format('dddd')
            };
        } catch (error) {
            logger.error('Weekend check failed', error);
            return { isWeekend: false, dayName: 'Unknown' };
        }
    }

    shouldAllowTrading(pair = null, currentTime = null) {
        try {
            const time = currentTime || this.getCurrentTime();
            let allow = true;
            let reasons = [];
            let confidence = 100;
            
            // Check weekend
            const weekendCheck = this.isWeekend(time);
            if (weekendCheck.isWeekend) {
                allow = false;
                reasons.push(`Weekend trading not allowed (${weekendCheck.dayName})`);
                confidence = 0;
                return { allow, reasons, confidence, timeData: { weekend: weekendCheck } };
            }
            
            // Check blackout periods
            const blackoutCheck = this.isInBlackoutPeriod(time);
            if (blackoutCheck.inBlackout) {
                allow = false;
                reasons.push(`Blackout period: ${blackoutCheck.reason}`);
                confidence = 10;
                return { allow, reasons, confidence, timeData: { blackout: blackoutCheck } };
            }
            
            // Check major news
            const newsCheck = this.isNearMajorNews(time);
            if (newsCheck.nearNews) {
                allow = false;
                reasons.push(`Near major news event: ${newsCheck.eventName} in ${newsCheck.minutesUntil} minutes`);
                confidence = 20;
                return { allow, reasons, confidence, timeData: { news: newsCheck } };
            }
            
            // Check active sessions
            const activeSessions = this.getActiveSessions(time);
            if (activeSessions.length === 0) {
                allow = false;
                reasons.push('No major trading sessions active');
                confidence = 30;
            } else {
                // Bonus for multiple active sessions (overlap)
                if (activeSessions.length >= 2) {
                    confidence = 100;
                    reasons.push(`Multiple sessions active: ${activeSessions.map(s => s.name).join(', ')}`);
                } else {
                    confidence = 80;
                    reasons.push(`Session active: ${activeSessions[0].name}`);
                }
            }
            
            // Session-specific pair preferences
            if (pair && activeSessions.length > 0) {
                const sessionScore = this.getSessionPairScore(activeSessions, pair);
                confidence = Math.min(100, confidence + sessionScore);
                
                if (sessionScore < 0) {
                    reasons.push(`Suboptimal session for ${pair}`);
                }
            }
            
            const timeData = {
                currentTime: time.format('YYYY-MM-DD HH:mm:ss'),
                activeSessions,
                weekend: weekendCheck,
                blackout: blackoutCheck,
                news: newsCheck
            };
            
            return { allow, reasons, confidence, timeData };
        } catch (error) {
            logger.error('Time filter check failed', error);
            return { allow: true, reasons: ['Filter error'], confidence: 50, timeData: null };
        }
    }

    getSessionPairScore(activeSessions, pair) {
        try {
            let score = 0;
            
            for (const session of activeSessions) {
                switch (session.name) {
                    case 'LONDON':
                        if (pair.includes('EUR') || pair.includes('GBP')) score += 10;
                        break;
                    case 'NEW_YORK':
                        if (pair.includes('USD')) score += 10;
                        break;
                    case 'TOKYO':
                        if (pair.includes('JPY') || pair.includes('AUD')) score += 10;
                        break;
                    case 'SYDNEY':
                        if (pair.includes('AUD') || pair.includes('NZD')) score += 10;
                        break;
                }
            }
            
            return score;
        } catch (error) {
            logger.error('Session pair scoring failed', error);
            return 0;
        }
    }

    getNextSessionStart(currentTime = null) {
        try {
            const time = currentTime || this.getCurrentTime();
            const nextSessions = [];
            
            for (const [sessionName, session] of Object.entries(this.activeSessions)) {
                const sessionTime = time.clone().tz(session.timezone);
                const startTime = moment(sessionTime.format('YYYY-MM-DD') + ' ' + session.start, 'YYYY-MM-DD HH:mm');
                
                // If already passed today's start, check tomorrow
                if (sessionTime.isAfter(startTime)) {
                    startTime.add(1, 'day');
                }
                
                nextSessions.push({
                    name: sessionName,
                    startTime: startTime,
                    minutesUntil: startTime.diff(time) / 60000
                });
            }
            
            // Sort by next start time
            nextSessions.sort((a, b) => a.minutesUntil - b.minutesUntil);
            
            return nextSessions[0] || null;
        } catch (error) {
            logger.error('Next session calculation failed', error);
            return null;
        }
    }

    getTradingWindowSummary(currentTime = null) {
        try {
            const time = currentTime || this.getCurrentTime();
            const allowResult = this.shouldAllowTrading(null, time);
            const nextSession = this.getNextSessionStart(time);
            
            return {
                currentTime: time.format('YYYY-MM-DD HH:mm:ss UTC'),
                canTrade: allowResult.allow,
                confidence: allowResult.confidence,
                reasons: allowResult.reasons,
                activeSessions: allowResult.timeData?.activeSessions || [],
                nextSession: nextSession ? {
                    name: nextSession.name,
                    startTime: nextSession.startTime.format('YYYY-MM-DD HH:mm:ss'),
                    minutesUntil: Math.floor(nextSession.minutesUntil)
                } : null,
                isWeekend: allowResult.timeData?.weekend?.isWeekend || false
            };
        } catch (error) {
            logger.error('Trading window summary failed', error);
            return null;
        }
    }

    addBlackoutPeriod(start, end, reason) {
        try {
            this.blackoutPeriods.push({ start, end, reason });
            logger.info('Blackout period added', { start, end, reason });
        } catch (error) {
            logger.error('Failed to add blackout period', error);
        }
    }

    removeBlackoutPeriod(start, end) {
        try {
            const initialLength = this.blackoutPeriods.length;
            this.blackoutPeriods = this.blackoutPeriods.filter(period => 
                !(period.start === start && period.end === end)
            );
            
            const removed = initialLength - this.blackoutPeriods.length;
            if (removed > 0) {
                logger.info(`Removed ${removed} blackout periods`);
            }
        } catch (error) {
            logger.error('Failed to remove blackout period', error);
        }
    }
}

module.exports = new TimeFilter();
