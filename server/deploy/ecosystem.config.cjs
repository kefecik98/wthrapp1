// PM2 ecosystem file for the WeatherAlert server.
//
// Usage on the app VM (after `npm run build`):
//   pm2 start deploy/ecosystem.config.cjs
//   pm2 save           # persist the process list across reboots
//   pm2 startup        # follow the printed command to enable boot start
//
// The Node process reads .env from cwd via dotenv (see src/config.ts), so
// PM2 just needs to start it in the project root — env vars are not
// injected here.

module.exports = {
  apps: [
    {
      name: "weatheralert-api",
      script: "dist/index.js",
      cwd: "/opt/weatheralert/server",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "512M",

      // node-cron lives in this process; clustering would fire the alert
      // engine N times. Keep instances: 1 unless the engine is extracted.
      out_file: "/var/log/weatheralert/out.log",
      error_file: "/var/log/weatheralert/error.log",
      merge_logs: true,
      time: true,

      // SIGTERM → graceful shutdown handler in src/index.ts closes Fastify
      // and disconnects Prisma. Give it a few seconds before SIGKILL.
      kill_timeout: 10000,
    },
  ],
};
