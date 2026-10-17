const { test, describe } = require('node:test');
const assert = require('node:assert');
const { analyze } = require('../src/analyze');

describe('analyze', () => {
  test('returns empty result for empty commits', () => {
    const repo = {
      root: '/test',
      repoName: 'test-repo',
      branch: 'main',
      identity: { email: '', name: '' },
      commits: [],
      totalCommits: 0,
      capped: false,
      unreadable: 0,
    };
    const result = analyze(repo);
    assert.strictEqual(result.empty, true);
    assert.strictEqual(result.repoName, 'test-repo');
  });

  test('analyzes single commit', () => {
    const repo = {
      root: '/test',
      repoName: 'test-repo',
      branch: 'main',
      identity: { email: 'test@test.com', name: 'Test' },
      commits: [
        {
          hash: 'abc1234def5678',
          author: 'Test',
          email: 'test@test.com',
          date: '2024-01-15',
          hour: 14,
          minute: 30,
          offset: 'Z',
          subject: 'initial commit',
          insertions: 10,
          deletions: 0,
          files: ['src/index.js'],
        },
      ],
      totalCommits: 1,
      capped: false,
      unreadable: 0,
      statsCovered: 1,
    };
    const result = analyze(repo);
    assert.strictEqual(result.empty, false);
    assert.strictEqual(result.totals.commits, 1);
    assert.strictEqual(result.totals.people, 1);
    assert.strictEqual(result.totals.insertions, 10);
    assert.strictEqual(result.totals.deletions, 0);
    assert.strictEqual(result.night.count, 0);
    assert.strictEqual(result.weekend.count, 0);
  });

  test('detects night commits', () => {
    const repo = {
      root: '/test',
      repoName: 'test-repo',
      branch: 'main',
      identity: { email: 'test@test.com', name: 'Test' },
      commits: [
        {
          hash: 'abc1234def5678',
          author: 'Test',
          email: 'test@test.com',
          date: '2024-01-15',
          hour: 2,
          minute: 30,
          offset: 'Z',
          subject: 'late night fix',
          insertions: 5,
          deletions: 2,
          files: ['src/index.js'],
        },
        {
          hash: 'def5678abc1234',
          author: 'Test',
          email: 'test@test.com',
          date: '2024-01-16',
          hour: 14,
          minute: 0,
          offset: 'Z',
          subject: 'daytime work',
          insertions: 3,
          deletions: 1,
          files: ['src/index.js'],
        },
      ],
      totalCommits: 2,
      capped: false,
      unreadable: 0,
      statsCovered: 2,
    };
    const result = analyze(repo);
    assert.strictEqual(result.night.count, 1);
    assert.strictEqual(result.night.pct, 50);
    assert.strictEqual(result.night.deepest.clock, '02:30');
  });

  test('detects weekend commits', () => {
    // 2024-01-13 is a Saturday
    const repo = {
      root: '/test',
      repoName: 'test-repo',
      branch: 'main',
      identity: { email: 'test@test.com', name: 'Test' },
      commits: [
        {
          hash: 'abc1234def5678',
          author: 'Test',
          email: 'test@test.com',
          date: '2024-01-13',
          hour: 10,
          minute: 0,
          offset: 'Z',
          subject: 'weekend work',
          insertions: 5,
          deletions: 0,
          files: [],
        },
      ],
      totalCommits: 1,
      capped: false,
      unreadable: 0,
      statsCovered: 1,
    };
    const result = analyze(repo);
    assert.strictEqual(result.weekend.count, 1);
    assert.strictEqual(result.weekend.pct, 100);
  });

  test('counts confessions', () => {
    const repo = {
      root: '/test',
      repoName: 'test-repo',
      branch: 'main',
      identity: { email: 'test@test.com', name: 'Test' },
      commits: [
        {
          hash: 'abc1234def5678',
          author: 'Test',
          email: 'test@test.com',
          date: '2024-01-15',
          hour: 10,
          minute: 0,
          offset: 'Z',
          subject: 'fix the bug, whoops',
          insertions: 5,
          deletions: 0,
          files: [],
        },
        {
          hash: 'def5678abc1234',
          author: 'Test',
          email: 'test@test.com',
          date: '2024-01-16',
          hour: 10,
          minute: 0,
          offset: 'Z',
          subject: 'typo in readme',
          insertions: 1,
          deletions: 0,
          files: [],
        },
      ],
      totalCommits: 2,
      capped: false,
      unreadable: 0,
      statsCovered: 0,
    };
    const result = analyze(repo);
    assert.ok(result.confession.counts.length > 0);
    const whoops = result.confession.counts.find(c => c.label === 'whoops');
    assert.ok(whoops);
    assert.strictEqual(whoops.n, 1);
    const typo = result.confession.counts.find(c => c.label === 'typo');
    assert.ok(typo);
    assert.strictEqual(typo.n, 1);
  });

  test('calculates streaks', () => {
    const repo = {
      root: '/test',
      repoName: 'test-repo',
      branch: 'main',
      identity: { email: 'test@test.com', name: 'Test' },
      commits: [
        { hash: 'a', author: 'Test', email: 'test@test.com', date: '2024-01-15', hour: 10, minute: 0, offset: 'Z', subject: 'day1', insertions: 1, deletions: 0, files: [] },
        { hash: 'b', author: 'Test', email: 'test@test.com', date: '2024-01-16', hour: 10, minute: 0, offset: 'Z', subject: 'day2', insertions: 1, deletions: 0, files: [] },
        { hash: 'c', author: 'Test', email: 'test@test.com', date: '2024-01-17', hour: 10, minute: 0, offset: 'Z', subject: 'day3', insertions: 1, deletions: 0, files: [] },
      ],
      totalCommits: 3,
      capped: false,
      unreadable: 0,
      statsCovered: 3,
    };
    const result = analyze(repo);
    assert.strictEqual(result.streaks.best, 3);
    assert.strictEqual(result.streaks.trailing, 3);
  });

  test('handles multiple people', () => {
    const repo = {
      root: '/test',
      repoName: 'test-repo',
      branch: 'main',
      identity: { email: 'alice@test.com', name: 'Alice' },
      commits: [
        { hash: 'a', author: 'Alice', email: 'alice@test.com', date: '2024-01-15', hour: 10, minute: 0, offset: 'Z', subject: 'alice work', insertions: 5, deletions: 0, files: [] },
        { hash: 'b', author: 'Bob', email: 'bob@test.com', date: '2024-01-16', hour: 10, minute: 0, offset: 'Z', subject: 'bob work', insertions: 3, deletions: 0, files: [] },
      ],
      totalCommits: 2,
      capped: false,
      unreadable: 0,
      statsCovered: 2,
    };
    const result = analyze(repo);
    assert.strictEqual(result.totals.people, 2);
    assert.strictEqual(result.people.length, 2);
    assert.strictEqual(result.you.name, 'Alice');
    assert.strictEqual(result.you.commits, 1);
  });

  test('filters commits with invalid dates', () => {
    const repo = {
      root: '/test',
      repoName: 'test-repo',
      branch: 'main',
      identity: { email: '', name: '' },
      commits: [
        { hash: 'a', author: 'Test', email: 'test@test.com', date: 'invalid', hour: 10, minute: 0, offset: 'Z', subject: 'bad date', insertions: 1, deletions: 0, files: [] },
        { hash: 'b', author: 'Test', email: 'test@test.com', date: '2024-01-15', hour: 10, minute: 0, offset: 'Z', subject: 'good date', insertions: 1, deletions: 0, files: [] },
      ],
      totalCommits: 2,
      capped: false,
      unreadable: 0,
      statsCovered: 0,
    };
    const result = analyze(repo);
    assert.strictEqual(result.totals.commits, 1);
    assert.strictEqual(result.unreadableDates, 1);
  });

  test('handles null insertions/deletions', () => {
    const repo = {
      root: '/test',
      repoName: 'test-repo',
      branch: 'main',
      identity: { email: 'test@test.com', name: 'Test' },
      commits: [
        { hash: 'a', author: 'Test', email: 'test@test.com', date: '2024-01-15', hour: 10, minute: 0, offset: 'Z', subject: 'no stats', insertions: null, deletions: null, files: [] },
      ],
      totalCommits: 1,
      capped: false,
      unreadable: 0,
      statsCovered: 0,
    };
    const result = analyze(repo);
    assert.strictEqual(result.totals.insertions, 0);
    assert.strictEqual(result.totals.deletions, 0);
    assert.strictEqual(result.totals.files, 0);
  });
});
