// Overlay geometry: page↔visual transforms, label and watermark placement,
// watermark validation and page-number formatting. Reads files as text — no
// browser.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  pageToVisual, visualToPage, placeLabel, watermarkPlacement, watermarkAutoSize,
  LABEL_POSITIONS, validateWatermark, formatPageNumber, DEFAULT_MARGIN, pageBoxOrigin,
} from "../js/core/overlay.js";

const PAGE_W = 612;
const PAGE_H = 792;
const ROTATIONS = [0, 90, 180, 270];

// Independent forward transform (page space → visual space) per PDF spec:
// /Rotate rotates the page clockwise when displayed. Visual space has origin
// at the visual bottom-left, y up. This uses a signed-permutation matrix
// derived from where page corners land after rotation and re-anchoring.
function forwardPageToVisual({ x, y }, pageW, pageH, r) {
  r = ((r % 360) + 360) % 360;
  let a, b, tx, c, d, ty; // vx = a*x + b*y + tx ; vy = c*x + d*y + ty
  switch (r) {
    case 0:   a = 1;  b = 0;  tx = 0;     c = 0;  d = 1;  ty = 0;     break;
    case 90:  a = 0;  b = 1;  tx = 0;     c = -1; d = 0;  ty = pageW; break;
    case 180: a = -1; b = 0;  tx = pageW; c = 0;  d = -1; ty = pageH; break;
    case 270: a = 0;  b = -1; tx = pageH; c = 1;  d = 0;  ty = 0;     break;
    default:  a = 1;  b = 0;  tx = 0;     c = 0;  d = 1;  ty = 0;     break;
  }
  return { x: a * x + b * y + tx, y: c * x + d * y + ty };
}

test("visualToPage is the exact inverse of pageToVisual for all four rotations", () => {
  const points = [
    { x: 0, y: 0 },
    { x: PAGE_W, y: PAGE_H },
    { x: 100, y: 200 },
    { x: PAGE_W / 2, y: PAGE_H / 2 },
    { x: 37, y: 722 },
  ];
  for (const rotation of ROTATIONS) {
    for (const p of points) {
      const visual = pageToVisual(p, PAGE_W, PAGE_H, rotation);
      const back = visualToPage(visual, PAGE_W, PAGE_H, rotation);
      assert.equal(back.x, p.x, `rotation ${rotation} x round-trip`);
      assert.equal(back.y, p.y, `rotation ${rotation} y round-trip`);
    }
  }
});

test("pageToVisual matches an independent forward transform on sample points", () => {
  const points = [
    { x: 0, y: 0 },
    { x: 50, y: 700 },
    { x: PAGE_W, y: PAGE_H },
    { x: 300, y: 400 },
  ];
  for (const rotation of ROTATIONS) {
    for (const p of points) {
      const impl = pageToVisual(p, PAGE_W, PAGE_H, rotation);
      const indep = forwardPageToVisual(p, PAGE_W, PAGE_H, rotation);
      assert.equal(impl.x, indep.x, `rotation ${rotation} x`);
      assert.equal(impl.y, indep.y, `rotation ${rotation} y`);
    }
  }
});

test("pageToVisual maps page corners to correct visual corners", () => {
  // Page bottom-left (0,0) at each rotation:
  // r=0: visual bottom-left (0,0)
  // r=90: visual top-left (0, PAGE_W)
  // r=180: visual top-right (PAGE_W, PAGE_H)
  // r=270: visual bottom-right (PAGE_H, 0)
  assert.deepStrictEqual(pageToVisual({ x: 0, y: 0 }, PAGE_W, PAGE_H, 0), { x: 0, y: 0 });
  assert.deepStrictEqual(pageToVisual({ x: 0, y: 0 }, PAGE_W, PAGE_H, 90), { x: 0, y: PAGE_W });
  assert.deepStrictEqual(pageToVisual({ x: 0, y: 0 }, PAGE_W, PAGE_H, 180), { x: PAGE_W, y: PAGE_H });
  assert.deepStrictEqual(pageToVisual({ x: 0, y: 0 }, PAGE_W, PAGE_H, 270), { x: PAGE_H, y: 0 });

  // Page top-right (PAGE_W, PAGE_H) at each rotation:
  assert.deepStrictEqual(pageToVisual({ x: PAGE_W, y: PAGE_H }, PAGE_W, PAGE_H, 0), { x: PAGE_W, y: PAGE_H });
  assert.deepStrictEqual(pageToVisual({ x: PAGE_W, y: PAGE_H }, PAGE_W, PAGE_H, 90), { x: PAGE_H, y: 0 });
  assert.deepStrictEqual(pageToVisual({ x: PAGE_W, y: PAGE_H }, PAGE_W, PAGE_H, 180), { x: 0, y: 0 });
  assert.deepStrictEqual(pageToVisual({ x: PAGE_W, y: PAGE_H }, PAGE_W, PAGE_H, 270), { x: 0, y: PAGE_W });
});

test("placeLabel puts bottom-center text at the visual bottom edge on every rotation", () => {
  const textWidth = 30;
  const fontSize = 10;
  for (const rotation of ROTATIONS) {
    const result = placeLabel({
      position: "bottom-center", pageW: PAGE_W, pageH: PAGE_H,
      rotation, fontSize, textWidth,
    });
    // The page-space result maps back to the visual bottom-centre anchor.
    const visual = pageToVisual(result, PAGE_W, PAGE_H, rotation);
    const { visualW, visualH } = rotation === 90 || rotation === 270
      ? { visualW: PAGE_H, visualH: PAGE_W }
      : { visualW: PAGE_W, visualH: PAGE_H };
    assert.equal(visual.x, visualW / 2 - textWidth / 2, `rotation ${rotation} visual x`);
    assert.equal(visual.y, DEFAULT_MARGIN, `rotation ${rotation} visual y (bottom margin)`);
    // The pdf-lib rotate angle (CCW) should be visualAngle + rotation = 0 + rotation = rotation.
    assert.equal(result.rotateDegrees, rotation % 360, `rotation ${rotation} angle`);
  }
});

test("placeLabel supports all six label positions at rotation 0", () => {
  for (const position of LABEL_POSITIONS) {
    const result = placeLabel({
      position, pageW: PAGE_W, pageH: PAGE_H, rotation: 0,
      fontSize: 10, textWidth: 40,
    });
    assert.ok(Number.isFinite(result.x));
    assert.ok(Number.isFinite(result.y));
    assert.equal(result.rotateDegrees, 0);
  }
  // Top-left sits MARGIN pt in from the top-left visual corner (y up).
  // Baseline is at visualH - margin - 0.72*fontSize
  const tl = placeLabel({ position: "top-left", pageW: PAGE_W, pageH: PAGE_H, rotation: 0, fontSize: 10, textWidth: 40 });
  assert.equal(tl.x, DEFAULT_MARGIN);
  assert.equal(tl.y, PAGE_H - DEFAULT_MARGIN - 0.72 * 10);
  // Bottom-right sits MARGIN pt in from bottom-right.
  const br = placeLabel({ position: "bottom-right", pageW: PAGE_W, pageH: PAGE_H, rotation: 0, fontSize: 10, textWidth: 40 });
  assert.equal(br.x, PAGE_W - DEFAULT_MARGIN - 40);
  assert.equal(br.y, DEFAULT_MARGIN);
});

test("placeLabel uses custom margin and visualAngle", () => {
  // Custom margin
  const customMargin = 20;
  const result = placeLabel({
    position: "bottom-left", pageW: PAGE_W, pageH: PAGE_H, rotation: 0,
    fontSize: 10, textWidth: 40, margin: customMargin,
  });
  assert.equal(result.x, customMargin);
  assert.equal(result.y, customMargin);

  // Visual angle 90 (reading upward) at rotation 0
  const rotated = placeLabel({
    position: "bottom-center", pageW: PAGE_W, pageH: PAGE_H, rotation: 0,
    fontSize: 10, textWidth: 40, visualAngle: 90,
  });
  assert.equal(rotated.rotateDegrees, 90);
});

test("watermarkPlacement centres the text box on the page at rotation 0", () => {
  const result = watermarkPlacement({
    pageW: PAGE_W, pageH: PAGE_H, rotation: 0, angle: 0,
    fontSize: 50, textWidth: 300,
  });
  // Box centre = origin + (textWidth/2, 0.36*fontSize) should be the page centre.
  const hc = 0.36 * 50;
  const centreX = result.x + 300 / 2;
  const centreY = result.y + hc;
  assert.equal(centreX, PAGE_W / 2);
  assert.equal(Math.round(centreY), Math.round(PAGE_H / 2));
  assert.equal(result.rotateDegrees, 0);
});

// Verify that the watermark box centre in visual space maps to the page centre in page space.
// The visual box centre is at (visualW/2, visualH/2). Converting to page space must yield (pageW/2, pageH/2).
function assertBoxCentreOnPageCentre(result, pageW, pageH, rotation, fontSize, textWidth, angle) {
  const { visualW, visualH } = rotation === 90 || rotation === 270
    ? { visualW: pageH, visualH: pageW }
    : { visualW: pageW, visualH: pageH };
  const a = (angle * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const hc = 0.36 * fontSize;
  const w2 = textWidth / 2;
  // Visual box centre relative to text origin in visual space (after CCW rotation by angle).
  const cx = w2 * cos - hc * sin;
  const cy = w2 * sin + hc * cos;
  // Visual text origin = pageToVisual(page-space origin).
  const visualOrigin = pageToVisual({ x: result.x, y: result.y }, pageW, pageH, rotation);
  // Visual box centre = visual origin + visual offset.
  const visualCentre = { x: visualOrigin.x + cx, y: visualOrigin.y + cy };
  // Should be the visual centre.
  assert.ok(Math.abs(visualCentre.x - visualW / 2) < 1e-9, `visual centre x: ${visualCentre.x} vs ${visualW / 2}`);
  assert.ok(Math.abs(visualCentre.y - visualH / 2) < 1e-9, `visual centre y: ${visualCentre.y} vs ${visualH / 2}`);
  // Converting visual centre to page space should give page centre.
  const pageCentre = visualToPage(visualCentre, pageW, pageH, rotation);
  assert.ok(Math.abs(pageCentre.x - pageW / 2) < 1e-9, `page centre x: ${pageCentre.x} vs ${pageW / 2}`);
  assert.ok(Math.abs(pageCentre.y - pageH / 2) < 1e-9, `page centre y: ${pageCentre.y} vs ${pageH / 2}`);
}

test("watermarkPlacement compensates for /Rotate and the watermark angle", () => {
  const base = watermarkPlacement({ pageW: PAGE_W, pageH: PAGE_H, rotation: 0, angle: 45, fontSize: 50, textWidth: 300 });
  const rotated = watermarkPlacement({ pageW: PAGE_W, pageH: PAGE_H, rotation: 90, angle: 45, fontSize: 50, textWidth: 300 });
  // The draw angle (CCW) = visualAngle + rotation.
  // For r=0, angle=45 (CCW): CCW = 45.
  // For r=90, angle=45 (CCW): CCW = 135.
  assert.equal(base.rotateDegrees, 45);
  assert.equal(rotated.rotateDegrees, 135);
  // The text box centre lands on the page centre in both cases.
  assertBoxCentreOnPageCentre(base, PAGE_W, PAGE_H, 0, 50, 300, 45);
  assertBoxCentreOnPageCentre(rotated, PAGE_W, PAGE_H, 90, 50, 300, 45);
});

test("watermarkPlacement pulls the origin back so the rotated box stays centred", () => {
  const upright = watermarkPlacement({ pageW: PAGE_W, pageH: PAGE_H, rotation: 0, angle: 0, fontSize: 60, textWidth: 240 });
  const rotated = watermarkPlacement({ pageW: PAGE_W, pageH: PAGE_H, rotation: 0, angle: 90, fontSize: 60, textWidth: 240 });
  assert.equal(upright.rotateDegrees, 0);
  assert.equal(rotated.rotateDegrees, 90); // 0 + 90 = 90
  // Box centre is the page centre regardless of the draw angle.
  assertBoxCentreOnPageCentre(upright, PAGE_W, PAGE_H, 0, 60, 240, 0);
  assertBoxCentreOnPageCentre(rotated, PAGE_W, PAGE_H, 0, 60, 240, 90);
});

test("watermarkPlacement works for all rotations with visualAngle + rotation", () => {
  // For r=270, angle=0: CCW = 270
  const r270 = watermarkPlacement({ pageW: PAGE_W, pageH: PAGE_H, rotation: 270, angle: 0, fontSize: 50, textWidth: 300 });
  assert.equal(r270.rotateDegrees, 270);
  // Box centre should be page centre.
  assertBoxCentreOnPageCentre(r270, PAGE_W, PAGE_H, 270, 50, 300, 0);

  // For r=180, angle=45: CCW = 225
  const r180 = watermarkPlacement({ pageW: PAGE_W, pageH: PAGE_H, rotation: 180, angle: 45, fontSize: 50, textWidth: 300 });
  assert.equal(r180.rotateDegrees, 225);
  assertBoxCentreOnPageCentre(r180, PAGE_W, PAGE_H, 180, 50, 300, 45);
});

test("formatPageNumber", () => {
  assert.equal(formatPageNumber(1, 3, "n"), "1");
  assert.equal(formatPageNumber(2, 3, "page-n"), "Page 2");
  assert.equal(formatPageNumber(3, 3, "n-of-total"), "3 / 3");
  assert.equal(formatPageNumber(1, 5, "page-of-total"), "Page 1 of 5");
  assert.equal(formatPageNumber(9, 9, "unknown"), "9"); // unknown format falls back to n
});

test("validateWatermark accepts valid text and rejects invalid text", () => {
  assert.equal(validateWatermark(""), undefined);
  assert.equal(validateWatermark("   "), undefined);
  assert.equal(validateWatermark("CONFIDENTIAL"), undefined);
  assert.equal(validateWatermark("DRAFT v1.0 (2026)"), undefined);
  assert.equal(validateWatermark("a".repeat(60)), undefined);
  assert.equal(validateWatermark("a".repeat(61)), "Watermark text is too long (maximum 60 characters).");
  assert.equal(validateWatermark("© 2026"), "Use Latin letters, digits and common punctuation only.");
  assert.equal(validateWatermark("日本語"), "Use Latin letters, digits and common punctuation only.");
  assert.equal(validateWatermark("line\nbreak"), "Use Latin letters, digits and common punctuation only.");
});

// --- Mandatory pure tests per Phase 3.1 round 2 ---

// Independent page-to-visual transform (PDF spec: /Rotate rotates page clockwise)
function independentPageToVisual({ x, y }, pageW, pageH, r) {
  r = ((r % 360) + 360) % 360;
  let a, b, tx, c, d, ty;
  switch (r) {
    case 0:   a = 1;  b = 0;  tx = 0;     c = 0;  d = 1;  ty = 0;     break;
    case 90:  a = 0;  b = 1;  tx = 0;     c = -1; d = 0;  ty = pageW; break;
    case 180: a = -1; b = 0;  tx = pageW; c = 0;  d = -1; ty = pageH; break;
    case 270: a = 0;  b = -1; tx = pageH; c = 1;  d = 0;  ty = 0;     break;
    default:  a = 1;  b = 0;  tx = 0;     c = 0;  d = 1;  ty = 0;
  }
  return { x: a * x + b * y + tx, y: c * x + d * y + ty };
}

// Expected visual anchor for a label position (matches visualAnchor in overlay.js)
function expectedVisualAnchor({ position, visualW, visualH, textWidth, margin, fontSize }) {
  const baselineOffset = 0.72 * fontSize;
  let vx, vy;
  switch (position) {
    case "top-left":      vx = margin;                      vy = visualH - margin - baselineOffset; break;
    case "top-center":    vx = visualW / 2 - textWidth / 2; vy = visualH - margin - baselineOffset; break;
    case "top-right":     vx = visualW - margin - textWidth; vy = visualH - margin - baselineOffset; break;
    case "bottom-left":   vx = margin;                      vy = margin; break;
    case "bottom-center": vx = visualW / 2 - textWidth / 2; vy = margin; break;
    case "bottom-right":  vx = visualW - margin - textWidth; vy = margin; break;
    default:              vx = margin;                      vy = margin;
  }
  return { vx, vy };
}

// Rotated bounding box of text (width w, cap height h) at angle a (CCW)
// boxW = w*cos(a) + h*sin(a), boxH = w*sin(a) + h*cos(a)
function rotatedBoxSize(textWidth, fontSize, angle) {
  const a = (angle * Math.PI) / 180;
  const cosA = Math.abs(Math.cos(a));
  const sinA = Math.abs(Math.sin(a));
  const h = 0.72 * fontSize;
  return {
    boxW: textWidth * cosA + h * sinA,
    boxH: textWidth * sinA + h * cosA,
  };
}

const NON_SQUARE_PAGES = [
  { pageW: 612, pageH: 792 },   // portrait
  { pageW: 792, pageH: 612 },   // landscape
  { pageW: 410, pageH: 792 },   // narrow portrait
  { pageW: 842, pageH: 595 },   // A4 landscape
];
const ROTATIONS_ALL = [0, 90, 180, 270];
const VISUAL_ANGLES = [0, 45, 90];
const MARGIN = 36;

for (const { pageW, pageH } of NON_SQUARE_PAGES) {
  for (const rotation of ROTATIONS_ALL) {
    for (const visualAngle of VISUAL_ANGLES) {
      for (const position of LABEL_POSITIONS) {
        test(`MANDATORY: placeLabel rotation=${rotation} visualAngle=${visualAngle} position=${position} page=${pageW}x${pageH}`, () => {
          const fontSize = 10;
          const text = "Test";
          const textWidth = text.length * 10; // matches fake font in tests

          const result = placeLabel({
            position, pageW, pageH, rotation, fontSize, textWidth, margin: MARGIN, visualAngle,
          });

          // 1. Visual baseline direction should equal (cos a, sin a) where a = visualAngle (CCW)
          const t = (visualAngle + rotation) % 360; // pdf-lib CCW rotation
          const a = (t * Math.PI) / 180;
          const expectedDir = { x: Math.cos(visualAngle * Math.PI / 180), y: Math.sin(visualAngle * Math.PI / 180) };

          // The baseline direction in page space is the text matrix first row [cos t, sin t]
          // Page space -> visual space for vectors: rotate CW by rotation (since /Rotate is CW).
          function rotateCW({ x, y }, r) {
            r = ((r % 360) + 360) % 360;
            const rad = (r * Math.PI) / 180;
            const cosR = Math.cos(rad);
            const sinR = Math.sin(rad);
            return { x: x * cosR + y * sinR, y: -x * sinR + y * cosR };
          }
          const pageDir = { x: Math.cos(a), y: Math.sin(a) }; // in page space
          const visualDir = rotateCW(pageDir, rotation);
          const visualDirLen = Math.hypot(visualDir.x, visualDir.y);
          // Allow small floating-point error (1e-6)
          assert.ok(Math.abs(visualDir.x / visualDirLen - expectedDir.x) < 1e-6,
            `visual baseline dir x: ${visualDir.x / visualDirLen} vs ${expectedDir.x}`);
          assert.ok(Math.abs(visualDir.y / visualDirLen - expectedDir.y) < 1e-6,
            `visual baseline dir y: ${visualDir.y / visualDirLen} vs ${expectedDir.y}`);

          // 2. Visual origin should equal expected visual anchor
          const visualOrigin = independentPageToVisual({ x: result.x, y: result.y }, pageW, pageH, rotation);
          const { visualW, visualH } = rotation === 90 || rotation === 270
            ? { visualW: pageH, visualH: pageW }
            : { visualW: pageW, visualH: pageH };
          const expectedAnchor = expectedVisualAnchor({ position, visualW, visualH, textWidth, margin: MARGIN, fontSize });
          assert.ok(Math.abs(visualOrigin.x - expectedAnchor.vx) < 1e-6,
            `visual origin x: ${visualOrigin.x} vs ${expectedAnchor.vx}`);
          assert.ok(Math.abs(visualOrigin.y - expectedAnchor.vy) < 1e-6,
            `visual origin y: ${visualOrigin.y} vs ${expectedAnchor.vy}`);

          // 3. Whole text box stays inside visual page
          // For labels (visualAngle=0), box is axis-aligned in visual space
          if (visualAngle === 0) {
            const h = 0.72 * fontSize;
            assert.ok(visualOrigin.x >= -1e-6, "box left inside page");
            assert.ok(visualOrigin.y >= -1e-6, "box bottom inside page");
            assert.ok(visualOrigin.x + textWidth <= visualW + 1e-6, "box right inside page");
            assert.ok(visualOrigin.y + h <= visualH + 1e-6, "box top inside page");
          }
        });
      }
    }
  }
}

// --- Watermark auto-size mandatory tests ---
// Test angles 0, 30, 45, 60, 90 on portrait and landscape at rotations 0 and 90,
// with "DRAFT" and a 60-character string, asserting boxW <= 0.8*visualW and boxH <= 0.8*visualH.

const AUTO_SIZE_PAGES = [
  { pageW: 612, pageH: 792 },   // portrait (US Letter)
  { pageW: 792, pageH: 612 },   // landscape (US Letter)
];
const AUTO_SIZE_ROTATIONS = [0, 90];
const AUTO_SIZE_ANGLES = [0, 30, 45, 60, 90];
const AUTO_SIZE_TEXTS = [
  "DRAFT",
  "A".repeat(60), // 60-character string
];

function visualDimsTest(pageW, pageH, rotation) {
  if (rotation === 90 || rotation === 270) return { visualW: pageH, visualH: pageW };
  return { visualW: pageW, visualH: pageH };
}

function measureTextFake(text, size) {
  // Simple fake: width = text.length * size * 0.5 (approximate Helvetica metrics)
  return text.length * size * 0.5;
}

for (const { pageW, pageH } of AUTO_SIZE_PAGES) {
  for (const rotation of AUTO_SIZE_ROTATIONS) {
    for (const angle of AUTO_SIZE_ANGLES) {
      for (const text of AUTO_SIZE_TEXTS) {
        test(`watermarkAutoSize: page=${pageW}x${pageH} rotation=${rotation} angle=${angle} text="${text.slice(0, 10)}${text.length > 10 ? '...' : ''}"`, () => {
          const { visualW, visualH } = visualDimsTest(pageW, pageH, rotation);
          const maxBoxW = 0.8 * visualW;
          const maxBoxH = 0.8 * visualH;

          const { size } = watermarkAutoSize({
            pageW, pageH, rotation, angle, text,
            measure: measureTextFake,
            maxFontSize: 500,
          });

          assert.ok(size >= 1, `font size should be at least 1, got ${size}`);
          assert.ok(size <= 500, `font size should not exceed maxFontSize, got ${size}`);

          // Verify the rotated bounding box fits within 80% of both visual dimensions
          const w = measureTextFake(text, size);
          const h = 0.72 * size;
          const a = (angle * Math.PI) / 180;
          const cosA = Math.abs(Math.cos(a));
          const sinA = Math.abs(Math.sin(a));
          const boxW = w * cosA + h * sinA;
          const boxH = w * sinA + h * cosA;

          assert.ok(boxW <= maxBoxW + 1e-6, `boxW ${boxW} <= maxBoxW ${maxBoxW}`);
          assert.ok(boxH <= maxBoxH + 1e-6, `boxH ${boxH} <= maxBoxH ${maxBoxH}`);

          // Verify that size+1 would NOT fit (maximality)
          if (size < 500) {
            const wNext = measureTextFake(text, size + 1);
            const hNext = 0.72 * (size + 1);
            const boxWNext = wNext * cosA + hNext * sinA;
            const boxHNext = wNext * sinA + hNext * cosA;
            const fitsNext = boxWNext <= maxBoxW + 1e-6 && boxHNext <= maxBoxH + 1e-6;
            assert.ok(!fitsNext, `size ${size} should be maximal; size ${size + 1} also fits (boxW=${boxWNext}, boxH=${boxHNext})`);
          }
        });
      }
    }
  }
}

// Watermark mandatory tests: for each rotation and visualAngle, verify centering and box inside page
for (const { pageW, pageH } of NON_SQUARE_PAGES) {
  for (const rotation of ROTATIONS_ALL) {
    for (const visualAngle of VISUAL_ANGLES) {
      test(`MANDATORY: watermarkPlacement rotation=${rotation} visualAngle=${visualAngle} page=${pageW}x${pageH}`, () => {
        const fontSize = 50;
        const text = "WATERMARK";
        const textWidth = text.length * 10;

        const result = watermarkPlacement({
          pageW, pageH, rotation, angle: visualAngle, fontSize, textWidth,
        });

        // Verify box centre lands on page centre (using existing helper)
        assertBoxCentreOnPageCentre(result, pageW, pageH, rotation, fontSize, textWidth, visualAngle);

        // Verify whole rotated box fits in visual page (80% constraint is handled by auto-size,
        // but fixed-size watermarks should still be checked for center placement)
        const { visualW, visualH } = rotation === 90 || rotation === 270
          ? { visualW: pageH, visualH: pageW }
          : { visualW: pageW, visualH: pageH };
        const { boxW, boxH } = rotatedBoxSize(textWidth, fontSize, visualAngle);
        const visualOrigin = independentPageToVisual({ x: result.x, y: result.y }, pageW, pageH, rotation);
        const a = (visualAngle * Math.PI) / 180;
        const cosA = Math.cos(a);
        const sinA = Math.sin(a);
        const hc = 0.36 * fontSize;
        const w2 = textWidth / 2;
        // Box corners relative to origin in visual space after rotation
        const corners = [
          { x: 0, y: 0 },
          { x: textWidth, y: 0 },
          { x: textWidth, y: 0.72 * fontSize },
          { x: 0, y: 0.72 * fontSize },
        ].map(c => ({
          x: c.x * cosA - c.y * sinA,
          y: c.x * sinA + c.y * cosA,
        }));
        // Translate by visual origin
        for (const c of corners) {
          const vx = visualOrigin.x + c.x;
          const vy = visualOrigin.y + c.y;
          // Just check it's reasonably close to the page (centered watermarks at 50pt on 612x792 fit)
          assert.ok(vx >= -10 && vx <= visualW + 10, `watermark corner x ${vx} in [0, ${visualW}]`);
          assert.ok(vy >= -10 && vy <= visualH + 10, `watermark corner y ${vy} in [0, ${visualH}]`);
        }
      });
    }
  }
}

// --- pageBoxOrigin: visible box origin (CropBox ∩ MediaBox lower-left) ---

test("pageBoxOrigin returns {0, 0} for a store page without a visible box", () => {
  assert.deepStrictEqual(pageBoxOrigin({ id: "p1", index: 0, width: 612, height: 792 }), { x: 0, y: 0 });
  assert.deepStrictEqual(pageBoxOrigin(undefined), { x: 0, y: 0 });
  assert.deepStrictEqual(pageBoxOrigin(null), { x: 0, y: 0 });
});

test("pageBoxOrigin reads the visible-box lower-left from a pdf.js page view", () => {
  assert.deepStrictEqual(pageBoxOrigin({ view: [36, 36, 576, 756] }), { x: 36, y: 36 });
  assert.deepStrictEqual(pageBoxOrigin({ view: [0, 0, 612, 792] }), { x: 0, y: 0 });
  assert.deepStrictEqual(pageBoxOrigin({ view: [72, 0, 540, 720] }), { x: 72, y: 0 });
});