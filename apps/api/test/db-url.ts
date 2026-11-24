export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres:///quillsync_test?host=/tmp';

/** Refuse to run destructive test setup against anything but a *_test database. */
export function assertTestDatabase(url: string): { adminUrl: string; name: string } {
  const parsed = new URL(url);
  const name = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (!/^[A-Za-z0-9_]+_test$/.test(name)) {
    throw new Error(
      `Refusing to run tests against "${name}": the database name must end with _test`,
    );
  }
  parsed.pathname = '/postgres';
  return { adminUrl: parsed.toString(), name };
}
