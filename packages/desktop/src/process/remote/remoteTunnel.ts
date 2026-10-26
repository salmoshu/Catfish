/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { createServer } from 'node:net';
import type { Server, Socket } from 'node:net';
import type { AddressInfo } from 'node:net';
import type { RemoteExecutor, RemoteProcess } from './remoteExecutor';

export const REMOTE_TUNNEL_SOURCE = `'use strict';
const net = require('net');
const port = Number(process.argv[2]);
if (!Number.isInteger(port) || port < 1 || port > 65535) process.exit(2);
const upstream = net.createConnection({ host: '127.0.0.1', port });
let closing = false;
const close = () => {
  if (closing) return;
  closing = true;
  upstream.destroy();
  process.exit(0);
};
upstream.on('connect', () => {
  process.stdin.pipe(upstream);
  upstream.pipe(process.stdout);
});
upstream.on('error', close);
upstream.on('close', () => process.stdin.destroy());
process.stdin.on('end', () => upstream.end());
process.stdin.on('error', close);
process.stdout.on('error', close);
process.on('SIGTERM', close);
process.on('SIGHUP', close);
`;

export class RemoteTunnel {
  private readonly connections = new Set<Socket>();
  private readonly helpers = new Set<RemoteProcess>();

  private constructor(
    private readonly server: Server,
    readonly port: number
  ) {}

  static async listen(
    executor: RemoteExecutor,
    nodePath: string,
    helperPath: string,
    remotePort: number
  ): Promise<RemoteTunnel> {
    const server = createServer();
    const tunnelPort = await new Promise<number>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port));
    });
    const tunnel = new RemoteTunnel(server, tunnelPort);
    server.on('connection', (socket) => {
      tunnel.connections.add(socket);
      socket.on('error', () => {});
      void executor
        .spawn(nodePath, [helperPath, String(remotePort)])
        .then((helper) => {
          if (!tunnel.connections.has(socket)) {
            void helper.kill();
            return;
          }
          tunnel.helpers.add(helper);
          socket.pipe(helper.stdin);
          helper.stdout.pipe(socket);
          helper.stderr.on('data', () => {});
          helper.stdin.on('error', () => socket.destroy());
          socket.on('error', () => void helper.kill());
          const cleanup = () => {
            tunnel.connections.delete(socket);
            tunnel.helpers.delete(helper);
            void helper.kill();
            socket.destroy();
          };
          socket.once('close', cleanup);
          void helper.wait().then(cleanup, cleanup);
        })
        .catch(() => {
          tunnel.connections.delete(socket);
          socket.destroy();
        });
    });
    return tunnel;
  }

  async stop(): Promise<void> {
    for (const socket of this.connections) socket.destroy();
    await Promise.all([...this.helpers].map((helper) => helper.kill()));
    this.connections.clear();
    this.helpers.clear();
    if (this.server.listening) {
      await new Promise<void>((resolve) => this.server.close(() => resolve()));
    }
  }
}
