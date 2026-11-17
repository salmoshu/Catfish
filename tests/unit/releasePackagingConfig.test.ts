import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

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

type ReleaseRun = {
  id: number;
  head_sha: string;
  head_branch: string;
  event: string;
  status: string;
  conclusion: string;
  html_url: string;
};

type ReleaseJob = {
  name: string;
  status: string;
  conclusion: string;
  html_url: string;
};

type GitHubRelease = {
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
  html_url: string;
  assets: { name: string; size: number }[];
};

type ReleaseVerification = {
  expectedJobCount: number;
  expectedAssetCount: number;
  assetCount: number;
};

type ReleaseProfilesModule = {
  getProfile: (name: string) => { jobs: { name: string }[] };
  expectedReleaseAssets: (profile: string, tag: string) => string[];
};

type ReleaseMonitorModule = {
  parseArgs: (argv: string[]) => { sha: string; tag: string; runId?: string };
  selectRun: (runs: ReleaseRun[], options: { sha: string; event?: string; branch?: string }) => ReleaseRun | undefined;
  buildVerification: (input: {
    profile: string;
    tag: string;
    run: ReleaseRun;
    jobs: ReleaseJob[];
    release: GitHubRelease | null;
    expectedCommit: string;
  }) => ReleaseVerification;
};

type ReleasePreflightModule = {
  runPreflight: (options: {
    root: string;
    commands: string[];
    minFreeGb: number;
    network: boolean;
  }) => Promise<{ ok: boolean; checks: { name: string; ok: boolean }[] }>;
};

const require = createRequire(import.meta.url);
const releaseProfiles = require(
  resolve(projectRoot, 'packages/shared-scripts/src/release/releaseProfiles.js')
) as ReleaseProfilesModule;
const releaseMonitor = require(
  resolve(projectRoot, 'packages/shared-scripts/src/release/releaseMonitor.js')
) as ReleaseMonitorModule;
const releasePreflight = require(
  resolve(projectRoot, 'packages/shared-scripts/src/release/releasePreflight.js')
) as ReleasePreflightModule;

const expectedCommit = 'a'.repeat(40);
const successfulRun: ReleaseRun = {
  id: 123,
  head_sha: expectedCommit,
  head_branch: 'main',
  event: 'workflow_dispatch',
  status: 'completed',
  conclusion: 'success',
  html_url: 'https://example.test/runs/123',
};

function successfulJobs(profile: string): ReleaseJob[] {
  return releaseProfiles.getProfile(profile).jobs.map((job) => ({
    name: job.name,
    status: 'completed',
    conclusion: 'success',
    html_url: `https://example.test/jobs/${encodeURIComponent(job.name)}`,
  }));
}

function stableRelease(profile: string, tag: string): GitHubRelease {
  return {
    tag_name: tag,
    draft: false,
    prerelease: false,
    html_url: `https://example.test/releases/${tag}`,
    assets: releaseProfiles.expectedReleaseAssets(profile, tag).map((name) => ({ name, size: 1 })),
  };
}

function createMinimalProject(root: string): void {
  for (const path of ['package.json', 'bun.lock', 'packages/desktop/electron-builder.yml', 'resources/app.ico']) {
    const filePath = resolve(root, path);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, path === 'package.json' ? JSON.stringify({ version: '1.2.3' }) : 'test');
  }
}

describe('release safety tools', () => {
  it.each([
    ['catfish', 'v0.5.0', 13, 25],
    ['core', 'v0.2.6', 8, 7],
  ])('verifies the complete %s release contract', (profile, tag, jobCount, assetCount) => {
    const report = releaseMonitor.buildVerification({
      profile,
      tag,
      run: successfulRun,
      jobs: successfulJobs(profile),
      release: stableRelease(profile, tag),
      expectedCommit,
    });

    expect(report.expectedJobCount).toBe(jobCount);
    expect(report.expectedAssetCount).toBe(assetCount);
    expect(report.assetCount).toBe(assetCount);
  });

  it('selects only the expected commit and source filters', () => {
    const staleRun = { ...successfulRun, id: 122, head_sha: 'b'.repeat(40) };

    expect(releaseMonitor.selectRun([staleRun], { sha: expectedCommit })).toBeUndefined();
    expect(
      releaseMonitor.selectRun([staleRun, successfulRun], {
        sha: expectedCommit,
        event: 'workflow_dispatch',
        branch: 'main',
      })
    ).toEqual(successfulRun);
  });

  it('rejects missing jobs and empty or unexpected release assets', () => {
    const jobs = successfulJobs('core').slice(1);
    const release = stableRelease('core', 'v0.2.6');
    release.assets[0].size = 0;

    expect(() =>
      releaseMonitor.buildVerification({
        profile: 'core',
        tag: 'v0.2.6',
        run: successfulRun,
        jobs,
        release,
        expectedCommit,
      })
    ).toThrow(/Required job is not successful[\s\S]*Missing or empty assets/);
  });

  it('requires an immutable commit, stable tag, and explicit run for failed-job retries', () => {
    expect(() => releaseMonitor.parseArgs([])).toThrow('--sha requires the full expected source commit');
    expect(() => releaseMonitor.parseArgs(['--sha', expectedCommit, '--tag', 'v0.5.0-dev-abc'])).toThrow(
      '--tag requires a stable tag'
    );
    expect(() => releaseMonitor.parseArgs(['--sha', expectedCommit, '--tag', 'v0.5.0', '--rerun-failed'])).toThrow(
      '--rerun-failed requires --run-id'
    );
  });

  it('passes preflight for a minimal complete project', async () => {
    const tempDir = mkdtempSync(resolve(projectRoot, '.tmp_release-preflight-'));
    try {
      createMinimalProject(tempDir);
      const report = await releasePreflight.runPreflight({
        root: tempDir,
        commands: [],
        minFreeGb: 0,
        network: false,
      });

      expect(report.ok).toBe(true);
    } finally {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it('fails preflight when a required project file is missing', async () => {
    const tempDir = mkdtempSync(resolve(projectRoot, '.tmp_release-preflight-'));
    try {
      createMinimalProject(tempDir);
      rmSync(resolve(tempDir, 'resources/app.ico'));
      const report = await releasePreflight.runPreflight({
        root: tempDir,
        commands: [],
        minFreeGb: 0,
        network: false,
      });

      expect(report.ok).toBe(false);
      expect(report.checks).toContainEqual(expect.objectContaining({ name: 'file:resources/app.ico', ok: false }));
    } finally {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });
});

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

  it('checks the Catfish Core binary in web CLI smoke tests', () => {
    const script = readProjectFile('scripts/smoke-test-web-cli.sh');

    expect(script).toContain('BACKEND_BINARY="$BACKEND_DIR/catfishcore"');
    expect(script).not.toContain('BACKEND_BINARY="$BACKEND_DIR/aioncore"');
  });

  it('allows the cpu-features buildcheck required for Electron rebuilds', () => {
    const manifest = JSON.parse(readProjectFile('package.json')) as {
      dependencies?: Record<string, string>;
      trustedDependencies?: string[];
    };

    expect(manifest.dependencies?.['cpu-features']).toBe('0.0.10');
    expect(manifest.trustedDependencies).toContain('cpu-features');
  });

  itWithWorkflow('skips source map validation when Sentry credentials are absent', () => {
    const workflow = readProjectFile('.github/workflows/_build-reusable.yml');

    expect(workflow).toContain('if [[ "${{ matrix.platform }}" == "linux-x64" && -n "${SENTRY_AUTH_TOKEN:-}" ]]');
    expect(workflow).toContain("if: matrix.platform == 'linux-x64' && env.SENTRY_UPLOAD_SOURCE_MAPS == 'true'");
  });

  itWithWorkflow('uses explicit target architectures for native rebuilds', () => {
    const workflow = readProjectFile('.github/workflows/_build-reusable.yml');

    expect(workflow).toContain('bunx electron-builder install-app-deps --arch=${{ matrix.arch }}');
    expect(workflow).toContain('Tee-Object -FilePath "$env:RUNNER_TEMP/native-rebuild.log"');
    expect(workflow).not.toContain('bun x --yes prebuild-install');
  });

  it('retires only the CI transition release when republishing 0.4.5', () => {
    const workflow = readProjectFile('.github/workflows/build-and-release.yml');

    expect(workflow).toContain("if: github.ref == 'refs/tags/v0.4.5'");
    expect(workflow).toContain("tag: 'v0.4.12'");
    expect(workflow).toContain('draft: true');
  });

  it('creates only new stable tags after candidate builds and never moves an existing tag', () => {
    const workflow = readProjectFile('.github/workflows/build-and-release.yml');
    const manualReleaseGate =
      "(github.event_name == 'workflow_dispatch' && inputs.release_tag != '' && !contains(inputs.release_tag, '-dev-'))";

    expect(workflow.match(new RegExp(manualReleaseGate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))).toHaveLength(5);
    expect(workflow.match(/git ls-remote --exit-code --tags origin/g)).toHaveLength(2);
    expect(workflow).toContain('if [[ "$RELEASE_TAG" != "v$VERSION" ]]');
    expect(workflow).toContain('if [[ "$GITHUB_REF" != "refs/heads/main" ]]');
    expect(workflow).toContain('release_tag_oid: ${{ steps.release_tag.outputs.oid }}');
    expect(workflow).toContain('if [[ "$ACTUAL_OID" != "$EXPECTED_OID" ]]');
    expect(workflow).toContain('if [[ -n "$MANUAL_RELEASE_TAG" ]]');
    expect(workflow).toContain(
      "target_commitish: ${{ github.event_name == 'workflow_dispatch' && needs.code-quality.outputs.release_tag_exists == 'false' && github.sha || '' }}"
    );
    expect(workflow.match(/target_commitish:/g)).toHaveLength(1);
  });

  it('uses supported macOS runners for build workflows', () => {
    for (const path of [
      '.github/workflows/build-and-release.yml',
      '.github/workflows/pack-web-cli.yml',
      '.github/workflows/build-manual.yml',
      '.github/workflows/pr-checks.yml',
    ]) {
      expect(readProjectFile(path)).not.toContain('macos-14');
    }
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

  it('always embeds the Catfish icon in Windows executables', () => {
    const config = readProjectFile('packages/desktop/electron-builder.yml');
    const winBlock = yamlBlock(config, 'win');
    const buildScript = readProjectFile('scripts/build-with-builder.js');

    expect(winBlock).toContain('  icon: resources/app.ico');
    expect(buildScript).not.toContain('signAndEditExecutable=false');
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

  itWithBash(
    'fails release asset preparation when a mac zip is missing',
    () => {
      const tempDir = mkdtempSync(resolve(projectRoot, '.tmp_release-assets-'));
      const artifactsDir = resolve(tempDir, 'build-artifacts');
      const outputDir = resolve(tempDir, 'release-assets');
      // Relative paths work in both WSL and Git Bash without Windows drive conversion.
      const shellArtifactsDir = relative(projectRoot, artifactsDir).replace(/\\/g, '/');
      const shellOutputDir = relative(projectRoot, outputDir).replace(/\\/g, '/');

      try {
        const env = { ...process.env, MOCK_VERSION: '1.0.0' };
        const createResult = spawnSync('bash', ['scripts/create-mock-release-artifacts.sh', shellArtifactsDir], {
          cwd: projectRoot,
          env,
          encoding: 'utf8',
        });
        expect(createResult.status).toBe(0);

        rmSync(resolve(artifactsDir, 'macos-build-arm64', 'Catfish-1.0.0-mac-arm64.zip'), { force: true });

        const prepareResult = spawnSync(
          'bash',
          ['scripts/prepare-release-assets.sh', shellArtifactsDir, shellOutputDir],
          {
            cwd: projectRoot,
            env,
            encoding: 'utf8',
          }
        );

        expect(prepareResult.status).not.toBe(0);
        expect(`${prepareResult.stdout}\n${prepareResult.stderr}`).toContain('Missing macOS zip artifact');
      } finally {
        rmSync(tempDir, { force: true, recursive: true });
      }
    },
    30_000
  );
});
