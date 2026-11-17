const { spawn } = require('node:child_process');

function runProcess(command, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(input);
  });
}

async function readGitCredential() {
  const result = await runProcess('git', ['credential', 'fill'], 'protocol=https\nhost=github.com\n\n');
  if (result.code !== 0) return null;
  return (
    result.stdout
      .split(/\r?\n/)
      .find((line) => line.startsWith('password='))
      ?.slice('password='.length) || null
  );
}

class GitHubApi {
  constructor({ repo, token, proxy } = {}) {
    if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('GitHub repository must use owner/repo format.');
    this.repo = repo;
    this.token = token || process.env.GITHUB_TOKEN || process.env.GH_TOKEN || null;
    this.proxy = proxy || process.env.HTTPS_PROXY || process.env.https_proxy || null;
    this.credentialLoaded = Boolean(this.token);
  }

  async tokenHeader() {
    if (!this.credentialLoaded) {
      this.token = await readGitCredential();
      this.credentialLoaded = true;
    }
    return this.token ? [`-H`, `Authorization: Bearer ${this.token}`] : [];
  }

  async request(path, { method = 'GET', body } = {}) {
    const marker = '\n%{http_code}';
    const args = [
      '--silent',
      '--show-error',
      '--compressed',
      '--location',
      '--connect-timeout',
      '30',
      '--max-time',
      '120',
      '--retry',
      '3',
      '--retry-delay',
      '15',
      '--request',
      method,
      '--write-out',
      marker,
      '-H',
      'Accept: application/vnd.github+json',
      '-H',
      'X-GitHub-Api-Version: 2022-11-28',
      '-H',
      'User-Agent: Catfish-release-monitor',
      ...(await this.tokenHeader()),
    ];
    if (this.proxy) args.push('--proxy', this.proxy);
    if (body !== undefined) args.push('--data', JSON.stringify(body));
    args.push(`https://api.github.com/repos/${this.repo}${path}`);

    const result = await runProcess(process.platform === 'win32' ? 'curl.exe' : 'curl', args);
    if (result.code !== 0) throw new Error(`GitHub request failed (${method} ${path}): ${result.stderr.trim()}`);
    const separator = result.stdout.lastIndexOf('\n');
    const status = Number(result.stdout.slice(separator + 1).trim());
    const text = result.stdout.slice(0, separator);
    let payload = null;
    if (text.trim()) {
      try {
        payload = JSON.parse(text);
      } catch {
        throw new Error(`GitHub returned a non-JSON response (${method} ${path}).`);
      }
    }
    if (status < 200 || status >= 300) {
      const error = new Error(`GitHub API ${status} (${method} ${path}): ${payload?.message || 'request failed'}`);
      error.status = status;
      throw error;
    }
    return payload;
  }

  getRun(runId) {
    return this.request(`/actions/runs/${runId}`);
  }

  listWorkflowRuns(workflow, event) {
    const eventQuery = event ? `&event=${encodeURIComponent(event)}` : '';
    return this.request(`/actions/workflows/${encodeURIComponent(workflow)}/runs?per_page=100${eventQuery}`);
  }

  getJobs(runId) {
    return this.request(`/actions/runs/${runId}/jobs?per_page=100`);
  }

  getRelease(tag) {
    return this.request(`/releases/tags/${encodeURIComponent(tag)}`);
  }

  rerunFailedJobs(runId) {
    return this.request(`/actions/runs/${runId}/rerun-failed-jobs`, { method: 'POST' });
  }
}

module.exports = {
  GitHubApi,
  readGitCredential,
};
