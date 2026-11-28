import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// editor.html was once reformatted as a whole by a formatter (4-space indent,
// long tags split across lines). That broke six layout-sensitive tests which
// match the file's exact markup: the wordmark, the Document label, the
// shortcut rows, the panel sections, and the em-dash stat placeholders. The
// repo keeps editor.html hand-laid-out like index.html and privacy.html:
// two-space indent, tags on one line where they fit. This guard fails if the
// file is auto-formatted again.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const editor = readFileSync(join(ROOT, "editor.html"), "utf8");
const lines = editor.split(/\r?\n/);

// More than 12 leading spaces means deeper than three nested elements; a
// reformatted file has most of its lines above that. More than 5% of lines
// over that indent suggests a formatter re-indented the file.
const deepLines = lines.filter((line) => /^[ ]{13,}/.test(line)).length;

// Body content only: the CSP meta in the head is intentionally long and wrapped.
const bodyStart = editor.indexOf("<body");
const bodyEnd = editor.indexOf("</body>", bodyStart);
const body = editor.slice(editor.indexOf(">", bodyStart) + 1, bodyEnd);
const longBodyLines = body.split(/\r?\n/).filter((line) => line.length > 160);

test("editor.html keeps the hand-written layout (not formatter output)", (t) => {
  assert.ok(
    deepLines / lines.length <= 0.05,
    `editor.html has ${deepLines} lines indented over 12 spaces (${((deepLines / lines.length) * 100).toFixed(1)}% of ${lines.length}); more than 5% suggests a formatter re-indented it`,
  );
  assert.deepStrictEqual(
    longBodyLines,
    [],
    `editor.html has body lines longer than 160 chars: ${longBodyLines.length}`,
  );
});
