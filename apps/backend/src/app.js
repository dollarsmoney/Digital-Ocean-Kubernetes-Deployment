'use strict';

const express = require('express');
const { loadConfig, maskSecret } = require('./config');

/**
 * Build the Express app. Exported separately from server.js so tests can
 * exercise it without binding a port, and so config can be injected.
 */
function createApp(env = process.env) {
  const config = loadConfig(env);
  const app = express();

  app.disable('x-powered-by');

  // Probed by the kubelet readiness/liveness checks in k8s/backend.yaml.
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  /**
   * The demo endpoint. Shows that ConfigMap values arrived intact and that the
   * Secret arrived - without ever returning the secret itself. Returning a raw
   * secret over HTTP would defeat the point of storing it in a Secret.
   */
  app.get('/api/info', (_req, res) => {
    res.json({
      fromConfigMap: {
        appName: config.appName,
        greeting: config.greeting,
        logLevel: config.logLevel,
      },
      fromSecret: {
        apiKeyPresent: Boolean(config.apiKey),
        apiKeyMasked: maskSecret(config.apiKey),
        dbPasswordPresent: Boolean(config.dbPassword),
      },
      // Differs per replica, which is how you prove every pod got the config.
      pod: {
        name: config.podName,
        node: config.nodeName,
      },
      servedAt: new Date().toISOString(),
    });
  });

  app.use((_req, res) => {
    res.status(404).json({ error: 'not found' });
  });

  return app;
}

module.exports = { createApp };
