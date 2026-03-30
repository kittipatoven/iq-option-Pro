// Simple syntax checker
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/core/bot.js');
console.log('Checking:', filePath);

try {
    const content = fs.readFileSync(filePath, 'utf8');
    console.log('File size:', content.length, 'bytes');
    console.log('Lines:', content.split('\n').length);
    
    // Try to parse as module
    require(filePath);
    console.log('✅ Module loaded successfully');
} catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
}
