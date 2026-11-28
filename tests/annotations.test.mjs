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
  DEFAULT_MARKUP_STYLE,
  DEFAULT_MARKUP_THICKNESS,
  DEFAULT_MARKUP_UNDERLINE_COLOR,
  DEFAULT_MARKUP_UNDERLINE_OPACITY,
  DEFAULT_MARKUP_STRIKETHROUGH_COLOR,
  DEFAULT_MARKUP_STRIKETHROUGH_OPACITY,
  MARKUP_THICKNESS_MIN,
  MARKUP_THICKNESS_MAX,
  toJSON,
  fromJSON,
  clear,
  annotationDefaultsFromState,
  panelControlValues,
  markupLineRect,
} from "../js/core/annotations.js";
import { freeMarkDir } from "../js/core/annotate-geometry.js";
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
  assert.equal(addedHigh.opacity, 0.7);

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
  assert.equal(DEFAULT_HIGHLIGHT_OPACITY, 0.7);
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

// --- Markup style tests ---

test("markupLineRect: highlight returns the box itself at dir 0", () => {
  const ann = { type: "highlight", style: "highlight", x: 100, y: 200, width: 300, height: 50, dir: 0 };
  const rect = markupLineRect(ann);
  assert.deepStrictEqual(rect, { x: 100, y: 200, width: 300, height: 50 });
});

test("markupLineRect: underline at dir 0 sits 11% above box bottom", () => {
  const ann = { type: "highlight", style: "underline", x: 100, y: 200, width: 300, height: 50, dir: 0, thickness: 2 };
  const rect = markupLineRect(ann);
  // edge = 200 + 0.11 * 50 = 205.5; bandBottom = 205.5 - 2 = 203.5
  assert.deepStrictEqual(rect, { x: 100, y: 203.5, width: 300, height: 2 });
});

test("markupLineRect: strikethrough at dir 0 centered at 45% of height", () => {
  const ann = { type: "highlight", style: "strikethrough", x: 100, y: 200, width: 300, height: 50, dir: 0, thickness: 2 };
  const rect = markupLineRect(ann);
  // edge = 200 + 0.45 * 50 = 222.5; bandStart = 222.5 - 1 = 221.5
  assert.deepStrictEqual(rect, { x: 100, y: 221.5, width: 300, height: 2 });
});

test("markupLineRect: underline at dir 90 runs vertically", () => {
  const ann = { type: "highlight", style: "underline", x: 100, y: 200, width: 300, height: 50, dir: 90, thickness: 2 };
  const rect = markupLineRect(ann);
  // dir 90: right=+y, down=+x. Visual bottom = right edge (x=400). Fraction line
  // 11% above visual bottom (anti-down = -x): 400 - 0.11*300 = 367. Band runs
  // down (+x) by thickness 2: x=367, width=2, full height 50.
  assert.deepStrictEqual(rect, { x: 367, y: 200, width: 2, height: 50 });
});

test("markupLineRect: underline at dir 180 runs horizontally", () => {
  const ann = { type: "highlight", style: "underline", x: 100, y: 200, width: 300, height: 50, dir: 180, thickness: 2 };
  const rect = markupLineRect(ann);
  // dir 180: right=-x, down=+y. Visual bottom = top edge (y=250). Fraction line
  // 11% above visual bottom (anti-down = -y): 250 - 0.11*50 = 244.5. Band runs
  // down (+y) by thickness 2: y=244.5, width=300, height=2.
  assert.deepStrictEqual(rect, { x: 100, y: 244.5, width: 300, height: 2 });
});

test("markupLineRect: underline at dir 270 runs vertically", () => {
  const ann = { type: "highlight", style: "underline", x: 100, y: 200, width: 300, height: 50, dir: 270, thickness: 2 };
  const rect = markupLineRect(ann);
  // dir 270: right=-y, down=-x. Visual bottom = left edge (x=100). Fraction line
  // 11% above visual bottom (anti-down = +x): 100 + 0.11*300 = 133. Band runs
  // down (-x) by thickness 2: x=131, width=2, full height 50.
  assert.deepStrictEqual(rect, { x: 131, y: 200, width: 2, height: 50 });
});

test("markupLineRect: thickness clamped to [0.5, 8]", () => {
  const thin = markupLineRect({ type: "highlight", style: "underline", x: 0, y: 0, width: 100, height: 20, dir: 0, thickness: 0.1 });
  assert.equal(thin.height, MARKUP_THICKNESS_MIN);
  const thick = markupLineRect({ type: "highlight", style: "underline", x: 0, y: 0, width: 100, height: 20, dir: 0, thickness: 99 });
  assert.equal(thick.height, MARKUP_THICKNESS_MAX);
});

test("markupLineRect: highlight ignores thickness", () => {
  const ann = { type: "highlight", style: "highlight", x: 10, y: 20, width: 100, height: 50, dir: 0, thickness: 99 };
  const rect = markupLineRect(ann);
  assert.deepStrictEqual(rect, { x: 10, y: 20, width: 100, height: 50 });
});

// --- Oracle: markupLineRect vs the (right, down) unit-vector table ---

// Independent re-derivation of the band rect from the (right, down) table, so
// the test does not simply restate the implementation.
function expectedMarkupLineRect(ann) {
  const style = ann.style || "highlight";
  if (style === "highlight") {
    return { x: ann.x || 0, y: ann.y || 0, width: ann.width || 0, height: ann.height || 0 };
  }
  const dirs = {
    0:   { right: { x: 1, y: 0 }, down: { x: 0, y: -1 } },
    90:  { right: { x: 0, y: 1 }, down: { x: 1, y: 0 } },
    180: { right: { x: -1, y: 0 }, down: { x: 0, y: 1 } },
    270: { right: { x: 0, y: -1 }, down: { x: -1, y: 0 } },
  };
  const dir = ((ann.dir || 0) % 360 + 360) % 360;
  const vec = dirs[dir];
  const thickness = Math.min(8, Math.max(0.5, ann.thickness ?? 1.5));
  const fraction = style === "underline" ? 0.11 : 0.45;
  const x0 = ann.x || 0, y0 = ann.y || 0;
  const x1 = x0 + (ann.width || 0), y1 = y0 + (ann.height || 0);
  const thickAxis = Math.abs(vec.down.x) ? "x" : "y";
  const thickSign = vec.down[thickAxis];
  const lenAxis = thickAxis === "x" ? "y" : "x";
  const thickMin = thickAxis === "x" ? x0 : y0;
  const thickMax = thickAxis === "x" ? x1 : y1;
  const thickBottom = thickSign === 1 ? thickMax : thickMin;
  const fractionLine = thickBottom - fraction * (thickMax - thickMin) * thickSign;
  const thickOrigin = style === "strikethrough"
    ? fractionLine - thickness / 2
    : (thickSign === 1 ? fractionLine : fractionLine - thickness);
  let x, y, width, height;
  if (lenAxis === "x") {
    x = x0; width = x1 - x0; y = thickOrigin; height = thickness;
  } else {
    x = thickOrigin; width = thickness; y = y0; height = y1 - y0;
  }
  return { x, y, width, height };
}

test("markupLineRect: matches (right, down) table for all dirs, both styles", () => {
  const ann = { type: "highlight", x: 100, y: 200, width: 300, height: 50, thickness: 2 };
  for (const dir of [0, 90, 180, 270]) {
    for (const style of ["underline", "strikethrough"]) {
      const actual = markupLineRect({ ...ann, dir, style });
      const expected = expectedMarkupLineRect({ ...ann, dir, style });
      assert.deepStrictEqual(actual, expected, `dir ${dir} style ${style}`);
    }
  }
});

test("markupLineRect: underline band sits at the text-bottom edge for all rotations", () => {
  const cases = [
    { dir: 0, width: 300, height: 50 },
    { dir: 90, width: 300, height: 50 },
    { dir: 180, width: 300, height: 50 },
    { dir: 270, width: 300, height: 50 },
  ];
  for (const c of cases) {
    const ann = { type: "highlight", style: "underline", x: 100, y: 200, ...c, thickness: 2 };
    const rect = markupLineRect(ann);
    const expected = expectedMarkupLineRect(ann);
    assert.deepStrictEqual(rect, expected);
    // Band thickness is exactly the requested thickness on the down axis.
    const thickAxis = [90, 270].includes(c.dir) ? "width" : "height";
    assert.equal(rect[thickAxis], 2);
    // Band spans the full extent on the length axis.
    const lenAxis = thickAxis === "width" ? "height" : "width";
    assert.equal(rect[lenAxis], c.dir === 0 || c.dir === 180 ? 300 : 50);
  }
});

test("markupLineRect: strikethrough band is centered at 45% for all dirs", () => {
  const ann = { type: "highlight", style: "strikethrough", x: 100, y: 200, width: 300, height: 50, thickness: 4 };
  for (const dir of [0, 90, 180, 270]) {
    const actual = markupLineRect({ ...ann, dir });
    const expected = expectedMarkupLineRect({ ...ann, dir });
    assert.deepStrictEqual(actual, expected, `dir ${dir}`);
  }
});

test("panelControlValues: markupStyle and markupThickness from store defaults", () => {
  const state = {
    annotateFontSize: 12,
    annotateTextColor: "#000000",
    annotateHighlightColor: "#ffe14d",
    annotateHighlightOpacity: 0.4,
    annotateMarkupStyle: "underline",
    annotateMarkupUnderlineThickness: 3,
  };
  const values = panelControlValues(state, null);
  assert.equal(values.markupStyle, "underline");
  assert.equal(values.markupThickness, 3);
});

test("panelControlValues: markupThickness undefined for highlight style", () => {
  const state = {
    annotateFontSize: 12,
    annotateTextColor: "#000000",
    annotateHighlightColor: "#ffe14d",
    annotateHighlightOpacity: 0.4,
    annotateMarkupStyle: "highlight",
  };
  const values = panelControlValues(state, null);
  assert.equal(values.markupStyle, "highlight");
  assert.equal(values.markupThickness, undefined);
});

test("panelControlValues: selected underline annotation uses its own thickness", () => {
  const state = {
    annotateFontSize: 12,
    annotateTextColor: "#000000",
    annotateHighlightColor: "#ffe14d",
    annotateHighlightOpacity: 0.4,
    annotateMarkupStyle: "strikethrough",
    annotateMarkupStrikethroughThickness: 2,
  };
  const selected = { id: "u1", type: "highlight", style: "underline", thickness: 6 };
  const values = panelControlValues(state, selected);
  assert.equal(values.markupStyle, "underline");
  assert.equal(values.markupThickness, 6);
});

test("panelControlValues: markupStyle from selected highlight annotation", () => {
  const state = {
    annotateFontSize: 12,
    annotateTextColor: "#000000",
    annotateHighlightColor: "#ffe14d",
    annotateHighlightOpacity: 0.4,
    annotateMarkupStyle: "highlight",
  };
  const selected = { id: "s1", type: "highlight", style: "strikethrough" };
  const values = panelControlValues(state, selected);
  assert.equal(values.markupStyle, "strikethrough");
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

// --- freeMarkDir oracle tests ---

test("freeMarkDir: direction equals effective rotation (visual rightward -> page space)", () => {
  assert.equal(freeMarkDir(0), 0);
  assert.equal(freeMarkDir(90), 90);
  assert.equal(freeMarkDir(180), 180);
  assert.equal(freeMarkDir(270), 270);
});

test("freeMarkDir: normalizes out-of-range rotations", () => {
  assert.equal(freeMarkDir(360), 0);
  assert.equal(freeMarkDir(-90), 270);
  assert.equal(freeMarkDir(450), 90);
});

test("freeMarkDir: underline at rotation 90 runs vertically so its length follows visual rightward", () => {
  const ann = {
    type: "highlight",
    style: "underline",
    x: 100,
    y: 200,
    width: 300,
    height: 50,
    dir: freeMarkDir(90),
    thickness: 2,
  };
  const rect = markupLineRect(ann);
  // dir 90 -> length along page y (vertical band), thickness along page x
  assert.equal(rect.width, 2);
  assert.equal(rect.height, 50);
});

test("freeMarkDir: underline at rotation 0 runs horizontally along the visual bottom edge", () => {
  const ann = {
    type: "highlight",
    style: "underline",
    x: 100,
    y: 200,
    width: 300,
    height: 50,
    dir: freeMarkDir(0),
    thickness: 2,
  };
  const rect = markupLineRect(ann);
  // dir 0 -> length along page x (horizontal band)
  assert.equal(rect.width, 300);
  assert.equal(rect.height, 2);
});