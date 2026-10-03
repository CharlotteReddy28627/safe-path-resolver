/**
 * Safe Path Resolver — resolves paths inside a fixed root, refusing escapes.
 *
 * Design choice: POSIX-only semantics, even on Windows. We normalise every
 * input as if `\` were a path separator and `/` were the canonical one. This
 * is stricter than the host OS but it means a sandbox on Windows cannot be
 * tricked by a literal `..\\..` that the OS would resolve but a naive split
 * on `/` would miss. The trade-off: a Windows file named `foo\\bar` (a single
 * path component containing a backslash) is not representable. For a sandbox
 * guard that is acceptable.
 *
 * Null bytes: any path containing NUL is rejected outright. Filesystems treat
 * NUL as a terminator and allowing it through is a classic truncation vector.
 */

import { SafePathResolver } from './core.js';

export { SafePathResolver };
