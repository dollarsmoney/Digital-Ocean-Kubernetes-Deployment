'use strict';

const request = require('supertest');
const { createApp } = require('./app');

const testEnv = {
  APP_NAME: 'test-backend',
  GREETING: 'Hello from tests',
  LOG_LEVEL: 'debug',
  API_KEY: 'sk_live_abcdefghijklmnop',
  DB_PASSWORD: 'hunter2-but-longer',
  POD_NAME: 'backend-test-pod',
  NODE_NAME: 'test-node',
};

describe('GET /api/health', () => {
  it('reports ok, so the kubelet probe passes', async () => {
    const res = await request(createApp(testEnv)).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

describe('GET /api/info', () => {
  it('returns the ConfigMap values', async () => {
    const res = await request(createApp(testEnv)).get('/api/info');
    expect(res.status).toBe(200);
    expect(res.body.fromConfigMap).toEqual({
      appName: 'test-backend',
      greeting: 'Hello from tests',
      logLevel: 'debug',
    });
  });

  it('confirms the Secret arrived without disclosing it', async () => {
    const res = await request(createApp(testEnv)).get('/api/info');
    expect(res.body.fromSecret.apiKeyPresent).toBe(true);
    expect(res.body.fromSecret.dbPasswordPresent).toBe(true);

    // The guarantee that matters: no raw secret anywhere in the response.
    const body = JSON.stringify(res.body);
    expect(body).not.toContain(testEnv.API_KEY);
    expect(body).not.toContain(testEnv.DB_PASSWORD);
  });

  it('reports which pod answered, proving per-pod injection', async () => {
    const res = await request(createApp(testEnv)).get('/api/info');
    expect(res.body.pod).toEqual({ name: 'backend-test-pod', node: 'test-node' });
  });

  it('reports the secret as absent when none is injected', async () => {
    const res = await request(createApp({})).get('/api/info');
    expect(res.body.fromSecret.apiKeyPresent).toBe(false);
    expect(res.body.fromSecret.apiKeyMasked).toBeNull();
  });
});

describe('unknown routes', () => {
  it('404s as JSON rather than an HTML error page', async () => {
    const res = await request(createApp(testEnv)).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not found' });
  });
});
