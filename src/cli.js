#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { collect } = require('./git');
const { analyze } = require('./analyze');
const { renderDocument, nonce } = require('./render');

function usage() {
  console.log('usage: node src/cli.js [repo-path] [-o out.html] [--max-commits N] [--stat-commits N] [--current-branch] [--json] [--version]');
  console.log('');
  console.log('Options:');
  console.log('  -o <file>           Write HTML output to <file> (default: preview/<repo>.vigil.html)');
  console.log('  --max-commits N     Maximum commits to read (default: 60000)');
  console.log('  --stat-commits N    Commits to diff for line counts (default: 6000)');
  console.log('  --current-branch    Only read the current branch, not all branches');
  console.log('  --json              Output analysis as JSON to stdout');
  console.log('  --version           Print version and exit');
  console.log('  -h, --help          Show this help');
}

function parse(argv) {
  const opts = { dir: process.cwd(), out: null, maxCommits: 60000, statCommits: 6000, allBranches: true, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') {
      usage();
      process.exit(0);
    } else if (arg === '--version') {
      const pkg = require('../package.json');
      console.log(pkg.version);
      process.exit(0);
    } else if (arg === '-o') {
      opts.out = argv[++i];
    } else if (arg === '--max-commits') {
      const v = Number(argv[++i]);
      opts.maxCommits = Number.isFinite(v) && v > 0 ? Math.floor(v) : opts.maxCommits;
    } else if (arg === '--stat-commits') {
      const v = Number(argv[++i]);
      opts.statCommits = Number.isFinite(v) && v > 0 ? Math.floor(v) : opts.statCommits;
    } else if (arg === '--current-branch') {
      opts.allBranches = false;
    } else if (arg === '--json') {
      opts.json = true;
    } else if (!arg.startsWith('-')) {
      opts.dir = path.resolve(arg);
    }
  }
  return opts;
}

async function main() {
  const opts = parse(process.argv.slice(2));
  const started = Date.now();
  const repo = await collect(opts.dir, { maxCommits: opts.maxCommits, statCommits: opts.statCommits, includeAllBranches: opts.allBranches });
  const summary = analyze(repo);
  const ms = Date.now() - started;

  if (opts.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  const out = opts.out || path.join(__dirname, '..', 'preview', `${repo.repoName}.vigil.html`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, renderDocument(summary, nonce(), {}));
  console.log(
    `${repo.repoName}: ${summary.totals.commits} commits read in ${ms}ms by ${summary.totals.people} people -> ${out}`
  );
  if (summary.truncated) console.log(`history capped at --max-commits ${opts.maxCommits}`);
}

main().catch((error) => {
  const message = String((error && error.message) || error);
  if (message === 'no-commits') console.error('vigil: this repository has no commits yet.');
  else if (/not a git repository/i.test(message) || error.code === 'ENOENT') {
    console.error('vigil: no git history reachable — is the path a repository, and is git on the PATH?');
  } else console.error(`vigil: ${message}`);
  process.exit(1);
});
