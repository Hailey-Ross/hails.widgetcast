module.exports = {
  apps: [{
    name: 'hails.widgetcast',
    script: 'sync.js',
    watch: false,
    restart_delay: 5000,
    max_restarts: 10,
  }],
};
