import { afterEach, describe, expect, it, vi } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.ts';
import { createDatabase, initialize } from '../src/core/database.ts';
import type { Database } from '../src/features/todos/types.ts';

vi.mock('@prisma/adapter-pg', () => ({ PrismaPg: vi.fn(class { constructor(public options: unknown) {} }) }));
vi.mock('../src/generated/prisma/client.ts', () => ({ PrismaClient: vi.fn(class { constructor(public options: unknown) {} }) }));

afterEach(() => vi.clearAllMocks());

describe('createDatabase', () => {
  it('creates a Prisma client on a PostgreSQL adapter with a connection timeout', () => {
    const database = createDatabase('postgresql://test:test@localhost:5432/test');
    expect(PrismaPg).toHaveBeenCalledWith({ connectionString: 'postgresql://test:test@localhost:5432/test', connectionTimeoutMillis: 10000 });
    const adapter = vi.mocked(PrismaPg).mock.instances[0];
    expect(PrismaClient).toHaveBeenCalledWith({ adapter });
    expect(database).toBe(vi.mocked(PrismaClient).mock.instances[0]);
  });
});

describe('initialize', () => {
  it('creates the todos table with its constraints', async () => {
    const $executeRaw = vi.fn().mockResolvedValue(0);
    await initialize({ $executeRaw } as unknown as Database);
    expect($executeRaw).toHaveBeenCalledOnce();
    const sql = ($executeRaw.mock.calls[0][0] as TemplateStringsArray).join('');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS todos');
    expect(sql).toContain('id SERIAL PRIMARY KEY');
    expect(sql).toContain('CONSTRAINT todo_title_not_empty CHECK (length(title) >= 1)');
    expect(sql).toContain("CONSTRAINT todo_priority CHECK (priority IN ('low', 'medium', 'high'))");
    expect(sql).toContain('created_at TIMESTAMPTZ NOT NULL');
  });

  it('propagates database errors', async () => {
    const $executeRaw = vi.fn().mockRejectedValue(new Error('Permission denied'));
    await expect(initialize({ $executeRaw } as unknown as Database)).rejects.toThrow('Permission denied');
  });
});
