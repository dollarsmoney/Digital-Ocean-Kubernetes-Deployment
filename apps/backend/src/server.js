'use strict';

const { createApp } = require('./app');
const { loadConfig } = require('./config');

const config = loadConfig();
const app = createApp();

const server = app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({
      level: 'info',
      msg: 'backend listening',
      port: config.port,
      appName: config.appName,
      pod: config.podName,
      apiKeyPresent: Boolean(config.apiKey),
    })
  );
});

// Kubernetes sends SIGTERM before removing the pod. Closing the server lets
// in-flight requests finish instead of being cut off mid-response.
function shutdown(signal) {
  return () => {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ level: 'info', msg: 'shutting down', signal }));
    server.close(() => process.exit(0));
  };
}

process.on('SIGTERM', shutdown('SIGTERM'));
process.on('SIGINT', shutdown('SIGINT'));
