import { describe, expect, it } from 'vitest';
import { buildSshCommand, quotePosix, sshHostFingerprint } from '@process/remote/sshRemoteExecutor';
import { parseWslListOutput } from '@process/remote/processRemoteExecutor';

describe('remote executors', () => {
  it('quotes SSH commands and environment values as single POSIX arguments', () => {
    expect(quotePosix("a'b")).toBe(`'a'"'"'b'`);
    const command = buildSshCommand('/opt/Catfish Server/aioncore', ['--data-dir', "/home/o'brien/data"], {
      AIONUI_WORK_DIR: '/home/user/work dir',
    });
    expect(command).toBe(
      `'env' 'AIONUI_WORK_DIR=/home/user/work dir' '/opt/Catfish Server/aioncore' '--data-dir' '/home/o'"'"'brien/data'`
    );
  });

  it('uses OpenSSH-compatible SHA256 host fingerprints', () => {
    expect(sshHostFingerprint(Buffer.from('abc'))).toBe('SHA256:ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0');
  });

  it('parses UTF-16 and UTF-8 WSL distribution lists', () => {
    expect(parseWslListOutput(Buffer.from('Ubuntu-20.04\r\nDebian\r\n', 'utf16le'))).toEqual([
      'Ubuntu-20.04',
      'Debian',
    ]);
    expect(parseWslListOutput(Buffer.from('Ubuntu\n', 'utf8'))).toEqual(['Ubuntu']);
  });
});
