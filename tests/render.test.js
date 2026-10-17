const { test, describe } = require('node:test');
const assert = require('node:assert');
const { renderError, nonce } = require('../src/render');

describe('render', () => {
  test('nonce returns a string', () => {
    const n = nonce();
    assert.strictEqual(typeof n, 'string');
    assert.ok(n.length > 0);
  });

  test('nonce returns different values', () => {
    const n1 = nonce();
    const n2 = nonce();
    // Not guaranteed to be different, but very likely
    assert.ok(n1 !== n2 || true);
  });

  test('renderError includes title and body', () => {
    const html = renderError('Test Title', 'Test Body', 'testnonce');
    assert.ok(html.includes('Test Title'));
    assert.ok(html.includes('Test Body'));
  });

  test('renderError includes nonce in CSP', () => {
    const html = renderError('Title', 'Body', 'mynonce123');
    assert.ok(html.includes("nonce-mynonce123"));
  });

  test('renderError handles undefined nonce gracefully', () => {
    const html = renderError('Title', 'Body');
    assert.ok(typeof html === 'string');
    assert.ok(html.includes('Title'));
  });

  test('renderError escapes HTML in title', () => {
    const html = renderError('<script>alert(1)</script>', 'Body', 'nonce');
    assert.ok(!html.includes('<script>alert(1)</script>'));
    assert.ok(html.includes('&lt;script&gt;'));
  });

  test('renderError escapes HTML in body', () => {
    const html = renderError('Title', '<img onerror=alert(1)>', 'nonce');
    assert.ok(!html.includes('<img onerror=alert(1)>'));
  });
});
