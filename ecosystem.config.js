const { execSync } = require('child_process');

// Clear port before starting
function clearPort(port) {
  try {
    const pids = execSync(`lsof -ti :${port} 2>/dev/null`, { encoding: 'utf8' }).trim();
    if (pids) {
      console.log(`Clearing port ${port} (PIDs: ${pids})`);
      execSync(`kill -9 ${pids.replace(/\n/g, ' ')}`, { stdio: 'ignore' });
    }
  } catch (e) {
    // No process on port, which is fine
  }
}

// Clear ports on config load
clearPort(3000);

module.exports = {
  apps: [
    {
      name: 'pos-backend',
      script: 'dist/main.js',
      cwd: '/Users/noc/operations/POS',
      node_args: '--enable-source-maps',
      instances: 1,
      exec_mode: 'fork', // Use fork mode instead of cluster for single instance
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',

      // Environment
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },

      // Restart policies (watchdog features)
      exp_backoff_restart_delay: 100,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 4000,

      // Graceful shutdown
      kill_timeout: 5000,

      // Logging
      error_file: '/Users/noc/operations/POS/logs/pm2-error.log',
      out_file: '/Users/noc/operations/POS/logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
    },
    {
      name: 'pos-frontend',
      script: 'npx',
      args: 'vite --host 0.0.0.0 --port 5173',
      cwd: '/Users/noc/operations/POS/frontend',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,

      env: {
        NODE_ENV: 'production',
      },

      // Restart policies
      exp_backoff_restart_delay: 100,
      max_restarts: 10,
      min_uptime: '5s',
      restart_delay: 2000,

      // Logging
      error_file: '/Users/noc/operations/POS/logs/pm2-frontend-error.log',
      out_file: '/Users/noc/operations/POS/logs/pm2-frontend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
    },
  ],
};
