import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { RemoteEnvironmentStore } from '@process/remote/remoteEnvironmentStore';

const directories: string[] = [];
const cipher = {
  isAvailable: () => true,
  encrypt: (value: string) => Buffer.from(`encrypted:${value}`),
  decrypt: (value: Buffer) => value.toString('utf8').replace(/^encrypted:/, ''),
};

async function createStore(): Promise<{ file: string; store: RemoteEnvironmentStore }> {
  const directory = await mkdtemp(join(tmpdir(), 'catfish-remote-store-'));
  directories.push(directory);
  const file = join(directory, 'remote-environments.json');
  return { file, store: new RemoteEnvironmentStore(file, cipher) };
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('RemoteEnvironmentStore', () => {
  it('persists only encrypted secrets and decrypts them at connection time', async () => {
    const { file, store } = await createStore();
    const environment = await store.save({
      kind: 'ssh',
      host: 'example.test',
      username: 'root',
      authType: 'password',
      password: 'very-secret',
    });

    expect(environment).not.toHaveProperty('password');
    const persisted = await readFile(file, 'utf8');
    expect(persisted).not.toContain('very-secret');
    expect(persisted).toContain('passwordCiphertext');

    const reloaded = new RemoteEnvironmentStore(file, cipher);
    expect(reloaded.getConnection(environment.id).password).toBe('very-secret');
    expect(reloaded.list()[0]).toEqual(environment);
  });

  it('updates trusted host keys without exposing private connection data in list results', async () => {
    const { file, store } = await createStore();
    const environment = await store.save({
      kind: 'ssh',
      host: 'example.test',
      username: 'root',
      authType: 'privateKey',
      privateKeyPath: join(file, 'id_rsa'),
      passphrase: 'key-secret',
    });
    await store.approveHostKey(environment.id, 'SHA256:trusted');
    const reloaded = new RemoteEnvironmentStore(file, cipher);
    const connection = reloaded.getConnection(environment.id);

    expect(connection.trustedHostKey).toBe('SHA256:trusted');
    expect(connection.passphrase).toBe('key-secret');
    expect(reloaded.list()[0]).not.toHaveProperty('passphraseCiphertext');
  });

  it('validates container identifiers and SSH ports', async () => {
    const { store } = await createStore();
    await expect(store.save({ kind: 'docker', container: '--privileged' })).rejects.toMatchObject({
      code: 'invalid_input',
    });
    await expect(
      store.save({ kind: 'ssh', host: 'example.test', port: 0, username: 'root', authType: 'password', password: 'x' })
    ).rejects.toMatchObject({ code: 'invalid_input' });
  });
});
