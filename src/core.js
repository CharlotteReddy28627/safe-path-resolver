/**
 * Core resolver. Pure string manipulation, no filesystem access.
 *
 * The algorithm is deliberately simple so it is easy to audit:
 *   1. reject NUL bytes;
 *   2. split on `/` or `\`;
 *   3. fold segments left-to-right, pushing names and popping on `..`;
 *   4. reject if an `..` would pop past the root (i.e. escape);
 *   5. join with `/` and prefix the root (root is normalised the same way).
 *
 * SymLinks are NOT followed — we never touch the filesystem. If you need
 * symlink-safe resolution you must resolve the symlink yourself and call us
 * again on the result. See README.
 */

export class SafePathResolver {
  /**
   * @param {string} rootPath — the sandbox root, anchored to process.cwd() if
   *   it is not absolute. Must itself be inside cwd, i.e. contain no `..`
   *   that escapes cwd. We do not call realpath; we trust the caller to pass a
   *   root that is already on disk.
   */
  constructor(rootPath) {
    if (typeof rootPath !== 'string' || rootPath.length === 0) {
      throw new TypeError('rootPath must be a non-empty string');
    }
    if (rootPath.includes('\u0000')) {
      throw new RangeError('rootPath must not contain NUL bytes');
    }
    const resolved = SafePathResolver._resolveRoot(rootPath);
    if (resolved === null) {
      throw new RangeError('rootPath escapes the process working directory');
    }
    this.root = resolved;
  }

  /**
   * Resolve `input` relative to the root. Returns the absolute, canonical path
   * guaranteed to be inside the root, or throws if `input` would escape.
   *
   * @param {string} input
   * @returns {string}
   */
  resolve(input) {
    if (typeof input !== 'string') {
      throw new TypeError('input must be a string');
    }
    if (input.includes('\u0000')) {
      throw new RangeError('input must not contain NUL bytes');
    }

    // Absolute inputs are re-anchored at the root: we drop the leading slash
    // and resolve the tail as if relative. This means `/etc/passwd` becomes
    // `<root>/etc/passwd` rather than an escape. The alternative — rejecting
    // absolute paths outright — surprises users who build paths by joining.
    // Re-anchoring is the safer surprise.
    let work = input;
    if (work.startsWith('/')) {
      work = work.slice(1);
    }

    const segments = work.split(/[\\/]+/);
    const stack = [];
    for (const seg of segments) {
      if (seg === '' || seg === '.') continue;
      if (seg === '..') {
        if (stack.length === 0) {
          // would escape the root.
          throw new RangeError(`path escapes sandbox root: ${input}`);
        }
        stack.pop();
        continue;
      }
      stack.push(seg);
    }

    if (stack.length === 0) {
      return this.root;
    }
    return this.root + '/' + stack.join('/');
  }

  /**
   * Like resolve, but returns null instead of throwing on escape. Handy when
   * the caller wants to treat an escape as a soft 404 rather than an error.
   */
  tryResolve(input) {
    try {
      return this.resolve(input);
    } catch (e) {
      if (e instanceof RangeError) return null;
      throw e;
    }
  }

  /**
   * @param {string} candidate
   * @returns {boolean} — true if `candidate`, once normalised, begins with the
   *   root. Used to vet a path that came from outside (e.g. a config file)
   *   before acting on it. Does NOT touch the filesystem.
   */
  contains(candidate) {
    if (typeof candidate !== 'string') {
      throw new TypeError('candidate must be a string');
    }
    if (candidate.includes('\u0000')) {
      return false;
    }
    const norm = SafePathResolver._normalizeAny(candidate);
    if (norm === null) return false;
    if (norm === this.root) return true;
    return norm.startsWith(this.root + '/');
  }

  // --- internal helpers ------------------------------------------------

  static _normalizeAny(input) {
    // Normalises ANY path (absolute or relative) against process.cwd(),
    // applying the same `..` folding rules. Returns null on escape.
    const cwd = process.cwd().replace(/\\/g, '/');
    const isAbs = input.startsWith('/') || /^[A-Za-z]:[\\/]/.test(input);
    let work = input.replace(/\\/g, '/');
    let base;
    if (isAbs && /^[A-Za-z]:/.test(work)) {
      base = work.slice(0, 3); // drive + slash
      work = work.slice(3);
    } else if (isAbs) {
      base = '';
    } else {
      base = cwd.endsWith('/') ? cwd : cwd + '/';
      // strip the leading slash of base if present so concatenation is clean
    }
    const segments = work.split('/');
    const stack = [];
    for (const seg of segments) {
      if (seg === '' || seg === '.') continue;
      if (seg === '..') {
        if (stack.length === 0) {
          // for relative paths, popping past base means escape past cwd
          return null;
        }
        stack.pop();
        continue;
      }
      stack.push(seg);
    }
    const tail = stack.join('/');
    if (base.endsWith('/')) {
      return (base + tail).replace(/\/+/g, '/') || '/';
    }
    return base + (tail ? '/' + tail : '') || '/';
  }

  static _resolveRoot(rootPath) {
    const norm = SafePathResolver._normalizeAny(rootPath);
    return norm;
  }
}
