Safe Path Resolver resolves filesystem paths inside a fixed root directory and refuses any input that would escape it. It is pure string manipulation — it does not touch the disk.

Usage:

```js
import { SafePathResolver } from 'safe-path-resolver';

const resolver = new SafePathResolver('/var/sandbox');

resolver.resolve('notes/2024.txt');       // '/var/sandbox/notes/2024.txt'
resolver.resolve('/etc/passwd');          // '/var/sandbox/etc/passwd' (re-anchored)
resolver.tryResolve('../escape');          // null
resolver.contains('/var/sandbox/notes/x'); // true
resolver.contains('/etc/passwd');          // false
```

Why this exists

Code that opens files based on untrusted input needs a guard between the input and `fs.open`. A naive `path.join(root, input)` is vulnerable to `..` traversal, and `path.resolve` happily leaves the root if the input is absolute. This library does one job: normalise an input against a fixed root and either return a path guaranteed to be inside it or throw.

The trade-off: symlinks are not followed. If `\root/link` points outside the sandbox, we will not catch it, because we never touch the filesystem. Callers who need symlink-safe behaviour must resolve symlinks themselves and re-run the result through `contains`.

Edge cases the reader will hit

- Absolute inputs like `/etc/passwd` are re-anchored under the root rather than rejected. This surprises people who expect an absolute path to be an escape. The alternative — rejecting absolute paths — breaks the common case of building paths with `path.join('/data', userInput)` and is the more dangerous surprise.
- Backslashes are treated as path separators on every platform, including Windows. A Windows file whose name literally contains a backslash is not representable. This is the cost of not letting `..\\..` slip past a `/`-only split.
- Any path containing a NUL byte is rejected. Filesystems treat NUL as a terminator and allowing it through is a classic truncation vector.
- `..` that would pop above the root throws `RangeError`; `tryResolve` returns `null` instead.

Run the tests:

```
node --test
```

## Performance

The window keeps a bounded buffer, so `push` is constant time and memory does not
grow with the length of the stream. `peak` and `trough` are linear in the window
size, which is the trade that keeps `push` cheap.

