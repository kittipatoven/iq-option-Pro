/**
 * PM2 Ecosystem Configuration
 * Production-ready process management for Trading Bot
 */

module.exports = {
  apps: [{
    name: 'iq-option-bot',
    script: './start_production.js',
    args: 'live',
    instances: 1,
    exec_mode: 'fork',
    
    // Restart policy
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s',
    restart_delay: 5000,
    
    // Memory management
    max_memory_restart: '512M',
    
    // Logging
    log_file: './logs/pm2-combined.log',
    out_file: './logs/pm2-out.log',
    error_file: './logs/pm2-error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    
    // Environment
    env: {
      NODE_ENV: 'production',
      LOG_LEVEL: 'info'
    },
    
    // Monitoring
    monitoring: true,
    
    // Advanced
    kill_timeout: 5000,
    listen_timeout: 10000,
    
    // Auto-save on crash
    // PM2 will automatically restart the bot if it crashes
    
    // Cron restart (optional - restart daily at 00:00)
    // cron_restart: '0 0 * * *',
    
    // Source map support for better error tracing
    source_map_support: true
  }],
  
  // Deployment configuration (if using PM2 deploy)
  deploy: {
    production: {
      user: 'root',
      host: process.env.VPS_HOST || 'your-vps-ip',
      ref: 'origin/main',
      repo: 'git@github.com:your-repo/iq-option-bot.git',
      path: '/root/iq-option-bot',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env production'
    }
  }
};
