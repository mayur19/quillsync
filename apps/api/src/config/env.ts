import { z } from 'zod';

const SECRET_PLACEHOLDER = 'replace-me-with-a-long-random-local-only-value';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_HOST: z.string().min(1).default('127.0.0.1'),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(4104),
    APP_ORIGIN: z.string().url().default('http://localhost:5104'),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
    SESSION_TTL_HOURS: z.coerce
      .number()
      .int()
      .min(1)
      .max(24 * 90)
      .default(168),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    /** Failed sign-ins per email before progressive lockout starts (30 s, doubling, max 15 min). */
    LOGIN_EMAIL_FREE_ATTEMPTS: z.coerce.number().int().min(1).max(100).default(5),
    /** Sign-in attempts per client IP per 15 minutes (password-spraying guard). */
    LOGIN_IP_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(10_000).default(30),
    /** Distinct emails one client IP (/64 for IPv6) may try per 15 minutes. */
    LOGIN_EMAILS_PER_IP_MAX: z.coerce.number().int().min(1).max(10_000).default(20),
    /** Registrations per client IP per hour. */
    REGISTER_IP_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(10_000).default(5),
    /**
     * Reverse-proxy trust for client IPs: "false" (default), a hop count such as
     * "1", or a comma-separated list of proxy IPs/CIDRs. "true" is rejected.
     */
    TRUST_PROXY: z
      .string()
      .optional()
      .transform((value, ctx): false | number | string[] | undefined => {
        if (value === undefined) return undefined;
        const trimmed = value.trim();
        if (trimmed === '' || trimmed === 'false') return false;
        if (/^\d+$/.test(trimmed)) return Number(trimmed);
        const entries = trimmed.split(',').map((entry) => entry.trim());
        const valid = entries.every((entry) => /^[0-9a-fA-F:.]+(\/\d{1,3})?$/.test(entry));
        if (!valid) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'TRUST_PROXY must be false, a hop count, or a list of proxy IPs/CIDRs',
          });
          return z.NEVER;
        }
        return entries;
      }),
    WS_MAX_MESSAGE_BYTES: z.coerce
      .number()
      .int()
      .min(1024)
      .max(16 * 1024 * 1024)
      .default(262_144),
    DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && env.TRUST_PROXY === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['TRUST_PROXY'],
        message:
          'TRUST_PROXY must be set explicitly in production (false, a hop count, or proxy IPs/CIDRs)',
      });
    }
    if (env.NODE_ENV === 'production' && env.SESSION_SECRET === SECRET_PLACEHOLDER) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SESSION_SECRET'],
        message: 'SESSION_SECRET still has the placeholder value',
      });
    }
  });

type ParsedEnv = z.infer<typeof envSchema>;
export type AppConfig = Readonly<
  Omit<ParsedEnv, 'TRUST_PROXY'> & { TRUST_PROXY: false | number | string[] }
>;

export class ConfigError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`Invalid configuration:\n  - ${issues.join('\n  - ')}`);
    this.name = 'ConfigError';
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    throw new ConfigError(result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
  }
  return Object.freeze({ ...result.data, TRUST_PROXY: result.data.TRUST_PROXY ?? false });
}
