module.exports = {
  apps: [{
    name: "caipu-zhuanjia-api",
    cwd: "/var/www/caipu-zhuanjia/server",
    script: "index.mjs",
    interpreter: "node",
    autorestart: true,
    watch: false,
    restart_delay: 3000,
    exp_backoff_restart_delay: 100,
    max_restarts: 20,
    kill_timeout: 5000,
    env: {NODE_ENV: "production", PORT: 8787}
  }]
};
