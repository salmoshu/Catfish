import { spawn } from 'node:child_process';
import { createServer, connect } from 'node:net';
import type { AddressInfo } from 'node:net';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { RemoteTunnel, REMOTE_TUNNEL_SOURCE } from '@process/remote/remoteTunnel';
import type { RemoteExecutor } from '@process/remote/remoteExecutor';

const cleanups: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).toReversed()) await cleanup();
});

describe('RemoteTunnel', () => {
  it('preserves binary payloads over the target stdio transport', async () => {
    const echoSockets = new Set<ReturnType<typeof connect>>();
    const echoServer = createServer((socket) => {
      echoSockets.add(socket);
      socket.on('error', () => {});
      socket.once('close', () => echoSockets.delete(socket));
      socket.pipe(socket);
    });
    await new Promise<void>((resolve) => echoServer.listen(0, '127.0.0.1', resolve));
    cleanups.push(async () => {
      for (const socket of echoSockets) socket.destroy();
      await new Promise<void>((resolve) => echoServer.close(() => resolve()));
    });
    const echoPort = (echoServer.address() as AddressInfo).port;
    const directory = await mkdtemp(join(tmpdir(), 'catfish-tunnel-'));
    cleanups.push(() => rm(directory, { recursive: true, force: true }));
    const helperPath = join(directory, 'tunnel.cjs');
    await writeFile(helperPath, REMOTE_TUNNEL_SOURCE);

    const executor: RemoteExecutor = {
      connect: async () => {},
      run: async () => ({ stdout: '', stderr: '', exitCode: 0 }),
      spawn: async (command, args) => {
        const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
        if (!child.stdin || !child.stdout || !child.stderr) throw new Error('missing stdio');
        const exited = new Promise<number | null>((resolve, reject) => {
          child.once('error', reject);
          child.once('close', resolve);
        });
        return {
          stdin: child.stdin,
          stdout: child.stdout,
          stderr: child.stderr,
          wait: () => exited,
          kill: async () => {
            child.kill();
          },
        };
      },
      close: async () => {},
    };
    const tunnel = await RemoteTunnel.listen(executor, process.execPath, helperPath, echoPort);
    cleanups.push(() => tunnel.stop());

    const client = connect(tunnel.port, '127.0.0.1');
    cleanups.push(() => client.destroy());
    await new Promise<void>((resolve, reject) => {
      client.once('connect', resolve);
      client.once('error', reject);
    });
    const expected = Buffer.from([0, 255, 1, 2, 3, 128, 65]);
    const received = new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      let length = 0;
      const timer = setTimeout(() => reject(new Error('timed out waiting for echo')), 5_000);
      client.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
        length += chunk.length;
        if (length >= expected.length) {
          clearTimeout(timer);
          resolve(Buffer.concat(chunks));
        }
      });
      client.once('error', reject);
    });
    client.write(expected);

    expect(await received).toEqual(expected);
  });
});
