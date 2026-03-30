const fs = require('fs');
const path = require('path');

// Read the bot.js file
const botPath = path.join(__dirname, 'src/core/bot.js');
const content = fs.readFileSync(botPath, 'utf8');

console.log('File size:', content.length);
console.log('Total lines:', content.split('\n').length);

// Check for orphaned catch/finally
const lines = content.split('\n');
let braceCount = 0;
let inTry = false;
let tryLine = 0;

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Count braces
    for (const char of line) {
        if (char === '{') braceCount++;
        if (char === '}') braceCount--;
    }
    
    // Check for try
    if (/\btry\b/.test(line) && line.includes('{')) {
        inTry = true;
        tryLine = i + 1;
    }
    
    // Check for catch/finally after try
    if (inTry && !line.trim().startsWith('//') && !line.trim().startsWith('*')) {
        if (/\bcatch\b/.test(line) || /\bfinally\b/.test(line)) {
            inTry = false;
        }
    }
}

console.log('Final brace count:', braceCount);
if (braceCount !== 0) {
    console.error('ERROR: Mismatched braces!');
}

// Try to require the file
try {
    delete require.cache[require.resolve(botPath)];
    require(botPath);
    console.log('✅ File loaded successfully');
} catch (e) {
    console.error('❌ Syntax Error:', e.message);
    console.error('Line:', e.stack?.split('\n')[1]);
}
