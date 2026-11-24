import { describe, expect, it } from 'vitest';
import {
  clientMessageSchema,
  colorForClient,
  createDocumentSchema,
  loginSchema,
  PROTOCOL_LIMITS,
  registerSchema,
  serverMessageSchema,
} from '../src/index.js';

describe('sync protocol schemas', () => {
  it('accepts well-formed client messages', () => {
    expect(
      clientMessageSchema.safeParse({
        type: 'hello',
        clientId: 'tab12345',
        vector: { tab12345: 3 },
      }).success,
    ).toBe(true);
    expect(
      clientMessageSchema.safeParse({
        type: 'ops',
        runs: [
          { k: 'i', client: 'tab12345', seq: 1, lamport: 1, origin: null, text: 'hi' },
          {
            k: 'd',
            client: 'tab12345',
            seq: 3,
            lamport: 3,
            targets: [{ client: 'tab12345', seq: 1, len: 2 }],
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      clientMessageSchema.safeParse({
        type: 'presence',
        anchor: { client: 'tab12345', seq: 1 },
        focused: true,
      }).success,
    ).toBe(true);
    expect(clientMessageSchema.safeParse({ type: 'ping' }).success).toBe(true);
  });

  it('rejects malformed or oversized messages', () => {
    expect(
      clientMessageSchema.safeParse({ type: 'hello', clientId: '__proto__', vector: {} }).success,
    ).toBe(false);
    expect(clientMessageSchema.safeParse({ type: 'ops', runs: [] }).success).toBe(false);
    expect(
      clientMessageSchema.safeParse({
        type: 'ops',
        runs: [{ k: 'i', client: 'tab12345', seq: 0, lamport: 1, origin: null, text: 'x' }],
      }).success,
    ).toBe(false);
    expect(
      clientMessageSchema.safeParse({
        type: 'ops',
        runs: [
          {
            k: 'i',
            client: 'tab12345',
            seq: 1,
            lamport: 1,
            origin: null,
            text: 'x'.repeat(PROTOCOL_LIMITS.maxRunText + 1),
          },
        ],
      }).success,
    ).toBe(false);
    expect(clientMessageSchema.safeParse({ type: 'ping', extra: 1 }).success).toBe(false);
    expect(clientMessageSchema.safeParse({ type: 'unknown' }).success).toBe(false);
  });

  it('validates server messages', () => {
    expect(serverMessageSchema.safeParse({ type: 'ack', vector: { tab12345: 1 } }).success).toBe(
      true,
    );
    expect(
      serverMessageSchema.safeParse({ type: 'error', code: 'NOPE', message: 'x' }).success,
    ).toBe(false);
  });

  it('derives a stable colour per client', () => {
    expect(colorForClient('tab12345')).toBe(colorForClient('tab12345'));
    expect(colorForClient('tab12345')).toMatch(/^hsl\(\d+ 70% 45%\)$/);
  });
});

describe('request schemas', () => {
  it('normalises emails and enforces password length', () => {
    const parsed = registerSchema.parse({
      organizationName: 'Northwind',
      displayName: 'Ada',
      email: '  Ada@Example.COM ',
      password: 'long-enough-1',
    });
    expect(parsed.email).toBe('ada@example.com');
    expect(registerSchema.safeParse({ ...parsed, password: 'short' }).success).toBe(false);
    expect(loginSchema.safeParse({ email: 'x', password: 'y' }).success).toBe(false);
    expect(createDocumentSchema.safeParse({ title: '   ' }).success).toBe(false);
  });
});
