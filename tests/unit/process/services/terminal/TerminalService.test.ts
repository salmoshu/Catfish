import { describe, expect, it, vi } from 'vitest';
import type { IPty } from 'node-pty';
import { TerminalService } from '@process/services/terminal/TerminalService';

const fixture = () => {
  let output: (data: string) => void = vi.fn();
  let exit: (event: { exitCode: number; signal?: number }) => void = vi.fn();
  const terminal = {
    cols: 100,
    rows: 30,
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    onData: vi.fn((handler: typeof output) => {
      output = handler;
      return { dispose: vi.fn() };
    }),
    onExit: vi.fn((handler: typeof exit) => {
      exit = handler;
      return { dispose: vi.fn() };
    }),
  };
  const spawn = vi.fn<(typeof import('node-pty'))['spawn']>().mockReturnValue(terminal as unknown as IPty);
  const loadPty = vi.fn().mockResolvedValue({ spawn });
  const emit = vi.fn();
  const service = new TerminalService({ loadPty, emit });
  service.registerOwner(1);
  return {
    service,
    terminal,
    spawn,
    loadPty,
    emit,
    output: (data: string) => output(data),
    exit: () => exit({ exitCode: 0 }),
  };
};

const params = { terminal_id: 'terminal-1', cwd: process.cwd() };

describe('owned terminal sessions', () => {
  it('reports a missing working directory without loading the native module', async () => {
    const f = fixture();
    const result = await f.service.start(1, { ...params, cwd: 'relative/path' });
    expect(result.error).toContain('absolute directory');
    expect(f.loadPty).not.toHaveBeenCalled();
  });

  it('reports a native module failure without crashing the application', async () => {
    const f = fixture();
    f.loadPty.mockRejectedValue(new Error('Native binary is unavailable'));
    expect(await f.service.start(1, params)).toEqual({ terminal_id: '', error: 'Native binary is unavailable' });
  });

  it('isolates input, resizing and closing between windows', async () => {
    const f = fixture();
    await f.service.start(1, params);
    f.service.write(2, params.terminal_id, 'untrusted');
    f.service.resize(2, params.terminal_id, 20, 10);
    f.service.kill(2, params.terminal_id);
    expect(f.terminal.write).not.toHaveBeenCalled();
    expect(f.terminal.resize).not.toHaveBeenCalled();
    expect(f.terminal.kill).not.toHaveBeenCalled();

    f.service.write(1, params.terminal_id, 'echo hello\r');
    expect(f.terminal.write).toHaveBeenCalledWith('echo hello\r');
  });

  it('sends shell output only to the window that owns it', async () => {
    const f = fixture();
    await f.service.start(1, params);
    f.output('shell prompt');
    expect(f.emit).toHaveBeenCalledWith(1, { terminal_id: params.terminal_id, type: 'data', data: 'shell prompt' });
  });

  it('clamps invalid dimensions before they reach the native terminal', async () => {
    const f = fixture();
    await f.service.start(1, { ...params, cols: Number.NaN, rows: -10 });
    expect(f.spawn).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({ cols: 100, rows: 1 })
    );
    f.service.resize(1, params.terminal_id, Infinity, 100_000);
    expect(f.terminal.resize).toHaveBeenCalledWith(100, 1000);
  });

  it('removes exited processes so later input and close requests are harmless', async () => {
    const f = fixture();
    await f.service.start(1, params);
    f.exit();
    f.service.write(1, params.terminal_id, 'ignored');
    f.service.kill(1, params.terminal_id);
    expect(f.terminal.write).not.toHaveBeenCalled();
    expect(f.terminal.kill).not.toHaveBeenCalled();
    expect(f.emit).toHaveBeenCalledWith(1, expect.objectContaining({ type: 'exit', exit_code: 0 }));
  });

  it('cancels pending starts when a renderer reloads', async () => {
    const f = fixture();
    let finishLoading!: (module: { spawn: typeof f.spawn }) => void;
    f.loadPty.mockReturnValue(
      new Promise((resolve) => {
        finishLoading = resolve;
      })
    );
    const starting = f.service.start(1, params);
    f.service.closeOwner(1);
    f.service.registerOwner(1);
    finishLoading({ spawn: f.spawn });
    expect((await starting).error).toContain('unavailable');
    expect(f.spawn).not.toHaveBeenCalled();
  });

  it('kills all owned processes when the application quits, even if one already exited', async () => {
    const f = fixture();
    await f.service.start(1, params);
    f.terminal.kill.mockImplementationOnce(() => {
      throw new Error('Already exited');
    });
    expect(() => f.service.dispose()).not.toThrow();
    expect((await f.service.start(1, params)).error).toContain('unavailable');
  });

  it('rejects duplicate ids without replacing the existing shell', async () => {
    const f = fixture();
    await f.service.start(1, params);
    expect((await f.service.start(1, params)).error).toContain('already exists');
    expect(f.spawn).toHaveBeenCalledTimes(1);
  });
});
