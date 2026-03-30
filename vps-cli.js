#!/usr/bin/env node

/**
 * VPS CLI Tool - Manual VPS operations
 * Usage: node vps-cli.js [command]
 * Commands: test, deploy, run, stop, logs, status
 */

require('dotenv').config();
const RemoteRunner = require('./src/remote/remoteRunner.js');

const command = process.argv[2] || 'help';

async function main() {
    const runner = new RemoteRunner();

    switch (command) {
        case 'test':
            console.log('🔍 Testing VPS connection...');
            const result = await runner.testVPS();
            if (result.success) {
                console.log('\n✅ VPS is ready for deployment');
                console.log(`   Node.js: ${result.node}`);
                console.log(`   NPM: ${result.npm}`);
                console.log(`   Internet: ${result.internet ? '✅' : '❌'}`);
            } else {
                console.error('\n❌ VPS test failed:', result.error);
                process.exit(1);
            }
            break;

        case 'deploy':
            console.log('🚀 Deploying to VPS...');
            if (!runner.isConfigured()) {
                console.error('❌ VPS not configured. Set VPS_HOST, VPS_USER, VPS_PASS in .env');
                process.exit(1);
            }
            try {
                await runner.runOnRemoteServer({ streaming: false });
                console.log('\n✅ Deployment complete!');
            } catch (err) {
                console.error('❌ Deployment failed:', err.message);
                process.exit(1);
            }
            break;

        case 'run':
        case 'start':
            console.log('🚀 Starting bot on VPS...');
            if (!runner.isConfigured()) {
                console.error('❌ VPS not configured');
                process.exit(1);
            }
            try {
                await runner.connect();
                await runner.runWithStreaming('live');
            } catch (err) {
                console.error('❌ Failed to start:', err.message);
                process.exit(1);
            }
            break;

        case 'stop':
            console.log('🛑 Stopping bot on VPS...');
            if (!runner.isConfigured()) {
                console.error('❌ VPS not configured');
                process.exit(1);
            }
            try {
                await runner.connect();
                await runner.stopBot();
                runner.disconnect();
                console.log('✅ Bot stopped');
            } catch (err) {
                console.error('❌ Failed to stop:', err.message);
                process.exit(1);
            }
            break;

        case 'logs':
            console.log('📜 Fetching logs from VPS...');
            if (!runner.isConfigured()) {
                console.error('❌ VPS not configured');
                process.exit(1);
            }
            try {
                await runner.connect();
                const lines = process.argv[3] || 50;
                const logs = await runner.getRemoteLogs(lines);
                console.log('\n--- Remote Logs ---\n');
                console.log(logs);
                runner.disconnect();
            } catch (err) {
                console.error('❌ Failed to fetch logs:', err.message);
                process.exit(1);
            }
            break;

        case 'status':
            console.log('📊 Checking bot status on VPS...');
            if (!runner.isConfigured()) {
                console.error('❌ VPS not configured');
                process.exit(1);
            }
            try {
                await runner.connect();
                const isRunning = await runner.isBotRunning();
                console.log(`\nBot status: ${isRunning ? '🟢 RUNNING' : '🔴 STOPPED'}`);
                runner.disconnect();
            } catch (err) {
                console.error('❌ Failed to check status:', err.message);
                process.exit(1);
            }
            break;

        case 'help':
        default:
            console.log(`
🌐 VPS CLI Tool - Remote Bot Management

Usage: node vps-cli.js [command]

Commands:
  test      - Test VPS connectivity
  deploy    - Deploy bot to VPS
  run       - Run bot on VPS with log streaming
  stop      - Stop bot on VPS
  logs [n]  - Show last n lines of logs (default: 50)
  status    - Check if bot is running
  help      - Show this help

Configuration (in .env):
  VPS_HOST=your-vps-ip
  VPS_USER=root
  VPS_PASS=your-password
  VPS_PORT=22
  VPS_PATH=/root/iq-option-bot
`);
            break;
    }
}

main().then(() => {
    process.exit(0);
}).catch(err => {
    console.error('💥 Error:', err.message);
    process.exit(1);
});
