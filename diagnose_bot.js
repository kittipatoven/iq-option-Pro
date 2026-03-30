const fs = require('fs');
const path = require('path');

const botPath = path.join(__dirname, 'src/core/bot.js');
const content = fs.readFileSync(botPath, 'utf8');
const lines = content.split('\n');

let output = [];
output.push(`=== BOT.JS DIAGNOSTIC ===`);
output.push(`File: ${botPath}`);
output.push(`Total lines: ${lines.length}`);
output.push(`File size: ${content.length} bytes`);
output.push('');

// Check first 10 lines
output.push('--- First 10 lines ---');
lines.slice(0, 10).forEach((line, i) => output.push(`${i + 1}: ${line}`));
output.push('');

// Check last 10 lines  
output.push('--- Last 10 lines ---');
lines.slice(-10).forEach((line, i) => output.push(`${lines.length - 9 + i}: ${line}`));
output.push('');

// Check for try-catch
output.push('--- Try-Catch Analysis ---');
let tryLines = [];
let catchLines = [];
lines.forEach((line, i) => {
    if (line.trim().startsWith('try {')) {
        tryLines.push(i + 1);
    }
    if (line.trim().startsWith('} catch')) {
        catchLines.push(i + 1);
    }
});
output.push(`try blocks at lines: ${tryLines.join(', ')}`);
output.push(`catch blocks at lines: ${catchLines.join(', ')}`);
output.push('');

// Syntax check
output.push('--- Syntax Check ---');
try {
    new Function(content);
    output.push('✅ SYNTAX OK');
} catch (e) {
    output.push(`❌ Syntax Error at line ${e.lineNumber || 'unknown'}: ${e.message}`);
    if (e.lineNumber && e.lineNumber > 0) {
        output.push(`   Code: ${lines[e.lineNumber - 1] || 'N/A'}`);
    }
}

const result = output.join('\n');
fs.writeFileSync('bot_diagnostic.txt', result);
console.log(result);
