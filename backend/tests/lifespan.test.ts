import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabase, initialize } from '../src/core/database.ts';
import { resolveDatabaseUrl } from '../src/core/config.ts';
import { createApp } from '../src/factory.ts';
import { start } from '../src/core/lifespan.ts';

vi.mock('../src/core/database.ts', () => ({ createDatabase: vi.fn(), initialize: vi.fn() }));
vi.mock('../src/core/config.ts', () => ({ resolveDatabaseUrl: vi.fn() }));
vi.mock('../src/factory.ts', () => ({ createApp: vi.fn() }));

type Handler = () => void;

class FakeServer extends EventEmitter {
  closeCallback?: () => Promise<void>;
  address() { return { port: 8123, address: '0.0.0.0', family: 'IPv4' }; }
  close(callback: () => Promise<void>) { this.closeCallback = callback; return this; }
}

function setup({ listenError }: { listenError?: Error } = {}) {
  const database = { $connect: vi.fn().mockResolvedValue(undefined), $disconnect: vi.fn().mockResolvedValue(undefined) };
  const server = new FakeServer();
  // `start` reads the returned server inside the callback, so the callback must run after `listen` returns.
  const listen = vi.fn((port: number, host: string, callback: () => void) => {
    queueMicrotask(listenError ? () => server.emit('error', listenError) : callback);
    return server;
  });
  vi.mocked(resolveDatabaseUrl).mockReturnValue('postgresql://test:test@localhost:5432/test');
  vi.mocked(createDatabase).mockReturnValue(database as unknown as ReturnType<typeof createDatabase>);
  vi.mocked(initialize).mockResolvedValue(undefined);
  vi.mocked(createApp).mockReturnValue({ listen } as unknown as ReturnType<typeof createApp>);
  const handlers = new Map<string, Handler>();
  const once = vi.spyOn(process, 'once').mockImplementation(((event: string, handler: Handler) => {
    handlers.set(event, handler);
    return process;
  }) as unknown as typeof process.once);
  return { database, server, listen, handlers, once };
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.stubEnv('API_PORT', '');
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  process.exitCode = undefined;
});

describe('start', () => {
  it('connects, initializes, builds the app and listens on port 8000 by default', async () => {
    const { database, server, listen } = setup();
    expect(await start()).toEqual({ server, database });
    expect(createDatabase).toHaveBeenCalledWith('postgresql://test:test@localhost:5432/test');
    expect(database.$connect).toHaveBeenCalledOnce();
    expect(initialize).toHaveBeenCalledWith(database);
    expect(createApp).toHaveBeenCalledWith(database);
    expect(listen).toHaveBeenCalledWith(8000, '0.0.0.0', expect.any(Function));
    expect(console.log).toHaveBeenCalledWith('Taskly App Node API listening on port 8123');
    expect(database.$disconnect).not.toHaveBeenCalled();
  });

  it('listens on API_PORT when it is set', async () => {
    vi.stubEnv('API_PORT', '9001');
    const { listen } = setup();
    await start();
    expect(listen).toHaveBeenCalledWith(9001, '0.0.0.0', expect.any(Function));
  });

  it('registers SIGTERM and SIGINT shutdown handlers', async () => {
    const { handlers, once } = setup();
    await start();
    expect(once).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
    expect(once).toHaveBeenCalledWith('SIGINT', expect.any(Function));
    expect(handlers.get('SIGTERM')).toBe(handlers.get('SIGINT'));
  });

  it('disconnects and rethrows when connecting fails', async () => {
    const { database, listen } = setup();
    database.$connect.mockRejectedValue(new Error('Connection refused'));
    await expect(start()).rejects.toThrow('Connection refused');
    expect(database.$disconnect).toHaveBeenCalledOnce();
    expect(initialize).not.toHaveBeenCalled();
    expect(listen).not.toHaveBeenCalled();
  });

  it('disconnects and rethrows when initialization fails', async () => {
    const { database, listen } = setup();
    vi.mocked(initialize).mockRejectedValue(new Error('Permission denied'));
    await expect(start()).rejects.toThrow('Permission denied');
    expect(database.$disconnect).toHaveBeenCalledOnce();
    expect(listen).not.toHaveBeenCalled();
  });

  it('disconnects and rethrows when the server cannot listen', async () => {
    const { database, once } = setup({ listenError: new Error('EADDRINUSE') });
    await expect(start()).rejects.toThrow('EADDRINUSE');
    expect(database.$disconnect).toHaveBeenCalledOnce();
    expect(once).not.toHaveBeenCalled();
  });
});

describe('shutdown', () => {
  it('closes the server, then disconnects the database and cancels the forced exit', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as unknown as typeof process.exit);
    const { database, server, handlers } = setup();
    await start();
    handlers.get('SIGTERM')!();
    expect(server.closeCallback).toBeDefined();
    expect(database.$disconnect).not.toHaveBeenCalled();
    await server.closeCallback!();
    expect(database.$disconnect).toHaveBeenCalledOnce();
    expect(process.exitCode).toBeUndefined();
    vi.advanceTimersByTime(10000);
    expect(exit).not.toHaveBeenCalled();
  });

  it('logs a disconnect failure and sets a failing exit code', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    vi.spyOn(process, 'exit').mockImplementation((() => undefined) as unknown as typeof process.exit);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { database, server, handlers } = setup();
    const error = new Error('Disconnect failed');
    database.$disconnect.mockRejectedValue(error);
    await start();
    handlers.get('SIGINT')!();
    await server.closeCallback!();
    expect(consoleError).toHaveBeenCalledWith(error);
    expect(process.exitCode).toBe(1);
  });

  it('forces exit with code 1 when closing takes longer than 10 seconds', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as unknown as typeof process.exit);
    const { handlers } = setup();
    await start();
    handlers.get('SIGTERM')!();
    vi.advanceTimersByTime(9999);
    expect(exit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(exit).toHaveBeenCalledWith(1);
  });
});
