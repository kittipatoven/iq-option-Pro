const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/core/bot.js');
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

console.log('='.repeat(60));
console.log('BOT.JS DIAGNOSTIC REPORT');
console.log('='.repeat(60));
console.log('Total lines:', lines.length);
console.log('File size:', content.length, 'bytes');
console.log();

// Check for orphaned catch/finally
console.log('--- Checking for orphaned catch/finally ---');
let inTryBlock = false;
let tryBlockLine = 0;
let openBraces = 0;

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Count braces
    for (const char of line) {
        if (char === '{') openBraces++;
        if (char === '}') openBraces--;
    }
    
    // Detect try blocks
    if (/^try\s*\{/.test(trimmed) || /\s+try\s*\{/.test(line)) {
        inTryBlock = true;
        tryBlockLine = i + 1;
    }
    
    // Detect catch/finally
    if (inTryBlock && (/^catch/.test(trimmed) || /^finally/.test(trimmed))) {
        inTryBlock = false;
    }
}

if (openBraces !== 0) {
    console.error('❌ MISMATCHED BRACES:', openBraces);
} else {
    console.log('✅ Brace count balanced');
}

console.log();
console.log('--- Attempting to require file ---');

try {
    delete require.cache[require.resolve(filePath)];
    const bot = require(filePath);
    console.log('✅ File loaded successfully');
    console.log('Module type:', typeof bot);
    console.log('Module keys:', Object.keys(bot));
} catch (e) {
    console.error('❌ ERROR:', e.message);
    if (e.stack) {
        const stackLines = e.stack.split('\n');
        console.error('Location:', stackLines[1] || 'Unknown');
    }
}

console.log();
console.log('='.repeat(60));
