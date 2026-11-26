// Annotation data model tests: CRUD, validation, serialization, page actions.
// Uses the new pure function API (no singleton module).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getPageAnnotations,
  getAllAnnotations,
  setPageAnnotations,
  addAnnotation,
  updateAnnotation,
  deleteAnnotation,
  moveAnnotation,
  nudgeAnnotation,
  duplicatePageAnnotations,
  deletePageAnnotations,
  getAnnotationCount,
  validateTextForHelvetica,
  createTextAnnotation,
  createHighlightAnnotation,
  createImageAnnotation,
  DEFAULT_TEXT_FONT_SIZE,
  DEFAULT_TEXT_COLOR,
  DEFAULT_HIGHLIGHT_COLOR,
  DEFAULT_HIGHLIGHT_OPACITY,
  DEFAULT_IMAGE_OPACITY,
  toJSON,
  fromJSON,
  clear,
  annotationDefaultsFromState,
  panelControlValues,
} from "../js/core/annotations.js";
import { commitTextDraft } from "../js/core/annotation-commit.js";

test("annotations: basic CRUD operations", () => {
  let annotations = {};

  // Empty page
  assert.deepStrictEqual(getPageAnnotations(annotations, "p1"), []);

  // Add text annotation
  const textAnn = createTextAnnotation(100, 200, "Hello");
  annotations = addAnnotation(annotations, "p1", textAnn);
  const added = getPageAnnotations(annotations, "p1")[0];
  assert.ok(added.id.startsWith("a"));
  assert.equal(added.text, "Hello");
  assert.equal(added.x, 100);
  assert.equal(added.y, 200);
  assert.equal(added.fontSize, 14);
  assert.equal(added.color, "#000000");

  // Add highlight annotation
  const highAnn = createHighlightAnnotation(50, 50, 200, 100);
  annotations = addAnnotation(annotations, "p1", highAnn);
  const addedHigh = getPageAnnotations(annotations, "p1")[1];
  assert.ok(addedHigh.id.startsWith("a"));
  assert.equal(addedHigh.type, "highlight");
  assert.equal(addedHigh.width, 200);
  assert.equal(addedHigh.height, 100);
  assert.equal(addedHigh.color, "#ffe14d");
  assert.equal(addedHigh.opacity, 0.4);

  // Get page annotations
  const pageAnns = getPageAnnotations(annotations, "p1");
  assert.equal(pageAnns.length, 2);
  assert.equal(pageAnns[0].id, added.id);
  assert.equal(pageAnns[1].id, addedHigh.id);

  // Update annotation
  annotations = updateAnnotation(annotations, "p1", added.id, { text: "Updated", fontSize: 18, color: "#ff0000" });
  const updated = getPageAnnotations(annotations, "p1").find((a) => a.id === added.id);
  assert.equal(updated.text, "Updated");
  assert.equal(updated.fontSize, 18);
  assert.equal(updated.color, "#ff0000");
  assert.equal(updated.x, 100); // unchanged
  assert.equal(updated.y, 200); // unchanged

  // Delete annotation
  annotations = deleteAnnotation(annotations, "p1", added.id);
  assert.equal(getPageAnnotations(annotations, "p1").length, 1);
  assert.equal(getPageAnnotations(annotations, "p1")[0].id, addedHigh.id);

  // Delete non-existent
  const beforeDelete = { ...annotations };
  annotations = deleteAnnotation(annotations, "p1", "nonexistent");
  assert.deepStrictEqual(annotations, beforeDelete);
});

test("annotations: getAllAnnotations and setPageAnnotations", () => {
  let annotations = {};
  annotations = addAnnotation(annotations, "p1", createTextAnnotation(0, 0, "A"));
  annotations = addAnnotation(annotations, "p1", createTextAnnotation(10, 10, "B"));
  annotations = addAnnotation(annotations, "p2", createTextAnnotation(20, 20, "C"));

  const all = getAllAnnotations(annotations);
  assert.equal(all.p1.length, 2);
  assert.equal(all.p2.length, 1);

  // setPageAnnotations replaces
  annotations = setPageAnnotations(annotations, "p1", [createTextAnnotation(0, 0, "X")]);
  assert.equal(getPageAnnotations(annotations, "p1").length, 1);
  assert.equal(getPageAnnotations(annotations, "p1")[0].text, "X");
});

test("annotations: moveAnnotation and nudgeAnnotation", () => {
  let annotations = {};
  const textAnn = createTextAnnotation(100, 200, "Test");
  annotations = addAnnotation(annotations, "p1", textAnn);
  const added = getPageAnnotations(annotations, "p1")[0];

  // moveAnnotation
  annotations = moveAnnotation(annotations, "p1", added.id, 50, -30);
  const moved = getPageAnnotations(annotations, "p1").find((a) => a.id === added.id);
  assert.equal(moved.x, 150);
  assert.equal(moved.y, 170);

  // nudgeAnnotation (alias)
  annotations = nudgeAnnotation(annotations, "p1", moved.id, 10, 10);
  const nudged = getPageAnnotations(annotations, "p1").find((a) => a.id === moved.id);
  assert.equal(nudged.x, 160);
  assert.equal(nudged.y, 180);
});

test("annotations: duplicatePageAnnotations with new IDs", () => {
  let annotations = {};
  annotations = addAnnotation(annotations, "p1", createTextAnnotation(0, 0, "A"));
  annotations = addAnnotation(annotations, "p1", createTextAnnotation(10, 10, "B"));
  annotations = addAnnotation(annotations, "p1", createHighlightAnnotation(20, 20, 100, 50));

  annotations = duplicatePageAnnotations(annotations, "p1", "p2");

  const p1Anns = getPageAnnotations(annotations, "p1");
  const p2Anns = getPageAnnotations(annotations, "p2");
  assert.equal(p2Anns.length, 3);
  // All IDs should be new
  for (const a of p2Anns) {
    assert.ok(a.id.startsWith("a"));
    // IDs should not collide with p1
    assert.ok(!p1Anns.some((p1) => p1.id === a.id));
  }
  // Content should be same except IDs
  assert.equal(p2Anns[0].text, "A");
  assert.equal(p2Anns[1].text, "B");
  assert.equal(p2Anns[2].width, 100);
});

test("annotations: deletePageAnnotations", () => {
  let annotations = {};
  annotations = addAnnotation(annotations, "p1", createTextAnnotation(0, 0, "A"));
  annotations = addAnnotation(annotations, "p2", createTextAnnotation(0, 0, "B"));

  annotations = deletePageAnnotations(annotations, "p1");
  assert.equal(getPageAnnotations(annotations, "p1").length, 0);
  assert.equal(getPageAnnotations(annotations, "p2").length, 1);

  const beforeDelete = { ...annotations };
  annotations = deletePageAnnotations(annotations, "p99");
  assert.deepStrictEqual(annotations, beforeDelete);
});

test("annotations: getAnnotationCount", () => {
  let annotations = {};
  assert.equal(getAnnotationCount(annotations, "p1"), 0);
  annotations = addAnnotation(annotations, "p1", createTextAnnotation(0, 0, "A"));
  assert.equal(getAnnotationCount(annotations, "p1"), 1);
  annotations = addAnnotation(annotations, "p1", createTextAnnotation(0, 0, "B"));
  assert.equal(getAnnotationCount(annotations, "p1"), 2);
});

test("annotations: validateTextForHelvetica", () => {
  // Valid: ASCII printable
  assert.deepStrictEqual(validateTextForHelvetica("Hello World!"), { valid: true });
  assert.deepStrictEqual(validateTextForHelvetica("Test 123"), { valid: true });

  // Valid: Latin-1 supplement (160-255)
  assert.deepStrictEqual(validateTextForHelvetica("café"), { valid: true });
  assert.deepStrictEqual(validateTextForHelvetica("naïve"), { valid: true });

  // Invalid: control characters
  const ctrlResult = validateTextForHelvetica("Hello\x00World");
  assert.equal(ctrlResult.valid, false);
  assert.equal(ctrlResult.code, 0);
  assert.equal(ctrlResult.position, 5);

  // Invalid: characters above 255 (emoji, CJK, etc.)
  const emojiResult = validateTextForHelvetica("Hello 😀");
  assert.equal(emojiResult.valid, false);
  assert.ok(emojiResult.code > 255);

  const cjkResult = validateTextForHelvetica("Hello 世界");
  assert.equal(cjkResult.valid, false);
  assert.ok(cjkResult.code > 255);
});

test("annotations: toJSON and fromJSON", () => {
  let annotations = {};
  annotations = addAnnotation(annotations, "p1", createTextAnnotation(100, 200, "Hello"));
  annotations = addAnnotation(annotations, "p1", createHighlightAnnotation(50, 50, 100, 100));
  annotations = addAnnotation(annotations, "p2", createTextAnnotation(0, 0, "World"));

  const json = toJSON(annotations);
  assert.equal(json.p1.length, 2);
  assert.equal(json.p2.length, 1);

  // Create new module and restore
  annotations = fromJSON(json);
  assert.equal(getPageAnnotations(annotations, "p1").length, 2);
  assert.equal(getPageAnnotations(annotations, "p1")[0].text, "Hello");
  assert.equal(getPageAnnotations(annotations, "p2")[0].text, "World");

  // IDs should be preserved
  assert.equal(getPageAnnotations(annotations, "p1")[0].id, json.p1[0].id);
});

test("annotations: fromJSON with invalid data", () => {
  let annotations = fromJSON(null);
  assert.equal(getAnnotationCount(annotations, "p1"), 0);
  annotations = fromJSON({});
  assert.equal(getAnnotationCount(annotations, "p1"), 0);
  annotations = fromJSON({ p1: "not an array" });
  assert.equal(getAnnotationCount(annotations, "p1"), 0);
});

test("annotations: clear", () => {
  let annotations = {};
  annotations = addAnnotation(annotations, "p1", createTextAnnotation(0, 0, "A"));
  annotations = addAnnotation(annotations, "p2", createTextAnnotation(0, 0, "B"));
  annotations = clear();
  assert.equal(getPageAnnotations(annotations, "p1").length, 0);
  assert.equal(getPageAnnotations(annotations, "p2").length, 0);
  // ID counter should reset
  annotations = addAnnotation(annotations, "p1", createTextAnnotation(0, 0, "C"));
  const fresh = getPageAnnotations(annotations, "p1")[0];
  assert.equal(fresh.id, "a1");
});

test("annotations: constants exported", () => {
  assert.equal(DEFAULT_TEXT_FONT_SIZE, 14);
  assert.equal(DEFAULT_TEXT_COLOR, "#000000");
  assert.equal(DEFAULT_HIGHLIGHT_COLOR, "#ffe14d");
  assert.equal(DEFAULT_HIGHLIGHT_OPACITY, 0.4);
});

test("annotations: createTextAnnotation and createHighlightAnnotation with custom options", () => {
  const textAnn = createTextAnnotation(10, 20, "Custom", { fontSize: 24, color: "#0066ff" });
  assert.equal(textAnn.fontSize, 24);
  assert.equal(textAnn.color, "#0066ff");

  const highAnn = createHighlightAnnotation(10, 20, 100, 50, { color: "#ff0000", opacity: 0.8 });
  assert.equal(highAnn.color, "#ff0000");
  assert.equal(highAnn.opacity, 0.8);
});

// commitTextDraft pure function tests
test("commitTextDraft: new annotation with non-empty text returns add action", () => {
  let annotations = {};
  const draft = { pageX: 100, pageY: 200, pageId: "p1" };
  const action = commitTextDraft({ draft, text: "Hello World", defaults: { fontSize: 14, color: "#000000" } });
  assert.ok(typeof action === "function");
  annotations = action(annotations);
  const anns = getPageAnnotations(annotations, "p1");
  assert.equal(anns.length, 1);
  assert.equal(anns[0].text, "Hello World");
  assert.equal(anns[0].x, 100);
  assert.equal(anns[0].y, 200);
  assert.equal(anns[0].fontSize, 14);
  assert.equal(anns[0].color, "#000000");
});

test("commitTextDraft: new annotation with empty text returns null (no action)", () => {
  const draft = { pageX: 100, pageY: 200, pageId: "p1" };
  const action = commitTextDraft({ draft, text: "   ", defaults: { fontSize: 14, color: "#000000" } });
  assert.equal(action, null);
  // Also test completely empty string
  const action2 = commitTextDraft({ draft, text: "", defaults: { fontSize: 14, color: "#000000" } });
  assert.equal(action2, null);
});

test("commitTextDraft: editing existing annotation with non-empty text returns update action", () => {
  let annotations = {};
  const ann = createTextAnnotation(100, 200, "Original");
  annotations = addAnnotation(annotations, "p1", ann);
  const annId = getPageAnnotations(annotations, "p1")[0].id;

  const draft = { pageX: 100, pageY: 200, pageId: "p1" };
  const action = commitTextDraft({ draft, text: "Updated", annotationId: annId, defaults: { fontSize: 14, color: "#000000" } });
  assert.ok(typeof action === "function");
  annotations = action(annotations);
  const updated = getPageAnnotations(annotations, "p1").find((a) => a.id === annId);
  assert.equal(updated.text, "Updated");
  assert.equal(updated.x, 100); // unchanged
  assert.equal(updated.y, 200); // unchanged
});

test("commitTextDraft: editing existing annotation with empty text returns delete action", () => {
  let annotations = {};
  const ann = createTextAnnotation(100, 200, "To Delete");
  annotations = addAnnotation(annotations, "p1", ann);
  const annId = getPageAnnotations(annotations, "p1")[0].id;

  const draft = { pageX: 100, pageY: 200, pageId: "p1" };
  const action = commitTextDraft({ draft, text: "", annotationId: annId, defaults: { fontSize: 14, color: "#000000" } });
  assert.ok(typeof action === "function");
  annotations = action(annotations);
  const pageAnns = getPageAnnotations(annotations, "p1");
  assert.equal(pageAnns.length, 0);
});

test("commitTextDraft: editing non-existent annotation returns update action (no-op in practice)", () => {
  let annotations = {};
  const draft = { pageX: 100, pageY: 200, pageId: "p1" };
  const action = commitTextDraft({ draft, text: "New Text", annotationId: "nonexistent", defaults: { fontSize: 14, color: "#000000" } });
  assert.ok(typeof action === "function");
  annotations = action(annotations);
  // Should not add annotation since the ID doesn't exist
  assert.equal(getPageAnnotations(annotations, "p1").length, 0);
});

test("commitTextDraft: uses custom defaults for new annotations", () => {
  let annotations = {};
  const draft = { pageX: 50, pageY: 100, pageId: "p1" };
  const action = commitTextDraft({ draft, text: "Custom", defaults: { fontSize: 24, color: "#ff0000" } });
  assert.ok(typeof action === "function");
  annotations = action(annotations);
  const ann = getPageAnnotations(annotations, "p1")[0];
  assert.equal(ann.fontSize, 24);
  assert.equal(ann.color, "#ff0000");
});

// annotationDefaultsFromState pure function tests
test("annotationDefaultsFromState: highlight with custom color and opacity", () => {
  const state = {
    annotateHighlightColor: "#ffcccc",
    annotateHighlightOpacity: 0.8,
    annotateFontSize: 12,
    annotateTextColor: "#000000",
  };
  const defaults = annotationDefaultsFromState(state, "highlight");
  assert.equal(defaults.color, "#ffcccc");
  assert.equal(defaults.opacity, 0.8);
});

test("annotationDefaultsFromState: highlight with only custom color", () => {
  const state = {
    annotateHighlightColor: "#ccffcc",
    annotateFontSize: 12,
    annotateTextColor: "#000000",
  };
  const defaults = annotationDefaultsFromState(state, "highlight");
  assert.equal(defaults.color, "#ccffcc");
  assert.equal(defaults.opacity, DEFAULT_HIGHLIGHT_OPACITY);
});

test("annotationDefaultsFromState: highlight with only custom opacity", () => {
  const state = {
    annotateHighlightOpacity: 0.6,
    annotateFontSize: 12,
    annotateTextColor: "#000000",
  };
  const defaults = annotationDefaultsFromState(state, "highlight");
  assert.equal(defaults.color, DEFAULT_HIGHLIGHT_COLOR);
  assert.equal(defaults.opacity, 0.6);
});

test("annotationDefaultsFromState: highlight with no custom values falls back to defaults", () => {
  const state = {
    annotateFontSize: 12,
    annotateTextColor: "#000000",
  };
  const defaults = annotationDefaultsFromState(state, "highlight");
  assert.equal(defaults.color, DEFAULT_HIGHLIGHT_COLOR);
  assert.equal(defaults.opacity, DEFAULT_HIGHLIGHT_OPACITY);
});

test("annotationDefaultsFromState: text with custom fontSize and color", () => {
  const state = {
    annotateHighlightColor: "#ffe14d",
    annotateHighlightOpacity: 0.4,
    annotateFontSize: 20,
    annotateTextColor: "#ff0000",
  };
  const defaults = annotationDefaultsFromState(state, "text");
  assert.equal(defaults.fontSize, 20);
  assert.equal(defaults.color, "#ff0000");
});

test("annotationDefaultsFromState: text with only custom fontSize", () => {
  const state = {
    annotateHighlightColor: "#ffe14d",
    annotateHighlightOpacity: 0.4,
    annotateFontSize: 24,
  };
  const defaults = annotationDefaultsFromState(state, "text");
  assert.equal(defaults.fontSize, 24);
  assert.equal(defaults.color, DEFAULT_TEXT_COLOR);
});

test("annotationDefaultsFromState: text with only custom color", () => {
  const state = {
    annotateHighlightColor: "#ffe14d",
    annotateHighlightOpacity: 0.4,
    annotateTextColor: "#0066ff",
  };
  const defaults = annotationDefaultsFromState(state, "text");
  assert.equal(defaults.fontSize, DEFAULT_TEXT_FONT_SIZE);
  assert.equal(defaults.color, "#0066ff");
});

test("annotationDefaultsFromState: text with no custom values falls back to defaults", () => {
  const state = {
    annotateHighlightColor: "#ffe14d",
    annotateHighlightOpacity: 0.4,
  };
  const defaults = annotationDefaultsFromState(state, "text");
  assert.equal(defaults.fontSize, DEFAULT_TEXT_FONT_SIZE);
  assert.equal(defaults.color, DEFAULT_TEXT_COLOR);
});

test("annotationDefaultsFromState: unknown type returns empty object", () => {
  const state = {
    annotateHighlightColor: "#ffcccc",
    annotateHighlightOpacity: 0.8,
    annotateFontSize: 20,
    annotateTextColor: "#ff0000",
  };
  const defaults = annotationDefaultsFromState(state, "unknown");
  assert.deepStrictEqual(defaults, {});
});

test("annotationDefaultsFromState: empty state returns all defaults", () => {
  const state = {};
  const highlightDefaults = annotationDefaultsFromState(state, "highlight");
  const textDefaults = annotationDefaultsFromState(state, "text");
  assert.equal(highlightDefaults.color, DEFAULT_HIGHLIGHT_COLOR);
  assert.equal(highlightDefaults.opacity, DEFAULT_HIGHLIGHT_OPACITY);
  assert.equal(textDefaults.fontSize, DEFAULT_TEXT_FONT_SIZE);
  assert.equal(textDefaults.color, DEFAULT_TEXT_COLOR);
});

test("panelControlValues: no selection returns store defaults", () => {
  const state = {
    annotateFontSize: 12,
    annotateTextColor: "#0066ff",
    annotateHighlightColor: "#ffe14d",
    annotateHighlightOpacity: 0.4,
  };
  const values = panelControlValues(state, null);
  assert.equal(values.fontSize, 12);
  assert.equal(values.textColor, "#0066ff");
  assert.equal(values.highlightColor, "#ffe14d");
  assert.equal(values.opacity, 0.4);
});

test("panelControlValues: selected text annotation uses its own font size and color", () => {
  const state = {
    annotateFontSize: 12,
    annotateTextColor: "#000000",
    annotateHighlightColor: "#ffe14d",
    annotateHighlightOpacity: 0.4,
  };
  const selected = { id: "t1", type: "text", fontSize: 14, color: "#ff0000" };
  const values = panelControlValues(state, selected);
  assert.equal(values.fontSize, 14);
  assert.equal(values.textColor, "#ff0000");
  assert.equal(values.highlightColor, "#ffe14d");
  assert.equal(values.opacity, 0.4);
});

test("panelControlValues: selected text annotation falls back to store defaults for missing fields", () => {
  const state = {
    annotateFontSize: 12,
    annotateTextColor: "#0066ff",
    annotateHighlightColor: "#ffe14d",
    annotateHighlightOpacity: 0.4,
  };
  const selected = { id: "t1", type: "text" };
  const values = panelControlValues(state, selected);
  assert.equal(values.fontSize, 12);
  assert.equal(values.textColor, "#0066ff");
});

test("panelControlValues: selected highlight annotation uses its own color and opacity", () => {
  const state = {
    annotateFontSize: 12,
    annotateTextColor: "#000000",
    annotateHighlightColor: "#ffe14d",
    annotateHighlightOpacity: 0.4,
  };
  const selected = { id: "h1", type: "highlight", color: "#0066ff", opacity: 0.8 };
  const values = panelControlValues(state, selected);
  assert.equal(values.fontSize, 12);
  assert.equal(values.textColor, "#000000");
  assert.equal(values.highlightColor, "#0066ff");
  assert.equal(values.opacity, 0.8);
});

test("panelControlValues: selected highlight falls back to store defaults for missing fields", () => {
  const state = {
    annotateFontSize: 12,
    annotateTextColor: "#000000",
    annotateHighlightColor: "#ffe14d",
    annotateHighlightOpacity: 0.4,
  };
  const selected = { id: "h1", type: "highlight" };
  const values = panelControlValues(state, selected);
  assert.equal(values.highlightColor, "#ffe14d");
  assert.equal(values.opacity, 0.4);
});

test("panelControlValues: undefined selection returns store defaults", () => {
  const state = { annotateFontSize: 9, annotateTextColor: "#111111" };
  const values = panelControlValues(state, undefined);
  assert.equal(values.fontSize, 9);
  assert.equal(values.textColor, "#111111");
});

// --- Image annotation tests ---

test("DEFAULT_IMAGE_OPACITY is 1", () => {
  assert.equal(DEFAULT_IMAGE_OPACITY, 1);
});

test("createImageAnnotation with defaults", () => {
  const ann = createImageAnnotation(50, 60, 200, 150, { assetId: "img1" });
  assert.equal(ann.type, "image");
  assert.equal(ann.x, 50);
  assert.equal(ann.y, 60);
  assert.equal(ann.width, 200);
  assert.equal(ann.height, 150);
  assert.equal(ann.assetId, "img1");
  assert.equal(ann.opacity, DEFAULT_IMAGE_OPACITY);
});

test("createImageAnnotation: opacity option overrides default", () => {
  const ann = createImageAnnotation(0, 0, 100, 100, { assetId: "img2", opacity: 0.5 });
  assert.equal(ann.opacity, 0.5);
});

test("createImageAnnotation: assetId defaults to null", () => {
  const ann = createImageAnnotation(0, 0, 100, 100);
  assert.equal(ann.assetId, null);
});

test("panelControlValues: selected image annotation uses its own opacity", () => {
  const state = {
    annotateFontSize: 12,
    annotateTextColor: "#000000",
    annotateHighlightColor: "#ffe14d",
    annotateHighlightOpacity: 0.4,
    annotateImageOpacity: 0.7,
  };
  const selected = { id: "i1", type: "image", opacity: 0.3, assetId: "img1" };
  const values = panelControlValues(state, selected);
  assert.equal(values.opacity, 0.3);
  assert.equal(values.fontSize, 12);
});

test("panelControlValues: selected image falls back to store image opacity", () => {
  const state = {
    annotateFontSize: 12,
    annotateTextColor: "#000000",
    annotateHighlightColor: "#ffe14d",
    annotateHighlightOpacity: 0.4,
    annotateImageOpacity: 0.6,
  };
  const selected = { id: "i1", type: "image", assetId: "img1" };
  const values = panelControlValues(state, selected);
  assert.equal(values.opacity, 0.6);
});

test("panelControlValues: selected image with no opacity and no store opacity falls back to DEFAULT_IMAGE_OPACITY", () => {
  const state = {
    annotateFontSize: 12,
    annotateTextColor: "#000000",
    annotateHighlightColor: "#ffe14d",
    annotateHighlightOpacity: 0.4,
  };
  const selected = { id: "i1", type: "image", assetId: "img1" };
  const values = panelControlValues(state, selected);
  assert.equal(values.opacity, DEFAULT_IMAGE_OPACITY);
});

test("annotations: add/move/delete image annotation round trip", () => {
  let annotations = {};
  const ann = createImageAnnotation(100, 100, 200, 100, { assetId: "img1" });
  annotations = addAnnotation(annotations, "p1", ann);
  const anns = getPageAnnotations(annotations, "p1");
  assert.equal(anns.length, 1);
  assert.equal(anns[0].type, "image");
  assert.equal(anns[0].assetId, "img1");

  annotations = moveAnnotation(annotations, "p1", anns[0].id, 10, -5);
  const moved = getPageAnnotations(annotations, "p1")[0];
  assert.equal(moved.x, 110);
  assert.equal(moved.y, 95);

  annotations = deleteAnnotation(annotations, "p1", anns[0].id);
  assert.equal(getPageAnnotations(annotations, "p1").length, 0);
});