const fs = require('fs');
const vm = require('vm');

const code = fs.readFileSync('src/core/bot.js', 'utf8');

try {
    new vm.Script(code, { filename: 'bot.js' });
    console.log('✅ Syntax OK');
} catch (err) {
    console.error('❌ Syntax Error:', err.message);
    console.error('Line:', err.lineNumber);
    console.error('Column:', err.columnNumber);
}
