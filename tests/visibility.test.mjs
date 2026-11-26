// Pure tests for js/core/visibility.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { visibilityFor } from "../js/core/visibility.js";

function makeState(mode, view, pages = []) {
  return { mode, view, pages };
}

test("visibility: empty content state shows empty, hides others", () => {
  const state = makeState("empty", "pages", []);
  const vis = visibilityFor(state);
  assert.equal(vis.emptyHidden, false);
  assert.equal(vis.loadingHidden, true);
  assert.equal(vis.gridHidden, true);
  assert.equal(vis.annotateHidden, true);
});

test("visibility: empty content state with annotate view still shows empty", () => {
  const state = makeState("empty", "annotate", []);
  const vis = visibilityFor(state);
  assert.equal(vis.emptyHidden, false);
  assert.equal(vis.loadingHidden, true);
  assert.equal(vis.gridHidden, true);
  assert.equal(vis.annotateHidden, true);
});

test("visibility: loading content state shows loading, hides others", () => {
  const state = makeState("loading", "pages", []);
  const vis = visibilityFor(state);
  assert.equal(vis.emptyHidden, true);
  assert.equal(vis.loadingHidden, false);
  assert.equal(vis.gridHidden, true);
  assert.equal(vis.annotateHidden, true);
});

test("visibility: loaded content with pages view shows grid, hides annotate", () => {
  const state = makeState("loaded", "pages", [{ id: "p1" }]);
  const vis = visibilityFor(state);
  assert.equal(vis.emptyHidden, true);
  assert.equal(vis.loadingHidden, true);
  assert.equal(vis.gridHidden, false);
  assert.equal(vis.annotateHidden, true);
});

test("visibility: loaded content with annotate view shows annotate, hides grid", () => {
  const state = makeState("loaded", "annotate", [{ id: "p1" }]);
  const vis = visibilityFor(state);
  assert.equal(vis.emptyHidden, true);
  assert.equal(vis.loadingHidden, true);
  assert.equal(vis.gridHidden, true);
  assert.equal(vis.annotateHidden, false);
});

test("visibility: loaded content with annotate view but no pages falls back to grid", () => {
  // When last page is removed while in annotate view
  const state = makeState("loaded", "annotate", []);
  const vis = visibilityFor(state);
  assert.equal(vis.emptyHidden, true);
  assert.equal(vis.loadingHidden, true);
  assert.equal(vis.gridHidden, false);
  assert.equal(vis.annotateHidden, true);
});

test("visibility: all combinations covered", () => {
  // Verify all 3*2 = 6 combos of (mode, view) are handled
  const combos = [
    ["empty", "pages", { emptyHidden: false, loadingHidden: true, gridHidden: true, annotateHidden: true }],
    ["empty", "annotate", { emptyHidden: false, loadingHidden: true, gridHidden: true, annotateHidden: true }],
    ["loading", "pages", { emptyHidden: true, loadingHidden: false, gridHidden: true, annotateHidden: true }],
    ["loading", "annotate", { emptyHidden: true, loadingHidden: false, gridHidden: true, annotateHidden: true }],
    ["loaded", "pages", { emptyHidden: true, loadingHidden: true, gridHidden: false, annotateHidden: true }],
    ["loaded", "annotate", { emptyHidden: true, loadingHidden: true, gridHidden: true, annotateHidden: false }],
  ];

  for (const [mode, view, expected] of combos) {
    const state = makeState(mode, view, mode === "loaded" ? [{ id: "p1" }] : []);
    const vis = visibilityFor(state);
    assert.deepStrictEqual(vis, expected, `combo mode=${mode} view=${view}`);
  }
});