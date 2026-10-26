import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const projectRoot = resolve(__dirname, '../..');
const itWithBash = spawnSync('bash', ['--version'], { encoding: 'utf8' }).status === 0 ? it : it.skip;
const itWithWorkflow = existsSync(resolve(projectRoot, '.github/workflows/_build-reusable.yml')) ? it : it.skip;

function readProjectFile(path: string): string {
  return readFileSync(resolve(projectRoot, path), 'utf8');
}

function yamlBlock(content: string, key: string): string {
  const startMatch = content.match(new RegExp(`^${key}:\\s*$`, 'm'));
  if (!startMatch || startMatch.index === undefined) return '';

  const blockStart = startMatch.index + startMatch[0].length;
  const rest = content.slice(blockStart);
  const nextTopLevelKey = rest.search(/^[a-zA-Z][a-zA-Z0-9]*:\s*$/m);
  return nextTopLevelKey === -1 ? rest : rest.slice(0, nextTopLevelKey);
}

describe('release packaging configuration', () => {
  it('uses the Catfish app, executable, copyright, and GitHub publisher identity', () => {
    const config = readProjectFile('packages/desktop/electron-builder.yml');

    expect(config).toMatch(/^appId: app\.catfish\.desktop$/m);
    expect(config).toMatch(/^productName: Catfish$/m);
    expect(config).toMatch(/^executableName: Catfish$/m);
    expect(config).toContain('copyright: Copyright © 2026 Catfish contributors');
    expect(config).toMatch(/^  owner: salmoshu$/m);
    expect(config).toMatch(/^  repo: Catfish$/m);
    expect(config).toContain('      - aionui');
  });

  itWithWorkflow('keeps the CI backend preparation entry on the existing CatfishCore module', () => {
    const workflow = readProjectFile('.github/workflows/_build-reusable.yml');
    const prepareScript = readProjectFile('scripts/prepareAioncore.js');

    expect(workflow).toContain('run: node scripts/prepareAioncore.js');
    expect(prepareScript).toContain("require('../packages/shared-scripts/src/prepare-catfishcore.js')");
    expect(prepareScript).not.toContain("require('../packages/shared-scripts/src/prepare-aioncore.js')");
  });

  it('keeps mac zip artifacts enabled', () => {
    const config = readProjectFile('packages/desktop/electron-builder.yml');
    const macBlock = yamlBlock(config, 'mac');

    expect(macBlock).toContain('    - dmg');
    expect(macBlock).toContain('    - zip');
  });

  it('does not build Windows zip artifacts', () => {
    const config = readProjectFile('packages/desktop/electron-builder.yml');
    const winBlock = yamlBlock(config, 'win');

    expect(winBlock).toContain('    - nsis');
    expect(winBlock).not.toContain('    - zip');
  });

  itWithWorkflow('uploads mac zip artifacts without a stale Windows zip glob', () => {
    const workflow = readProjectFile('.github/workflows/_build-reusable.yml');

    expect(workflow).toContain('out/Catfish-*-mac-*.zip');
    expect(workflow).not.toContain('out/Catfish-*-win32-*.zip');
  });

  it('retries mac prepackaged builds with both dmg and zip targets', () => {
    const script = readProjectFile('scripts/build-with-builder.js');

    expect(script).toMatch(/--mac\s+dmg\s+zip\s+--\$\{targetArch\}\s+--prepackaged/);
  });

  itWithBash('fails release asset preparation when a mac zip is missing', () => {
    const tempDir = mkdtempSync(resolve(tmpdir(), 'aionui-release-assets-'));
    const artifactsDir = resolve(tempDir, 'build-artifacts');
    const outputDir = resolve(tempDir, 'release-assets');

    try {
      const env = { ...process.env, MOCK_VERSION: '1.0.0' };
      const createResult = spawnSync('bash', ['scripts/create-mock-release-artifacts.sh', artifactsDir], {
        cwd: projectRoot,
        env,
        encoding: 'utf8',
      });
      expect(createResult.status).toBe(0);

      rmSync(resolve(artifactsDir, 'macos-build-arm64', 'Catfish-1.0.0-mac-arm64.zip'), { force: true });

      const prepareResult = spawnSync('bash', ['scripts/prepare-release-assets.sh', artifactsDir, outputDir], {
        cwd: projectRoot,
        env,
        encoding: 'utf8',
      });

      expect(prepareResult.status).not.toBe(0);
      expect(`${prepareResult.stdout}\n${prepareResult.stderr}`).toContain('Missing macOS zip artifact');
    } finally {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });
});
