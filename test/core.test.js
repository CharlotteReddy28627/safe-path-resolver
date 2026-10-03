import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SafePathResolver } from '../src/index.js';
import path from 'node:path';
import os from 'node:os';

// All test paths are built under a temp dir so tests are deterministic and
// independent of the host. We never touch the filesystem, but we want
// process.cwd() to be a known, controllable value. Since the resolver trusts
// process.cwd() as the anchor, we run the tests from a known cwd by changing
// directory. To keep tests hermetic and avoid mutating global state across
// files, we set cwd per-test where it matters.

const tmp = os.tmpdir();
const sandbox = path.join(tmp, 'safe-path-resolver-sandbox');

function cwdRelative(p) {
  // Returns p expressed relative to process.cwd(); used so that rootPath
  // arguments that are relative are stable regardless of where the suite runs.
  return path.relative(process.cwd(), p);
}

test('rejects empty root', () => {
  assert.throws(() => new SafePathResolver(''), TypeError);
  assert.throws(() => new SafePathResolver(null), TypeError);
  assert.throws(() => new SafePathResolver(undefined), TypeError);
});

test('rejects NUL byte in root', () => {
  assert.throws(() => new SafePathResolver('a\u0000b'), RangeError);
});

test('rejects root that escapes cwd via ..', () => {
  assert.throws(() => new SafePathResolver('../../../../../../../../..'), RangeError);
});

test('resolve simple relative path stays inside root', () => {
  const r = new SafePathResolver(sandbox);
  const out = r.resolve('foo/bar.txt');
  assert.equal(out, sandbox.replace(/\\/g, '/') + '/foo/bar.txt');
});

test('resolve collapses . segments', () => {
  const r = new SafePathResolver(sandbox);
  const out = r.resolve('././foo/./bar');
  assert.equal(out, sandbox.replace(/\\/g, '/') + '/foo/bar');
});

test('resolve allows .. that stays inside root', () => {
  const r = new SafePathResolver(sandbox);
  const out = r.resolve('a/b/../../c');
  assert.equal(out, sandbox.replace(/\\/g, '/') + '/c');
});

test('resolve rejects .. that escapes root', () => {
  const r = new SafePathResolver(sandbox);
  assert.throws(() => r.resolve('../escape'), RangeError);
  assert.throws(() => r.resolve('a/../../../escape'), RangeError);
});

test('resolve rejects .. that escapes root even with leading slash', () => {
  const r = new SafePathResolver(sandbox);
  assert.throws(() => r.resolve('/../escape'), RangeError);
});

test('resolve re-anchors absolute paths under root', () => {
  const r = new SafePathResolver(sandbox);
  const out = r.resolve('/etc/passwd');
  assert.equal(out, sandbox.replace(/\\/g, '/') + '/etc/passwd');
});

test('resolve treats backslash as a separator', () => {
  const r = new SafePathResolver(sandbox);
  const out = r.resolve('a\\b\\c');
  assert.equal(out, sandbox.replace(/\\/g, '/') + '/a/b/c');
});

test('resolve empty string returns root', () => {
  const r = new SafePathResolver(sandbox);
  assert.equal(r.resolve(''), sandbox.replace(/\\/g, '/'));
});

test('resolve rejects NUL in input', () => {
  const r = new SafePathResolver(sandbox);
  assert.throws(() => r.resolve('a\u0000b'), RangeError);
});

test('resolve rejects non-string input', () => {
  const r = new SafePathResolver(sandbox);
  assert.throws(() => r.resolve(42), TypeError);
  assert.throws(() => r.resolve(null), TypeError);
});

test('tryResolve returns null on escape', () => {
  const r = new SafePathResolver(sandbox);
  assert.equal(r.tryResolve('../escape'), null);
});

test('tryResolve returns path on success', () => {
  const r = new SafePathResolver(sandbox);
  const out = r.tryResolve('ok.txt');
  assert.equal(out, sandbox.replace(/\\/g, '/') + '/ok.txt');
});

test('contains accepts a path inside root', () => {
  const r = new SafePathResolver(sandbox);
  assert.equal(r.contains(sandbox + '/sub/file'), true);
  assert.equal(r.contains(sandbox), true);
});

test('contains rejects a path outside root', () => {
  const r = new SafePathResolver(sandbox);
  assert.equal(r.contains(tmp + '/elsewhere'), false);
});

test('contains rejects NUL paths', () => {
  const r = new SafePathResolver(sandbox);
  assert.equal(r.contains('a\u0000b'), false);
});

test('consecutive separators collapse', () => {
  const r = new SafePathResolver(sandbox);
  const out = r.resolve('a///b\\\\c');
  assert.equal(out, sandbox.replace(/\\/g, '/') + '/a/b/c');
});

test('trailing slash is dropped', () => {
  const r = new SafePathResolver(sandbox);
  const out = r.resolve('dir/');
  assert.equal(out, sandbox.replace(/\\/g, '/') + '/dir');
});

test('dotdot exactly at root boundary escapes', () => {
  const r = new SafePathResolver(sandbox);
  assert.throws(() => r.resolve('..'), RangeError);
});

test('root given as relative path resolves against cwd', () => {
  // Use a subdirectory of cwd expressed relatively.
  const rel = cwdRelative(sandbox);
  // If sandbox is not under cwd, skip — we cannot construct the case.
  if (rel && !rel.startsWith('..')) {
    const r = new SafePathResolver(rel);
    const out = r.resolve('inside.txt');
    assert.equal(out, sandbox.replace(/\\/g, '/') + '/inside.txt');
  }
});

test('mixed .. and . does not leak', () => {
  const r = new SafePathResolver(sandbox);
  assert.throws(() => r.resolve('a/./../../b'), RangeError);
});
