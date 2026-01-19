module.exports = {
  apps: [{
    name: 'flash-whatsapp-dev',
    script: 'dist/main.js',
    node_args: '-r dotenv/config',
    watch: ['dist'],
    ignore_watch: ['node_modules', '.git', '*.log', 'session-*', 'src'],
    watch_delay: 2000,
    restart_delay: 3000,
    env: {
      NODE_ENV: 'development',
    },
    max_restarts: 10,
    min_uptime: '10s',
    // Kill and restart instead of reload for WhatsApp Web.js
    kill_timeout: 5000,
    listen_timeout: 10000,
    autorestart: true,
    max_memory_restart: '500M',
    // Run build before starting
    pre_restart: 'npm run build',
  }]
};