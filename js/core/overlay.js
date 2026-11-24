// Overlay geometry for page numbers and watermarks on rotated pages.
//
// PDF spec: /Rotate turns the page contents clockwise when displayed.
// pdf-lib's drawText({ rotate: degrees(t) }) rotates COUNTERCLOCKWISE by t
// (positive angles turn the text counterclockwise), exactly like a PDF text
// matrix [cos t, sin t, -sin t, cos t].
// So a mark that must look upright on a page rotated R° clockwise is drawn
// rotated (visualAngle + R) mod 360 — the CCW angle that cancels /Rotate.
// (visualAngle is counter-clockwise: 0 = upright label, 45 = rising watermark.)
//
// Coordinate spaces:
// - Page space: PDF user space, origin bottom-left, y up.
// - Visual space: what the viewer shows, origin bottom-left, y up.
//   (This is the page space rotated by R° clockwise, then re-anchored so
//   the visual bottom-left is at the page's visual bottom-left corner.)
//
// For a page with unrotated mediabox size W × H and effective rotation
// r ∈ {0, 90, 180, 270} (clockwise, as the PDF /Rotate entry):
//   Visual size: VW = W, VH = H for r = 0, 180; VW = H, VH = W for r = 90, 270.
//
// Visual → Page space for a text origin (baseline start, y up in both):
//   r = 0:   px = vx,              py = vy
//   r = 90:  px = W - vy,           py = vx
//   r = 180: px = W - vx,           py = H - vy
//   r = 270: px = vy,               py = H - vx

export const DEFAULT_MARGIN = 36; // half an inch from the visual edge

export const LABEL_POSITIONS = [
  "top-left", "top-center", "top-right",
  "bottom-left", "bottom-center", "bottom-right",
];

// Visual size for a given rotation.
function visualDims(pageW, pageH, rotation) {
  if (rotation === 90 || rotation === 270) return { visualW: pageH, visualH: pageW };
  return { visualW: pageW, visualH: pageH };
}

// Visual anchor (vx, vy) in visual space (origin bottom-left, y up).
// position: one of LABEL_POSITIONS.
// textWidth: width of the text in points.
// margin: distance from the visual edge in points (8-72).
// fontSize: font size in points (used for baseline offset from top).
function visualAnchor({ position, visualW, visualH, textWidth, margin, fontSize }) {
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

// Convert visual coordinates (origin bottom-left, y up) to page space
// (origin bottom-left, y up) for a page with effective rotation r.
export function visualToPage({ x: vx, y: vy }, pageW, pageH, rotation) {
  switch (rotation) {
    case 0:   return { x: vx,                y: vy };
    case 90:  return { x: pageW - vy,        y: vx };
    case 180: return { x: pageW - vx,        y: pageH - vy };
    case 270: return { x: vy,                y: pageH - vx };
    default:  return { x: vx,                y: vy };
  }
}

// Inverse transform: page space → visual space. Used by tests only.
export function pageToVisual({ x: px, y: py }, pageW, pageH, rotation) {
  switch (rotation) {
    case 0:   return { x: px,                y: py };
    case 90:  return { x: py,                y: pageW - px };
    case 180: return { x: pageW - px,        y: pageH - py };
    case 270: return { x: pageH - py,        y: px };
    default:  return { x: px,                y: py };
  }
}

// Place a single line of text at a visual anchor on a page rotated
// `rotation` degrees clockwise. Returns page-space x, y (baseline start,
// y up) and the pdf-lib drawText rotate angle (counter-clockwise degrees)
// that makes the text appear at visualAngle in visual space.
export function placeLabel({ position, pageW, pageH, rotation, fontSize, textWidth, margin = DEFAULT_MARGIN, visualAngle = 0 }) {
  const { visualW, visualH } = visualDims(pageW, pageH, rotation);
  const { vx, vy } = visualAnchor({ position, visualW, visualH, textWidth, margin, fontSize });
  const page = visualToPage({ x: vx, y: vy }, pageW, pageH, rotation);

  // pdf-lib rotate is COUNTERCLOCKWISE. To appear at visualAngle (CCW) in
  // visual space, the total CCW rotation is visualAngle + rotation.
  const rotateDegrees = (visualAngle + rotation) % 360;

  return { x: page.x, y: page.y, rotateDegrees };
}

// Centre a watermark of `textWidth × fontSize` on the page, angled
// `visualAngle` degrees counter-clockwise relative to the visual page.
// Returns page-space origin (x, y) and pdf-lib counter-clockwise rotation.
//
// The text box (before rotation) has width = textWidth, cap height ≈ 0.72 * fontSize.
// Half cap height for baseline-centre offset: hc = 0.36 * fontSize.
// Box centre relative to text origin (baseline start, y up): (w/2, hc).
// After rotating the box by visualAngle (counter-clockwise) about the origin,
// the centre moves to (w/2 cos a - hc sin a, w/2 sin a + hc cos a) in visual space.
// We want the box centre at the visual centre (VW/2, VH/2), so the text origin
// in visual space is:
//   vx = VW/2 - (w/2 cos a - hc sin a)
//   vy = VH/2 - (w/2 sin a + hc cos a)
// Then convert to page space and compute pdf-lib rotation (CCW = visualAngle + rotation).
export function watermarkPlacement({ pageW, pageH, rotation, angle, fontSize, textWidth }) {
  const { visualW, visualH } = visualDims(pageW, pageH, rotation);

  // visualAngle is counter-clockwise (0 = upright in visual space).
  const visualAngle = angle; // already counter-clockwise per spec

  // pdf-lib rotate is counter-clockwise. Total CCW rotation = visualAngle + rotation.
  const rotateDegrees = (visualAngle + rotation) % 360;

  const a = (visualAngle * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const hc = 0.36 * fontSize;
  const w2 = textWidth / 2;

  // Box centre offset from text origin in visual space after rotation by visualAngle (CCW).
  const cx = w2 * cos - hc * sin;
  const cy = w2 * sin + hc * cos;

  // Visual origin so box centre lands at visual centre.
  const vx = visualW / 2 - cx;
  const vy = visualH / 2 - cy;

  const page = visualToPage({ x: vx, y: vy }, pageW, pageH, rotation);

  return { x: page.x, y: page.y, rotateDegrees };
}

// Watermark auto-size: find the largest integer fontSize such that the
// ROTATED bounding box fits within 80% of BOTH visual dimensions.
// Box: boxW = w*|cos a| + h*|sin a|, boxH = w*|sin a| + h*|cos a|
// where w = measure(text, size), h = 0.72 * size.
// Visual size swaps width and height for rotation 90/270.
export function watermarkAutoSize({ pageW, pageH, rotation, angle, text, measure, maxFontSize = 500 }) {
  const { visualW, visualH } = visualDims(pageW, pageH, rotation);
  const maxBoxW = 0.8 * visualW;
  const maxBoxH = 0.8 * visualH;
  const a = (angle * Math.PI) / 180;
  const cosA = Math.abs(Math.cos(a));
  const sinA = Math.abs(Math.sin(a));

  // Binary search for the largest font size that fits.
  let lo = 1;
  let hi = maxFontSize;
  let best = 1;

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const w = measure(text, mid);
    const h = 0.72 * mid;
    const boxW = w * cosA + h * sinA;
    const boxH = w * sinA + h * cosA;

    if (boxW <= maxBoxW && boxH <= maxBoxH) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return { size: best };
}

// Allowed watermark characters: Latin letters, digits, spaces and common
// punctuation. Anything else (emoji, symbols, scripts) is rejected so
// Helvetica (a single-byte font) never draws a .notdef box.
const WATERMARK_CHARS = /^[A-Za-z0-9 .,!?':;()&@\-]+$/;

export function validateWatermark(text) {
  if (!text || !text.trim()) return undefined; // empty means "no watermark"
  if (text.length > 60) return "Watermark text is too long (maximum 60 characters).";
  if (!WATERMARK_CHARS.test(text)) return "Use Latin letters, digits and common punctuation only.";
  return undefined;
}

export function formatPageNumber(n, total, format) {
  switch (format) {
    case "n": return String(n);
    case "page-n": return `Page ${n}`;
    case "n-of-total": return `${n} / ${total}`;
    case "page-of-total": return `Page ${n} of ${total}`;
    default: return String(n);
  }
}