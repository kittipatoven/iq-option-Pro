const fs = require('fs');
const path = require('path');

class Logger {
    constructor() {
        this.logDir = path.join(__dirname, '../../logs');
        this.ensureLogDir();
        this.logLevels = {
            ERROR: 0,
            WARN: 1,
            INFO: 2,
            DEBUG: 3
        };
        this.currentLevel = this.logLevels.INFO;
    }

    ensureLogDir() {
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
    }

    formatMessage(level, message, data = null) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level,
            message,
            data
        };
        
        // Console output
        const consoleMessage = `[${timestamp}] ${level}: ${message}`;
        if (data) {
            console.log(consoleMessage, data);
        } else {
            console.log(consoleMessage);
        }
        
        // File output
        const logFile = path.join(this.logDir, `trading-${new Date().toISOString().split('T')[0]}.log`);
        fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
    }

    error(message, data = null) {
        if (this.logLevels.ERROR <= this.currentLevel) {
            this.formatMessage('ERROR', message, data);
        }
    }

    warn(message, data = null) {
        if (this.logLevels.WARN <= this.currentLevel) {
            this.formatMessage('WARN', message, data);
        }
    }

    info(message, data = null) {
        if (this.logLevels.INFO <= this.currentLevel) {
            this.formatMessage('INFO', message, data);
        }
    }

    debug(message, data = null) {
        if (this.logLevels.DEBUG <= this.currentLevel) {
            this.formatMessage('DEBUG', message, data);
        }
    }

    trade(pair, action, result) {
        const tradeLog = {
            timestamp: new Date().toISOString(),
            pair,
            action,
            result
        };
        
        const tradeFile = path.join(this.logDir, `trades-${new Date().toISOString().split('T')[0]}.log`);
        fs.appendFileSync(tradeFile, JSON.stringify(tradeLog) + '\n');
        
        this.info(`TRADE: ${pair} - ${action}`, result);
    }

    setLevel(level) {
        if (this.logLevels[level] !== undefined) {
            this.currentLevel = this.logLevels[level];
        }
    }
}

module.exports = new Logger();
