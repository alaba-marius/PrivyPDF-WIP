// Image asset registry for the "Insert image" annotation feature.
// Processed image bytes are kept in a module-level registry keyed by assetId.
// Annotations store only the assetId (never the bytes), so undo snapshots
// stay small and the store never holds image data.

import { visualDims, pageToVisual, visualToPage } from "./overlay.js";

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB
const MAX_SIDE = 2000; // downscale longer side to 2000px
const JPEG_QUALITY = 0.9;

// File signature magic numbers (first bytes)
const SIG_PNG = [0x89, 0x50, 0x4e, 0x47];
const SIG_JPG = [0xff, 0xd8, 0xff];
const SIG_RIFF = [0x52, 0x49, 0x46, 0x46]; // "RIFF"
const SIG_WEBP = [0x57, 0x45, 0x42, 0x50]; // "WEBP" at offset 8

let assetIdCounter = 1;
const assets = new Map(); // assetId -> { assetId, mimeType, width, height, size, bytes, dataUrl }

export function resetAssetRegistry() {
  assetIdCounter = 1;
  for (const asset of assets.values()) {
    if (asset.dataUrl) URL.revokeObjectURL(asset.dataUrl);
  }
  assets.clear();
}

function newAssetId() {
  return `img${assetIdCounter++}`;
}

// Pure: scale dimensions so the longer side fits maxSide, preserving aspect.
export function computeScaledSize(width, height, maxSide = MAX_SIDE) {
  if (width <= maxSide && height <= maxSide) {
    return { width, height, scale: 1 };
  }
  const scale = Math.min(maxSide / width, maxSide / height);
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
    scale,
  };
}

// Pure: place an image centered on a click point, clamped inside the page.
// The click and the returned rect are in page space, but the placement box is
// computed in visual space (centered on the visual click, aspect preserved,
// width = min(30% of visual page width, natural width)) and then mapped to page
// space via visualToPage, so width/height swap at rotations 90/270 and the
// image stays upright under the page's /Rotate.
// clickX/clickY: page-space click point. naturalWidth/naturalHeight: decoded
// bitmap size in points (1pt = 1px at 72dpi). rotation: effective clockwise
// page rotation in {0, 90, 180, 270}. Returns {x, y, width, height} in page space.
export function computeImagePlacement(clickX, clickY, naturalWidth, naturalHeight, pageWidth, pageHeight, rotation = 0) {
  if (naturalWidth <= 0 || naturalHeight <= 0) {
    return { x: clickX, y: clickY, width: 0, height: 0 };
  }
  const r = rotation % 360;
  const { visualW, visualH } = visualDims(pageWidth, pageHeight, r);

  // Placement box in visual space, centered on the visual-space click.
  const maxW = visualW * 0.30;
  const placeW = Math.min(naturalWidth, maxW);
  const placeH = placeW * (naturalHeight / naturalWidth);

  const vClick = pageToVisual({ x: clickX, y: clickY }, pageWidth, pageHeight, r);
  let vx = vClick.x - placeW / 2;
  let vy = vClick.y - placeH / 2;
  // Clamp so the image stays fully inside the visual page.
  vx = Math.max(0, Math.min(vx, visualW - placeW));
  vy = Math.max(0, Math.min(vy, visualH - placeH));

  // Map the visual box's 4 corners to page space and take the bounding rect.
  const corners = [
    { x: vx, y: vy },
    { x: vx + placeW, y: vy },
    { x: vx + placeW, y: vy + placeH },
    { x: vx, y: vy + placeH },
  ].map((c) => visualToPage(c, pageWidth, pageHeight, r));

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of corners) {
    minX = Math.min(minX, c.x);
    minY = Math.min(minY, c.y);
    maxX = Math.max(maxX, c.x);
    maxY = Math.max(maxY, c.y);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

// Pure: detect image type from file signature bytes.
// Returns "png" | "jpg" | "webp" | null.
export function detectFileType(bytes) {
  if (!(bytes instanceof Uint8Array) && !(bytes instanceof ArrayBuffer)) return null;
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (u8.length < 12) return null;

  // PNG
  if (SIG_PNG.every((b, i) => u8[i] === b)) return "png";
  // JPEG
  if (SIG_JPG.every((b, i) => u8[i] === b)) return "jpg";
  // WebP: "RIFF" at 0, "WEBP" at 8
  if (
    SIG_RIFF.every((b, i) => u8[i] === b) &&
    SIG_WEBP.every((b, i) => u8[i + 8] === b)
  ) {
    return "webp";
  }
  return null;
}

// Check whether the decoded bitmap has any fully-transparent pixel.
// Samples a grid of pixels for speed; returns true if any sampled alpha < 255.
function hasAlpha(bitmap) {
  const sample = 32;
  const sw = Math.min(bitmap.width, sample);
  const sh = Math.min(bitmap.height, sample);
  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, sw, sh);
  const data = ctx.getImageData(0, 0, sw, sh).data;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 255) return true;
  }
  return false;
}

async function encodeBitmap(bitmap, format, quality) {
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0);
  const blob = await new Promise((resolve) => {
    canvas.toBlob(resolve, `image/${format}`, quality);
  });
  return new Uint8Array(await blob.arrayBuffer());
}

// Register a user-selected image file: validate, decode, downscale, re-encode,
// and store in the registry. Returns { assetId, mimeType, width, height, size }.
// Throws on invalid file, oversized file, or decode failure.
export async function registerAsset(file) {
  if (!file) throw new Error("No file provided");
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`Image too large (max ${Math.round(MAX_FILE_SIZE / 1024 / 1024)}MB)`);
  }

  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const detected = detectFileType(bytes);
  if (!detected) {
    throw new Error("Unsupported image format (PNG, JPG or WebP)");
  }

  // Decode via createImageBitmap (PNG, JPG, WebP all supported).
  const blob = new Blob([bytes], { type: file.type || `image/${detected}` });
  let bitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch (e) {
    throw new Error("Failed to decode image");
  }

  let { width, height } = bitmap;
  let sourceType = detected;

  // Downscale if the longer side exceeds MAX_SIDE.
  if (width > MAX_SIDE || height > MAX_SIDE) {
    const scaled = computeScaledSize(width, height, MAX_SIDE);
    width = scaled.width;
    height = scaled.height;
  }

  // Determine target format: PNG if transparency or source is PNG;
  // WebP with alpha -> PNG; WebP without alpha -> JPEG q0.9; JPEG -> JPEG q0.9.
  let targetFormat;
  if (sourceType === "png") {
    targetFormat = "png";
  } else if (sourceType === "webp") {
    targetFormat = hasAlpha(bitmap) ? "png" : "jpeg";
  } else {
    // jpg
    targetFormat = "jpeg";
  }

  let encodedBytes;
  let mimeType;
  if (targetFormat === "png") {
    encodedBytes = await encodeBitmap(bitmap, "png", 1);
    mimeType = "image/png";
  } else {
    encodedBytes = await encodeBitmap(bitmap, "jpeg", JPEG_QUALITY);
    mimeType = "image/jpeg";
  }

  // Recompute dimensions from the encoded bitmap (they're unchanged by encoding,
  // but width/height are properties of bitmap which still holds the decoded size).
  const assetId = newAssetId();
  const dataUrl = URL.createObjectURL(new Blob([encodedBytes], { type: mimeType }));
  const asset = {
    assetId,
    mimeType,
    width,
    height,
    size: encodedBytes.length,
    bytes: encodedBytes,
    dataUrl,
  };
  assets.set(assetId, asset);
  return { assetId, mimeType, width, height, size: encodedBytes.length };
}

export function getAsset(assetId) {
  return assets.get(assetId) || null;
}

// Register an image asset from raw bytes (for environments without
// createImageBitmap, e.g. Node tests). Stores the bytes as-is and exposes them
// via a data URL, mirroring the shape registerAsset produces.
export function registerRawBytes({ assetId, mimeType, width, height, bytes }) {
  if (!assetId) throw new Error("No assetId provided");
  if (!mimeType) throw new Error("No mimeType provided");
  const encodedBytes = new Uint8Array(bytes);
  const dataUrl = URL.createObjectURL(new Blob([encodedBytes], { type: mimeType }));
  const asset = { assetId, mimeType, width, height, size: encodedBytes.length, bytes: encodedBytes, dataUrl };
  assets.set(assetId, asset);
  return { assetId, mimeType, width, height, size: encodedBytes.length };
}

export function revokeAsset(assetId) {
  const asset = assets.get(assetId);
  if (asset) {
    if (asset.dataUrl) URL.revokeObjectURL(asset.dataUrl);
    assets.delete(assetId);
  }
}

// Number of registered assets (useful for tests)
export function assetCount() {
  return assets.size;
}
