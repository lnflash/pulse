module.exports = {
  apps: [
    // Monolith Mode (Default)
    {
      name: 'pulse-monolith',
      script: './dist/main.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        TRANSPORT_MODE: 'in-process',
      },
      error_file: './logs/pulse-error.log',
      out_file: './logs/pulse-out.log',
      log_file: './logs/pulse-combined.log',
      time: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 4000,
      autorestart: true,
      max_memory_restart: '1G',
      node_args: '--max-old-space-size=1024',
      wait_ready: true,
      listen_timeout: 10000,
    },

    // Multi-Process Mode: API Gateway
    {
      name: 'pulse-gateway',
      script: './dist/main.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        TRANSPORT_MODE: 'rabbitmq',
        PROCESS_TYPE: 'gateway',
      },
      error_file: './logs/gateway-error.log',
      out_file: './logs/gateway-out.log',
      autorestart: true,
    },

    // Multi-Process Mode: Message Worker
    {
      name: 'pulse-worker',
      script: './dist/main.js',
      instances: 2, // Scale workers as needed
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        TRANSPORT_MODE: 'rabbitmq',
        PROCESS_TYPE: 'worker',
      },
      error_file: './logs/worker-error.log',
      out_file: './logs/worker-out.log',
      autorestart: true,
    },
  ],
};
