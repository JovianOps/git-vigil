const fs = require('node:fs');
const path = require('node:path');
const { analyze } = require('../src/analyze');
const { renderDocument, nonce } = require('../src/render');

let seed = Number(process.argv[2] || 20261017);
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = (list) => list[Math.floor(rnd() * list.length)];

const PEOPLE = [
  { name: 'Nora Vance', email: 'nora@vigil.dev', weight: 0.46 },
  { name: 'Kai Ferreira', email: 'kai@vigil.dev', weight: 0.26 },
  { name: 'Ilya Brandt', email: 'ilya@vigil.dev', weight: 0.18 },
  { name: 'Sam Oduya', email: 'sam@vigil.dev', weight: 0.1 },
];

const VERBS = ['add', 'fix', 'refactor', 'move', 'drop', 'rewrite', 'wip', 'stub', 'wire up', 'clean up'];
const NOUNS = ['the auth flow', 'session handling', 'the retry loop', 'date parsing', 'the sidebar', 'upload queue', 'the cache', 'error paths', 'token refresh', 'the migration', 'websockets', 'form validation'];
const TAILS = ['', '', '', ' -- again', ' (for real this time)', ', part 2', ': still broken', ': whoops', ' and sorry', ': final attempt', '', ' [wip]', ': why', ' (revert of revert)'];

function message() {
  const roll = rnd();
  if (roll < 0.14) return `fix ${pick(NOUNS)}`;
  if (roll < 0.2) return `${pick(VERBS)} ${pick(NOUNS)}`;
  if (roll < 0.34) return `${pick(VERBS)} ${pick(NOUNS)}${pick(TAILS)}`;
  const verb = pick(VERBS);
  return `${verb[0].toUpperCase()}${verb.slice(1)} ${pick(NOUNS)}${pick(TAILS)}`;
}

function person() {
  let r = rnd();
  for (const p of PEOPLE) {
    r -= p.weight;
    if (r <= 0) return p;
  }
  return PEOPLE[0];
}

const DAY = 86400000;
const start = Date.UTC(2022, 7, 4);
const end = Date.UTC(2026, 9, 17);
const commits = [];

for (let t = start; t < end; t += DAY) {
  const dow = new Date(t).getUTCDay();
  const burnout = t > Date.UTC(2025, 0, 1) && t < Date.UTC(2025, 4, 1);
  let rate = (dow === 0 || dow === 6 ? 0.35 : 0.8) + (burnout ? 0.9 : 0);
  if (rnd() > rate) continue;
  const count = 1 + Math.floor(rnd() * (burnout ? 9 : 5));
  for (let i = 0; i < count; i += 1) {
    const night = rnd() < (burnout ? 0.42 : 0.16);
    const hour = night ? Math.floor(rnd() * 5) : 8 + Math.floor(rnd() * 13);
    const at = new Date(t + hour * 3600000 + Math.floor(rnd() * 3600000));
    const who = person();
    commits.push({
      hash: Math.floor(rnd() * 0xfffffff).toString(16).padStart(7, '0') + Math.floor(rnd() * 0xfffffff).toString(16),
      author: who.name,
      email: who.email,
      date: at.toISOString().slice(0, 10),
      hour,
      minute: at.getUTCMinutes(),
      offset: '+00:00',
      subject: message(),
      insertions: Math.floor(rnd() * 340),
      deletions: Math.floor(rnd() * 190),
      files: Array.from({ length: 1 + Math.floor(rnd() * 5) }, (_, f) => `src/${pick(['core', 'ui', 'api', 'db'])}/module-${f}.ts`),
    });
  }
}

// Ilya disappears from the project in late 2024.
for (const commit of commits) {
  if (commit.email === 'ilya@vigil.dev' && commit.date > '2024-11-20') {
    commit.email = 'nora@vigil.dev';
    commit.author = 'Nora Vance';
  }
}

const repo = {
  root: '/sample/vigil',
  repoName: 'vigil-core',
  branch: 'main',
  identity: { email: 'nora@vigil.dev', name: 'Nora Vance' },
  commits,
};

const summary = analyze(repo);
const html = renderDocument(summary, nonce(), {});
const out = path.join(__dirname, 'sample.html');
fs.writeFileSync(out, html);
console.log(`preview/sample.html written (${(html.length / 1024).toFixed(0)} KB) from ${commits.length} sample commits`);
