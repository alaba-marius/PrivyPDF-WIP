// Annotate geometry: pure screen↔page coordinate conversion.
// Used by annotate.js for all pointer interactions.
// No zoom, no devicePixelRatio, no viewport — only the displayed canvas CSS rect.

import { visualToPage, pageToVisual, visualDims } from "./overlay.js";

/**
 * Convert screen coordinates (clientX, clientY) to page-space coordinates.
 * @param {Object} opts
 * @param {number} opts.clientX - Screen X (viewport-relative, origin top-left, y down)
 * @param {number} opts.clientY - Screen Y (viewport-relative, origin top-left, y down)
 * @param {Object} opts.canvasRect - Displayed canvas CSS rect { left, top, width, height } in CSS pixels
 * @param {number} opts.pageW - Unrotated page width in PDF points
 * @param {number} opts.pageH - Unrotated page height in PDF points
 * @param {number} opts.rotation - Effective rotation (0, 90, 180, 270) clockwise
 * @returns {{ x: number, y: number }} Page-space coordinates (origin bottom-left, y up)
 */
export function screenToPage({ clientX, clientY, canvasRect, pageW, pageH, rotation }) {
  // Canvas-relative coordinates (origin top-left, y down)
  const cx = clientX - canvasRect.left;
  const cy = clientY - canvasRect.top;

  // Visual page dimensions (points)
  const { visualW, visualH } = visualDims(pageW, pageH, rotation);

  // Scale from visual space (points) to canvas CSS pixels
  // Both dimensions should give the same scale (canvas is fitted, not stretched)
  const scale = canvasRect.width / visualW;

  // Convert to visual space (origin bottom-left, y up)
  // Canvas origin is top-left, so flip Y
  const vx = cx / scale;
  const vy = visualH - cy / scale;

  // Convert visual space to page space
  return visualToPage({ x: vx, y: vy }, pageW, pageH, rotation);
}

/**
 * Convert page-space coordinates to screen coordinates (clientX, clientY).
 * Inverse of screenToPage.
 * @param {Object} opts
 * @param {number} opts.x - Page-space X (origin bottom-left, y up)
 * @param {number} opts.y - Page-space Y (origin bottom-left, y up)
 * @param {Object} opts.canvasRect - Displayed canvas CSS rect { left, top, width, height } in CSS pixels
 * @param {number} opts.pageW - Unrotated page width in PDF points
 * @param {number} opts.pageH - Unrotated page height in PDF points
 * @param {number} opts.rotation - Effective rotation (0, 90, 180, 270) clockwise
 * @returns {{ clientX: number, clientY: number }} Screen coordinates (viewport-relative, origin top-left, y down)
 */
export function pageToScreen({ x, y, canvasRect, pageW, pageH, rotation }) {
  // Convert page space to visual space
  const { x: vx, y: vy } = pageToVisual({ x, y }, pageW, pageH, rotation);

  // Visual page dimensions
  const { visualW, visualH } = visualDims(pageW, pageH, rotation);

  // Scale from visual space (points) to canvas CSS pixels
  const scale = canvasRect.width / visualW;

  // Convert to canvas-relative (origin top-left, y down)
  const cx = vx * scale;
  const cy = (visualH - vy) * scale;

  // Convert to screen coordinates
  return {
    clientX: canvasRect.left + cx,
    clientY: canvasRect.top + cy,
  };
}

/**
 * Get the visual page dimensions for a given rotation.
 * Re-exported from overlay.js for convenience.
 */
export { visualDims };

/**
 * Convert screen coordinates to page space, taking page object and canvas rect directly.
 * Pure function for use by annotate.js and tests.
 * @param {Object} opts
 * @param {number} opts.clientX - Screen X (viewport-relative, origin top-left, y down)
 * @param {number} opts.clientY - Screen Y (viewport-relative, origin top-left, y down)
 * @param {Object} opts.canvasRect - Displayed canvas CSS rect { left, top, width, height } in CSS pixels
 * @param {Object} opts.page - Page object with width, height, baseRotation, rotated
 * @returns {{ x: number, y: number }} Page-space coordinates (origin bottom-left, y up)
 */
export function screenToPageFromPage({ clientX, clientY, canvasRect, page }) {
  const rotation = ((page.baseRotation || 0) + (page.rotated || 0)) % 360;
  return screenToPage({ clientX, clientY, canvasRect, pageW: page.width, pageH: page.height, rotation });
}

/**
 * Convert page space to screen coordinates, taking page object and canvas rect directly.
 * Pure function for use by annotate.js and tests.
 * @param {Object} opts
 * @param {number} opts.x - Page-space X (origin bottom-left, y up)
 * @param {number} opts.y - Page-space Y (origin bottom-left, y up)
 * @param {Object} opts.canvasRect - Displayed canvas CSS rect { left, top, width, height } in CSS pixels
 * @param {Object} opts.page - Page object with width, height, baseRotation, rotated
 * @returns {{ clientX: number, clientY: number }} Screen coordinates (viewport-relative, origin top-left, y down)
 */
export function pageToScreenFromPage({ x, y, canvasRect, page }) {
  const rotation = ((page.baseRotation || 0) + (page.rotated || 0)) % 360;
  return pageToScreen({ x, y, canvasRect, pageW: page.width, pageH: page.height, rotation });
}

/**
 * (right, down) unit vectors for each dir, in page space (origin bottom-left, y up).
 *   right: direction the mark's length runs (visual rightward / baseline axis).
 *   down : direction toward the visual bottom edge (the text-bottom side).
 * Mirrors MARKUP_DIR_VECTORS in annotations.js so this module stays self-contained.
 */
const MARKUP_DIR_VECTORS = {
  0:   { right: { x: 1, y: 0 }, down: { x: 0, y: -1 } },
  90:  { right: { x: 0, y: 1 }, down: { x: 1, y: 0 } },
  180: { right: { x: -1, y: 0 }, down: { x: 0, y: 1 } },
  270: { right: { x: 0, y: -1 }, down: { x: -1, y: 0 } },
};

// Apply the linear part of visualToPage to a visual unit vector, returning the
// resulting page-space unit vector. pageW/pageH only shift the translation,
// which cancels in the difference, so any non-degenerate size works.
function visualVectorToPage({ x: vx, y: vy }, pageW, pageH, rotation) {
  const origin = visualToPage({ x: 0, y: 0 }, pageW, pageH, rotation);
  const point = visualToPage({ x: vx, y: vy }, pageW, pageH, rotation);
  return { x: point.x - origin.x, y: point.y - origin.y };
}

/**
 * Direction (baseline axis) for a free-drag underline/strikethrough so the mark's
 * length runs along visual rightward (the visual bottom edge) at every effective
 * rotation. The dir is DERIVED from overlay.js visualToPage: map the visual
 * rightward and visual downward unit vectors to page space, then match the
 * (right, down) pair to the dir table — never assumed to equal the rotation.
 * @param {number} effectiveRotation - Effective rotation (0, 90, 180, 270) clockwise
 * @returns {number} The baseline direction to use for a free-drawn mark
 */
export function freeMarkDir(effectiveRotation) {
  const rotation = ((effectiveRotation % 360) + 360) % 360;
  const visualRight = visualVectorToPage({ x: 1, y: 0 }, 100, 100, rotation);
  const visualDown = visualVectorToPage({ x: 0, y: -1 }, 100, 100, rotation);
  for (const [dir, vec] of Object.entries(MARKUP_DIR_VECTORS)) {
    const d = Number(dir);
    if (vec.right.x === visualRight.x && vec.right.y === visualRight.y
        && vec.down.x === visualDown.x && vec.down.y === visualDown.y) {
      return d;
    }
  }
  return rotation;
}