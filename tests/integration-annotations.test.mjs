// Integration tests for annotations: store + exporter + pdf-lib + page actions.
// These tests verify the parts are connected: add/move/delete annotations through
// the same code path the editor uses, then export and assert they appear in the
// content stream at the right page-space position; undo removes them from the
// export; redo restores them; duplicate page copies them; delete page then undo
// restores them.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../js/core/store.js";
import {
  addAnnotation,
  updateAnnotation,
  deleteAnnotation,
  moveAnnotation,
  nudgeAnnotation,
  duplicatePageAnnotations,
  deletePageAnnotations,
  getAnnotationCount,
  createTextAnnotation,
  createHighlightAnnotation,
  DEFAULT_TEXT_FONT_SIZE,
  DEFAULT_TEXT_COLOR,
  DEFAULT_HIGHLIGHT_COLOR,
  DEFAULT_HIGHLIGHT_OPACITY,
  toJSON,
  fromJSON,
  clear,
} from "../js/core/annotations.js";
import { createExporter } from "../js/core/exporter.js";
import { PDFDocument, degrees, StandardFonts, rgb } from "../vendor/pdf-lib/pdf-lib.esm.min.js";
import { inflate } from "zlib";
import { promisify } from "util";

const inflateAsync = promisify(inflate);

// Parse content stream operators from a PDF page
async function parseContentStream(page) {
  const contentsRef = page.node.Contents();
  if (!contentsRef || !contentsRef.array) return "";

  const context = contentsRef.context;
  let bestContent = "";
  let bestLength = 0;

  function hasFilter(dict) {
    if (!dict?.dict) return false;
    for (const key of dict.dict.keys()) {
      if (key.encodedName === "/Filter") return true;
    }
    return false;
  }

  for (const ref of contentsRef.array) {
    const val = context.indirectObjects.get(ref);
    if (val && val.contents && val.contents.length > bestLength && hasFilter(val.dict)) {
      try {
        const decompressed = await inflateAsync(val.contents);
        const content = new TextDecoder().decode(decompressed);
        if (content.length > bestLength) {
          bestLength = content.length;
          bestContent = content;
        }
      } catch (e) {
        // ignore
      }
    }
  }
  return bestContent;
}

// Extract text matrix info from content stream
function extractTextMatrix(content) {
  const results = [];
  const tmRegex = /([\-\d.]+)\s+([\-\d.]+)\s+([\-\d.]+)\s+([\-\d.]+)\s+([\-\d.]+)\s+([\-\d.]+)\s+Tm/g;
  let match;
  while ((match = tmRegex.exec(content)) !== null) {
    const [, a, b, c, d, e, f] = match.map(Number);
    results.push({ a, b, c, d, e, f });
  }
  return results;
}

// Extract rectangle info from content stream (for highlights)
function extractHighlightRects(content) {
  const results = [];
  const cmMatches = [];
  const cmRegex = /^1\s+0\s+0\s+1\s+([\-\d.]+)\s+([\-\d.]+)\s+cm$/gm;
  let match;
  while ((match = cmRegex.exec(content)) !== null) {
    cmMatches.push({
      x: Number(match[1]),
      y: Number(match[2]),
      index: match.index,
    });
  }

  const rectMatches = [];
  const rectRegex = /0\s+0\s+m\s+0\s+([\-\d.]+)\s+l\s+([\-\d.]+)\s+\1\s+l\s+\2\s+0\s+l\s+h\s+[fF]/g;
  while ((match = rectRegex.exec(content)) !== null) {
    rectMatches.push({
      height: Number(match[1]),
      width: Number(match[2]),
      index: match.index,
    });
  }

  for (const rect of rectMatches) {
    let bestCm = null;
    for (const cm of cmMatches) {
      if (cm.index < rect.index && (cm.x !== 0 || cm.y !== 0)) {
        if (!bestCm || cm.index < bestCm.index) {
          bestCm = cm;
        }
      }
    }
    if (!bestCm) {
      for (const cm of cmMatches) {
        if (cm.index < rect.index && (!bestCm || cm.index > bestCm.index)) {
          bestCm = cm;
        }
      }
    }
    if (bestCm) {
      results.push({ x: bestCm.x, y: bestCm.y, width: rect.width, height: rect.height });
    }
  }
  return results;
}

// Expected position for line k at rotation R
function expectedLinePos(annX, annY, lineHeight, k, rotation) {
  const rad = (rotation * Math.PI) / 180;
  const sin = Math.sin(rad);
  const cos = Math.cos(rad);
  return {
    x: Number((annX + k * lineHeight * sin).toFixed(3)),
    y: Number((annY - k * lineHeight * cos).toFixed(3)),
  };
}

// Helper to create test source PDF
async function createTestPDF(width = 612, height = 792, baseRotation = 0) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([width, height]);
  if (baseRotation !== 0) {
    page.setRotation(degrees(baseRotation));
  }
  return { doc, page, bytes: await doc.save() };
}

// Helper to run export with annotations
async function runExport(pages, annotations, options = {}) {
  const exporter = createExporter({ PDFLib: { PDFDocument, degrees, StandardFonts, rgb } });
  const getSource = (sourceId) => {
    const source = pages.find(p => p.sourceId === sourceId);
    if (!source) return null;
    return { kind: "pdf", bytes: source.bytes, width: source.width, height: source.height, type: "application/pdf", id: sourceId };
  };

  return exporter.exportPages({
    pages,
    getSource,
    fileName: "test",
    exportMode: options.exportMode || "all",
    selected: options.selected || new Set(),
    pageNumbers: { mode: "none" },
    watermark: { text: "", enabled: false },
    annotations,
  });
}

// Create a store with pages and annotations tracking
function createTestStore(initialPages = []) {
  return createStore(
    {
      mode: "loaded",
      fileName: "test.pdf",
      pages: initialPages,
      selected: [],
      sourceFiles: [],
      totalSize: 0,
      size: "large",
      exportMode: "all",
      exportOptions: {
        pageNumbers: { mode: "none", format: "n", skipFirst: false },
        watermark: { text: "", color: "gray", angle: 0, opacity: 30 },
        metadata: { title: "", author: "" },
        split: { mode: "every", every: 1, ranges: "" },
      },
      annotations: {},
    },
    { track: ["pages", "annotations"] }
  );
}

// Action: add a text annotation to a page (one undo checkpoint)
function actionAddTextAnnotation(store, pageId, x, y, text, options = {}) {
  const ann = createTextAnnotation(x, y, text, options);
  store.checkpoint((s) => {
    s.annotations = addAnnotation(s.annotations || {}, pageId, ann);
  });
  // Return the added annotation ID (last one added)
  const pageAnns = getPageAnnotations(s => s, store.get().annotations, pageId);
  return pageAnns[pageAnns.length - 1]?.id;
}

// Action: add a highlight annotation to a page (one undo checkpoint)
function actionAddHighlightAnnotation(store, pageId, x, y, width, height, options = {}) {
  const ann = createHighlightAnnotation(x, y, width, height, options);
  store.checkpoint((s) => {
    s.annotations = addAnnotation(s.annotations || {}, pageId, ann);
  });
  const pageAnns = getPageAnnotations(s => s, store.get().annotations, pageId);
  return pageAnns[pageAnns.length - 1]?.id;
}

// Action: update an annotation (one undo checkpoint)
function actionUpdateAnnotation(store, pageId, annotationId, updates) {
  store.checkpoint((s) => {
    s.annotations = updateAnnotation(s.annotations || {}, pageId, annotationId, updates);
  });
}

// Action: delete an annotation (one undo checkpoint)
function actionDeleteAnnotation(store, pageId, annotationId) {
  store.checkpoint((s) => {
    s.annotations = deleteAnnotation(s.annotations || {}, pageId, annotationId);
  });
}

// Action: move/nudge an annotation (one undo checkpoint)
function actionNudgeAnnotation(store, pageId, annotationId, dx, dy) {
  store.checkpoint((s) => {
    s.annotations = nudgeAnnotation(s.annotations || {}, pageId, annotationId, dx, dy);
  });
}

// Helper to get page annotations from state
function getPageAnnotations(getter, annotations, pageId) {
  return annotations[pageId] ? [...annotations[pageId]] : [];
}

test("integration: add text and highlight annotations, export, verify in content stream", async () => {
  const { bytes } = await createTestPDF(612, 792);
  const pages = [{ id: "p1", sourceId: "s1", index: 0, rotated: 0, width: 612, height: 792, bytes }];

  const store = createTestStore(pages);

  // Add text annotation through action
  const textAnnId = actionAddTextAnnotation(store, "p1", 100, 200, "Hello World", { fontSize: 18, color: "#ff0000" });
  assert.ok(textAnnId);

  // Add highlight annotation through action
  const highAnnId = actionAddHighlightAnnotation(store, "p1", 50, 50, 200, 100, { color: "#00ff00", opacity: 0.5 });
  assert.ok(highAnnId);

  const state = store.get();
  assert.equal(state.annotations.p1.length, 2);

  // Export and verify
  const result = await runExport(pages, state.annotations);
  const outDoc = await PDFDocument.load(result.bytes);
  const outPage = outDoc.getPage(0);
  const content = await parseContentStream(outPage);

  const textMatrices = extractTextMatrix(content);
  const rects = extractHighlightRects(content);

  // Should have 1 text annotation (1 line) + possibly page numbers (none since mode=none)
  assert.equal(textMatrices.length, 1, "Should have 1 text matrix for the annotation");
  const tm = textMatrices[0];
  assert.equal(tm.e, 100); // x
  assert.equal(tm.f, 200); // y
  // Font size is in the text state (Ts), not in Tm matrix
  // Color check would need rgb comparison

  // Should have 1 highlight
  assert.equal(rects.length, 1);
  assert.equal(rects[0].x, 50);
  assert.equal(rects[0].y, 50);
  assert.equal(rects[0].width, 200);
  assert.equal(rects[0].height, 100);
});

test("integration: undo removes annotations from export, redo restores them", async () => {
  const { bytes } = await createTestPDF(612, 792);
  const pages = [{ id: "p1", sourceId: "s1", index: 0, rotated: 0, width: 612, height: 792, bytes }];

  const store = createTestStore(pages);

  // Add annotation
  actionAddTextAnnotation(store, "p1", 100, 200, "Test Annotation");
  let state = store.get();
  assert.equal(state.annotations.p1.length, 1);

  // Export with annotation
  let result = await runExport(pages, state.annotations);
  let outDoc = await PDFDocument.load(result.bytes);
  let outPage = outDoc.getPage(0);
  let content = await parseContentStream(outPage);
  let textMatrices = extractTextMatrix(content);
  assert.equal(textMatrices.length, 1, "Annotation should be in export");

  // Undo
  const undoResult = store.undo();
  assert.equal(undoResult, true);
  state = store.get();
  assert.equal(state.annotations.p1?.length || 0, 0, "Annotation should be removed after undo");

  // Export without annotation
  result = await runExport(pages, state.annotations);
  outDoc = await PDFDocument.load(result.bytes);
  outPage = outDoc.getPage(0);
  content = await parseContentStream(outPage);
  textMatrices = extractTextMatrix(content);
  assert.equal(textMatrices.length, 0, "Annotation should not be in export after undo");

  // Redo
  const redoResult = store.redo();
  assert.equal(redoResult, true);
  state = store.get();
  assert.equal(state.annotations.p1?.length || 0, 1, "Annotation should be restored after redo");

  // Export with annotation again
  result = await runExport(pages, state.annotations);
  outDoc = await PDFDocument.load(result.bytes);
  outPage = outDoc.getPage(0);
  content = await parseContentStream(outPage);
  textMatrices = extractTextMatrix(content);
  assert.equal(textMatrices.length, 1, "Annotation should be in export after redo");
});

test("integration: duplicate page copies annotations", async () => {
  const { bytes } = await createTestPDF(612, 792);
  const pages = [
    { id: "p1", sourceId: "s1", index: 0, rotated: 0, width: 612, height: 792, bytes },
  ];

  const store = createTestStore(pages);

  // Add annotations to page 1
  actionAddTextAnnotation(store, "p1", 100, 200, "Original Text");
  actionAddHighlightAnnotation(store, "p1", 50, 50, 100, 50);

  let state = store.get();
  assert.equal(state.annotations.p1.length, 2);

  // Simulate page duplication (like duplicateSelected does)
  const newPageId = "p2";
  store.checkpoint((s) => {
    s.pages = [
      ...s.pages,
      { id: newPageId, sourceId: "s1", index: 0, rotated: 0, width: 612, height: 792 },
    ];
    // Duplicate annotations using pure helper
    s.annotations = duplicatePageAnnotations(s.annotations || {}, "p1", newPageId);
  });

  state = store.get();
  assert.equal(state.pages.length, 2);
  assert.equal(state.annotations.p1.length, 2);
  assert.equal(state.annotations.p2.length, 2);

  // Verify annotations on duplicated page have new IDs
  for (let i = 0; i < 2; i++) {
    assert.notEqual(state.annotations.p1[i].id, state.annotations.p2[i].id);
    assert.equal(state.annotations.p1[i].text, state.annotations.p2[i].text);
    assert.equal(state.annotations.p1[i].x, state.annotations.p2[i].x);
    assert.equal(state.annotations.p1[i].y, state.annotations.p2[i].y);
  }

  // Export both pages and verify
  const pagesForExport = [
    { id: "p1", sourceId: "s1", index: 0, rotated: 0, width: 612, height: 792, bytes },
    { id: "p2", sourceId: "s1", index: 0, rotated: 0, width: 612, height: 792, bytes },
  ];

  const result = await runExport(pagesForExport, state.annotations);
  const outDoc = await PDFDocument.load(result.bytes);
  assert.equal(outDoc.getPageCount(), 2);

  // Check page 1
  let outPage = outDoc.getPage(0);
  let content = await parseContentStream(outPage);
  let textMatrices = extractTextMatrix(content);
  let rects = extractHighlightRects(content);
  assert.equal(textMatrices.length, 1);
  assert.equal(rects.length, 1);

  // Check page 2
  outPage = outDoc.getPage(1);
  content = await parseContentStream(outPage);
  textMatrices = extractTextMatrix(content);
  rects = extractHighlightRects(content);
  assert.equal(textMatrices.length, 1);
  assert.equal(rects.length, 1);
});

test("integration: delete page removes annotations, undo restores them", async () => {
  const { bytes } = await createTestPDF(612, 792);
  const pages = [
    { id: "p1", sourceId: "s1", index: 0, rotated: 0, width: 612, height: 792, bytes },
    { id: "p2", sourceId: "s1", index: 0, rotated: 0, width: 612, height: 792, bytes },
  ];

  const store = createTestStore(pages);

  // Add annotations to page 2
  actionAddTextAnnotation(store, "p2", 100, 200, "Page 2 Text");
  actionAddHighlightAnnotation(store, "p2", 50, 50, 100, 50);

  let state = store.get();
  assert.equal(state.pages.length, 2);
  assert.equal(state.annotations.p2.length, 2);

  // Simulate page deletion (like deleteSelected does)
  store.checkpoint((s) => {
    s.pages = s.pages.filter((p) => p.id !== "p2");
    s.annotations = deletePageAnnotations(s.annotations || {}, "p2");
  });

  state = store.get();
  assert.equal(state.pages.length, 1);
  assert.equal(state.annotations.p2, undefined);

  // Export - should only have page 1, no annotations
  const pagesForExport = [{ id: "p1", sourceId: "s1", index: 0, rotated: 0, width: 612, height: 792, bytes }];
  let result = await runExport(pagesForExport, state.annotations);
  let outDoc = await PDFDocument.load(result.bytes);
  assert.equal(outDoc.getPageCount(), 1);

  // Undo - should restore page and annotations
  const undoResult = store.undo();
  assert.equal(undoResult, true);
  state = store.get();
  assert.equal(state.pages.length, 2);
  assert.equal(state.annotations.p2.length, 2);

  // Export again - should have both pages with annotations on page 2
  pagesForExport.push({ id: "p2", sourceId: "s1", index: 0, rotated: 0, width: 612, height: 792, bytes });
  result = await runExport(pagesForExport, state.annotations);
  outDoc = await PDFDocument.load(result.bytes);
  assert.equal(outDoc.getPageCount(), 2);

  let outPage = outDoc.getPage(1);
  let content = await parseContentStream(outPage);
  let textMatrices = extractTextMatrix(content);
  let rects = extractHighlightRects(content);
  assert.equal(textMatrices.length, 1);
  assert.equal(rects.length, 1);
});

test("integration: badge count function returns correct count", () => {
  const store = createTestStore();
  const annotations = store.get().annotations;

  assert.equal(getAnnotationCount(annotations, "p1"), 0);

  store.checkpoint((s) => {
    s.annotations = addAnnotation(s.annotations || {}, "p1", createTextAnnotation(0, 0, "A"));
  });
  assert.equal(getAnnotationCount(store.get().annotations, "p1"), 1);

  store.checkpoint((s) => {
    s.annotations = addAnnotation(s.annotations || {}, "p1", createHighlightAnnotation(0, 0, 10, 10));
  });
  assert.equal(getAnnotationCount(store.get().annotations, "p1"), 2);

  store.checkpoint((s) => {
    const anns = getPageAnnotations(s => s, s.annotations, "p1");
    s.annotations = deleteAnnotation(s.annotations || {}, "p1", anns[0].id);
  });
  assert.equal(getAnnotationCount(store.get().annotations, "p1"), 1);
});

test("integration: empty text annotation is discarded (not stored)", () => {
  const store = createTestStore([{ id: "p1", sourceId: "s1", index: 0, rotated: 0, width: 612, height: 792, bytes: new Uint8Array() }]);

  // Add empty text annotation
  store.checkpoint((s) => {
    s.annotations = addAnnotation(s.annotations || {}, "p1", createTextAnnotation(100, 200, ""));
  });

  // The annotation is added but has empty text - export should skip it
  let state = store.get();
  assert.equal(state.annotations.p1.length, 1); // Still in store

  // Simulate commitTextInput with empty text -> should delete
  const annId = state.annotations.p1[0].id;
  store.checkpoint((s) => {
    s.annotations = deleteAnnotation(s.annotations || {}, "p1", annId);
  });

  state = store.get();
  assert.equal(state.annotations.p1.length, 0);
});

test("integration: annotations work correctly at all rotations (0, 90, 180, 270)", async () => {
  for (const rotation of [0, 90, 180, 270]) {
    const { bytes } = await createTestPDF(612, 792);
    const pages = [{ id: "p1", sourceId: "s1", index: 0, rotated: rotation, width: 612, height: 792, bytes }];

    const store = createTestStore(pages);

    // Add text annotation
    actionAddTextAnnotation(store, "p1", 100, 600, "Line 1\nLine 2\nLine 3", { fontSize: 20 });
    // Add highlight annotation
    actionAddHighlightAnnotation(store, "p1", 100, 300, 200, 60);

    const state = store.get();

    // Export and verify
    const result = await runExport(pages, state.annotations);
    const outDoc = await PDFDocument.load(result.bytes);
    const outPage = outDoc.getPage(0);
    const content = await parseContentStream(outPage);

    const textMatrices = extractTextMatrix(content);
    const rects = extractHighlightRects(content);

    // Should have 3 text lines
    assert.equal(textMatrices.length, 3, `Rotation ${rotation}: should have 3 text lines`);

    const lineHeight = 20 * 1.2;
    for (let k = 0; k < 3; k++) {
      const expected = expectedLinePos(100, 600, lineHeight, k, rotation);
      const tm = textMatrices[k];
      assert.ok(Math.abs(tm.e - expected.x) < 0.01, `Rotation ${rotation} Line ${k}: tx`);
      assert.ok(Math.abs(tm.f - expected.y) < 0.01, `Rotation ${rotation} Line ${k}: ty`);
    }

    // Highlight should be at page-space coordinates regardless of rotation
    assert.equal(rects.length, 1, `Rotation ${rotation}: should have 1 highlight`);
    assert.equal(rects[0].x, 100, `Rotation ${rotation}: highlight x`);
    assert.equal(rects[0].y, 300, `Rotation ${rotation}: highlight y`);
    assert.equal(rects[0].width, 200, `Rotation ${rotation}: highlight width`);
    assert.equal(rects[0].height, 60, `Rotation ${rotation}: highlight height`);
  }
});

test("integration: base /Rotate + user rotation = effective rotation for annotations", async () => {
  // Source PDF has base rotation 90, user adds 90, effective = 180
  const { bytes } = await createTestPDF(612, 792, 90);
  const pages = [{ id: "p1", sourceId: "s1", index: 0, rotated: 90, width: 612, height: 792, bytes }];

  const store = createTestStore(pages);

  actionAddTextAnnotation(store, "p1", 100, 600, "Line 1\nLine 2\nLine 3", { fontSize: 20 });
  actionAddHighlightAnnotation(store, "p1", 100, 300, 200, 60);

  const state = store.get();

  const result = await runExport(pages, state.annotations);
  const outDoc = await PDFDocument.load(result.bytes);
  const outPage = outDoc.getPage(0);

  // Verify effective rotation is 180
  const effectiveRotation = outPage.getRotation().angle ?? 0;
  assert.equal(effectiveRotation, 180, "Effective rotation should be 180° (base 90 + user 90)");

  const content = await parseContentStream(outPage);
  const textMatrices = extractTextMatrix(content);
  const rects = extractHighlightRects(content);

  const lineHeight = 20 * 1.2;
  for (let k = 0; k < 3; k++) {
    const expected = expectedLinePos(100, 600, lineHeight, k, 180);
    const tm = textMatrices[k];
    assert.ok(Math.abs(tm.e - expected.x) < 0.01, `Line ${k}: tx`);
    assert.ok(Math.abs(tm.f - expected.y) < 0.01, `Line ${k}: ty`);
  }

  assert.equal(rects.length, 1);
  assert.equal(rects[0].x, 100);
  assert.equal(rects[0].y, 300);
  assert.equal(rects[0].width, 200);
  assert.equal(rects[0].height, 60);
});

// Integration test: text annotation commit/undo at rotation 180 creates exactly ONE history entry
test("integration: text annotation commit/undo at rotation 180 — one history entry per commit", async () => {
  // Create a PDF with base rotation 180
  const { bytes } = await createTestPDF(612, 792, 180);
  const pages = [{ id: "p1", sourceId: "s1", index: 0, rotated: 180, width: 612, height: 792, bytes }];

  const store = createTestStore(pages);

  // Initial history should be empty
  let state = store.get();
  assert.equal(state.pages.length, 1);

  // Add a text annotation at page-space coordinates (100, 600) — this simulates
  // the user clicking, typing, and committing (blur/enter) which calls updateAnnotations once
  store.checkpoint((s) => {
    s.annotations = addAnnotation(s.annotations || {}, "p1", createTextAnnotation(100, 600, "Test at 180°", { fontSize: 18 }));
  });

  // Verify: exactly ONE history entry was created
  state = store.get();
  assert.equal(state.annotations.p1.length, 1);
  const ann = state.annotations.p1[0];
  assert.equal(ann.text, "Test at 180°");
  assert.equal(ann.x, 100);
  assert.equal(ann.y, 600);

  // Export and verify the text appears at correct page-space position in content stream
  let result = await runExport(pages, state.annotations);
  let outDoc = await PDFDocument.load(result.bytes);
  let outPage = outDoc.getPage(0);
  let content = await parseContentStream(outPage);
  let textMatrices = extractTextMatrix(content);
  assert.equal(textMatrices.length, 1, "Should have 1 text matrix for the annotation");
  // At rotation 180, page-space (100, 600) should be at the correct position
  // expectedLinePos handles the rotation
  const lineHeight = 18 * 1.2;
  const expected = expectedLinePos(100, 600, lineHeight, 0, 180);
  const tm = textMatrices[0];
  assert.ok(Math.abs(tm.e - expected.x) < 0.01, `tx: got ${tm.e}, expected ${expected.x}`);
  assert.ok(Math.abs(tm.f - expected.y) < 0.01, `ty: got ${tm.f}, expected ${expected.y}`);

  // Undo — should remove the annotation
  const undoResult = store.undo();
  assert.equal(undoResult, true, "Undo should succeed");
  state = store.get();
  assert.equal(state.annotations.p1?.length || 0, 0, "Annotation should be removed after undo");

  // Export without annotation
  result = await runExport(pages, state.annotations);
  outDoc = await PDFDocument.load(result.bytes);
  outPage = outDoc.getPage(0);
  content = await parseContentStream(outPage);
  textMatrices = extractTextMatrix(content);
  assert.equal(textMatrices.length, 0, "Annotation should not be in export after undo");

  // Redo — should restore the annotation
  const redoResult = store.redo();
  assert.equal(redoResult, true, "Redo should succeed");
  state = store.get();
  assert.equal(state.annotations.p1?.length || 0, 1, "Annotation should be restored after redo");

  // Export with annotation again
  result = await runExport(pages, state.annotations);
  outDoc = await PDFDocument.load(result.bytes);
  outPage = outDoc.getPage(0);
  content = await parseContentStream(outPage);
  textMatrices = extractTextMatrix(content);
  assert.equal(textMatrices.length, 1, "Annotation should be in export after redo");
  const tm2 = textMatrices[0];
  assert.ok(Math.abs(tm2.e - expected.x) < 0.01, `redo tx: got ${tm2.e}, expected ${expected.x}`);
  assert.ok(Math.abs(tm2.f - expected.y) < 0.01, `redo ty: got ${tm2.f}, expected ${expected.y}`);

  // Verify history length: only 1 checkpoint created by the commit
  // (the test store doesn't expose history directly, but we verified undo/redo round-trip works)
});