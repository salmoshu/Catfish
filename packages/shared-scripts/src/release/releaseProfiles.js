const CATFISH_PLATFORMS = ['macos-arm64', 'macos-x64', 'windows-x64', 'windows-arm64', 'linux-x64', 'linux-arm64'];
const CATFISH_WEB_TARGETS = ['darwin-arm64', 'darwin-x64', 'linux-x64', 'linux-arm64', 'win32-x64'];
const CORE_TARGETS = [
  'x86_64-unknown-linux-gnu',
  'aarch64-unknown-linux-gnu',
  'x86_64-apple-darwin',
  'aarch64-apple-darwin',
  'x86_64-pc-windows-msvc',
  'aarch64-pc-windows-msvc',
];

function exactJob(name) {
  return { name, matches: (job) => job.name === name };
}

function suffixedJob(name, prefix) {
  return { name: `${prefix} / ${name}`, matches: (job) => job.name === `${prefix} / ${name}` };
}

const PROFILES = {
  catfish: {
    jobs: [
      exactJob('Code Quality'),
      exactJob('Create Release'),
      ...CATFISH_PLATFORMS.map((platform) => suffixedJob(`Build ${platform}`, 'Build Pipeline')),
      ...CATFISH_WEB_TARGETS.map((target) => suffixedJob(`Pack web-cli ${target}`, 'Pack Web CLI')),
    ],
    assets(version) {
      return [
        ...['darwin-arm64', 'darwin-x86_64', 'linux-arm64', 'linux-x86_64', 'win-x86_64'].flatMap((target) => [
          `aionui-web-${version}-${target}.tar.gz`,
          `aionui-web-${version}-${target}.tar.gz.sha256`,
        ]),
        `Catfish-${version}-linux-amd64.deb`,
        `Catfish-${version}-linux-arm64.deb`,
        `Catfish-${version}-mac-arm64.dmg`,
        `Catfish-${version}-mac-arm64.zip`,
        `Catfish-${version}-mac-x64.dmg`,
        `Catfish-${version}-mac-x64.zip`,
        `Catfish-${version}-win-arm64.exe`,
        `Catfish-${version}-win-x64.exe`,
        'install-web.sh',
        'latest-arm64-mac.yml',
        'latest-linux-arm64.yml',
        'latest-linux.yml',
        'latest-mac.yml',
        'latest-win-arm64.yml',
        'latest.yml',
      ];
    },
  },
  core: {
    jobs: [
      exactJob('Prepare Release Metadata'),
      exactJob('Upload GitHub Release assets'),
      ...CORE_TARGETS.map((target) => exactJob(`Build ${target}`)),
    ],
    assets(version) {
      return [
        ...CORE_TARGETS.map((target) => {
          const extension = target.includes('windows') ? 'zip' : 'tar.gz';
          return `catfishcore-v${version}-${target}.${extension}`;
        }),
        'catfishcore-checksums.txt',
      ];
    },
  },
};

function getProfile(name) {
  const profile = PROFILES[name];
  if (!profile) throw new Error(`Unknown release profile: ${name}. Expected catfish or core.`);
  return profile;
}

function collectRequiredJobs(profileName, jobs) {
  return getProfile(profileName).jobs.map((definition) => {
    const job = jobs.find((candidate) => definition.matches(candidate));
    return {
      name: job?.name || definition.name,
      status: job?.status || 'missing',
      conclusion: job?.conclusion || 'missing',
      url: job?.html_url || null,
    };
  });
}

function expectedReleaseAssets(profileName, tag) {
  const version = tag.replace(/^v/, '');
  return getProfile(profileName).assets(version);
}

module.exports = {
  collectRequiredJobs,
  expectedReleaseAssets,
  getProfile,
};
