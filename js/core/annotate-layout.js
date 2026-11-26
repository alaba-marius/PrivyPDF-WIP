// Pure functions for in-page Annotate view layout.
// No DOM, no side effects — used by annotate-view.js and tests.

import { visualDims, visualToPage, pageToVisual } from "./overlay.js";

// Re-export the core rotation math from overlay.js
export { visualDims, visualToPage, pageToVisual };

/**
 * Convert a page-space rectangle to its screen bounding box.
 * Converts all 4 corners of the page-space rect to screen coordinates and
 * returns the bounding box, so width/height are always positive (even at
 * rotations 180/270 where pageToScreenForBlock flips the Y axis and a
 * naive top-left/bottom-right delta collapses to a negative size).
 * @param {number} pageX - Page-space X (bottom-left origin, y up)
 * @param {number} pageY - Page-space Y
 * @param {number} width - Page-space width
 * @param {number} height - Page-space height
 * @param {Object} block - The page block from computePageLayout
 * @param {Object} canvasRect - The canvas getBoundingClientRect()
 * @returns {{ left, top, right, bottom, width, height }|null} Screen bounding box, or null
 */
export function pageRectToScreen(pageX, pageY, width, height, block, canvasRect) {
  const corners = [
    { x: pageX, y: pageY },
    { x: pageX + width, y: pageY },
    { x: pageX + width, y: pageY + height },
    { x: pageX, y: pageY + height },
  ];
  const screens = corners.map((c) =>
    pageToScreenForBlock(c.x, c.y, block, canvasRect)
  ).filter(Boolean);
  if (screens.length < 4) return null;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of screens) {
    minX = Math.min(minX, s.clientX);
    minY = Math.min(minY, s.clientY);
    maxX = Math.max(maxX, s.clientX);
    maxY = Math.max(maxY, s.clientY);
  }
  return {
    left: minX,
    top: minY,
    right: maxX,
    bottom: maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Compute layout for all pages at a given zoom.
 * Returns block offsets (top positions) and total height.
 * @param {Array} pages - Array of page objects with { id, width, height, baseRotation, rotated }
 * @param {number} zoom - Current zoom level (CSS pixels per PDF point)
 * @param {number} gap - Vertical gap between pages in CSS pixels
 * @returns {Object} { blocks: Array<{ id, top, height, visualW, visualH, rotation }>, totalHeight }
 */
export function computePageLayout(pages, zoom, gap = 24) {
  const blocks = [];
  let top = gap; // Start with gap from top

  for (const page of pages) {
    const rotation = ((page.baseRotation || 0) + (page.rotated || 0)) % 360;
    const { visualW, visualH } = visualDims(page.width, page.height, rotation);

    // Canvas CSS size at current zoom
    const canvasW = visualW * zoom;
    const canvasH = visualH * zoom;

    blocks.push({
      id: page.id,
      top,
      height: canvasH,
      pageW: page.width,
      pageH: page.height,
      visualW,
      visualH,
      rotation,
    });

    top += canvasH + gap;
  }

  return { blocks, totalHeight: top };
}

/**
 * Find which page is most visible in the scroll container.
 * @param {Array} blocks - From computePageLayout
 * @param {number} scrollTop - Current scroll position
 * @param {number} viewportHeight - Height of scroll container
 * @returns {Object|null} { pageId, index, visibility } or null
 */
export function findCurrentPage(blocks, scrollTop, viewportHeight) {
  if (!blocks.length) return null;

  let best = null;
  let bestVisibility = -1;

  const viewBottom = scrollTop + viewportHeight;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const blockBottom = block.top + block.height;

    // Intersection with viewport
    const intersectTop = Math.max(block.top, scrollTop);
    const intersectBottom = Math.min(blockBottom, viewBottom);
    const visibleHeight = Math.max(0, intersectBottom - intersectTop);
    const visibility = visibleHeight / block.height;

    if (visibility > bestVisibility) {
      bestVisibility = visibility;
      best = { pageId: block.id, index: i, visibility };
    }
  }

  return best;
}

/**
 * Determine which page blocks are within the render window (visible + buffer).
 * @param {Array} blocks - From computePageLayout
 * @param {number} scrollTop - Current scroll position
 * @param {number} viewportHeight - Height of scroll container
 * @param {number} buffer - Extra screens to render ahead/behind (default 1.5)
 * @returns {Array<number>} Indices of blocks to render
 */
export function getRenderWindow(blocks, scrollTop, viewportHeight, buffer = 1.5) {
  if (!blocks.length) return [];

  const viewTop = scrollTop - viewportHeight * buffer;
  const viewBottom = scrollTop + viewportHeight * (1 + buffer);

  const indices = [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const blockBottom = block.top + block.height;
    if (blockBottom >= viewTop && block.top <= viewBottom) {
      indices.push(i);
    }
  }

  return indices;
}

/**
 * Convert screen coordinates to page-space for a specific page block.
 * @param {number} clientX - Screen X
 * @param {number} clientY - Screen Y
 * @param {Object} block - The page block from computePageLayout
 * @param {Object} canvasRect - The canvas getBoundingClientRect()
 * @returns {{ x, y }} Page-space coordinates (origin bottom-left, y up)
 */
export function screenToPageForBlock(clientX, clientY, block, canvasRect) {
  // Canvas-relative coordinates (origin top-left, y down)
  const cx = clientX - canvasRect.left;
  const cy = clientY - canvasRect.top;

  // Visual page dimensions (points)
  const { visualW, visualH } = { visualW: block.visualW, visualH: block.visualH };

  // Scale from visual space (points) to canvas CSS pixels
  const scale = canvasRect.width / visualW;

  // Convert to visual space (origin bottom-left, y up)
  // Canvas origin is top-left, so flip Y
  const vx = cx / scale;
  const vy = visualH - cy / scale;

  // Convert visual space to page space
  // visualToPage expects unrotated page dimensions (pageW, pageH)
  return visualToPage({ x: vx, y: vy }, block.pageW, block.pageH, block.rotation);
}

/**
 * Convert page-space coordinates to screen coordinates for a specific page block.
 * @param {number} pageX - Page-space X
 * @param {number} pageY - Page-space Y
 * @param {Object} block - The page block from computePageLayout (must have pageW, pageH, visualW, visualH, rotation)
 * @param {Object} canvasRect - The canvas getBoundingClientRect()
 * @returns {{ clientX, clientY }} Screen coordinates
 */
export function pageToScreenForBlock(pageX, pageY, block, canvasRect) {
  // Convert page space to visual space
  // pageToVisual expects unrotated page dimensions (pageW, pageH)
  const { x: vx, y: vy } = pageToVisual({ x: pageX, y: pageY }, block.pageW, block.pageH, block.rotation);

  // Visual page dimensions
  const { visualW, visualH } = { visualW: block.visualW, visualH: block.visualH };

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