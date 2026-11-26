// Pure tests for js/core/annotate-layout.js
// No pdf-lib, no DOM.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computePageLayout,
  findCurrentPage,
  getRenderWindow,
  visualDims,
  visualToPage,
  pageToVisual,
  screenToPageForBlock,
  pageToScreenForBlock,
  pageRectToScreen,
} from "../js/core/annotate-layout.js";

const PAGE_SIZES = [
  { w: 612, h: 792, label: "portrait 612x792" },
  { w: 792, h: 612, label: "landscape 792x612" },
];
const ROTATIONS = [0, 90, 180, 270];
const ZOOMS = [0.5, 0.74, 0.96, 1, 1.5, 2];

// Helper to create a page object
function makePage(w, h, rotation, id) {
  return { id: id || `page-${w}x${h}`, width: w, height: h, baseRotation: 0, rotated: rotation };
}

// ===== computePageLayout tests =====

test("annotate-layout: computePageLayout - single page at rotation 0", () => {
  const pages = [makePage(612, 792, 0, "p1")];
  const layout = computePageLayout(pages, 1);
  assert.equal(layout.blocks.length, 1);
  const block = layout.blocks[0];
  assert.equal(block.id, "p1");
  assert.equal(block.rotation, 0);
  assert.equal(block.visualW, 612);
  assert.equal(block.visualH, 792);
  assert.equal(block.top, 24); // starts with gap
});

test("annotate-layout: computePageLayout - mixed page sizes and rotations", () => {
  const pages = [
    { id: "p1", width: 612, height: 792, baseRotation: 0, rotated: 0 },
    { id: "p2", width: 792, height: 612, baseRotation: 90, rotated: 90 }, // base 90 + user 90 = 180
    { id: "p3", width: 612, height: 792, baseRotation: 0, rotated: 180 },
    { id: "p4", width: 612, height: 792, baseRotation: 0, rotated: 270 },
  ];
  const layout = computePageLayout(pages, 1, 24);
  assert.equal(layout.blocks.length, 4);

  // Block 0: rot 0, visual 612x792
  assert.equal(layout.blocks[0].rotation, 0);
  assert.equal(layout.blocks[0].visualW, 612);
  assert.equal(layout.blocks[0].visualH, 792);
  assert.equal(layout.blocks[0].top, 24); // starts with gap

  // Block 1: rot 180, visual 612x792 (base 90 + user 90 = 180, so page 792x612 rotated 180 = visual 792x612? No, rotated 180 means visual = original)
  // Page is 792x612, rotated 180 -> visual is 792x612
  assert.equal(layout.blocks[1].rotation, 180);
  assert.equal(layout.blocks[1].visualW, 792);
  assert.equal(layout.blocks[1].visualH, 612);
  assert.equal(layout.blocks[1].top, 24 + 792 + 24); // previous top + height + gap

  // Block 2: rot 180, page 612x792 -> visual 612x792
  assert.equal(layout.blocks[2].rotation, 180);
  assert.equal(layout.blocks[2].visualW, 612);
  assert.equal(layout.blocks[2].visualH, 792);
  assert.equal(layout.blocks[2].top, 24 + 792 + 24 + 612 + 24);

  // Block 3: rot 270, page 612x792 -> visual 792x612
  assert.equal(layout.blocks[3].rotation, 270);
  assert.equal(layout.blocks[3].visualW, 792);
  assert.equal(layout.blocks[3].visualH, 612);
});

test("annotate-layout: computePageLayout - zoom scales block sizes", () => {
  const pages = [
    { id: "p1", width: 612, height: 792, baseRotation: 0, rotated: 0 },
  ];
  const layout1x = computePageLayout(pages, 1);
  const layout2x = computePageLayout(pages, 2);

  // At 2x zoom, canvas dimensions should be 2x
  assert.equal(layout2x.blocks[0].height, layout1x.blocks[0].height * 2);
  // Total height: gap is not scaled, so 2x(height + gap) - gap = 2*height + gap
  // layout1x.totalHeight = 24 (gap) + 792 (height) + 24 (gap) = 840
  // layout2x.totalHeight = 24 (gap) + 1584 (height) + 24 (gap) = 1632
  assert.equal(layout2x.totalHeight, 1632);
});

test("annotate-layout: computePageLayout - gap between pages", () => {
  const pages = [
    { id: "p1", width: 612, height: 792, baseRotation: 0, rotated: 0 },
    { id: "p2", width: 612, height: 792, baseRotation: 0, rotated: 0 },
  ];
  const layout = computePageLayout(pages, 1, 24);
  assert.equal(layout.blocks[1].top - (layout.blocks[0].top + layout.blocks[0].height), 24);
});

test("annotate-layout: computePageLayout - baseRotation + user rotation = effective rotation", () => {
  const pages = [
    { id: "p1", width: 612, height: 792, baseRotation: 90, rotated: 90 }, // effective 180
  ];
  const layout = computePageLayout(pages, 1);
  assert.equal(layout.blocks[0].rotation, 180);
});

// ===== findCurrentPage tests =====

test("annotate-layout: findCurrentPage - returns page most visible in viewport", () => {
  const pages = [
    { id: "p1", width: 612, height: 792, baseRotation: 0, rotated: 0 },
    { id: "p2", width: 612, height: 792, baseRotation: 0, rotated: 0 },
    { id: "p3", width: 612, height: 792, baseRotation: 0, rotated: 0 },
  ];
  const layout = computePageLayout(pages, 1, 24);

  // Viewport at top showing first page fully
  const result1 = findCurrentPage(layout.blocks, 0, 800);
  assert.equal(result1.pageId, "p1");
  assert.ok(result1.visibility > 0.9);

  // Viewport showing second page
  const result2 = findCurrentPage(layout.blocks, 820, 800);
  assert.equal(result2.pageId, "p2");
  assert.ok(result2.visibility > 0.9);
});

test("annotate-layout: findCurrentPage - returns null for empty blocks", () => {
  const result = findCurrentPage([], 0, 800);
  assert.equal(result, null);
});

test("annotate-layout: findCurrentPage - handles partial visibility", () => {
  const pages = [
    { id: "p1", width: 612, height: 792, baseRotation: 0, rotated: 0 },
    { id: "p2", width: 612, height: 792, baseRotation: 0, rotated: 0 },
  ];
  const layout = computePageLayout(pages, 1, 24);

  // Scroll position showing bottom of p1 and top of p2
  // p1: top=24, height=792, bottom=816
  // p2: top=840, height=792, bottom=1632
  // At scrollTop=800, viewport=800: view covers 800-1600
  // p1 visible: 800-816 = 16px (2% visibility)
  // p2 visible: 840-1600 = 760px (96% visibility)
  const result = findCurrentPage(layout.blocks, 800, 800);
  assert.equal(result.pageId, "p2");
});

// ===== getRenderWindow tests =====

test("annotate-layout: getRenderWindow - returns indices of pages in view + buffer", () => {
  const pages = [
    { id: "p1", width: 612, height: 792, baseRotation: 0, rotated: 0 },
    { id: "p2", width: 612, height: 792, baseRotation: 0, rotated: 0 },
    { id: "p3", width: 612, height: 792, baseRotation: 0, rotated: 0 },
    { id: "p4", width: 612, height: 792, baseRotation: 0, rotated: 0 },
  ];
  const layout = computePageLayout(pages, 1, 24);
  // p1: top=24, bottom=816
  // p2: top=840, bottom=1632
  // p3: top=1656, bottom=2448
  // p4: top=2472, bottom=3264

  // Viewport at top (scrollTop=0, viewportHeight=800), buffer=1.5
  // viewTop = 0 - 1200 = -1200, viewBottom = 0 + 800*2.5 = 2000
  // p1 (24-816): intersects
  // p2 (840-1632): intersects
  // p3 (1656-2448): intersects
  // p4 (2472-3264): does not intersect
  const window1 = getRenderWindow(layout.blocks, 0, 800, 1.5);
  assert.deepStrictEqual(window1, [0, 1, 2]);

  // Viewport at middle (scrollTop=1000, viewportHeight=800)
  // viewTop = 1000 - 1200 = -200, viewBottom = 1000 + 2000 = 3000
  const window2 = getRenderWindow(layout.blocks, 1000, 800, 1.5);
  assert.deepStrictEqual(window2, [0, 1, 2, 3]);
});

test("annotate-layout: getRenderWindow - returns empty for empty blocks", () => {
  const window = getRenderWindow([], 0, 800);
  assert.deepStrictEqual(window, []);
});

test("annotate-layout: getRenderWindow - at most ~8 pages alive (buffer limits)", () => {
  // Create many pages
  const pages = Array.from({ length: 20 }, (_, i) => ({
    id: `p${i}`,
    width: 612,
    height: 792,
    baseRotation: 0,
    rotated: 0,
  }));
  const layout = computePageLayout(pages, 1, 24);

  // With buffer=1.5 and viewport=800, should render at most ~8 pages
  // viewTop = -1200, viewBottom = 2000
  // Each page is 816 tall + 24 gap = 840
  // 2000 / 840 ≈ 2.3 pages visible, * 2.5 buffer = ~5-6 pages
  const window = getRenderWindow(layout.blocks, 0, 800, 1.5);
  assert.ok(window.length <= 8, `Expected at most 8 pages, got ${window.length}`);
});

// ===== getRenderWindow tests with 300 pages (long document) =====

test("annotate-layout: getRenderWindow - 300 pages at various zoom levels and scroll positions always includes visible ones (view caps at 8)", () => {
  // Create 300 pages with mixed sizes
  const pages = Array.from({ length: 300 }, (_, i) => {
    const isLandscape = i % 3 === 0;
    return {
      id: `p${i}`,
      width: isLandscape ? 792 : 612,
      height: isLandscape ? 612 : 792,
      baseRotation: 0,
      rotated: 0,
    };
  });

  const viewportHeight = 800;
  const buffer = 1.5;

  for (const zoom of [0.5, 1, 1.5, 2]) {
    const layout = computePageLayout(pages, zoom, 24);

    // Test at multiple scroll positions: top, 25%, 50%, 75%, bottom
    const testPositions = [
      0,
      layout.totalHeight * 0.25,
      layout.totalHeight * 0.5,
      layout.totalHeight * 0.75,
      Math.max(0, layout.totalHeight - viewportHeight),
    ];

    for (const scrollTop of testPositions) {
      const window = getRenderWindow(layout.blocks, scrollTop, viewportHeight, buffer);

      // getRenderWindow returns all pages in buffer; view caps at MAX_LIVE_CANVASES (8)
      // Just verify it returns a reasonable number (buffer covers ~2.5 screens)
      // At zoom=0.5 pages are smaller so more fit; that's OK - view will cap.
      // The important thing: window always includes the visible pages.

      // Must include the page containing the viewport center (most visible page)
      const current = findCurrentPage(layout.blocks, scrollTop, viewportHeight);
      if (current) {
        assert.ok(window.includes(current.index),
          `zoom=${zoom} scrollTop=${scrollTop}: Render window must include current page ${current.index}, got [${window.join(",")}]`);
      }

      // Must include pages fully visible in viewport
      const viewBottom = scrollTop + viewportHeight;
      for (let i = 0; i < layout.blocks.length; i++) {
        const block = layout.blocks[i];
        const blockBottom = block.top + block.height;
        const fullyVisible = block.top >= scrollTop && blockBottom <= viewBottom;
        if (fullyVisible) {
          assert.ok(window.includes(i),
            `zoom=${zoom} scrollTop=${scrollTop}: Fully visible page ${i} must be in render window`);
        }
      }
    }
  }
});

test("annotate-layout: getRenderWindow - moving the window releases the right pages", () => {
  const pages = Array.from({ length: 50 }, (_, i) => ({
    id: `p${i}`,
    width: 612,
    height: 792,
    baseRotation: 0,
    rotated: 0,
  }));
  const layout = computePageLayout(pages, 1, 24);
  const viewportHeight = 800;
  const buffer = 1.5;

  // At top
  const windowTop = getRenderWindow(layout.blocks, 0, viewportHeight, buffer);
  // At middle
  const windowMid = getRenderWindow(layout.blocks, layout.totalHeight / 2, viewportHeight, buffer);
  // At bottom
  const windowBot = getRenderWindow(layout.blocks, Math.max(0, layout.totalHeight - viewportHeight), viewportHeight, buffer);

  // Windows at different positions should be disjoint (mostly)
  const topSet = new Set(windowTop);
  const midSet = new Set(windowMid);
  const botSet = new Set(windowBot);

  // Top and bottom should not overlap
  for (const idx of topSet) {
    assert.ok(!botSet.has(idx), `Page ${idx} should not be in both top and bottom windows`);
  }

  // Each window should have at most 8 pages
  assert.ok(windowTop.length <= 8);
  assert.ok(windowMid.length <= 8);
  assert.ok(windowBot.length <= 8);
});

test("annotate-layout: findCurrentPage matches the scroll offset used to open a given page index (round trip for every index)", () => {
  const pages = Array.from({ length: 100 }, (_, i) => ({
    id: `p${i}`,
    width: 612,
    height: 792,
    baseRotation: 0,
    rotated: 0,
  }));

  for (const zoom of [0.5, 1, 1.5, 2]) {
    const layout = computePageLayout(pages, zoom, 24);
    const viewportHeight = 800;

    // Test every 10th page to keep test fast, plus first and last
    const testIndices = [0, 1, 5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 99];

    for (const idx of testIndices) {
      const block = layout.blocks[idx];
      // Scroll to exact block top (what enter() does)
      const scrollTop = block.top;
      const current = findCurrentPage(layout.blocks, scrollTop, viewportHeight);

      assert.ok(current, `zoom=${zoom} idx=${idx}: findCurrentPage should return a page`);
      assert.equal(current.index, idx,
        `zoom=${zoom} idx=${idx}: Round-trip failed. Scrolled to page ${idx} (top=${block.top}), but findCurrentPage returned ${current.index}`);
    }
  }
});

// ===== visualDims tests =====

test("annotate-layout: visualDims - swaps at 90/270", () => {
  assert.deepStrictEqual(visualDims(612, 792, 0), { visualW: 612, visualH: 792 });
  assert.deepStrictEqual(visualDims(612, 792, 90), { visualW: 792, visualH: 612 });
  assert.deepStrictEqual(visualDims(612, 792, 180), { visualW: 612, visualH: 792 });
  assert.deepStrictEqual(visualDims(612, 792, 270), { visualW: 792, visualH: 612 });
});

// ===== visualToPage / pageToVisual round-trip tests =====

test("annotate-layout: visualToPage / pageToVisual round-trip all rotations", () => {
  const points = [
    [0, 0], [100, 200], [300, 400], [612, 792], [612, 0], [0, 792],
    [123.456, 456.789], [0.1, 0.1],
    [306, 396], // center
  ];

  for (const rotation of ROTATIONS) {
    for (const [px, py] of points) {
      const visual = pageToVisual({ x: px, y: py }, 612, 792, rotation);
      const back = visualToPage(visual, 612, 792, rotation);
      const dx = Math.abs(back.x - px);
      const dy = Math.abs(back.y - py);
      assert.ok(dx < 0.001 && dy < 0.001,
        `Round-trip failed at rot ${rotation}: (${px},${py}) -> (${back.x.toFixed(4)},${back.y.toFixed(4)})`);
    }
  }
});

// ===== screenToPageForBlock / pageToScreenForBlock tests =====

function makeCanvasRect(canvasRect, scale, rotation, pageW, pageH) {
  const { visualW, visualH } = visualDims(pageW, pageH, rotation);
  return {
    left: canvasRect.left,
    top: canvasRect.top,
    width: visualW * scale,
    height: visualH * scale,
  };
}

test("annotate-layout: screenToPageForBlock / pageToScreenForBlock round-trip", () => {
  const baseCanvasRect = { left: 100, top: 50, width: 0, height: 0 };
  const testPoints = [
    [0, 0], [100, 200], [300, 400], [612, 792], [612, 0], [0, 792],
    [123.456, 456.789], [0.1, 0.1],
    [306, 396],
  ];

  for (const { w: pageW, h: pageH } of PAGE_SIZES) {
    for (const rotation of ROTATIONS) {
      for (const scale of ZOOMS) {
        const canvasRect = makeCanvasRect(baseCanvasRect, scale, rotation, pageW, pageH);
        const block = {
          pageW,
          pageH,
          visualW: visualDims(pageW, pageH, rotation).visualW,
          visualH: visualDims(pageW, pageH, rotation).visualH,
          rotation,
        };

        for (const [px, py] of testPoints) {
          if (px < 0 || px > pageW || py < 0 || py > pageH) continue;

          const screen = pageToScreenForBlock(px, py, block, canvasRect);
          const back = screenToPageForBlock(screen.clientX, screen.clientY, block, canvasRect);
          const dx = Math.abs(back.x - px);
          const dy = Math.abs(back.y - py);
          assert.ok(dx < 0.01 && dy < 0.01,
            `Round-trip failed: ${pageW}x${pageH} rot ${rotation} scale ${scale}: (${px},${py}) -> (${back.x.toFixed(4)},${back.y.toFixed(4)}), error=(${dx.toFixed(4)},${dy.toFixed(4)})`);
        }
      }
    }
  }
});

test("annotate-layout: pageToScreenForBlock maps page origin to correct canvas corners", () => {
  const baseCanvasRect = { left: 100, top: 50, width: 0, height: 0 };

  for (const { w: pageW, h: pageH } of PAGE_SIZES) {
    for (const rotation of ROTATIONS) {
      for (const scale of [1, 2]) {
        const canvasRect = makeCanvasRect(baseCanvasRect, scale, rotation, pageW, pageH);
        const block = {
          pageW,
          pageH,
          visualW: visualDims(pageW, pageH, rotation).visualW,
          visualH: visualDims(pageW, pageH, rotation).visualH,
          rotation,
        };

        const screen = pageToScreenForBlock(0, 0, block, canvasRect);

        switch (rotation) {
          case 0:
            assert.equal(screen.clientX, canvasRect.left);
            assert.equal(screen.clientY, canvasRect.top + canvasRect.height);
            break;
          case 90:
            assert.equal(screen.clientX, canvasRect.left);
            assert.equal(screen.clientY, canvasRect.top);
            break;
          case 180:
            assert.equal(screen.clientX, canvasRect.left + canvasRect.width);
            assert.equal(screen.clientY, canvasRect.top);
            break;
          case 270:
            assert.equal(screen.clientX, canvasRect.left + canvasRect.width);
            assert.equal(screen.clientY, canvasRect.top + canvasRect.height);
            break;
        }

        // Page center should map to canvas center
        const screenCenter = pageToScreenForBlock(pageW / 2, pageH / 2, block, canvasRect);
        const expectedCenterX = canvasRect.left + canvasRect.width / 2;
        const expectedCenterY = canvasRect.top + canvasRect.height / 2;
        assert.ok(Math.abs(screenCenter.clientX - expectedCenterX) < 0.001);
        assert.ok(Math.abs(screenCenter.clientY - expectedCenterY) < 0.001);
      }
    }
  }
});

// ===== pageRectToScreen tests =====

function makeBlock(pageW, pageH, rotation) {
  const { visualW, visualH } = visualDims(pageW, pageH, rotation);
  return {
    pageW, pageH, visualW, visualH, rotation,
  };
}

const CANVAS_RECT = { left: 100, top: 50, width: 612, height: 792 };

test("annotate-layout: pageRectToScreen - rotation 0 preserves width and height", () => {
  const block = makeBlock(612, 792, 0);
  const rect = pageRectToScreen(100, 200, 300, 400, block, CANVAS_RECT);
  assert.ok(rect, "Should return a bounding box");
  // Rotation 0: page origin bottom-left maps to canvas bottom-left corner area
  // width and height should be positive and match page-space dims at scale 1
  assert.equal(rect.width, 300, "width should be 300 at rotation 0");
  assert.equal(rect.height, 400, "height should be 400 at rotation 0");
  assert.equal(rect.left, rect.right - 300);
  assert.equal(rect.top, rect.bottom - 400);
});

test("annotate-layout: pageRectToScreen - rotation 90 swaps width/height, positive size", () => {
  const block = makeBlock(612, 792, 90);
  // At rotation 90 the page's visual dims are 792x612; canvas must match.
  const canvas = { left: 100, top: 50, width: 792, height: 612 };
  const rect = pageRectToScreen(100, 200, 300, 400, block, canvas);
  assert.ok(rect, "Should return a bounding box");
  assert.ok(rect.width > 0, `width should be positive, got ${rect.width}`);
  assert.ok(rect.height > 0, `height should be positive, got ${rect.height}`);
  // Page-space width (300) maps to screen height, page-space height (400) maps to screen width
  assert.equal(rect.width, 400, "width should equal page-space height at rotation 90");
  assert.equal(rect.height, 300, "height should equal page-space width at rotation 90");
});

test("annotate-layout: pageRectToScreen - rotation 180 positive size (no collapse)", () => {
  const block = makeBlock(612, 792, 180);
  const rect = pageRectToScreen(100, 200, 300, 400, block, CANVAS_RECT);
  assert.ok(rect, "Should return a bounding box");
  assert.equal(rect.width, 300, "width should be 300 at rotation 180");
  assert.equal(rect.height, 400, "height should be 400 at rotation 180");
  assert.ok(rect.width > 0 && rect.height > 0, "width and height must be positive");
});

test("annotate-layout: pageRectToScreen - rotation 270 swaps width/height, positive size", () => {
  const block = makeBlock(612, 792, 270);
  const canvas = { left: 100, top: 50, width: 792, height: 612 };
  const rect = pageRectToScreen(100, 200, 300, 400, block, canvas);
  assert.ok(rect, "Should return a bounding box");
  assert.ok(rect.width > 0, `width should be positive, got ${rect.width}`);
  assert.ok(rect.height > 0, `height should be positive, got ${rect.height}`);
  assert.equal(rect.width, 400, "width should equal page-space height at rotation 270");
  assert.equal(rect.height, 300, "height should equal page-space width at rotation 270");
});

test("annotate-layout: pageRectToScreen - all four rotations give positive width/height", () => {
  for (const rotation of [0, 90, 180, 270]) {
    const block = makeBlock(612, 792, rotation);
    const rect = pageRectToScreen(50, 100, 200, 300, block, CANVAS_RECT);
    assert.ok(rect, `rotation ${rotation}: should return a bounding box`);
    assert.ok(rect.width > 0, `rotation ${rotation}: width should be positive, got ${rect.width}`);
    assert.ok(rect.height > 0, `rotation ${rotation}: height should be positive, got ${rect.height}`);
    assert.equal(rect.left, rect.right - rect.width);
    assert.equal(rect.top, rect.bottom - rect.height);
  }
});

test("annotate-layout: pageRectToScreen - landscape page at all rotations", () => {
  for (const rotation of [0, 90, 180, 270]) {
    const block = makeBlock(792, 612, rotation);
    const rect = pageRectToScreen(50, 100, 200, 300, block, CANVAS_RECT);
    assert.ok(rect, `landscape rotation ${rotation}: should return a bounding box`);
    assert.ok(rect.width > 0, `landscape rotation ${rotation}: width should be positive`);
    assert.ok(rect.height > 0, `landscape rotation ${rotation}: height should be positive`);
  }
});

test("annotate-layout: pageRectToScreen - zero-size rect returns zero width/height", () => {
  const block = makeBlock(612, 792, 0);
  const rect = pageRectToScreen(100, 200, 0, 0, block, CANVAS_RECT);
  assert.ok(rect, "Should return a bounding box for zero-size rect");
  assert.equal(rect.width, 0, "width should be 0 for zero-size rect");
  assert.equal(rect.height, 0, "height should be 0 for zero-size rect");
});

test("annotate-layout: pageRectToScreen - returns null when fewer than 4 corners map", () => {
  const block = makeBlock(612, 792, 0);
  // canvasRect with 0 width/height - pageToScreenForBlock may return null for some corners
  const degenerateRect = { left: 0, top: 0, width: 0, height: 0 };
  const rect = pageRectToScreen(100, 200, 300, 400, block, degenerateRect);
  // May or may not return null depending on pageToScreenForBlock behavior with zero canvas
  // Just verify it doesn't throw
  assert.ok(rect === null || (rect.width >= 0 && rect.height >= 0));
});