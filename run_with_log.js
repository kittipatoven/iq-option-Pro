const fs = require('fs');
const path = require('path');

// Create a log file
const logFile = fs.createWriteStream('bot_run.log', { flags: 'w' });

// Override console methods to log to file
const originalLog = console.log;
const originalError = console.error;

console.log = function(...args) {
    const msg = args.join(' ');
    logFile.write(new Date().toISOString() + ' LOG: ' + msg + '\n');
    originalLog.apply(console, args);
};

console.error = function(...args) {
    const msg = args.join(' ');
    logFile.write(new Date().toISOString() + ' ERROR: ' + msg + '\n');
    originalError.apply(console, args);
};

console.log('=== BOT STARTUP ===');
console.log('Time:', new Date().toISOString());
console.log('Node version:', process.version);

// Now run the main bot
try {
    console.log('Loading main module...');
    require('./main.js');
} catch (error) {
    console.error('Failed to load main:', error.message);
    console.error('Stack:', error.stack);
}

// Keep the log file open
process.on('exit', () => {
    logFile.end();
});
