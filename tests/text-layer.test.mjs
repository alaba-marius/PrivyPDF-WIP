// Unit tests for js/core/text-layer.js — pure text-hit and selection logic.
// Layers are built by hand (no pdf.js) because real pdf.js getTextContent does
// not work in Node; cache injection (cache.set) covers the parse path.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hitTestText,
  selectionRects,
  createTextLayerCache,
} from "../js/core/text-layer.js";
import {
  screenToPageForBlock,
  pageToScreenForBlock,
} from "../js/core/annotate-layout.js";

// Two horizontal text lines in unrotated page space (y up, origin bottom-left).
// Line 0: "Hello"  baseline 700   (higher on the page -> reading order first)
// Line 1: "World"  baseline 600
const LINE_0 = {
  dir: 0, from: 100, to: 200, baseline: 700,
  descent: 682.4, ascent: 770.4,
  chars: [
    { ch: "H", from: 100, to: 120 },
    { ch: "e", from: 120, to: 140 },
    { ch: "l", from: 140, to: 160 },
    { ch: "l", from: 160, to: 180 },
    { ch: "o", from: 180, to: 200 },
  ],
};
const LINE_1 = {
  dir: 0, from: 100, to: 200, baseline: 600,
  descent: 582.4, ascent: 670.4,
  chars: [
    { ch: "W", from: 100, to: 120 },
    { ch: "o", from: 120, to: 140 },
    { ch: "r", from: 140, to: 160 },
    { ch: "l", from: 160, to: 180 },
    { ch: "d", from: 180, to: 200 },
  ],
};
const LAYER = { lines: [LINE_0, LINE_1] };

function approx(a, b) {
  return Math.abs(a - b) < 0.01;
}
function rectEq(actual, expected) {
  return approx(actual.x, expected.x)
    && approx(actual.y, expected.y)
    && approx(actual.width, expected.width)
    && approx(actual.height, expected.height);
}

test("text layer: hitTestText returns null for a missing layer", () => {
  assert.equal(hitTestText(null, { x: 100, y: 700 }), null);
});

test("text layer: hitTestText returns null when the point misses all text", () => {
  assert.equal(hitTestText(LAYER, { x: 500, y: 700 }), null); // far right of both lines
  assert.equal(hitTestText(LAYER, { x: 100, y: 800 }), null); // above all lines
});

test("text layer: hitTestText snaps to the nearest character on a line", () => {
  const hit = hitTestText(LAYER, { x: 105, y: 720 }); // line 0, "H" (midpoint 110)
  assert.equal(hit.lineIndex, 0);
  assert.equal(hit.charIndex, 0);
  assert.equal(hit.side, "before"); // 105 < 110
});

test("text layer: hitTestText picks the correct line and side", () => {
  const hit = hitTestText(LAYER, { x: 145, y: 610 }); // line 1, "r" (midpoint 150)
  assert.equal(hit.lineIndex, 1);
  assert.equal(hit.charIndex, 2);
  assert.equal(hit.side, "before"); // 145 < 150
});

test("text layer: selectionRects partial on a single line", () => {
  const rects = selectionRects(
    LAYER,
    { lineIndex: 0, charIndex: 2, side: "before" }, // "l" from 140
    { lineIndex: 0, charIndex: 4, side: "after" },   // "o" to 200
  );
  assert.equal(rects.length, 1);
  assert.ok(rectEq(rects[0], { x: 139.5, y: 681.9, width: 61, height: 89 }));
});

test("text layer: selectionRects yields one bar per line across multiple lines", () => {
  const rects = selectionRects(
    LAYER,
    { lineIndex: 0, charIndex: 0, side: "before" }, // line 0 from 100
    { lineIndex: 1, charIndex: 2, side: "before" },  // line 1 "r" from 140
  );
  assert.equal(rects.length, 2);
  assert.ok(rectEq(rects[0], { x: 99.5, y: 681.9, width: 101, height: 89 }));
  assert.ok(rectEq(rects[1], { x: 99.5, y: 581.9, width: 41, height: 89 }));
});

test("text layer: selectionRects is empty when start equals end", () => {
  const rects = selectionRects(
    LAYER,
    { lineIndex: 0, charIndex: 0, side: "before" },
    { lineIndex: 0, charIndex: 0, side: "before" },
  );
  assert.equal(rects.length, 0);
});

test("text layer: selectionRects orders by reading order when start is below end", () => {
  const rects = selectionRects(
    LAYER,
    { lineIndex: 1, charIndex: 4, side: "after" },  // line 1 "d" to 200
    { lineIndex: 0, charIndex: 0, side: "before" },  // line 0 "H" from 100
  );
  assert.equal(rects.length, 2);
  // line 0 (higher baseline) comes first in reading order
  assert.ok(rectEq(rects[0], { x: 99.5, y: 681.9, width: 101, height: 89 }));
  assert.ok(rectEq(rects[1], { x: 99.5, y: 581.9, width: 101, height: 89 }));
});

test("text layer: cache set/getSync/has/clear/size", () => {
  const cache = createTextLayerCache();
  assert.equal(cache.size(), 0);
  assert.equal(cache.has("s1:0"), false);
  assert.equal(cache.getSync("s1:0"), null);

  cache.set("s1:0", LAYER);
  assert.equal(cache.has("s1:0"), true);
  assert.equal(cache.getSync("s1:0"), LAYER);
  assert.equal(cache.size(), 1);

  cache.clear();
  assert.equal(cache.size(), 0);
  assert.equal(cache.has("s1:0"), false);
  assert.equal(cache.getSync("s1:0"), null);
});

test("text layer: selectionRects is not empty for a reverse drag on a single line", () => {
  // Dragging right-to-left along a line (page space) is what a visual
  // left-to-right drag becomes at rotation 180. It must still produce a bar.
  const forward = selectionRects(
    LAYER,
    { lineIndex: 0, charIndex: 0, side: "before" },
    { lineIndex: 0, charIndex: 4, side: "after" },
  );
  const reverse = selectionRects(
    LAYER,
    { lineIndex: 0, charIndex: 4, side: "after" },
    { lineIndex: 0, charIndex: 0, side: "after" },
  );
  assert.equal(forward.length, 1, "forward single-line drag produces one bar");
  assert.equal(reverse.length, 1, "reverse single-line drag must not be empty");
  assert.ok(reverse[0].width > 0, "reverse single-line drag must have positive width");
});

test("text layer: selectionRects reverse across lines is not empty", () => {
  const reverse = selectionRects(
    LAYER,
    { lineIndex: 1, charIndex: 4, side: "after" }, // line 1 "d" to 200
    { lineIndex: 0, charIndex: 0, side: "before" }, // line 0 "H" from 100
  );
  assert.equal(reverse.length, 2, "reverse multi-line drag must cover both lines");
  assert.ok(reverse[0].width > 0 && reverse[1].width > 0, "both bars must be non-empty");
});

// --- Rotation-independence table test ---
// The same page-space drag must give identical (non-empty) selectionRects at
// every rotation, using pageToScreen -> screenToPage to map through visual
// pointer positions exactly as the real view does. Covers portrait and
// landscape pages, forward and reverse drags, inside one line and across lines.
const PORTRAIT = { width: 612, height: 792 };
const LANDSCAPE = { width: 792, height: 612 };
const CANVAS_RECT = { left: 0, top: 0, width: 800, height: 600 };

function rectsEq(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (
      a[i].x !== b[i].x || a[i].y !== b[i].y ||
      a[i].width !== b[i].width || a[i].height !== b[i].height
    ) return false;
  }
  return true;
}

test("text layer: selectionRects identical and non-empty at every rotation", () => {
  // Two horizontal lines in page space (same layer at every rotation).
  const layer = {
    lines: [
      { dir: 0, from: 100, to: 200, baseline: 700, descent: 682.4, ascent: 770.4,
        chars: [
          { ch: "H", from: 100, to: 120 }, { ch: "e", from: 120, to: 140 },
          { ch: "l", from: 140, to: 160 }, { ch: "l", from: 160, to: 180 },
          { ch: "o", from: 180, to: 200 },
        ] },
      { dir: 0, from: 100, to: 200, baseline: 600, descent: 582.4, ascent: 670.4,
        chars: [
          { ch: "W", from: 100, to: 120 }, { ch: "o", from: 120, to: 140 },
          { ch: "r", from: 140, to: 160 }, { ch: "l", from: 160, to: 180 },
          { ch: "d", from: 180, to: 200 },
        ] },
    ],
  };

  // Page-space drag cases: [start, end, expectedRects].
  // start/end are {x, y} page-space points; hitTestText converts them to positions.
  const cases = [
    {
      name: "forward inside one line",
      start: { x: 105, y: 720 },
      end: { x: 145, y: 720 },
      expected: [{ x: 99.5, y: 681.9, width: 41, height: 89 }],
    },
    {
      name: "reverse inside one line (rotation-180 visual-forward case)",
      start: { x: 145, y: 720 },
      end: { x: 105, y: 720 },
      expected: [{ x: 99.5, y: 681.9, width: 41, height: 89 }],
    },
    {
      name: "forward across lines",
      start: { x: 105, y: 720 },
      end: { x: 145, y: 620 },
      expected: [
        { x: 99.5, y: 681.9, width: 101, height: 89 },
        { x: 99.5, y: 581.9, width: 41, height: 89 },
      ],
    },
    {
      name: "reverse across lines",
      start: { x: 145, y: 620 },
      end: { x: 105, y: 720 },
      expected: [
        { x: 99.5, y: 681.9, width: 101, height: 89 },
        { x: 99.5, y: 581.9, width: 41, height: 89 },
      ],
    },
  ];

  const rotations = [0, 90, 180, 270];
  const sizes = [PORTRAIT, LANDSCAPE];

  const baselines = {};
  for (const size of sizes) {
    for (const rotation of rotations) {
      const block = {
        pageW: size.width,
        pageH: size.height,
        visualW: rotation === 90 || rotation === 270 ? size.height : size.width,
        visualH: rotation === 90 || rotation === 270 ? size.width : size.height,
        rotation,
      };
      for (const c of cases) {
        // Map page-space start/end to visual pointer positions, then back to
        // page space (round trip through the geometry used by the real view).
        const startScreen = pageToScreenForBlock(c.start.x, c.start.y, block, CANVAS_RECT);
        const endScreen = pageToScreenForBlock(c.end.x, c.end.y, block, CANVAS_RECT);
        const startPage = screenToPageForBlock(startScreen.clientX, startScreen.clientY, block, CANVAS_RECT);
        const endPage = screenToPageForBlock(endScreen.clientX, endScreen.clientY, block, CANVAS_RECT);

        // Round trip must be lossless.
        assert.ok(Math.abs(startPage.x - c.start.x) < 1e-6 && Math.abs(startPage.y - c.start.y) < 1e-6);
        assert.ok(Math.abs(endPage.x - c.end.x) < 1e-6 && Math.abs(endPage.y - c.end.y) < 1e-6);

        const startPos = hitTestText(layer, startPage);
        const endPos = hitTestText(layer, endPage);
        assert.ok(startPos && endPos, `${c.name} rot=${rotation} size=${size.width}x${size.height}: both points must hit text`);

        const rects = selectionRects(layer, startPos, endPos);
        assert.ok(rects.length > 0, `${c.name} rot=${rotation} size=${size.width}x${size.height}: selection must not be empty`);
        assert.deepStrictEqual(rects, c.expected, `${c.name} rot=${rotation} size=${size.width}x${size.height}: unexpected rects`);
        for (const r of rects) {
          assert.ok(r.width > 0 && r.height > 0, `${c.name} rot=${rotation}: bar must have positive size`);
        }

        if (!(c.name in baselines)) baselines[c.name] = rects;
        assert.ok(rectsEq(rects, baselines[c.name]), `${c.name}: selectionRects must be identical at every rotation`);
      }
    }
  }
});
