const { test, describe } = require('node:test');
const assert = require('node:assert');
const { parseRecords, parseNumstat, normalizePath } = require('../src/git');

describe('normalizePath', () => {
  test('strips surrounding quotes', () => {
    assert.strictEqual(normalizePath('"src/index.js"'), 'src/index.js');
  });

  test('handles rename notation', () => {
    assert.strictEqual(normalizePath('{old => new}.js'), 'new.js');
  });

  test('handles arrow notation', () => {
    assert.strictEqual(normalizePath('old/path.js => new/path.js'), 'new/path.js');
  });

  test('returns plain path unchanged', () => {
    assert.strictEqual(normalizePath('src/index.js'), 'src/index.js');
  });

  test('handles complex rename', () => {
    assert.strictEqual(normalizePath('src/{old => new}/file.js'), 'src/new/file.js');
  });
});

describe('parseRecords', () => {
  const F = '\u001f';

  test('parses single commit', () => {
    const raw = 'abc1234' + F + 'Alice' + F + 'alice@test.com' + F + '2024-01-15T14:30:00Z' + F + 'initial commit';
    const commits = parseRecords(raw);
    assert.strictEqual(commits.length, 1);
    assert.strictEqual(commits[0].hash, 'abc1234');
    assert.strictEqual(commits[0].author, 'Alice');
    assert.strictEqual(commits[0].email, 'alice@test.com');
    assert.strictEqual(commits[0].date, '2024-01-15');
    assert.strictEqual(commits[0].hour, 14);
    assert.strictEqual(commits[0].minute, 30);
    assert.strictEqual(commits[0].subject, 'initial commit');
  });

  test('parses multiple commits', () => {
    const c1 = 'abc1234' + F + 'Alice' + F + 'alice@test.com' + F + '2024-01-15T14:30:00Z' + F + 'first';
    const c2 = 'def5678' + F + 'Bob' + F + 'bob@test.com' + F + '2024-01-16T09:00:00Z' + F + 'second';
    const raw = c1 + '\u0000' + c2;
    const commits = parseRecords(raw);
    assert.strictEqual(commits.length, 2);
    assert.strictEqual(commits[0].hash, 'abc1234');
    assert.strictEqual(commits[1].hash, 'def5678');
  });

  test('skips commits with invalid hash', () => {
    const raw = 'notahash' + F + 'Alice' + F + 'alice@test.com' + F + '2024-01-15T14:30:00Z' + F + 'bad';
    const commits = parseRecords(raw);
    assert.strictEqual(commits.length, 0);
  });

  test('skips commits with invalid date', () => {
    const raw = 'abc1234' + F + 'Alice' + F + 'alice@test.com' + F + 'not-a-date' + F + 'bad date';
    const commits = parseRecords(raw);
    assert.strictEqual(commits.length, 0);
  });

  test('handles empty input', () => {
    const commits = parseRecords('');
    assert.strictEqual(commits.length, 0);
  });

  test('handles commit with multi-line subject', () => {
    const raw = 'abc1234' + F + 'Alice' + F + 'alice@test.com' + F + '2024-01-15T14:30:00Z' + F + 'first line\nsecond line';
    const commits = parseRecords(raw);
    assert.strictEqual(commits.length, 1);
    assert.ok(commits[0].subject.includes('first line'));
  });

  test('handles commit with no author name (uses email)', () => {
    const raw = 'abc1234' + F + '' + F + 'alice@test.com' + F + '2024-01-15T14:30:00Z' + F + 'commit';
    const commits = parseRecords(raw);
    assert.strictEqual(commits.length, 1);
    assert.strictEqual(commits[0].author, 'alice@test.com');
  });
});

describe('parseNumstat', () => {
  test('parses single commit stats', () => {
    const raw = 'commit abc1234\n5\t2\tsrc/index.js\n';
    const stats = parseNumstat(raw);
    assert.ok(stats.has('abc1234'));
    const entry = stats.get('abc1234');
    assert.strictEqual(entry.insertions, 5);
    assert.strictEqual(entry.deletions, 2);
    assert.ok(entry.files.has('src/index.js'));
  });

  test('handles binary files', () => {
    const raw = 'commit abc1234\n-\t-\timage.png\n';
    const stats = parseNumstat(raw);
    const entry = stats.get('abc1234');
    assert.strictEqual(entry.insertions, 0);
    assert.strictEqual(entry.deletions, 0);
    assert.ok(entry.files.has('image.png'));
  });

  test('handles multiple commits', () => {
    const raw = 'commit abc1234\n5\t2\tsrc/index.js\ncommit def5678\n3\t1\tsrc/app.js\n';
    const stats = parseNumstat(raw);
    assert.strictEqual(stats.size, 2);
    assert.strictEqual(stats.get('abc1234').insertions, 5);
    assert.strictEqual(stats.get('def5678').insertions, 3);
  });

  test('handles empty input', () => {
    const stats = parseNumstat('');
    assert.strictEqual(stats.size, 0);
  });

  test('handles multiple files in one commit', () => {
    const raw = 'commit abc1234\n5\t2\tsrc/index.js\n3\t1\tsrc/app.js\n';
    const stats = parseNumstat(raw);
    const entry = stats.get('abc1234');
    assert.strictEqual(entry.files.size, 2);
    assert.ok(entry.files.has('src/index.js'));
    assert.ok(entry.files.has('src/app.js'));
  });
});
