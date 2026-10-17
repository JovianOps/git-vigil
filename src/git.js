const { execFile } = require('node:child_process');
const path = require('node:path');

const F = '\u001f';

const CONFIG = ['-c', 'core.quotePath=false'];

const GIT_BINARIES =
  process.platform === 'win32'
    ? ['git.exe', 'git', 'C:\\Program Files\\Git\\bin\\git.exe', 'C:\\Program Files\\Git\\cmd\\git.exe']
    : ['git', '/usr/bin/git', '/usr/local/bin/git'];

// Never shell out: the repository path is user-controlled, so args go straight to execFile.
const MAX_RETRIES = 2;
function runGit(cwd, args, retries = 0) {
  return new Promise((resolve, reject) => {
    const attempt = (index) => {
      if (index >= GIT_BINARIES.length) {
        reject(Object.assign(new Error('git-not-found'), { code: 'ENOENT' }));
        return;
      }
      execFile(GIT_BINARIES[index], args, { cwd, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024, windowsHide: true }, (error, stdout, stderr) => {
        if (!error) resolve(stdout);
        else if (error.code === 'ENOENT') attempt(index + 1);
        else if (retries < MAX_RETRIES && (error.code === 'EAGAIN' || error.code === 'ETIMEDOUT' || (stderr && /resource temporarily unavailable/i.test(stderr)))) {
          // Transient failure: retry with exponential backoff.
          setTimeout(() => {
            runGit(cwd, args, retries + 1).then(resolve, reject);
          }, 100 * Math.pow(2, retries));
        } else {
          const message = (stderr && stderr.trim()) ? stderr.trim() : (error.message || String(error));
          reject(Object.assign(new Error(message), { code: error.code, stderr: stderr || '' }));
        }
      });
    };
    attempt(0);
  });
}

function normalizePath(raw) {
  let p = raw.replace(/^"|"$/g, '');
  p = p.replace(/\{[^{}]* => ([^{}]*)\}/g, '$1');
  const arrow = p.lastIndexOf(' => ');
  if (arrow !== -1) p = p.slice(arrow + 4);
  return p;
}

const AUTHORED = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):\d{2}(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/;

function parseRecords(raw) {
  const commits = [];
  for (const chunk of raw.split('\u0000')) {
    if (!chunk.trim()) continue;
    const parts = chunk.split(F);
    if (parts.length < 5) continue;
    const [hash, name, email, iso, ...rest] = parts;
    // %aI renders UTC author dates as "...:30Z", not "...:30+00:00" — accept both.
    const when = AUTHORED.exec(iso.trim());
    if (!/^[0-9a-f]{7,40}$/.test(hash) || !when) continue;
    const [, date, hour, minute, offset] = when;
    commits.push({
      hash,
      author: name.trim() || email.trim() || 'unknown',
      email: (email.trim() || name.trim()).toLowerCase(),
      date,
      hour: Number(hour),
      minute: Number(minute),
      offset: offset || 'Z',
      subject: rest.join(F).replace(/^[\n\r]+/, '').trim(),
    });
  }
  return commits;
}

function parseNumstat(raw) {
  const byHash = new Map();
  let current = null;
  for (const line of raw.split('\n')) {
    if (line.startsWith('commit ')) {
      current = line.slice(7).trim();
      if (!byHash.has(current)) byHash.set(current, { insertions: 0, deletions: 0, files: new Set() });
      continue;
    }
    if (!current) continue;
    const stat = /^(\d+|-)\t(\d+|-)\t(.+)$/.exec(line);
    if (!stat) continue;
    const entry = byHash.get(current);
    if (stat[1] !== '-') entry.insertions += Number(stat[1]);
    if (stat[2] !== '-') entry.deletions += Number(stat[2]);
    entry.files.add(normalizePath(stat[3]));
  }
  return byHash;
}

async function collect(cwd, options = {}) {
  const root = (await runGit(cwd, [...CONFIG, 'rev-parse', '--show-toplevel'])).trim();
  const maxCommits = options.maxCommits || 60000;
  // Diffing 60k commits costs git ~36s; the line-count window stays much smaller.
  const statCommits = Math.min(options.statCommits || 6000, maxCommits);
  const scope = options.includeAllBranches === false ? [] : ['--all'];
  const base = [...CONFIG, 'log', ...scope, '--no-merges', '-n', String(maxCommits)];

  const [rawLog, rawNumstat, branch, userEmail, userName, totalRaw] = await Promise.all([
    runGit(root, [...base, '-z', `--pretty=%H${F}%an${F}%ae${F}%aI${F}%s`]),
    runGit(root, [...CONFIG, 'log', ...scope, '--no-merges', '-n', String(statCommits), '--numstat', '--pretty=format:commit %H']).catch(() => ''),
    runGit(root, [...CONFIG, 'rev-parse', '--abbrev-ref', 'HEAD']).catch(() => 'HEAD'),
    runGit(root, [...CONFIG, 'config', 'user.email']).catch(() => ''),
    runGit(root, [...CONFIG, 'config', 'user.name']).catch(() => ''),
    runGit(root, [...CONFIG, 'rev-list', '--count', ...scope, '--no-merges', 'HEAD']).catch(() => ''),
  ]);

  const records = rawLog.split('\u0000').filter((chunk) => chunk.trim()).length;
  const commits = parseRecords(rawLog);
  if (!commits.length) throw new Error('no-commits');

  const stats = parseNumstat(rawNumstat);
  let statsCovered = 0;
  for (const commit of commits) {
    const stat = stats.get(commit.hash);
    if (stat) {
      statsCovered += 1;
      commit.insertions = stat.insertions;
      commit.deletions = stat.deletions;
      commit.files = [...stat.files];
    } else {
      commit.insertions = null;
      commit.deletions = null;
      commit.files = [];
    }
  }

  const total = Number(totalRaw.trim());
  return {
    root,
    repoName: path.basename(root),
    branch: branch.trim() || 'HEAD',
    identity: { email: userEmail.trim().toLowerCase(), name: userName.trim() },
    totalCommits: Number.isFinite(total) && total > 0 ? total : commits.length,
    capped: records >= maxCommits,
    unreadable: records - commits.length,
    statsCovered,
    commits,
  };
}

module.exports = { collect, runGit, parseRecords, parseNumstat, normalizePath };
