// extractTitle: pulls a PDF's /Title entry out of raw bytes (Latin-1 scan of
// the first 64 KB), including UTF-16BE BOM strings. No browser.
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractTitle } from "../js/core/pdf-title.js";

function pdfBytes(text) {
  return new TextEncoder().encode(text);
}

test("extractTitle returns undefined when there is no Title entry", () => {
  assert.equal(extractTitle(pdfBytes("%PDF-1.4\n%%EOF\n")), undefined);
  assert.equal(extractTitle(pdfBytes("/Author (Marius) /Subject (x)")), undefined);
});

test("extractTitle reads a literal /Title string", () => {
  const bytes = pdfBytes("%PDF-1.4\n/Title (Quarterly Report) /Author (Marius)\n%%EOF");
  assert.equal(extractTitle(bytes), "Quarterly Report");
});

test("extractTitle handles spaces around the title and escaped characters", () => {
  const bytes = pdfBytes("/Title  (  Spaced Title  )");
  assert.equal(extractTitle(bytes), "Spaced Title");
  const escaped = pdfBytes("/Title (A\\B)");
  assert.equal(extractTitle(escaped), "AB");
});

test("extractTitle decodes a UTF-16BE title with BOM", () => {
  // /Title (\xfe\xff<UTF-16BE code units>) — BOM sits inside the parens.
  const title = "Ünïcode- thé";
  const units = [];
  for (const ch of title) units.push(ch.charCodeAt(0));
  const body = [0xfe, 0xff, ...units.flatMap((u) => [(u >> 8) & 0xff, u & 0xff])];
  const bytes = new Uint8Array([..."/Title (".split("").map((c) => c.charCodeAt(0)), ...body, 0x29]);
  assert.equal(extractTitle(bytes), title);
});

test("extractTitle trims and returns undefined for an empty title", () => {
  assert.equal(extractTitle(pdfBytes("/Title (   )")), undefined);
  assert.equal(extractTitle(pdfBytes("/Title ()")), undefined);
});

test("extractTitle only scans the first 64 KB", () => {
  const padding = " ".repeat(70000);
  const bytes = pdfBytes(padding + "/Title (Beyond the Limit)");
  assert.equal(extractTitle(bytes), undefined);
  const within = pdfBytes(" ".repeat(1000) + "/Title (Within Limit)");
  assert.equal(extractTitle(within), "Within Limit");
});
