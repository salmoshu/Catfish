const fs = require('node:fs');
const path = require('node:path');
const { GitHubApi } = require('./githubApi');
const { collectRequiredJobs, expectedReleaseAssets } = require('./releaseProfiles');

const FAILED_CONCLUSIONS = new Set(['failure', 'cancelled', 'timed_out', 'action_required', 'startup_failure']);
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function takeValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value.`);
  return value;
}

function parseArgs(argv) {
  const options = {
    repo: 'salmoshu/Catfish',
    intervalSeconds: 60,
    timeoutMinutes: 120,
    watch: false,
    verifyOnly: false,
    rerunFailed: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (
      ['--repo', '--profile', '--workflow', '--run-id', '--sha', '--tag', '--event', '--branch', '--output'].includes(
        flag
      )
    ) {
      const value = takeValue(argv, index, flag);
      const key = flag.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      options[key] = value;
      index += 1;
    } else if (flag === '--interval-seconds' || flag === '--timeout-minutes') {
      const value = Number(takeValue(argv, index, flag));
      if (!Number.isFinite(value)) throw new Error(`${flag} requires a number.`);
      options[flag === '--interval-seconds' ? 'intervalSeconds' : 'timeoutMinutes'] = value;
      index += 1;
    } else if (flag === '--watch') {
      options.watch = true;
    } else if (flag === '--verify-only') {
      options.verifyOnly = true;
    } else if (flag === '--rerun-failed') {
      options.rerunFailed = true;
    } else {
      throw new Error(`Unknown argument: ${flag}`);
    }
  }
  options.profile = options.profile || (options.repo.toLowerCase().endsWith('/catfishcore') ? 'core' : 'catfish');
  options.workflow = options.workflow || (options.profile === 'core' ? 'release.yml' : 'build-and-release.yml');
  options.intervalSeconds = Math.max(30, options.intervalSeconds);
  if (!options.sha || !/^[0-9a-f]{40}$/.test(options.sha))
    throw new Error('--sha requires the full expected source commit.');
  if (!options.tag || !/^v\d+\.\d+\.\d+$/.test(options.tag))
    throw new Error('--tag requires a stable tag such as v0.5.0.');
  if (options.runId && !/^\d+$/.test(options.runId)) throw new Error('--run-id must be numeric.');
  if (options.rerunFailed && (!options.runId || options.verifyOnly)) {
    throw new Error('--rerun-failed requires --run-id and cannot be combined with --verify-only.');
  }
  return options;
}

function selectRun(runs, options) {
  return runs.find(
    (run) =>
      run.head_sha === options.sha &&
      (!options.event || run.event === options.event) &&
      (!options.branch || run.head_branch === options.branch)
  );
}

function buildVerification({ profile, tag, run, jobs, release, expectedCommit }) {
  const errors = [];
  if (run.head_sha !== expectedCommit) errors.push(`Workflow commit ${run.head_sha} does not match ${expectedCommit}.`);
  if (run.status !== 'completed' || run.conclusion !== 'success')
    errors.push('Workflow has not completed successfully.');
  const requiredJobs = collectRequiredJobs(profile, jobs);
  for (const job of requiredJobs) {
    if (job.status !== 'completed' || job.conclusion !== 'success') {
      errors.push(`Required job is not successful: ${job.name} (${job.status}/${job.conclusion}).`);
    }
  }
  if (!release || release.tag_name !== tag) errors.push(`Release ${tag} was not found.`);
  if (release?.draft || release?.prerelease) errors.push('Release must be public and stable.');

  const expectedAssets = expectedReleaseAssets(profile, tag);
  const assets = (release?.assets || []).map((asset) => ({ name: asset.name, size: asset.size }));
  const missingAssets = expectedAssets.filter((name) => !assets.some((asset) => asset.name === name && asset.size > 0));
  if (missingAssets.length) errors.push(`Missing or empty assets: ${missingAssets.join(', ')}.`);
  if (assets.length !== expectedAssets.length) {
    errors.push(`Expected ${expectedAssets.length} assets, found ${assets.length}.`);
  }

  const report = {
    tag,
    commit: run.head_sha,
    sourceRef: run.head_branch,
    event: run.event,
    run: { id: run.id, status: run.status, conclusion: run.conclusion, url: run.html_url },
    release: release ? { url: release.html_url, draft: release.draft, prerelease: release.prerelease } : null,
    jobs: requiredJobs,
    expectedJobCount: requiredJobs.length,
    assetCount: assets.length,
    expectedAssetCount: expectedAssets.length,
    assets,
    missingAssets,
  };
  if (errors.length) {
    const error = new Error(errors.join('\n'));
    error.report = report;
    throw error;
  }
  return report;
}

async function loadRun(api, options) {
  if (options.runId) {
    const run = await api.getRun(options.runId);
    if (run.head_sha !== options.sha) {
      throw new Error(`Run ${options.runId} uses ${run.head_sha}, expected ${options.sha}.`);
    }
    return run;
  }
  const response = await api.listWorkflowRuns(options.workflow, options.event);
  const run = selectRun(response.workflow_runs, options);
  if (!run) throw new Error(`No matching ${options.workflow} run found for ${options.sha}.`);
  return run;
}

async function verify(api, options, run) {
  const [jobsResponse, release] = await Promise.all([api.getJobs(run.id), api.getRelease(options.tag)]);
  return buildVerification({
    profile: options.profile,
    tag: options.tag,
    run,
    jobs: jobsResponse.jobs,
    release,
    expectedCommit: options.sha,
  });
}

function writeReport(report, output) {
  const content = `${JSON.stringify(report, null, 2)}\n`;
  if (output) {
    const outputPath = path.resolve(output);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, content, 'utf8');
  }
  process.stdout.write(content);
}

async function main(argv) {
  const options = parseArgs(argv);
  const api = new GitHubApi({ repo: options.repo });
  let minimumAttempt = 0;
  if (options.rerunFailed) {
    const previous = await loadRun(api, options);
    minimumAttempt = (previous.run_attempt || 1) + 1;
    await api.rerunFailedJobs(options.runId);
    console.log(JSON.stringify({ runId: options.runId, rerunFailedJobs: true, previousAttempt: previous.run_attempt }));
  }

  const deadline = Date.now() + options.timeoutMinutes * 60_000;
  let verificationFailures = 0;
  while (Date.now() <= deadline) {
    let run;
    try {
      run = await loadRun(api, options);
      if (minimumAttempt && (run.run_attempt || 1) < minimumAttempt) {
        console.log(JSON.stringify({ runId: run.id, status: 'waiting_for_rerun' }));
        await pause(options.intervalSeconds * 1000);
        continue;
      }
      console.log(
        JSON.stringify({
          runId: run.id,
          status: run.status,
          conclusion: run.conclusion,
          attempt: run.run_attempt,
          commit: run.head_sha,
        })
      );
      if (run.status === 'completed' && run.conclusion === 'success') {
        try {
          const report = await verify(api, options, run);
          writeReport(report, options.output);
          return;
        } catch (error) {
          verificationFailures += 1;
          if (!options.watch || verificationFailures >= 3) throw error;
          console.error(`Release verification attempt ${verificationFailures}/3 failed: ${error.message}`);
        }
      } else if (FAILED_CONCLUSIONS.has(run.conclusion)) {
        throw new Error(`Workflow ${run.conclusion}: ${run.html_url}`);
      }
      if (!options.watch) throw new Error(`Workflow is not complete: ${run.status}/${run.conclusion || 'pending'}.`);
    } catch (error) {
      if (!options.watch || verificationFailures >= 3 || FAILED_CONCLUSIONS.has(run?.conclusion)) throw error;
      console.error(`Temporary monitoring failure: ${error.message}`);
    }
    await pause(options.intervalSeconds * 1000);
  }
  throw new Error(`Timed out after ${options.timeoutMinutes} minutes.`);
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((error) => {
    if (error.report) writeReport(error.report, null);
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  buildVerification,
  loadRun,
  parseArgs,
  selectRun,
  verify,
};
