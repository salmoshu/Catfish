const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { GitHubApi } = require('./githubApi');
const { verifyBundledCatfishcoreResources } = require('../verify-bundled-catfishcore-resources');

const PROJECT_FILES = ['package.json', 'bun.lock', 'packages/desktop/electron-builder.yml', 'resources/app.ico'];

function takeValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value.`);
  return value;
}

function parseArgs(argv) {
  const options = {
    root: path.resolve(__dirname, '../../../..'),
    commands: ['node', 'git', 'bun', 'curl'],
    minFreeGb: 8,
    network: false,
    requireDependencies: false,
    verifyResources: false,
    json: false,
    repo: 'salmoshu/CatfishCore',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (['--root', '--core-bundle', '--electron-dist', '--node-runtime', '--repo'].includes(flag)) {
      const value = takeValue(argv, index, flag);
      const key = flag.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      options[key] = value;
      index += 1;
    } else if (flag === '--commands') {
      options.commands = takeValue(argv, index, flag)
        .split(',')
        .map((command) => command.trim())
        .filter(Boolean);
      index += 1;
    } else if (flag === '--min-free-gb') {
      options.minFreeGb = Number(takeValue(argv, index, flag));
      index += 1;
    } else if (flag === '--network') {
      options.network = true;
    } else if (flag === '--require-dependencies') {
      options.requireDependencies = true;
    } else if (flag === '--verify-resources') {
      options.verifyResources = true;
    } else if (flag === '--json') {
      options.json = true;
    } else {
      throw new Error(`Unknown argument: ${flag}`);
    }
  }
  if (!Number.isFinite(options.minFreeGb) || options.minFreeGb < 0) {
    throw new Error('--min-free-gb must be a non-negative number.');
  }
  return options;
}

function nonEmptyFile(filePath) {
  return fs.existsSync(filePath) && fs.statSync(filePath).isFile() && fs.statSync(filePath).size > 0;
}

function existingDirectory(directory) {
  return fs.existsSync(directory) && fs.statSync(directory).isDirectory();
}

async function runPreflight(options) {
  const root = path.resolve(options.root);
  const checks = [];
  const check = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), detail });

  for (const relativePath of PROJECT_FILES) {
    check(`file:${relativePath}`, nonEmptyFile(path.join(root, relativePath)), 'Required non-empty project file');
  }
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    check(
      'package:version',
      typeof manifest.version === 'string' && /^\d+\.\d+\.\d+$/.test(manifest.version),
      manifest.version
    );
  } catch {
    check('package:version', false, 'package.json must contain a stable version');
  }
  if (options.requireDependencies) {
    check(
      'dependencies',
      existingDirectory(path.join(root, 'node_modules')),
      'node_modules must exist before packaging'
    );
  }

  for (const command of options.commands) {
    const executable = command === 'curl' && process.platform === 'win32' ? 'curl.exe' : command;
    const result = spawnSync(executable, ['--version'], { encoding: 'utf8', timeout: 15_000 });
    const version = `${result.stdout || ''}`.split(/\r?\n/)[0];
    check(`command:${command}`, result.status === 0, result.status === 0 ? version : 'Command is unavailable');
  }

  if (options.minFreeGb > 0) {
    try {
      const stats = fs.statfsSync(root);
      const freeBytes = stats.bsize * stats.bfree;
      const minimumBytes = options.minFreeGb * 1024 ** 3;
      check('disk:free', freeBytes >= minimumBytes, `${(freeBytes / 1024 ** 3).toFixed(1)} GiB available`);
    } catch (error) {
      check('disk:free', false, error.message);
    }
  }

  if (options.coreBundle) {
    const bundle = path.resolve(options.coreBundle);
    const binary = process.platform === 'win32' ? 'catfishcore.exe' : 'catfishcore';
    check('core:bundle', existingDirectory(bundle), bundle);
    check('core:binary', nonEmptyFile(path.join(bundle, binary)), binary);
    // Raw local bundles are valid without a manifest; preparation creates one for packaged resources.
    check('core:managed-resources', existingDirectory(path.join(bundle, 'managed-resources')), 'managed-resources');
  }
  if (options.electronDist) {
    const directory = path.resolve(options.electronDist);
    const binary =
      process.platform === 'win32' ? 'electron.exe' : process.platform === 'darwin' ? 'Electron.app' : 'electron';
    check('electron:dist', existingDirectory(directory) && nonEmptyFile(path.join(directory, binary)), binary);
  }
  if (options.nodeRuntime) {
    const directory = path.resolve(options.nodeRuntime);
    const binary = process.platform === 'win32' ? 'node.exe' : path.join('bin', 'node');
    check('node:runtime', existingDirectory(directory) && nonEmptyFile(path.join(directory, binary)), binary);
  }
  if (options.verifyResources) {
    const result = verifyBundledCatfishcoreResources({
      resourcesDir: path.join(root, 'resources'),
      electronPlatformName: process.platform,
      targetArch: process.arch,
    });
    check(
      'core:verified-resources',
      result.missing.length === 0 && result.failures.length === 0,
      result.missing.join(', ')
    );
  }
  if (options.network) {
    try {
      const release = await new GitHubApi({ repo: options.repo }).request('/releases/latest');
      check('network:github', Boolean(release?.tag_name), release?.tag_name || 'Latest release is unavailable');
    } catch (error) {
      check('network:github', false, error.message);
    }
  }

  return { ok: checks.every((entry) => entry.ok), root, checks };
}

function printReport(report, json) {
  if (json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }
  for (const check of report.checks) {
    console.log(`${check.ok ? 'PASS' : 'FAIL'} ${check.name}${check.detail ? `: ${check.detail}` : ''}`);
  }
  console.log(report.ok ? 'Release preflight passed.' : 'Release preflight failed.');
}

if (require.main === module) {
  Promise.resolve()
    .then(async () => {
      const options = parseArgs(process.argv.slice(2));
      const report = await runPreflight(options);
      printReport(report, options.json);
      if (!report.ok) process.exitCode = 1;
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}

module.exports = {
  parseArgs,
  runPreflight,
};
