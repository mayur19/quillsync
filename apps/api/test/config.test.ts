import { describe, expect, it } from 'vitest';
import { trustProxySetting } from '../src/app.js';
import { ConfigError, loadConfig } from '../src/config/env.js';

const base = { DATABASE_URL: 'postgres:///x_test', SESSION_SECRET: 'x'.repeat(40) };

describe('config loader', () => {
  it('applies defaults', () => {
    const config = loadConfig(base);
    expect(config.API_PORT).toBe(4104);
    expect(config.APP_ORIGIN).toBe('http://localhost:5104');
    expect(config.TRUST_PROXY).toBe(false);
    expect(config.LOGIN_EMAIL_FREE_ATTEMPTS).toBe(5);
    expect(Object.isFrozen(config)).toBe(true);
  });

  it('reports every invalid variable', () => {
    expect(() => loadConfig({ SESSION_SECRET: 'short', API_PORT: 'abc' })).toThrow(ConfigError);
    try {
      loadConfig({ SESSION_SECRET: 'short' });
    } catch (error) {
      expect((error as ConfigError).issues.join()).toMatch(/DATABASE_URL/);
      expect((error as ConfigError).issues.join()).toMatch(/SESSION_SECRET/);
    }
  });

  it('requires TRUST_PROXY to be set explicitly in production', () => {
    const prod = { ...base, NODE_ENV: 'production' };
    expect(() => loadConfig(prod)).toThrow(/TRUST_PROXY must be set/);
    expect(loadConfig({ ...prod, TRUST_PROXY: 'false' }).TRUST_PROXY).toBe(false);
  });

  it('rejects the placeholder secret in production', () => {
    expect(() =>
      loadConfig({
        ...base,
        NODE_ENV: 'production',
        TRUST_PROXY: '1',
        SESSION_SECRET: 'replace-me-with-a-long-random-local-only-value',
      }),
    ).toThrow(/placeholder/);
  });

  it('parses TRUST_PROXY as false, a hop count or a proxy list, never "true"', () => {
    expect(loadConfig({ ...base, TRUST_PROXY: 'false' }).TRUST_PROXY).toBe(false);
    expect(loadConfig({ ...base, TRUST_PROXY: '2' }).TRUST_PROXY).toBe(2);
    expect(loadConfig({ ...base, TRUST_PROXY: '10.0.0.1, 192.168.0.0/16' }).TRUST_PROXY).toEqual([
      '10.0.0.1',
      '192.168.0.0/16',
    ]);
    expect(() => loadConfig({ ...base, TRUST_PROXY: 'true' })).toThrow(ConfigError);
  });

  it('maps a hop count to a hop predicate', () => {
    const setting = trustProxySetting(1);
    expect(typeof setting).toBe('function');
    if (typeof setting === 'function') {
      expect(setting('10.0.0.1', 0)).toBe(true);
      expect(setting('10.0.0.2', 1)).toBe(false);
    }
    expect(trustProxySetting(false)).toBe(false);
  });
});
