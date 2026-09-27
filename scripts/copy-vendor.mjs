/**
 * Stage the browser build of Mozilla Readability for the Listen widget.
 *
 * The widget loads it on demand from /afrispeech/readability.min.js, so a
 * visitor who never clicks Listen never downloads it. The file is vendored
 * rather than pulled from a CDN: the host page loads it cross-origin, and we
 * would rather serve a pinned, audited copy from our own domain.
 *
 * Run automatically by `prebuild`.
 */
import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dest = join(root, 'public', 'afrispeech', 'readability.min.js');

await mkdir(dirname(dest), { recursive: true });
await copyFile(require.resolve('@mozilla/readability/Readability.js'), dest);
console.log('staged afrispeech/readability.min.js');
