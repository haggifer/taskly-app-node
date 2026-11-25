import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveDatabaseUrl } from '../src/core/config.ts';

const parts = {
  POSTGRES_USER: 'taskly', POSTGRES_PASSWORD: 'secret', POSTGRES_HOST: 'db.example', DB_PORT: '5433', POSTGRES_DB: 'tasks',
};

function stubParts(values: Partial<Record<keyof typeof parts, string>>) {
  for (const [name, value] of Object.entries({ ...parts, ...values })) vi.stubEnv(name, value);
}

beforeEach(() => {
  // The module loads the repository's .env and CI may set variables: start every test from a known state.
  vi.stubEnv('DATABASE_URL', '');
  stubParts({});
});
afterEach(() => vi.unstubAllEnvs());

describe('resolveDatabaseUrl', () => {
  it('prefers an explicit override over DATABASE_URL', () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://env:env@env-host:5432/env');
    expect(resolveDatabaseUrl('postgresql://override:pw@host:5432/db')).toBe('postgresql://override:pw@host:5432/db');
  });

  it('uses DATABASE_URL when no override is given', () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://env:env@env-host:5432/env');
    expect(resolveDatabaseUrl()).toBe('postgresql://env:env@env-host:5432/env');
    expect(resolveDatabaseUrl('')).toBe('postgresql://env:env@env-host:5432/env');
  });

  it('rewrites the SQLAlchemy psycopg scheme to plain postgresql', () => {
    expect(resolveDatabaseUrl('postgresql+psycopg://u:p@host:5432/db')).toBe('postgresql://u:p@host:5432/db');
    vi.stubEnv('DATABASE_URL', 'postgresql+psycopg://env:env@env-host:5432/env');
    expect(resolveDatabaseUrl()).toBe('postgresql://env:env@env-host:5432/env');
  });

  it('builds the URL from the POSTGRES_* variables and DB_PORT', () => {
    expect(resolveDatabaseUrl()).toBe('postgresql://taskly:secret@db.example:5433/tasks');
  });

  it('encodes special characters in the credentials and database name', () => {
    stubParts({ POSTGRES_USER: 'app user', POSTGRES_PASSWORD: 'p@ss:w/rd', POSTGRES_DB: 'my db/1' });
    const url = resolveDatabaseUrl();
    expect(url).toBe('postgresql://app%20user:p%40ss%3Aw%2Frd@db.example:5433/my%20db%2F1');
    const parsed = new URL(url);
    expect(decodeURIComponent(parsed.username)).toBe('app user');
    expect(decodeURIComponent(parsed.password)).toBe('p@ss:w/rd');
    expect(decodeURIComponent(parsed.pathname.slice(1))).toBe('my db/1');
  });

  it.each(Object.keys(parts))('throws when %s is missing', (name) => {
    vi.stubEnv(name, '');
    expect(() => resolveDatabaseUrl()).toThrow(`Missing environment variable: ${name}`);
  });
});
