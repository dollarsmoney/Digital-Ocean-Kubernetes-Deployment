'use strict';

/**
 * Everything the app needs from its environment, in one place.
 *
 * On the cluster these values arrive from two different Kubernetes objects,
 * both wired into the Deployment with `envFrom`:
 *
 *   ConfigMap "backend-config"  -> APP_NAME, GREETING, LOG_LEVEL   (in git)
 *   Secret    "backend-secret"  -> API_KEY, DB_PASSWORD            (never in git)
 *
 * The app itself cannot tell the difference: both land as plain environment
 * variables. That is the whole point of the pattern - config source is an
 * operational concern, not an application concern.
 */

/** Mask a secret so it can be shown as evidence without being disclosed. */
function maskSecret(value) {
  if (!value) return null;
  if (value.length <= 8) return '*'.repeat(value.length);
  return `${value.slice(0, 6)}${'*'.repeat(Math.min(value.length - 6, 12))}`;
}

function loadConfig(env = process.env) {
  return {
    // From the ConfigMap. Defaults keep local `npm start` working.
    appName: env.APP_NAME || 'do-learn-backend (unconfigured)',
    greeting: env.GREETING || 'Hello (no ConfigMap mounted)',
    logLevel: env.LOG_LEVEL || 'info',

    // From the Secret. Only ever exposed in masked form.
    apiKey: env.API_KEY || null,
    dbPassword: env.DB_PASSWORD || null,

    // Injected by the downward API, so we can prove which pod answered.
    podName: env.POD_NAME || 'unknown-pod',
    nodeName: env.NODE_NAME || 'unknown-node',

    port: Number.parseInt(env.PORT, 10) || 3000,
  };
}

module.exports = { loadConfig, maskSecret };
