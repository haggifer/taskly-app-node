---
name: writing-backend-tests
description: Writes Vitest unit tests for the Express + Prisma back end in the repository's own style, with no database or network. Use when the unit-test agent has a write or update decision for a file under backend/src.
---

# Writing back-end tests

Read `backend/tests/` before writing: the existing tests are the style guide. Match them over anything here.

## Files and style

- One file per module: `backend/tests/<module>.test.ts` (flat folder). Extend the existing file for a module
  rather than creating a second one.
- Import sources with the `.ts` extension, as the existing tests do: `import { createApp } from '../src/factory.ts'`.
- Semicolons and single quotes; the back end has no formatter, so copy the neighbouring files.
- Import test functions explicitly: `import { afterEach, describe, expect, it, vi } from 'vitest'`.
- Reuse `tests/fixture.ts`: `record` is a Prisma row, `todo` is the matching API object. Add new fixtures as new
  exports there only when two or more test files need them.
- Name tests after behavior in the present tense: `it('returns 404 when the task does not exist')`. Use `it.each`
  for input tables, as `validators.test.ts` does.

## Patterns by layer

**Repository (`features/*/repository.ts`):** build the real Prisma delegate without a database and spy on its IO:

```ts
const database = createDatabase('postgresql://test:test@localhost:5432/test');
const findMany = vi.spyOn(database.todo, 'findMany').mockResolvedValue([record]);
```

Assert the mapped result **and** the exact Prisma arguments (`toHaveBeenCalledWith`). Add
`afterEach(() => vi.restoreAllMocks())`.

**Router (`features/*/router.ts`):** mount the router on a bare app with a fake store and call it with Supertest:

```ts
const repository = { list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() };
const app = express().use(express.json()).use('/api/todos', createTodosRouter(repository));
const response = await request(app).patch('/api/todos/1').send({ completed: true });
```

Cover each route's success status and body, 404 and 422 paths, and the store arguments. For invalid input, also
assert that the store was **not** called.

**App factory (`factory.ts`):** pass a fake database (`{ todo: { findFirst: vi.fn() } } as unknown as Database`)
and check the JSON 404, invalid JSON (422), oversized body (413), unexpected errors (500, with `console.error`
spied and silenced) and `/openapi.json`.

**Config (`core/config.ts`):** set variables with `vi.stubEnv`, clear them with `vi.unstubAllEnvs()` in `afterEach`,
and assert the built URL, including the encoding of special characters and the error for each missing variable.

**Database and lifespan (`core/database.ts`, `core/lifespan.ts`):** mock the collaborators with `vi.mock` (the Prisma
client, `createApp`) and assert the calls: `initialize` runs the DDL through `$executeRaw`, and `start` connects,
initializes, listens and disconnects on failure. If a function only wires modules together, record it as
`skip-not-testable` instead of mocking everything.

## Avoid

- A real PostgreSQL, real network, real timers or `setTimeout` sleeps.
- Snapshot tests, or assertions on private helpers and implementation details.
- `any`: type fakes against the interface (`TodoStore`), or cast narrowly with `as unknown as Database`.
- Restating validation tables that `validators.test.ts` already covers. Test what the new code adds.
