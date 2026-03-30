/**
 * Remote Runner - VPS Deployment & Remote Execution System
 * Deploys bot to remote server when local network is blocked
 */

const { Client } = require('ssh2');
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

class RemoteRunner {
    constructor(config = {}) {
        this.vpsHost = config.vpsHost || process.env.VPS_HOST;
        this.vpsUser = config.vpsUser || process.env.VPS_USER || 'root';
        this.vpsPass = config.vpsPass || process.env.VPS_PASS;
        this.vpsPort = config.vpsPort || parseInt(process.env.VPS_PORT) || 22;
        this.remotePath = config.remotePath || '/root/iq-option-bot';
        this.sshClient = null;
        this.sftp = null;
        this.isConnected = false;
        this.logBuffer = [];
        this.onLogCallback = null;
    }

    /**
     * Check if VPS is configured
     */
    isConfigured() {
        return !!(this.vpsHost && this.vpsUser && this.vpsPass);
    }

    /**
     * Connect to VPS via SSH
     */
    async connect() {
        return new Promise((resolve, reject) => {
            console.log(`\n🔌 Connecting to VPS: ${this.vpsHost}...`);

            this.sshClient = new Client();

            this.sshClient.on('ready', () => {
                console.log(`✅ Connected to VPS: ${this.vpsHost}`);
                this.isConnected = true;
                resolve(true);
            });

            this.sshClient.on('error', (err) => {
                console.error(`❌ SSH Connection error: ${err.message}`);
                this.isConnected = false;
                reject(err);
            });

            this.sshClient.on('close', () => {
                console.log('📡 SSH Connection closed');
                this.isConnected = false;
            });

            this.sshClient.connect({
                host: this.vpsHost,
                port: this.vpsPort,
                username: this.vpsUser,
                password: this.vpsPass,
                readyTimeout: 20000,
                keepaliveInterval: 10000
            });
        });
    }

    /**
     * Disconnect from VPS
     */
    disconnect() {
        if (this.sshClient) {
            this.sshClient.end();
            this.isConnected = false;
        }
    }

    /**
     * Execute command on remote server
     */
    async execCommand(command, options = {}) {
        return new Promise((resolve, reject) => {
            if (!this.isConnected) {
                reject(new Error('Not connected to VPS'));
                return;
            }

            const streamCallback = options.onData || this.defaultLogHandler.bind(this);

            this.sshClient.exec(command, (err, stream) => {
                if (err) {
                    reject(err);
                    return;
                }

                let stdout = '';
                let stderr = '';

                stream.on('close', (code, signal) => {
                    resolve({
                        code,
                        signal,
                        stdout,
                        stderr
                    });
                });

                stream.on('data', (data) => {
                    const output = data.toString();
                    stdout += output;
                    streamCallback(output, 'stdout');
                });

                stream.stderr.on('data', (data) => {
                    const output = data.toString();
                    stderr += output;
                    streamCallback(output, 'stderr');
                });
            });
        });
    }

    /**
     * Default log handler
     */
    defaultLogHandler(data, type) {
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] [${type.toUpperCase()}] ${data}`;
        this.logBuffer.push(logEntry);
        
        // Keep buffer size manageable
        if (this.logBuffer.length > 1000) {
            this.logBuffer.shift();
        }

        // Call external callback if set
        if (this.onLogCallback) {
            this.onLogCallback(logEntry, type);
        }

        // Print to console with remote prefix
        if (type === 'stderr') {
            console.error(`[REMOTE] ${data.trim()}`);
        } else {
            console.log(`[REMOTE] ${data.trim()}`);
        }
    }

    /**
     * Set log callback
     */
    onLog(callback) {
        this.onLogCallback = callback;
    }

    /**
     * Get SFTP session
     */
    async getSftp() {
        return new Promise((resolve, reject) => {
            if (!this.isConnected) {
                reject(new Error('Not connected to VPS'));
                return;
            }

            this.sshClient.sftp((err, sftp) => {
                if (err) {
                    reject(err);
                } else {
                    this.sftp = sftp;
                    resolve(sftp);
                }
            });
        });
    }

    /**
     * Create remote directory
     */
    async createRemoteDir(dirPath) {
        const sftp = await this.getSftp();
        
        return new Promise((resolve, reject) => {
            sftp.mkdir(dirPath, true, (err) => {
                if (err && err.code !== 4) { // 4 = already exists
                    reject(err);
                } else {
                    resolve(true);
                }
            });
        });
    }

    /**
     * Upload file to remote server
     */
    async uploadFile(localPath, remotePath) {
        const sftp = await this.getSftp();
        
        return new Promise((resolve, reject) => {
            sftp.fastPut(localPath, remotePath, (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(true);
                }
            });
        });
    }

    /**
     * Upload directory recursively
     */
    async uploadDirectory(localDir, remoteDir) {
        console.log(`📤 Uploading directory: ${localDir} → ${remoteDir}`);
        
        // Create remote directory
        await this.createRemoteDir(remoteDir);

        // Read local directory
        const entries = await fs.readdir(localDir, { withFileTypes: true });

        for (const entry of entries) {
            const localPath = path.join(localDir, entry.name);
            const remotePath = `${remoteDir}/${entry.name}`;

            // Skip certain files
            if (entry.name === 'node_modules' || 
                entry.name === '.git' || 
                entry.name === 'logs' ||
                entry.name === '.windsurf' ||
                entry.name.endsWith('.log')) {
                console.log(`   ⏭️  Skipping: ${entry.name}`);
                continue;
            }

            if (entry.isDirectory()) {
                await this.uploadDirectory(localPath, remotePath);
            } else {
                console.log(`   📄 Uploading: ${entry.name}`);
                await this.uploadFile(localPath, remotePath);
            }
        }

        console.log(`✅ Uploaded: ${localDir}`);
    }

    /**
     * Deploy project to VPS
     */
    async deploy() {
        console.log('\n');
        console.log('╔══════════════════════════════════════════════════════════════╗');
        console.log('║     🚀 DEPLOYING TO VPS                                      ║');
        console.log('╚══════════════════════════════════════════════════════════════╝');
        console.log(`\n📍 VPS: ${this.vpsHost}`);
        console.log(`📁 Remote path: ${this.remotePath}`);
        console.log('');

        // Connect to VPS
        await this.connect();

        // Create remote directory structure
        console.log('📁 Creating remote directories...');
        await this.createRemoteDir(this.remotePath);

        // Get project root (parent of src)
        const projectRoot = path.resolve(__dirname, '../..');

        // Upload files
        console.log('\n📤 Uploading project files...');
        await this.uploadDirectory(projectRoot, this.remotePath);

        // Install dependencies
        console.log('\n📦 Installing dependencies on VPS...');
        await this.execCommand(`cd ${this.remotePath} && npm install --production`, {
            onData: (data, type) => {
                // Filter npm output
                if (data.includes('added') || data.includes('packages')) {
                    console.log(`[VPS] ${data.trim()}`);
                }
            }
        });

        console.log('\n✅ Deployment complete!');
        return true;
    }

    /**
     * Start bot on remote server
     */
    async startBot(mode = 'live') {
        console.log(`\n🚀 Starting bot on VPS in ${mode.toUpperCase()} mode...\n`);

        const command = `cd ${this.remotePath} && node start_production.js ${mode}`;
        
        // Start bot in background (no wait for completion)
        this.sshClient.exec(command, (err, stream) => {
            if (err) {
                console.error('❌ Failed to start bot:', err.message);
                return;
            }

            stream.on('data', (data) => {
                this.defaultLogHandler(data, 'stdout');
            });

            stream.stderr.on('data', (data) => {
                this.defaultLogHandler(data, 'stderr');
            });

            stream.on('close', (code) => {
                console.log(`\n⚠️ Remote bot process exited with code ${code}`);
            });
        });

        return true;
    }

    /**
     * Run bot with live log streaming
     */
    async runWithStreaming(mode = 'live') {
        console.log(`\n🚀 Running bot on VPS with streaming (Mode: ${mode.toUpperCase()})\n`);

        const command = `cd ${this.remotePath} && node start_production.js ${mode}`;
        
        return new Promise((resolve, reject) => {
            this.sshClient.exec(command, (err, stream) => {
                if (err) {
                    reject(err);
                    return;
                }

                let connected = false;
                let tradeExecuted = false;

                stream.on('data', (data) => {
                    const output = data.toString();
                    this.defaultLogHandler(output, 'stdout');

                    // Check for success indicators
                    if (output.includes('CONNECTED') || output.includes('📡')) {
                        connected = true;
                    }
                    if (output.includes('ORDER') || output.includes('💰')) {
                        tradeExecuted = true;
                    }
                });

                stream.stderr.on('data', (data) => {
                    this.defaultLogHandler(data, 'stderr');
                });

                stream.on('close', (code) => {
                    console.log(`\n⚠️ Remote process exited with code ${code}`);
                    resolve({
                        code,
                        connected,
                        tradeExecuted,
                        logs: this.logBuffer
                    });
                });
            });
        });
    }

    /**
     * Check if bot is running on remote
     */
    async isBotRunning() {
        try {
            const result = await this.execCommand('pgrep -f "start_production.js"');
            return result.stdout.trim().length > 0;
        } catch (err) {
            return false;
        }
    }

    /**
     * Stop remote bot
     */
    async stopBot() {
        console.log('🛑 Stopping remote bot...');
        try {
            await this.execCommand('pkill -f "start_production.js"');
            console.log('✅ Remote bot stopped');
            return true;
        } catch (err) {
            console.log('ℹ️ No bot process found');
            return false;
        }
    }

    /**
     * Get remote logs
     */
    async getRemoteLogs(lines = 50) {
        try {
            const result = await this.execCommand(`cd ${this.remotePath} && tail -n ${lines} logs/trading.log 2>/dev/null || echo "No log file"`);
            return result.stdout;
        } catch (err) {
            return `Error reading logs: ${err.message}`;
        }
    }

    /**
     * Test VPS connectivity
     */
    async testVPS() {
        console.log('\n🔍 Testing VPS connectivity...');
        
        try {
            await this.connect();
            
            // Check Node.js
            const nodeCheck = await this.execCommand('node --version');
            console.log(`✅ Node.js: ${nodeCheck.stdout.trim()}`);

            // Check NPM
            const npmCheck = await this.execCommand('npm --version');
            console.log(`✅ NPM: ${npmCheck.stdout.trim()}`);

            // Check internet
            const pingCheck = await this.execCommand('ping -c 1 iqoption.com 2>/dev/null && echo "OK" || echo "FAIL"');
            const hasInternet = pingCheck.stdout.includes('OK');
            console.log(`${hasInternet ? '✅' : '❌'} Internet: ${hasInternet ? 'Connected' : 'No connectivity'}`);

            this.disconnect();

            return {
                success: true,
                node: nodeCheck.stdout.trim(),
                npm: npmCheck.stdout.trim(),
                internet: hasInternet
            };
        } catch (err) {
            console.error('❌ VPS test failed:', err.message);
            return {
                success: false,
                error: err.message
            };
        }
    }

    /**
     * Run full remote deployment and execution
     */
    async runOnRemoteServer(config = {}) {
        const mode = config.mode || 'live';
        const streaming = config.streaming !== false;

        console.log('\n');
        console.log('╔══════════════════════════════════════════════════════════════╗');
        console.log('║     🌐 REMOTE EXECUTION MODE                                 ║');
        console.log('║     Deploying to VPS for LIVE trading                        ║');
        console.log('╚══════════════════════════════════════════════════════════════╝');
        console.log('\n');

        if (!this.isConfigured()) {
            console.error('❌ VPS not configured. Set VPS_HOST, VPS_USER, VPS_PASS in .env');
            return {
                success: false,
                error: 'VPS not configured',
                mode: 'demo'
            };
        }

        try {
            // Test VPS first
            const vpsTest = await this.testVPS();
            if (!vpsTest.success) {
                throw new Error('VPS connection failed');
            }

            if (!vpsTest.internet) {
                console.error('❌ VPS has no internet connectivity');
                return {
                    success: false,
                    error: 'VPS has no internet',
                    mode: 'demo'
                };
            }

            // Deploy
            await this.deploy();

            // Run bot
            if (streaming) {
                await this.runWithStreaming(mode);
            } else {
                await this.startBot(mode);
            }

            return {
                success: true,
                mode: 'live',
                location: 'vps',
                message: 'Bot running on VPS'
            };

        } catch (err) {
            console.error('❌ Remote execution failed:', err.message);
            this.disconnect();
            
            return {
                success: false,
                error: err.message,
                mode: 'demo'
            };
        }
    }
}

module.exports = RemoteRunner;

// CLI mode
if (require.main === module) {
    const runner = new RemoteRunner();
    
    const command = process.argv[2] || 'deploy';
    
    switch (command) {
        case 'deploy':
            runner.runOnRemoteServer({ streaming: true });
            break;
        case 'test':
            runner.testVPS().then(result => {
                console.log('\nTest result:', result);
                process.exit(result.success ? 0 : 1);
            });
            break;
        case 'stop':
            runner.connect().then(() => {
                runner.stopBot().then(() => {
                    runner.disconnect();
                    process.exit(0);
                });
            });
            break;
        default:
            console.log('Usage: node remoteRunner.js [deploy|test|stop]');
            process.exit(1);
    }
}
