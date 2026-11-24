import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export function newSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Session tokens are stored as HMAC-SHA256(secret, token): a DB leak does not yield usable cookies. */
export function hashSessionToken(secret: string, token: string): Buffer {
  return createHmac('sha256', secret).update(`session:${token}`).digest();
}

/** CSRF token bound to the session (stateless double-submit; ADR-0017). */
export function csrfTokenFor(secret: string, sessionToken: string): string {
  return createHmac('sha256', secret).update(`csrf:${sessionToken}`).digest('base64url');
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
