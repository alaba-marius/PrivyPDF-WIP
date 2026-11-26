// Pure coordinate transform tests (no pdf-lib, no DOM).
// Tests pointer↔page and page↔pointer round-trips.
import { test } from "node:test";
import assert from "node:assert/strict";
import { pageToVisual, visualToPage } from "../js/core/overlay.js";
import { screenToPage, pageToScreen, visualDims, screenToPageFromPage, pageToScreenFromPage } from "../js/core/annotate-geometry.js";

const PAGE_W = 612;
const PAGE_H = 792;

function roundTrip(rotation, px, py, label) {
  const visual = pageToVisual({ x: px, y: py }, PAGE_W, PAGE_H, rotation);
  const back = visualToPage(visual, PAGE_W, PAGE_H, rotation);
  assert.ok(
    Math.abs(back.x - px) < 0.001 && Math.abs(back.y - py) < 0.001,
    `${label}: round-trip failed at rot ${rotation}: (${px},${py}) -> (${back.x},${back.y})`
  );
}

test("coordinate-transform: pageToVisual → visualToPage round-trip at rotation 0", () => {
  const points = [
    [0, 0], [100, 200], [300, 400], [612, 792], [612, 0], [0, 792],
    [123.456, 456.789], [0.1, 0.1]
  ];
  for (const [px, py] of points) roundTrip(0, px, py, "rot 0");
});

test("coordinate-transform: pageToVisual → visualToPage round-trip at rotation 90", () => {
  const points = [
    [0, 0], [100, 200], [300, 400], [612, 792], [612, 0], [0, 792],
    [123.456, 456.789], [0.1, 0.1]
  ];
  for (const [px, py] of points) roundTrip(90, px, py, "rot 90");
});

test("coordinate-transform: pageToVisual → visualToPage round-trip at rotation 180", () => {
  const points = [
    [0, 0], [100, 200], [300, 400], [612, 792], [612, 0], [0, 792],
    [123.456, 456.789], [0.1, 0.1]
  ];
  for (const [px, py] of points) roundTrip(180, px, py, "rot 180");
});

test("coordinate-transform: pageToVisual → visualToPage round-trip at rotation 270", () => {
  const points = [
    [0, 0], [100, 200], [300, 400], [612, 792], [612, 0], [0, 792],
    [123.456, 456.789], [0.1, 0.1]
  ];
  for (const [px, py] of points) roundTrip(270, px, py, "rot 270");
});

// Known exact transforms for verification
test("coordinate-transform: known transforms rotation 0", () => {
  // rot 0: vx = px, vy = py
  assert.deepStrictEqual(pageToVisual({ x: 100, y: 200 }, PAGE_W, PAGE_H, 0), { x: 100, y: 200 });
  assert.deepStrictEqual(visualToPage({ x: 100, y: 200 }, PAGE_W, PAGE_H, 0), { x: 100, y: 200 });
});

test("coordinate-transform: known transforms rotation 90", () => {
  // rot 90: vx = py, vy = W - px
  assert.deepStrictEqual(pageToVisual({ x: 100, y: 200 }, PAGE_W, PAGE_H, 90), { x: 200, y: 512 });
  // inverse: px = W - vy, py = vx
  assert.deepStrictEqual(visualToPage({ x: 200, y: 512 }, PAGE_W, PAGE_H, 90), { x: 100, y: 200 });
});

test("coordinate-transform: known transforms rotation 180", () => {
  // rot 180: vx = W - px, vy = H - py
  assert.deepStrictEqual(pageToVisual({ x: 100, y: 200 }, PAGE_W, PAGE_H, 180), { x: 512, y: 592 });
  // inverse: px = W - vx, py = H - vy
  assert.deepStrictEqual(visualToPage({ x: 512, y: 592 }, PAGE_W, PAGE_H, 180), { x: 100, y: 200 });
});

test("coordinate-transform: known transforms rotation 270", () => {
  // rot 270: vx = H - py, vy = px
  assert.deepStrictEqual(pageToVisual({ x: 100, y: 200 }, PAGE_W, PAGE_H, 270), { x: 592, y: 100 });
  // inverse: px = vy, py = H - vx
  assert.deepStrictEqual(visualToPage({ x: 592, y: 100 }, PAGE_W, PAGE_H, 270), { x: 100, y: 200 });
});

// Test that corners map correctly
test("coordinate-transform: page corners map to visual corners", () => {
  // Page space corners (bottom-left origin, y up)
  // pageToVisual for rot 90: vx = py, vy = pageW - px
  // Visual size at rot 90: visualW = pageH, visualH = pageW

  // Rotation 0: corners match (identity)
  assert.deepStrictEqual(pageToVisual({ x: 0, y: 0 }, PAGE_W, PAGE_H, 0), { x: 0, y: 0 });
  assert.deepStrictEqual(pageToVisual({ x: PAGE_W, y: 0 }, PAGE_W, PAGE_H, 0), { x: PAGE_W, y: 0 });
  assert.deepStrictEqual(pageToVisual({ x: 0, y: PAGE_H }, PAGE_W, PAGE_H, 0), { x: 0, y: PAGE_H });
  assert.deepStrictEqual(pageToVisual({ x: PAGE_W, y: PAGE_H }, PAGE_W, PAGE_H, 0), { x: PAGE_W, y: PAGE_H });

  // Rotation 90: pageToVisual({x:px, y:py}) => {x: py, y: PAGE_W - px}
  // page BL (0,0) -> visual (0, PAGE_W) = (0, 612) -- visual top-left
  assert.deepStrictEqual(pageToVisual({ x: 0, y: 0 }, PAGE_W, PAGE_H, 90), { x: 0, y: PAGE_W });
  // page BR (PAGE_W, 0) -> visual (0, 0) -- visual bottom-left
  assert.deepStrictEqual(pageToVisual({ x: PAGE_W, y: 0 }, PAGE_W, PAGE_H, 90), { x: 0, y: 0 });
  // page TL (0, PAGE_H) -> visual (PAGE_H, PAGE_W) -- visual top-right
  assert.deepStrictEqual(pageToVisual({ x: 0, y: PAGE_H }, PAGE_W, PAGE_H, 90), { x: PAGE_H, y: PAGE_W });
  // page TR (PAGE_W, PAGE_H) -> visual (PAGE_H, 0) -- visual bottom-right
  assert.deepStrictEqual(pageToVisual({ x: PAGE_W, y: PAGE_H }, PAGE_W, PAGE_H, 90), { x: PAGE_H, y: 0 });

  // Rotation 180: pageToVisual => {x: PAGE_W - px, y: PAGE_H - py}
  assert.deepStrictEqual(pageToVisual({ x: 0, y: 0 }, PAGE_W, PAGE_H, 180), { x: PAGE_W, y: PAGE_H });
  assert.deepStrictEqual(pageToVisual({ x: PAGE_W, y: PAGE_H }, PAGE_W, PAGE_H, 180), { x: 0, y: 0 });

  // Rotation 270: pageToVisual => {x: PAGE_H - py, y: px}
  // page BL (0,0) -> visual (PAGE_H, 0) -- visual bottom-right
  assert.deepStrictEqual(pageToVisual({ x: 0, y: 0 }, PAGE_W, PAGE_H, 270), { x: PAGE_H, y: 0 });
  // page TR (PAGE_W, PAGE_H) -> visual (0, PAGE_W) -- visual top-left
  assert.deepStrictEqual(pageToVisual({ x: PAGE_W, y: PAGE_H }, PAGE_W, PAGE_H, 270), { x: 0, y: PAGE_W });
});

// Test visual size swap at 90/270
test("coordinate-transform: visual dimensions swap at 90/270", () => {
  // Visual width/height for page 612x792
  // rot 0/180: visual = 612x792
  // rot 90/270: visual = 792x612

  // This is implicitly tested by the corner mappings above
  // but let's verify the extreme points stay in bounds

  // At rot 90, page BR (612,0) -> visual (0, 0) -- visual bottom-left
  const v = pageToVisual({ x: PAGE_W, y: 0 }, PAGE_W, PAGE_H, 90); // page BR
  assert.equal(v.x, 0);
  assert.equal(v.y, 0);

  // At rot 90, page TL (0,792) -> visual (792, 612) -- visual top-right
  const v2 = pageToVisual({ x: 0, y: PAGE_H }, PAGE_W, PAGE_H, 90); // page TL
  assert.equal(v2.x, PAGE_H);
  assert.equal(v2.y, PAGE_W);
});

// Pointer event simulation: visual -> page (what the UI does on click)
test("coordinate-transform: pointer (visual) to page space", () => {
  // Simulate a click at visual coordinates, convert to page space for storage
  // At rot 90, click at visual (100, 100) -> page (W-100, 100) = (512, 100)
  const pagePt = visualToPage({ x: 100, y: 100 }, PAGE_W, PAGE_H, 90);
  assert.equal(pagePt.x, 512);
  assert.equal(pagePt.y, 100);

  // At rot 270, click at visual (100, 100) -> page (100, H-100) = (100, 692)
  const pagePt2 = visualToPage({ x: 100, y: 100 }, PAGE_W, PAGE_H, 270);
  assert.equal(pagePt2.x, 100);
  assert.equal(pagePt2.y, 692);
});

// Reverse: page -> visual (what the renderer does for display)
test("coordinate-transform: page space to visual (for rendering)", () => {
  // Annotation at page (100, 200) at rot 90 should render at visual (200, 512)
  const visual = pageToVisual({ x: 100, y: 200 }, PAGE_W, PAGE_H, 90);
  assert.equal(visual.x, 200);
  assert.equal(visual.y, 512);
});

// ===== screenToPage / pageToScreen tests (new annotate-geometry module) =====

// Helper to create canvas rect at given zoom (canvas CSS pixels = visual points * zoom)
function canvasRectAtZoom(zoom, rotation) {
  const { visualW, visualH } = visualDims(PAGE_W, PAGE_H, rotation);
  return {
    left: 100,
    top: 50,
    width: visualW * zoom,
    height: visualH * zoom,
  };
}

// 1. Round-trip error < 0.01pt at all rotations (0/90/180/270) at 2× zoom
test("annotate-geometry: screenToPage → pageToScreen round-trip < 0.01pt at 2× zoom", () => {
  const zoom = 2;
  const points = [
    [0, 0], [100, 200], [300, 400], [612, 792], [612, 0], [0, 792],
    [123.456, 456.789], [0.1, 0.1],
    [PAGE_W / 2, PAGE_H / 2], // center
  ];

  for (const rotation of [0, 90, 180, 270]) {
    const canvasRect = canvasRectAtZoom(zoom, rotation);
    for (const [px, py] of points) {
      // page → screen → page
      const screen = pageToScreen({ x: px, y: py, canvasRect, pageW: PAGE_W, pageH: PAGE_H, rotation });
      const back = screenToPage({ clientX: screen.clientX, clientY: screen.clientY, canvasRect, pageW: PAGE_W, pageH: PAGE_H, rotation });
      const dx = Math.abs(back.x - px);
      const dy = Math.abs(back.y - py);
      assert.ok(dx < 0.01 && dy < 0.01,
        `Round-trip failed at rot ${rotation}, zoom ${zoom}: (${px},${py}) -> (${back.x},${back.y}), error=(${dx.toFixed(4)},${dy.toFixed(4)})`);
    }
  }
});

// 2. Known points mapping: page origin (0,0) maps to correct screen corners; page center maps to visual center
test("annotate-geometry: known page points map to correct screen coordinates", () => {
  const zoom = 1;

  for (const rotation of [0, 90, 180, 270]) {
    const canvasRect = canvasRectAtZoom(zoom, rotation);
    const { visualW, visualH } = visualDims(PAGE_W, PAGE_H, rotation);

    // Page origin (0,0) in page space
    // At rot 0: visual (0,0) -> screen (left, top + visualH*zoom) = bottom-left of canvas
    // At rot 90: page (0,0) -> visual (0, PAGE_W) -> top-left of canvas
    // At rot 180: page (0,0) -> visual (PAGE_W, PAGE_H) -> top-right of canvas
    // At rot 270: page (0,0) -> visual (PAGE_H, 0) -> bottom-right of canvas

    const screenOrigin = pageToScreen({ x: 0, y: 0, canvasRect, pageW: PAGE_W, pageH: PAGE_H, rotation });

    switch (rotation) {
      case 0:
        // visual (0,0) = canvas bottom-left
        assert.equal(screenOrigin.clientX, canvasRect.left);
        assert.equal(screenOrigin.clientY, canvasRect.top + canvasRect.height);
        break;
      case 90:
        // visual (0, visualH) = canvas top-left
        assert.equal(screenOrigin.clientX, canvasRect.left);
        assert.equal(screenOrigin.clientY, canvasRect.top);
        break;
      case 180:
        // visual (visualW, visualH) = canvas top-right
        assert.equal(screenOrigin.clientX, canvasRect.left + canvasRect.width);
        assert.equal(screenOrigin.clientY, canvasRect.top);
        break;
      case 270:
        // visual (visualW, 0) = canvas bottom-right
        assert.equal(screenOrigin.clientX, canvasRect.left + canvasRect.width);
        assert.equal(screenOrigin.clientY, canvasRect.top + canvasRect.height);
        break;
    }

    // Page center should map to visual center (center of canvas)
    const screenCenter = pageToScreen({ x: PAGE_W / 2, y: PAGE_H / 2, canvasRect, pageW: PAGE_W, pageH: PAGE_H, rotation });
    const expectedCenterX = canvasRect.left + canvasRect.width / 2;
    const expectedCenterY = canvasRect.top + canvasRect.height / 2;
    assert.ok(Math.abs(screenCenter.clientX - expectedCenterX) < 0.001,
      `Rotation ${rotation}: center X mismatch`);
    assert.ok(Math.abs(screenCenter.clientY - expectedCenterY) < 0.001,
      `Rotation ${rotation}: center Y mismatch`);
  }
});

// 3. Drag rectangle consistency: a 100×100 pt drag at screen center produces same page-space rectangle at 1×, 2×, 3× zoom
test("annotate-geometry: drag rectangle consistency across zoom levels", () => {
  const rectPtWidth = 100;
  const rectPtHeight = 100;

  for (const rotation of [0, 90, 180, 270]) {
    // Drag a 100x100 pt rectangle centered at visual center
    // Start at visual center - 50pt, end at visual center + 50pt

    // Get visual center in page space
    const visualCenterPage = { x: PAGE_W / 2, y: PAGE_H / 2 };

    // Convert visual center to screen at each zoom
    for (const zoom of [1, 2, 3]) {
      const canvasRect = canvasRectAtZoom(zoom, rotation);
      const { visualW, visualH } = visualDims(PAGE_W, PAGE_H, rotation);

      // Screen center
      const screenCenterX = canvasRect.left + canvasRect.width / 2;
      const screenCenterY = canvasRect.top + canvasRect.height / 2;

      // Scale from visual points to screen pixels
      const scale = canvasRect.width / visualW;

      // 100pt in visual space = 100 * scale pixels
      const halfWidthPx = (rectPtWidth / 2) * scale;
      const halfHeightPx = (rectPtHeight / 2) * scale;

      // Start drag at center - half size, end at center + half size
      const startScreen = { clientX: screenCenterX - halfWidthPx, clientY: screenCenterY + halfHeightPx };
      const endScreen = { clientX: screenCenterX + halfWidthPx, clientY: screenCenterY - halfHeightPx };

      // Convert to page space
      const startPage = screenToPage({ clientX: startScreen.clientX, clientY: startScreen.clientY, canvasRect, pageW: PAGE_W, pageH: PAGE_H, rotation });
      const endPage = screenToPage({ clientX: endScreen.clientX, clientY: endScreen.clientY, canvasRect, pageW: PAGE_W, pageH: PAGE_H, rotation });

      // The page-space rectangle should be 100x100 pt centered at page center
      const rectWidth = Math.abs(endPage.x - startPage.x);
      const rectHeight = Math.abs(endPage.y - startPage.y);
      const rectCenterX = (startPage.x + endPage.x) / 2;
      const rectCenterY = (startPage.y + endPage.y) / 2;

      assert.ok(Math.abs(rectWidth - rectPtWidth) < 0.01,
        `Rotation ${rotation}, zoom ${zoom}: width=${rectWidth.toFixed(4)}, expected ${rectPtWidth}`);
      assert.ok(Math.abs(rectHeight - rectPtHeight) < 0.01,
        `Rotation ${rotation}, zoom ${zoom}: height=${rectHeight.toFixed(4)}, expected ${rectPtHeight}`);
      assert.ok(Math.abs(rectCenterX - PAGE_W / 2) < 0.01,
        `Rotation ${rotation}, zoom ${zoom}: centerX=${rectCenterX.toFixed(4)}, expected ${PAGE_W / 2}`);
      assert.ok(Math.abs(rectCenterY - PAGE_H / 2) < 0.01,
        `Rotation ${rotation}, zoom ${zoom}: centerY=${rectCenterY.toFixed(4)}, expected ${PAGE_H / 2}`);
    }
  }
});

// ===== screenToPageFromPage / pageToScreenFromPage tests (pure functions taking page object) =====

const PAGE_SIZES = [
  { w: 612, h: 792, label: "portrait 612x792" },
  { w: 792, h: 612, label: "landscape 792x612" },
];
const SCALES = [0.5, 0.74, 0.96, 1, 1.5, 2];
const ROTATIONS = [0, 90, 180, 270];

function makePage(w, h, rotation) {
  return { width: w, height: h, baseRotation: 0, rotated: rotation };
}

function makeCanvasRect(canvasRect, scale, rotation, pageW, pageH) {
  const { visualW, visualH } = visualDims(pageW, pageH, rotation);
  return {
    left: canvasRect.left,
    top: canvasRect.top,
    width: visualW * scale,
    height: visualH * scale,
  };
}

// 4. screenToPageFromPage / pageToScreenFromPage round-trip at all rotations, page sizes, scales
test("annotate-geometry: screenToPageFromPage → pageToScreenFromPage round-trip < 0.01pt all configs", () => {
  const baseCanvasRect = { left: 100, top: 50, width: 0, height: 0 }; // width/height will be set per scale
  const testPoints = [
    [0, 0], [100, 200], [300, 400], [612, 792], [612, 0], [0, 792],
    [123.456, 456.789], [0.1, 0.1],
    [306, 396], // center for 612x792
  ];

  for (const { w: pageW, h: pageH, label } of PAGE_SIZES) {
    for (const rotation of ROTATIONS) {
      for (const scale of SCALES) {
        const canvasRect = makeCanvasRect(baseCanvasRect, scale, rotation, pageW, pageH);
        const page = makePage(pageW, pageH, rotation);

        for (const [px, py] of testPoints) {
          // Skip points outside page bounds
          if (px < 0 || px > pageW || py < 0 || py > pageH) continue;

          // page → screen → page
          const screen = pageToScreenFromPage({ x: px, y: py, canvasRect, page });
          const back = screenToPageFromPage({ clientX: screen.clientX, clientY: screen.clientY, canvasRect, page });
          const dx = Math.abs(back.x - px);
          const dy = Math.abs(back.y - py);
          assert.ok(dx < 0.01 && dy < 0.01,
            `Round-trip failed: ${label} rot ${rotation} scale ${scale}: (${px},${py}) -> (${back.x.toFixed(4)},${back.y.toFixed(4)}), error=(${dx.toFixed(4)},${dy.toFixed(4)})`);
        }
      }
    }
  }
});

// 5. Known points: page origin (0,0) maps to correct screen corners at all rotations
test("annotate-geometry: pageToScreenFromPage maps page origin to correct canvas corners", () => {
  const baseCanvasRect = { left: 100, top: 50, width: 0, height: 0 };

  for (const { w: pageW, h: pageH, label } of PAGE_SIZES) {
    for (const rotation of ROTATIONS) {
      for (const scale of [1, 2]) { // test a couple scales
        const canvasRect = makeCanvasRect(baseCanvasRect, scale, rotation, pageW, pageH);
        const page = makePage(pageW, pageH, rotation);

        const screenOrigin = pageToScreenFromPage({ x: 0, y: 0, canvasRect, page });
        const { visualW, visualH } = visualDims(pageW, pageH, rotation);

        switch (rotation) {
          case 0:
            // page (0,0) = visual (0,0) = canvas bottom-left
            assert.equal(screenOrigin.clientX, canvasRect.left);
            assert.equal(screenOrigin.clientY, canvasRect.top + canvasRect.height);
            break;
          case 90:
            // page (0,0) = visual (0, visualH) = canvas top-left
            assert.equal(screenOrigin.clientX, canvasRect.left);
            assert.equal(screenOrigin.clientY, canvasRect.top);
            break;
          case 180:
            // page (0,0) = visual (visualW, visualH) = canvas top-right
            assert.equal(screenOrigin.clientX, canvasRect.left + canvasRect.width);
            assert.equal(screenOrigin.clientY, canvasRect.top);
            break;
          case 270:
            // page (0,0) = visual (visualW, 0) = canvas bottom-right
            assert.equal(screenOrigin.clientX, canvasRect.left + canvasRect.width);
            assert.equal(screenOrigin.clientY, canvasRect.top + canvasRect.height);
            break;
        }

        // Page center should map to canvas center
        const screenCenter = pageToScreenFromPage({ x: pageW / 2, y: pageH / 2, canvasRect, page });
        const expectedCenterX = canvasRect.left + canvasRect.width / 2;
        const expectedCenterY = canvasRect.top + canvasRect.height / 2;
        assert.ok(Math.abs(screenCenter.clientX - expectedCenterX) < 0.001,
          `${label} rot ${rotation} scale ${scale}: center X mismatch`);
        assert.ok(Math.abs(screenCenter.clientY - expectedCenterY) < 0.001,
          `${label} rot ${rotation} scale ${scale}: center Y mismatch`);
      }
    }
  }
});

// 6. Drag rectangle consistency: 100x100 pt drag at canvas center produces same page-space rect at all scales
test("annotate-geometry: drag rectangle consistency at all rotations, page sizes, scales", () => {
  const rectPtWidth = 100;
  const rectPtHeight = 100;
  const baseCanvasRect = { left: 100, top: 50, width: 0, height: 0 };

  for (const { w: pageW, h: pageH } of PAGE_SIZES) {
    for (const rotation of ROTATIONS) {
      for (const scale of SCALES) {
        const canvasRect = makeCanvasRect(baseCanvasRect, scale, rotation, pageW, pageH);
        const page = makePage(pageW, pageH, rotation);
        const { visualW, visualH } = visualDims(pageW, pageH, rotation);

        // Screen center
        const screenCenterX = canvasRect.left + canvasRect.width / 2;
        const screenCenterY = canvasRect.top + canvasRect.height / 2;

        // Scale from visual points to screen pixels
        const scalePx = canvasRect.width / visualW;

        // 100pt in visual space = 100 * scalePx pixels
        const halfWidthPx = (rectPtWidth / 2) * scalePx;
        const halfHeightPx = (rectPtHeight / 2) * scalePx;

        // Start drag at center - half size, end at center + half size
        // Note: screen Y is top-down, visual Y is bottom-up
        const startScreen = { clientX: screenCenterX - halfWidthPx, clientY: screenCenterY + halfHeightPx };
        const endScreen = { clientX: screenCenterX + halfWidthPx, clientY: screenCenterY - halfHeightPx };

        // Convert to page space
        const startPage = screenToPageFromPage({ clientX: startScreen.clientX, clientY: startScreen.clientY, canvasRect, page });
        const endPage = screenToPageFromPage({ clientX: endScreen.clientX, clientY: endScreen.clientY, canvasRect, page });

        // The page-space rectangle should be 100x100 pt centered at page center
        const rectWidth = Math.abs(endPage.x - startPage.x);
        const rectHeight = Math.abs(endPage.y - startPage.y);
        const rectCenterX = (startPage.x + endPage.x) / 2;
        const rectCenterY = (startPage.y + endPage.y) / 2;

        assert.ok(Math.abs(rectWidth - rectPtWidth) < 0.01,
          `${pageW}x${pageH} rot ${rotation} scale ${scale}: width=${rectWidth.toFixed(4)}, expected ${rectPtWidth}`);
        assert.ok(Math.abs(rectHeight - rectPtHeight) < 0.01,
          `${pageW}x${pageH} rot ${rotation} scale ${scale}: height=${rectHeight.toFixed(4)}, expected ${rectPtHeight}`);
        assert.ok(Math.abs(rectCenterX - pageW / 2) < 0.01,
          `${pageW}x${pageH} rot ${rotation} scale ${scale}: centerX=${rectCenterX.toFixed(4)}, expected ${pageW / 2}`);
        assert.ok(Math.abs(rectCenterY - pageH / 2) < 0.01,
          `${pageW}x${pageH} rot ${rotation} scale ${scale}: centerY=${rectCenterY.toFixed(4)}, expected ${pageH / 2}`);
      }
    }
  }
});

// ===== Tests for canvasRect partly outside visible area (negative top/left, canvas larger than container) =====
// These tests verify that screenToPage / pageToScreen work correctly when the canvas extends
// beyond the viewport (simulating zoom where canvas > visible area).
// The canvasRect can have negative left/top (canvas scrolled out of view) and width/height > viewport.

const SCALES_ZOOM = [0.5, 0.74, 1, 1.29, 2];
const ROTATIONS_ALL = [0, 90, 180, 270];

// Helper: create a canvasRect that simulates the canvas being partly outside the viewport.
// The canvas is centered at (0,0) in a virtual viewport, but the visible area is a smaller window.
// At zoom=1.29 on a 612x792 page: canvas = 789x1022. Viewport = 612x792.
// Canvas center at viewport center => canvasRect = { left: -88.5, top: -115, width: 789, height: 1022 }
function makeCanvasRectScrolled(pageW, pageH, rotation, scale, viewportW, viewportH) {
  const { visualW, visualH } = visualDims(pageW, pageH, rotation);
  const canvasW = visualW * scale;
  const canvasH = visualH * scale;
  // Center canvas in viewport: canvasRect left/top can be negative
  const left = (viewportW - canvasW) / 2;
  const top = (viewportH - canvasH) / 2;
  return { left, top, width: canvasW, height: canvasH };
}

// 7. Drag rectangle consistency at all scales with canvasRect partly outside viewport (negative left/top)
// A drag from 20-60% across and 20-30% down the VISUAL page should give the same page-space rectangle
// regardless of zoom level, even when canvas extends beyond viewport (negative canvasRect left/top).
test("annotate-geometry: drag 20-60% x 20-30% gives same page-space rect at all scales with scrolled canvasRect", () => {
  const pageW = 612;
  const pageH = 792;
  const viewportW = 612; // Simulate viewport = page size at 1x
  const viewportH = 792;

  for (const rotation of ROTATIONS_ALL) {
    const { visualW, visualH } = visualDims(pageW, pageH, rotation);

    for (const scale of SCALES_ZOOM) {
      const canvasRect = makeCanvasRectScrolled(pageW, pageH, rotation, scale, viewportW, viewportH);

      // Drag from 20% to 60% across (40% width) and 20% to 30% down (10% height) of VISUAL page
      // In visual space (origin bottom-left, y up):
      // Start: vx = 0.2 * visualW, vy = 0.3 * visualH (20% across, 30% down from bottom = 70% up from top)
      // End:   vx = 0.6 * visualW, vy = 0.2 * visualH (60% across, 20% down from bottom = 80% up from top)
      // Screen Y is top-down, so:
      // startScreenY = canvasRect.top + (visualH - 0.3*visualH) * scale = canvasRect.top + 0.7*visualH*scale
      // endScreenY   = canvasRect.top + (visualH - 0.2*visualH) * scale = canvasRect.top + 0.8*visualH*scale
      const startVX = 0.2 * visualW;
      const startVY = 0.3 * visualH;
      const endVX = 0.6 * visualW;
      const endVY = 0.2 * visualH;

      const startScreen = {
        clientX: canvasRect.left + startVX * scale,
        clientY: canvasRect.top + (visualH - startVY) * scale,
      };
      const endScreen = {
        clientX: canvasRect.left + endVX * scale,
        clientY: canvasRect.top + (visualH - endVY) * scale,
      };

      const startPage = screenToPage({ clientX: startScreen.clientX, clientY: startScreen.clientY, canvasRect, pageW, pageH, rotation });
      const endPage = screenToPage({ clientX: endScreen.clientX, clientY: endScreen.clientY, canvasRect, pageW, pageH, rotation });

      // Expected page-space rectangle: 40% of visualW x 10% of visualH, at 20% across, 20% down
      // Convert expected visual rect to page space
      const expectedStartVisual = { x: startVX, y: startVY };
      const expectedEndVisual = { x: endVX, y: endVY };
      const expectedStartPage = visualToPage(expectedStartVisual, pageW, pageH, rotation);
      const expectedEndPage = visualToPage(expectedEndVisual, pageW, pageH, rotation);

      const rectWidth = Math.abs(endPage.x - startPage.x);
      const rectHeight = Math.abs(endPage.y - startPage.y);
      const expectedWidth = Math.abs(expectedEndPage.x - expectedStartPage.x);
      const expectedHeight = Math.abs(expectedEndPage.y - expectedStartPage.y);

      assert.ok(Math.abs(rectWidth - expectedWidth) < 0.01,
        `Rotation ${rotation}, scale ${scale}: width=${rectWidth.toFixed(4)}, expected ${expectedWidth.toFixed(4)}`);
      assert.ok(Math.abs(rectHeight - expectedHeight) < 0.01,
        `Rotation ${rotation}, scale ${scale}: height=${rectHeight.toFixed(4)}, expected ${expectedHeight.toFixed(4)}`);

      // Also verify center matches
      const rectCenterX = (startPage.x + endPage.x) / 2;
      const rectCenterY = (startPage.y + endPage.y) / 2;
      const expectedCenterX = (expectedStartPage.x + expectedEndPage.x) / 2;
      const expectedCenterY = (expectedStartPage.y + expectedEndPage.y) / 2;
      assert.ok(Math.abs(rectCenterX - expectedCenterX) < 0.01,
        `Rotation ${rotation}, scale ${scale}: centerX=${rectCenterX.toFixed(4)}, expected ${expectedCenterX.toFixed(4)}`);
      assert.ok(Math.abs(rectCenterY - expectedCenterY) < 0.01,
        `Rotation ${rotation}, scale ${scale}: centerY=${rectCenterY.toFixed(4)}, expected ${expectedCenterY.toFixed(4)}`);
    }
  }
});

// 8. Round-trip with negative canvasRect left/top (canvas scrolled out of view)
test("annotate-geometry: round-trip with negative canvasRect left/top at all rotations and scales", () => {
  const pageW = 612;
  const pageH = 792;
  const viewportW = 612;
  const viewportH = 792;

  const testPoints = [
    [0, 0], [100, 200], [300, 400], [612, 792], [612, 0], [0, 792],
    [123.456, 456.789], [0.1, 0.1],
    [pageW / 2, pageH / 2],
  ];

  for (const rotation of ROTATIONS_ALL) {
    for (const scale of SCALES_ZOOM) {
      const canvasRect = makeCanvasRectScrolled(pageW, pageH, rotation, scale, viewportW, viewportH);

      for (const [px, py] of testPoints) {
        // page → screen → page
        const screen = pageToScreen({ x: px, y: py, canvasRect, pageW, pageH, rotation });
        const back = screenToPage({ clientX: screen.clientX, clientY: screen.clientY, canvasRect, pageW, pageH, rotation });
        const dx = Math.abs(back.x - px);
        const dy = Math.abs(back.y - py);
        assert.ok(dx < 0.01 && dy < 0.01,
          `Round-trip failed at rot ${rotation}, scale ${scale}: (${px},${py}) -> (${back.x.toFixed(4)},${back.y.toFixed(4)}), error=(${dx.toFixed(4)},${dy.toFixed(4)})`);
      }
    }
  }
});

// 9. pageToScreenFromPage / screenToPageFromPage with scrolled canvasRect
test("annotate-geometry: screenToPageFromPage round-trip with scrolled canvasRect all configs", () => {
  const baseCanvasRect = { left: 0, top: 0, width: 0, height: 0 };
  const testPoints = [
    [0, 0], [100, 200], [300, 400], [612, 792], [612, 0], [0, 792],
    [123.456, 456.789], [0.1, 0.1],
    [306, 396],
  ];

  for (const { w: pageW, h: pageH, label } of PAGE_SIZES) {
    for (const rotation of ROTATIONS_ALL) {
      for (const scale of SCALES_ZOOM) {
        const viewportW = 612;
        const viewportH = 792;
        const canvasRect = makeCanvasRectScrolled(pageW, pageH, rotation, scale, viewportW, viewportH);
        const page = makePage(pageW, pageH, rotation);

        for (const [px, py] of testPoints) {
          if (px < 0 || px > pageW || py < 0 || py > pageH) continue;

          const screen = pageToScreenFromPage({ x: px, y: py, canvasRect, page });
          const back = screenToPageFromPage({ clientX: screen.clientX, clientY: screen.clientY, canvasRect, page });
          const dx = Math.abs(back.x - px);
          const dy = Math.abs(back.y - py);
          assert.ok(dx < 0.01 && dy < 0.01,
            `Round-trip failed: ${label} rot ${rotation} scale ${scale}: (${px},${py}) -> (${back.x.toFixed(4)},${back.y.toFixed(4)}), error=(${dx.toFixed(4)},${dy.toFixed(4)})`);
        }
      }
    }
  }
});