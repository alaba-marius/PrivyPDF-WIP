// Image asset registry tests: pure helpers (computeScaledSize, detectFileType).
// registerAsset/getAsset are browser-only (createImageBitmap, URL) and are
// covered by the annotate view smoke test where the DOM is available.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeScaledSize,
  computeImagePlacement,
  detectFileType,
  registerRawBytes,
  getAsset,
  resetAssetRegistry,
  revokeAsset,
  assetCount,
} from "../js/core/image-assets.js";

test("computeScaledSize: no scaling needed when within maxSide", () => {
  assert.deepStrictEqual(computeScaledSize(1000, 800, 2000), {
    width: 1000,
    height: 800,
    scale: 1,
  });
});

test("computeScaledSize: scales down the longer side to maxSide", () => {
  const result = computeScaledSize(4000, 2000, 2000);
  assert.equal(result.width, 2000);
  assert.equal(result.height, 1000);
  assert.equal(result.scale, 0.5);
});

test("computeScaledSize: portrait image scales by height", () => {
  const result = computeScaledSize(1000, 4000, 2000);
  assert.equal(result.width, 500);
  assert.equal(result.height, 2000);
  assert.equal(result.scale, 0.5);
});

test("computeScaledSize: square image at maxSide", () => {
  assert.deepStrictEqual(computeScaledSize(2000, 2000, 2000), {
    width: 2000,
    height: 2000,
    scale: 1,
  });
});

test("computeScaledSize: small image not upscaled", () => {
  assert.deepStrictEqual(computeScaledSize(100, 100, 2000), {
    width: 100,
    height: 100,
    scale: 1,
  });
});

test("detectFileType: PNG signature", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(detectFileType(png), "png");
});

test("detectFileType: JPEG signature", () => {
  const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(detectFileType(jpg), "jpg");
});

test("detectFileType: WebP signature (RIFF at 0, WEBP at 8)", () => {
  const webp = new Uint8Array(12);
  webp[0] = 0x52; webp[1] = 0x49; webp[2] = 0x46; webp[3] = 0x46; // RIFF
  webp[8] = 0x57; webp[9] = 0x45; webp[10] = 0x42; webp[11] = 0x50; // WEBP
  assert.equal(detectFileType(webp), "webp");
});

test("detectFileType: returns null for unknown/short data", () => {
  assert.equal(detectFileType(new Uint8Array([1, 2, 3])), null);
  assert.equal(detectFileType(new Uint8Array([0x89, 0x50, 0x4e])), null); // truncated PNG
  assert.equal(detectFileType("not bytes"), null);
});

// approx helper for float results
const approx = (a, b) => Math.abs(a - b) < 1e-6;

test("computeImagePlacement: wide image clamped to 30% of page width, centered on click", () => {
  const r = computeImagePlacement(500, 500, 2000, 1000, 1000, 1000);
  // maxW = 300, natural wider -> placeW = 300, aspect 2:1 -> placeH = 150
  assert.ok(approx(r.width, 300), `width ${r.width}`);
  assert.ok(approx(r.height, 150), `height ${r.height}`);
  assert.ok(approx(r.x, 350), `x ${r.x}`);
  assert.ok(approx(r.y, 425), `y ${r.y}`);
});

test("computeImagePlacement: tall image uses min(30% page, natural), aspect preserved", () => {
  const r = computeImagePlacement(500, 500, 1000, 2000, 1000, 1000);
  // placeW = 300, aspect 1:2 -> placeH = 600
  assert.ok(approx(r.width, 300), `width ${r.width}`);
  assert.ok(approx(r.height, 600), `height ${r.height}`);
  assert.ok(approx(r.x, 350), `x ${r.x}`);
  assert.ok(approx(r.y, 200), `y ${r.y}`);
});

test("computeImagePlacement: square image at natural size when below 30% of page", () => {
  const r = computeImagePlacement(500, 500, 100, 100, 1000, 1000);
  // natural 100 < maxW 300 -> no upscale, placeW = placeH = 100
  assert.ok(approx(r.width, 100), `width ${r.width}`);
  assert.ok(approx(r.height, 100), `height ${r.height}`);
  assert.ok(approx(r.x, 450), `x ${r.x}`);
  assert.ok(approx(r.y, 450), `y ${r.y}`);
});

test("computeImagePlacement: centers image on the click point", () => {
  const r = computeImagePlacement(250, 300, 400, 400, 1000, 1000);
  // placeW = 300 (clamped), placeH = 300; center x = 250-150 = 100, y = 300-150 = 150
  assert.ok(approx(r.x, 100), `x ${r.x}`);
  assert.ok(approx(r.y, 150), `y ${r.y}`);
});

test("computeImagePlacement: clamps to right and bottom page edges", () => {
  const r = computeImagePlacement(950, 900, 2000, 1000, 1000, 1000);
  // placeW = 300, placeH = 150; raw x = 800 -> clamped to 700 (1000-300); raw y = 825 (not clamped, < 850)
  assert.ok(approx(r.x, 700), `x ${r.x}`);
  assert.ok(approx(r.y, 825), `y ${r.y}`);
  assert.ok(approx(r.x + r.width, 1000), "right edge at page width");
  assert.ok(approx(r.y + r.height, 975), "bottom inside page");
});

test("computeImagePlacement: clamps to left and top page edges", () => {
  const r = computeImagePlacement(50, 50, 2000, 1000, 1000, 1000);
  // raw x = 50-150 = -100 -> clamped to 0; raw y = 50-75 = -25 -> clamped to 0
  assert.ok(approx(r.x, 0), `x ${r.x}`);
  assert.ok(approx(r.y, 0), `y ${r.y}`);
});

test("computeImagePlacement: rotation-swapped page dims (90/270 visual width)", () => {
  // Portrait 612x792 page viewed at 90/270 has visual width 792; use 600x400 swapped dims for clean math.
  const r = computeImagePlacement(300, 200, 2000, 1000, 600, 400);
  // maxW = 180, placeW = 180, placeH = 90; center x = 300-90 = 210, y = 200-45 = 155
  assert.ok(approx(r.width, 180), `width ${r.width}`);
  assert.ok(approx(r.height, 90), `height ${r.height}`);
  assert.ok(approx(r.x, 210), `x ${r.x}`);
  assert.ok(approx(r.y, 155), `y ${r.y}`);
});

test("computeImagePlacement: zero-size natural returns zero rect", () => {
  const r = computeImagePlacement(10, 10, 0, 100, 1000, 1000);
  assert.deepStrictEqual(r, { x: 10, y: 10, width: 0, height: 0 });
});

// ===== Rotation-aware placement tests =====

// Portrait 612x792 page, click at page center, 200x100 natural image (aspect 2).
// Rotation 0: visualW=612, maxW=183.6 -> placeW=183.6, placeH=91.8, centered on click.
test("computeImagePlacement: rotation 0 keeps dims and centers on the click", () => {
  const r = computeImagePlacement(306, 396, 200, 100, 612, 792, 0);
  assert.ok(approx(r.x, 214.2), `x ${r.x}`);
  assert.ok(approx(r.y, 350.1), `y ${r.y}`);
  assert.ok(approx(r.width, 183.6), `width ${r.width}`);
  assert.ok(approx(r.height, 91.8), `height ${r.height}`);
});

// Rotation 90: visualW=792, visualH=612 -> width/height swap (placeW=200, placeH=100).
test("computeImagePlacement: rotation 90 swaps width/height and centers on visual click", () => {
  const r = computeImagePlacement(306, 396, 200, 100, 612, 792, 90);
  assert.ok(approx(r.x, 256), `x ${r.x}`);
  assert.ok(approx(r.y, 296), `y ${r.y}`);
  assert.ok(approx(r.width, 100), `width ${r.width}`);
  assert.ok(approx(r.height, 200), `height ${r.height}`);
});

// Rotation 180: same as rotation 0 for a centered click (symmetric).
test("computeImagePlacement: rotation 180 keeps dims and centers on the click", () => {
  const r = computeImagePlacement(306, 396, 200, 100, 612, 792, 180);
  assert.ok(approx(r.x, 214.2), `x ${r.x}`);
  assert.ok(approx(r.y, 350.1), `y ${r.y}`);
  assert.ok(approx(r.width, 183.6), `width ${r.width}`);
  assert.ok(approx(r.height, 91.8), `height ${r.height}`);
});

// Rotation 270: width/height swap like rotation 90.
test("computeImagePlacement: rotation 270 swaps width/height and centers on visual click", () => {
  const r = computeImagePlacement(306, 396, 200, 100, 612, 792, 270);
  assert.ok(approx(r.x, 256), `x ${r.x}`);
  assert.ok(approx(r.y, 296), `y ${r.y}`);
  assert.ok(approx(r.width, 100), `width ${r.width}`);
  assert.ok(approx(r.height, 200), `height ${r.height}`);
});

test("computeImagePlacement: rotation 90 clamps to the visual page edges", () => {
  // Click near a visual edge on a portrait page at 90 (page y near the top
  // maps to visual x near visualW). The stored page-space rect must stay in-bounds.
  const r = computeImagePlacement(300, 780, 400, 400, 612, 792, 90);
  // visualW=792, visualH=612; maxW=237.6 -> placeW=placeH=237.6
  assert.ok(approx(r.width, 237.6), `width ${r.width}`);
  assert.ok(approx(r.height, 237.6), `height ${r.height}`);
  assert.ok(r.x >= 0 && r.y >= 0, "not clamped negative");
  assert.ok(approx(r.y + r.height, 792), "visual right edge maps to page bottom edge");
});

test("computeImagePlacement: stored rect stays within the page at every rotation", () => {
  for (const rot of [0, 90, 180, 270]) {
    const r = computeImagePlacement(300, 400, 400, 400, 612, 792, rot);
    assert.ok(r.x >= 0 && r.y >= 0, `rot ${rot}: not negative`);
    assert.ok(r.x + r.width <= 612 + 1e-6, `rot ${rot}: right within page width`);
    assert.ok(r.y + r.height <= 792 + 1e-6, `rot ${rot}: bottom within page height`);
    assert.ok(r.width > 0 && r.height > 0, `rot ${rot}: non-degenerate`);
  }
});


// ===== registerRawBytes tests (Node-safe, no createImageBitmap needed) =====

test("registerRawBytes: stores asset and returns minimal info", () => {
  resetAssetRegistry();
  const bytes = new Uint8Array([1, 2, 3, 4]);
  const result = registerRawBytes({
    assetId: "img1",
    mimeType: "image/png",
    width: 100,
    height: 200,
    bytes,
  });

  assert.equal(result.assetId, "img1");
  assert.equal(result.mimeType, "image/png");
  assert.equal(result.width, 100);
  assert.equal(result.height, 200);
  assert.equal(result.size, 4);

  const asset = getAsset("img1");
  assert.ok(asset, "Asset should be retrievable");
  assert.equal(asset.mimeType, "image/png");
  assert.equal(asset.width, 100);
  assert.equal(asset.height, 200);
  assert.ok(asset.bytes instanceof Uint8Array);
  assert.ok(asset.dataUrl, "dataUrl should be set");
  assert.equal(assetCount(), 1);
});

test("registerRawBytes: throws on missing assetId", () => {
  resetAssetRegistry();
  assert.throws(
    () => registerRawBytes({ mimeType: "image/png", width: 10, height: 10, bytes: new Uint8Array() }),
    /No assetId provided/
  );
});

test("registerRawBytes: throws on missing mimeType", () => {
  resetAssetRegistry();
  assert.throws(
    () => registerRawBytes({ assetId: "img1", width: 10, height: 10, bytes: new Uint8Array() }),
    /No mimeType provided/
  );
});

test("registerRawBytes: accepts image/jpeg and image/png mime types", () => {
  resetAssetRegistry();
  const jpg = registerRawBytes({
    assetId: "img-jpg",
    mimeType: "image/jpeg",
    width: 50,
    height: 50,
    bytes: new Uint8Array([0xff, 0xd8, 0xff]),
  });
  assert.equal(jpg.mimeType, "image/jpeg");

  const png = registerRawBytes({
    assetId: "img-png",
    mimeType: "image/png",
    width: 50,
    height: 50,
    bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
  });
  assert.equal(png.mimeType, "image/png");
  assert.equal(assetCount(), 2);
});

test("registerRawBytes: bytes are stored as Uint8Array copy", () => {
  resetAssetRegistry();
  const source = new Uint8Array([10, 20, 30]);
  registerRawBytes({ assetId: "img-copy", mimeType: "image/png", width: 1, height: 1, bytes: source });
  const asset = getAsset("img-copy");
  assert.ok(asset.bytes instanceof Uint8Array);
  assert.deepStrictEqual([...asset.bytes], [10, 20, 30]);
  // Mutating the source should not affect the stored asset
  source[0] = 99;
  assert.equal(getAsset("img-copy").bytes[0], 10);
});

test("registerRawBytes: revokeAsset removes the asset", () => {
  resetAssetRegistry();
  registerRawBytes({ assetId: "img-revoked", mimeType: "image/png", width: 1, height: 1, bytes: new Uint8Array() });
  assert.equal(assetCount(), 1);
  revokeAsset("img-revoked");
  assert.equal(assetCount(), 0);
  assert.equal(getAsset("img-revoked"), null);
});

test("registerRawBytes: resetAssetRegistry clears all assets", () => {
  resetAssetRegistry();
  registerRawBytes({ assetId: "img-a", mimeType: "image/png", width: 1, height: 1, bytes: new Uint8Array() });
  registerRawBytes({ assetId: "img-b", mimeType: "image/png", width: 1, height: 1, bytes: new Uint8Array() });
  assert.equal(assetCount(), 2);
  resetAssetRegistry();
  assert.equal(assetCount(), 0);
});
