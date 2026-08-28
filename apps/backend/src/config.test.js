'use strict';

const { loadConfig, maskSecret } = require('./config');

describe('maskSecret', () => {
  it('returns null for a missing secret', () => {
    expect(maskSecret(undefined)).toBeNull();
    expect(maskSecret(null)).toBeNull();
    expect(maskSecret('')).toBeNull();
  });

  it('fully masks short secrets, leaking no characters', () => {
    expect(maskSecret('abc')).toBe('***');
    expect(maskSecret('12345678')).toBe('********');
  });

  it('reveals only a 6-character prefix of longer secrets', () => {
    const masked = maskSecret('sk_live_abcdefghijklmnop');
    expect(masked.startsWith('sk_liv')).toBe(true);
    expect(masked).not.toContain('abcdefghijklmnop');
  });

  it('never returns the original secret', () => {
    const secret = 'sk_live_supersecretvalue';
    expect(maskSecret(secret)).not.toBe(secret);
  });
});

describe('loadConfig', () => {
  it('falls back to safe defaults when nothing is injected', () => {
    const config = loadConfig({});
    expect(config.appName).toContain('unconfigured');
    expect(config.apiKey).toBeNull();
    expect(config.port).toBe(3000);
  });

  it('reads ConfigMap-sourced values from the environment', () => {
    const config = loadConfig({
      APP_NAME: 'my-app',
      GREETING: 'hi',
      LOG_LEVEL: 'debug',
    });
    expect(config.appName).toBe('my-app');
    expect(config.greeting).toBe('hi');
    expect(config.logLevel).toBe('debug');
  });

  it('reads Secret-sourced values from the environment', () => {
    const config = loadConfig({ API_KEY: 'k', DB_PASSWORD: 'p' });
    expect(config.apiKey).toBe('k');
    expect(config.dbPassword).toBe('p');
  });

  it('parses PORT as a number and ignores garbage', () => {
    expect(loadConfig({ PORT: '8080' }).port).toBe(8080);
    expect(loadConfig({ PORT: 'not-a-port' }).port).toBe(3000);
  });
});
