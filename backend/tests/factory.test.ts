import request from 'supertest';
import { readFileSync } from 'node:fs';
import { afterEach, it, expect, vi } from 'vitest';
import { createApp } from '../src/factory.ts';
import type { Database } from '../src/features/todos/types.ts';
import { record, todo } from './fixture.ts';

afterEach(() => vi.restoreAllMocks());

function setup() {
  const database = {
    todo: { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([record]), create: vi.fn() },
  };
  return { app: createApp(database as unknown as Database), database };
}

it('mounts the health route on the database', async () => {
  const { app, database } = setup();
  const response = await request(app).get('/api/health');
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ status: 'ok' });
  expect(database.todo.findFirst).toHaveBeenCalledOnce();
});

it('mounts the todos routes on a repository backed by the database', async () => {
  const { app, database } = setup();
  const response = await request(app).get('/api/todos');
  expect(response.status).toBe(200);
  expect(response.body).toEqual([todo]);
  expect(database.todo.findMany).toHaveBeenCalledOnce();
});

it('does not advertise Express in the headers', async () => {
  const { app } = setup();
  const response = await request(app).get('/api/health');
  expect(response.headers['x-powered-by']).toBeUndefined();
});

it('returns a JSON 404 for unknown routes', async () => {
  const { app } = setup();
  const response = await request(app).get('/api/unknown');
  expect(response.status).toBe(404);
  expect(response.body).toEqual({ detail: 'Not Found' });
});

it('returns 422 for malformed JSON without reaching the database', async () => {
  const { app, database } = setup();
  const response = await request(app).post('/api/todos').set('Content-Type', 'application/json').send('{"title":');
  expect(response.status).toBe(422);
  expect(response.body).toEqual({ detail: 'Invalid JSON.' });
  expect(database.todo.create).not.toHaveBeenCalled();
});

it('returns 413 for an oversized JSON body', async () => {
  const { app, database } = setup();
  const response = await request(app).post('/api/todos').send({ title: 'Task', description: 'x'.repeat(200 * 1024) });
  expect(response.status).toBe(413);
  expect(response.body).toEqual({ detail: 'Request body too large.' });
  expect(database.todo.create).not.toHaveBeenCalled();
});

it('logs unexpected errors and returns a generic 500', async () => {
  const { app, database } = setup();
  const error = new Error('Database unavailable');
  database.todo.findMany.mockRejectedValue(error);
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  const response = await request(app).get('/api/todos');
  expect(response.status).toBe(500);
  expect(response.body).toEqual({ detail: 'Internal Server Error' });
  expect(consoleError).toHaveBeenCalledWith(error);
});

it('serves the OpenAPI specification and the docs page', async () => {
  const { app } = setup();
  const specification = JSON.parse(readFileSync(new URL('../openapi.json', import.meta.url), 'utf8'));
  const response = await request(app).get('/openapi.json');
  expect(response.status).toBe(200);
  expect(response.body).toEqual(specification);
  const docs = await request(app).get('/docs/');
  expect(docs.status).toBe(200);
  expect(docs.headers['content-type']).toMatch(/text\/html/);
});
