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