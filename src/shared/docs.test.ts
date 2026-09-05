// The documents that must agree with each other, checked rather than promised. B58.
//
// **D43's criterion, argued rather than assumed.** *"Tests only where a wrong answer is
// invisible."* A drifted verbatim block is exactly that: `SCOPE.md` §2–§4 is copied into the
// README between markers, and nothing about a README that quietly disagrees with the scope
// document looks wrong. Nobody re-reads the two side by side — which is the whole reason
// `CLAUDE.md` §10 says a scope change *is* a README change. This is that sentence, executable.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const ROOT = join(import.meta.dirname, '..', '..');

/** The text strictly between the two markers, or `null` if either marker is missing. */
function verbatimBlock(file: string): string | null {
  const text = readFileSync(join(ROOT, file), 'utf8');
  const begin = text.indexOf('README-VERBATIM-BEGIN');
  const end = text.indexOf('README-VERBATIM-END');
  if (begin === -1 || end === -1 || end < begin) return null;
  // From the end of the BEGIN marker's own line to the start of the END marker's line.
  const from = text.indexOf('\n', begin) + 1;
  const to = text.lastIndexOf('\n', text.lastIndexOf('\n', end) - 1) + 1;
  return text.slice(from, to);
}

test('README.md carries SCOPE.md §2-§4 byte for byte between the markers', () => {
  const scope = verbatimBlock('docs/SCOPE.md');
  const readme = verbatimBlock('README.md');

  assert.notEqual(scope, null, 'docs/SCOPE.md lost its README-VERBATIM markers');
  assert.notEqual(readme, null, 'README.md lost its README-VERBATIM markers');
  // `deepEqual` on strings would pass the diff to the reporter as one blob; compare and, on
  // failure, name the first line that differs — a 90-line block needs a pointer, not a dump.
  if (scope !== readme) {
    const a = (scope ?? '').split('\n');
    const b = (readme ?? '').split('\n');
    const i = a.findIndex((line, n) => line !== b[n]);
    assert.fail(
      `README.md's verbatim block has drifted from docs/SCOPE.md at line ${i + 1} of the block:\n` +
        `  SCOPE.md: ${JSON.stringify(a[i] ?? '(block ends)')}\n` +
        `  README.md: ${JSON.stringify(b[i] ?? '(block ends)')}\n` +
        `A scope change is a README change (CLAUDE.md §10). Re-copy the block, do not edit it here.`,
    );
  }
});
