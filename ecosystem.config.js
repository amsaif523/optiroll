module.exports = {
  apps: [
    {
      name: 'optiroll-backend',
      script: 'src/app.js',
      cwd: './optiroll-backend',
      env: {
        NODE_ENV: 'production',
        PORT: 5005,
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
    },
    {
      name: 'optiroll-frontend',
      script: 'npm',
      args: 'start',
      cwd: './optiroll-frontend',
      env: {
        NODE_ENV: 'production',
        PORT: 3005,
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
    },
  ],
}
