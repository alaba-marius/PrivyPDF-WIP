// In-page Annotate view: vertical scroll of all pages with annotation tools.
// Opens as a mode within editor.html (not a modal). All coordinates in unrotated page space.

import { hydrateIcons } from "../icons.js";
import { getSource } from "../core/sources.js";
import { registerAsset, getAsset, computeImagePlacement } from "../core/image-assets.js";
import {
  computePageLayout,
  findCurrentPage,
  getRenderWindow,
  screenToPageForBlock,
  pageToScreenForBlock,
  pageRectToScreen,
  visualToPage,
  pageToVisual,
  visualDims,
} from "../core/annotate-layout.js";
import { commitTextDraft } from "../core/annotation-commit.js";
import {
  addAnnotation,
  updateAnnotation,
  deleteAnnotation,
  nudgeAnnotation as coreNudgeAnnotation,
  getAnnotationCount,
  getPageAnnotations,
  createTextAnnotation,
  createHighlightAnnotation,
  createImageAnnotation,
  DEFAULT_TEXT_FONT_SIZE,
  DEFAULT_TEXT_COLOR,
  DEFAULT_HIGHLIGHT_COLOR,
  DEFAULT_HIGHLIGHT_OPACITY,
  DEFAULT_IMAGE_OPACITY,
  validateTextForHelvetica,
  annotationDefaultsFromState,
} from "../core/annotations.js";

const TOOLS = ["select", "text", "highlight", "image"];
const TEXT_PRESET_SIZES = [8, 10, 12, 14, 16, 18, 24, 36, 48, 72];
const TEXT_PRESET_COLORS = [
  "#000000", "#ffffff", "#ff0000", "#0066ff", "#00aa00", "#ff8800", "#aa00aa", "#00aaaa",
];
const HIGHLIGHT_PRESET_COLORS = [
  "#ffe14d", "#ffcccc", "#ccffcc", "#ccccff", "#ffffcc", "#ffccff", "#ccffff",
];

// CSS classes for the annotate view
const ANNOTATE_VIEW_HTML = `
<div class="annotate-view" id="annotate-view" role="region" aria-label="Annotate pages" hidden>
  <div class="annotate-top-bar" role="toolbar" aria-label="Annotation tools">
    <span class="annotate-title">Annotate</span>
    <span class="annotate-page-indicator" id="annotate-page-indicator">Page 1 of 1</span>
    <button class="ds-btn ds-btn--sm ds-btn--outline annotate-undo" id="annotate-undo" aria-label="Undo"><i data-icon="rotate-ccw"></i></button>
    <button class="ds-btn ds-btn--sm ds-btn--outline annotate-redo" id="annotate-redo" aria-label="Redo"><i data-icon="rotate-cw"></i></button>
    <div class="annotate-zoom" id="annotate-zoom-controls">
      <button class="ds-icon-btn" id="annotate-zoom-out" aria-label="Zoom out"><i data-icon="minus"></i></button>
      <span id="annotate-zoom-level">100%</span>
      <button class="ds-icon-btn" id="annotate-zoom-in" aria-label="Zoom in"><i data-icon="plus"></i></button>
      <button class="ds-btn ds-btn--sm ds-btn--outline" id="annotate-zoom-fit" aria-label="Fit width">Fit width</button>
    </div>
    <button class="ds-btn ds-btn--sm ds-btn--primary annotate-done" id="annotate-done" aria-label="Done annotating"><i data-icon="check"></i><span>Done</span></button>
  </div>

  <!-- Floating tool palette: positioned by JS at the left edge of the page area,
       next to the rail's Annotate item. Becomes a horizontal bar under 900px. -->
  <div class="annotate-tool-palette" id="annotate-tool-palette" role="toolbar" aria-label="Annotation tools">
    <button class="annotate-palette-btn annotate-tool" data-tool="select" aria-pressed="true" title="Select (V)"><i data-icon="mouse-pointer-2"></i></button>
    <button class="annotate-palette-btn annotate-tool" data-tool="text" aria-pressed="false" title="Text (T)"><i data-icon="type"></i></button>
    <button class="annotate-palette-btn annotate-tool" data-tool="highlight" aria-pressed="false" title="Highlight (H)"><i data-icon="highlighter"></i></button>
    <button class="annotate-palette-btn annotate-tool" data-tool="image" aria-pressed="false" title="Insert image (I)"><i data-icon="image"></i></button>
  </div>

  <div class="annotate-pages-wrap" id="annotate-pages-wrap">
    <div class="annotate-pages" id="annotate-pages"></div>
  </div>
</div>
`;

// Pure: viewport-relative `top` for the tool palette so the Text button's
// center lines up with the Annotate rail item's center. `textButtonOffsetTop`
// and `textButtonHeight` are measured against the palette (its offsetParent
// once the palette is position: fixed).
export function paletteTopForTextButton(railRect, textButtonOffsetTop, textButtonHeight) {
  return railRect.top + railRect.height / 2 - (textButtonOffsetTop + textButtonHeight / 2);
}

export function mountAnnotateView(root, opts = {}) {
  const { getState, getSource, updateAnnotations, onDone } = opts;

  // Insert the annotate view into the document
  const container = document.createElement("div");
  container.innerHTML = ANNOTATE_VIEW_HTML;
  const view = container.firstElementChild;
  root.appendChild(view);
  hydrateIcons(view);

  // State
  let currentTool = "select";
  let selectedAnnotationId = null;
  let selectedPageId = null; // The page containing the selected annotation
  let currentPageId = null; // The page most visible in the scroll area
  let isDragging = false;
  let dragStart = { x: 0, y: 0 };
  let dragStartPage = { x: 0, y: 0 }; // page-space point where the drag started
  let dragAnnotationStart = { x: 0, y: 0 };
  let isDrawingHighlight = false;
  let highlightStart = { x: 0, y: 0 };
  let highlightPageId = null;
  // Image annotation drag/resize state
  let isDraggingImage = false;
  let isResizingImage = false;
  let imageDragStart = { x: 0, y: 0 }; // page-space anchor where drag started
  let imageDragStartPos = { x: 0, y: 0 }; // annotation's original position at drag start
  let imageDragOffset = { x: 0, y: 0 }; // accumulated offset during drag (committed on pointerup)
  let imageResizeStart = { x: 0, y: 0, width: 0, height: 0 };
  let imageResizeCorner = null; // "nw" | "ne" | "sw" | "se"
  let imagePageId = null;
  let textInput = null;
  let zoom = 1; // Will be set to fit-width zoom on enter()
  let pdfjsDoc = null;

  // Publish selection to store (single function for all selection changes)
  function publishSelection() {
    const store = opts.store;
    if (store && store.patch) {
      store.patch({
        annotateSelectedAnnotationId: selectedAnnotationId,
        annotateSelectedPageId: selectedPageId,
      });
    }
  }

  // Publish annotate view state to the store (single function for all annotate
  // state changes, next to publishSelection). Only called where a value can
  // actually change, so the view's own store subscriber never loops on it.
  function publishAnnotateState() {
    const store = opts.store;
    if (store && store.patch) {
      store.patch({
        annotateCurrentTool: currentTool,
        annotateCurrentPageId: currentPageId,
      });
    }
  }
  let pageCanvases = new Map(); // pageId -> { canvas, ctx, page, viewport, renderTask, block, wrapper, hasBitmap, renderChain, renderGeneration }
  let layout = { blocks: [], totalHeight: 0 };
  let resizeHandler = null;
  let scrollHandler = null;
  let paletteResizeObserver = null;
  let intersectionObserver = null;
  let documentKeyDownHandler = null; // Document-level Delete/Backspace handler (added in enter, removed in cleanup)
  let pendingTextInput = null; // For deferred text input creation
  let isCommittingText = false; // Recursion guard for commitTextInput

  // Configurable constants
  const MAX_LIVE_CANVASES = 8;
  const RENDER_BUFFER = 1.5; // screens to render ahead/behind

  // Elements
  const $ = (id) => view.querySelector(`#${id}`);
  const pagesWrap = $("annotate-pages-wrap");
  const pagesEl = $("annotate-pages");
  const pageIndicator = $("annotate-page-indicator");
  const doneBtn = $("annotate-done");
  const hintEl = null; // We'll use the panel hint instead
  const zoomLevelEl = $("annotate-zoom-level");
  const zoomInBtn = $("annotate-zoom-in");
  const zoomOutBtn = $("annotate-zoom-out");
  const zoomFitBtn = $("annotate-zoom-fit");
  const undoBtn = $("annotate-undo");
  const redoBtn = $("annotate-redo");

  // Tool palette (floating) + its buttons
  const palette = view.querySelector("#annotate-tool-palette");
  const paletteButtons = view.querySelectorAll(".annotate-tool");

  function updateToolButtons() {
    paletteButtons.forEach((btn) => {
      const isActive = btn.dataset.tool === currentTool;
      btn.setAttribute("aria-pressed", String(isActive));
      btn.classList.toggle("annotate-palette-btn--active", isActive);
    });
    // Update undo/redo button states
    if (undoBtn) undoBtn.disabled = !opts.store?.canUndo?.();
    if (redoBtn) redoBtn.disabled = !opts.store?.canRedo?.();

    // If selected annotation was removed (e.g., by undo/redo) or its page no longer exists, clear selection
    if (selectedAnnotationId && selectedPageId) {
      const state = getState();
      const pageExists = state.pages.some((p) => p.id === selectedPageId);
      if (!pageExists) {
        selectedAnnotationId = null;
        selectedPageId = null;
        publishSelection();
      } else {
        const anns = getPageAnnotations(state.annotations || {}, selectedPageId);
        if (!anns.some((a) => a.id === selectedAnnotationId)) {
          selectedAnnotationId = null;
          selectedPageId = null;
          publishSelection();
        }
      }
    }
  }

  function setTool(tool) {
    if (!TOOLS.includes(tool)) return;
    cancelTextInput();
    // Keep an existing selection when switching to the select tool (e.g. right
    // after placing an image, so it can be dragged immediately). Clear the
    // selection for any other tool change.
    if (selectedAnnotationId && tool !== "select") {
      selectedAnnotationId = null;
      selectedPageId = null;
      publishSelection();
    }
    currentTool = tool;
    updateToolButtons();
    renderAllOverlays();
    publishAnnotateState();
  }

  function cancelTextInput() {
    if (textInput) {
      textInput.remove();
      textInput = null;
      renderAllOverlays();
    }
    pendingTextInput = null;
  }

  // Open a file picker limited to images and return the selected File (or null).
  function pickImageFile() {
    let resolveFile = null;
    const promise = new Promise((res) => { resolveFile = res; });
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp";
    input.style.display = "none";
    document.body.appendChild(input);
    input.onchange = () => resolveFile(input.files?.[0] ?? null);
    input.oncancel = () => resolveFile(null);
    input.click();
    document.body.removeChild(input);
    return promise;
  }

  function commitTextInput() {
    if (!textInput || isCommittingText) return;
    isCommittingText = true;
    try {
      const text = textInput.value.trim();
      const annotationId = textInput.dataset.annotationId;

      // Read draft from textarea element
      const draftPageX = textInput.dataset.draftPageX ? Number(textInput.dataset.draftPageX) : null;
      const draftPageY = textInput.dataset.draftPageY ? Number(textInput.dataset.draftPageY) : null;
      const draftPageId = textInput.dataset.draftPageId || null;

      // Get text defaults from store state
      const state = getState();
      const textDefaults = annotationDefaultsFromState(state, "text");

      // Use pure commitTextDraft to determine the action
      const action = commitTextDraft({
        draft: { pageX: draftPageX, pageY: draftPageY, pageId: draftPageId },
        text,
        annotationId,
        defaults: { fontSize: textDefaults.fontSize, color: textDefaults.color },
      });

      if (action) {
        updateAnnotations(action);
        // If creating new annotation, select it
        if (!annotationId && draftPageId) {
          const pageAnns = getPageAnnotations(getState().annotations || {}, draftPageId);
          selectedAnnotationId = pageAnns[pageAnns.length - 1]?.id;
          selectedPageId = draftPageId;
        } else if (annotationId) {
          selectedAnnotationId = annotationId;
        }
      } else if (annotationId) {
        // Editing existing but text is empty -> already deleted by action, clear selection
        selectedAnnotationId = null;
        selectedPageId = null;
      }
      publishSelection();

      textInput.remove();
      textInput = null;
      pendingTextInput = null;
      renderAllOverlays();
      updateToolButtons();
    } finally {
      isCommittingText = false;
    }
  }

  // Create text input AFTER the pointer sequence completes (on pointerup)
  function scheduleTextInputAt(pageX, pageY, pageId) {
    pendingTextInput = { pageX, pageY, pageId };
  }

  function createTextInputAt(pageX, pageY, pageId) {
    const state = getState();
    const page = state.pages.find((p) => p.id === pageId);
    if (!page) return;

    // Find the canvas for this page to position the input
    const canvasData = pageCanvases.get(pageId);
    if (!canvasData) return;

    const canvasRect = canvasData.canvas.getBoundingClientRect();
    const wrapRect = pagesWrap.getBoundingClientRect();

    // Convert page space to screen coordinates for positioning the input
    const screen = pageToScreenForBlock(pageX, pageY, canvasData.block, canvasRect);
    if (!screen) return;

    // Use store values for font size and text color (set via right panel)
    const fontSize = state.annotateFontSize || DEFAULT_TEXT_FONT_SIZE;
    const textColor = state.annotateTextColor || DEFAULT_TEXT_COLOR;

    textInput = document.createElement("textarea");
    textInput.className = "annotate-text-input";
    // Store draft on the element itself for commitTextInput to read
    textInput.dataset.draftPageX = String(pageX);
    textInput.dataset.draftPageY = String(pageY);
    textInput.dataset.draftPageId = pageId;
    textInput.style.left = `${screen.clientX - wrapRect.left}px`;
    textInput.style.top = `${screen.clientY - wrapRect.top}px`;
    textInput.style.fontSize = `${fontSize}px`;
    textInput.style.color = textColor;
    // Match page rotation
    const rotation = ((page.baseRotation || 0) + (page.rotated || 0)) % 360;
    textInput.style.transform = `rotate(${(rotation * Math.PI) / 180}rad)`;
    textInput.style.transformOrigin = "left bottom";
    // Append to the page's overlay
    const overlay = canvasData.wrapper.querySelector(".annotate-overlay");
    if (overlay) overlay.appendChild(textInput);
    textInput.focus();

    textInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        commitTextInput();
      } else if (e.key === "Escape") {
        cancelTextInput();
      }
    });
    textInput.addEventListener("blur", () => {
      setTimeout(() => {
        if (textInput) commitTextInput();
      }, 100);
    });
    textInput.addEventListener("input", () => {
      textInput.style.height = "auto";
      textInput.style.height = `${textInput.scrollHeight}px`;
    });

    updateToolButtons();
  }

  function getEffectiveRotation(page) {
    return ((page.baseRotation || 0) + (page.rotated || 0)) % 360;
  }

  // Build the page layout and create DOM structure
  function buildPageStructure() {
    const state = getState();
    layout = computePageLayout(state.pages, zoom);

    // Set container height for scrolling
    pagesEl.style.height = `${layout.totalHeight}px`;

    // Create or update page wrappers
    const existingWrappers = new Map();
    for (const child of pagesEl.children) {
      if (child.dataset.pageId) {
        existingWrappers.set(child.dataset.pageId, child);
      }
    }

    for (let i = 0; i < layout.blocks.length; i++) {
      const block = layout.blocks[i];
      const page = state.pages.find((p) => p.id === block.id);
      if (!page) continue;

      let wrapper = existingWrappers.get(block.id);
      if (!wrapper) {
        wrapper = document.createElement("div");
        wrapper.className = "annotate-page-wrapper";
        wrapper.dataset.pageId = block.id;
        wrapper.style.position = "absolute";
        wrapper.style.top = `${block.top}px`;
        wrapper.style.left = "50%";
        wrapper.style.transform = "translateX(-50%)";
        wrapper.style.width = `${block.visualW * zoom}px`;
        pagesEl.appendChild(wrapper);
      } else {
        wrapper.style.top = `${block.top}px`;
        wrapper.style.width = `${block.visualW * zoom}px`;
      }

      // Inner element (positioning context for overlay)
      let inner = wrapper.querySelector(".annotate-page-inner");
      if (!inner) {
        inner = document.createElement("div");
        inner.className = "annotate-page-inner";
        inner.style.position = "relative";
        inner.style.width = `${block.visualW * zoom}px`;
        inner.style.height = `${block.visualH * zoom}px`;
        wrapper.appendChild(inner);
      } else {
        inner.style.width = `${block.visualW * zoom}px`;
        inner.style.height = `${block.visualH * zoom}px`;
      }

      // Canvas
      let canvas = inner.querySelector(".annotate-page-canvas");
      if (!canvas) {
        canvas = document.createElement("canvas");
        canvas.className = "annotate-page-canvas";
        canvas.style.width = `${block.visualW * zoom}px`;
        canvas.style.height = `${block.visualH * zoom}px`;
        canvas.style.display = "block";
        canvas.style.background = "var(--color-paper-white)";
        canvas.style.boxShadow = "var(--shadow-lg)";
        inner.appendChild(canvas);
      } else {
        canvas.style.width = `${block.visualW * zoom}px`;
        canvas.style.height = `${block.visualH * zoom}px`;
      }

      // Overlay
      let overlay = inner.querySelector(".annotate-overlay");
      if (!overlay) {
        overlay = document.createElement("div");
        overlay.className = "annotate-overlay";
        overlay.style.position = "absolute";
        overlay.style.inset = "0";
        overlay.style.pointerEvents = "none";
        inner.appendChild(overlay);
      }

      // Page number label
      let pageNum = inner.querySelector(".annotate-page-number");
      if (!pageNum) {
        pageNum = document.createElement("div");
        pageNum.className = "annotate-page-number";
        pageNum.style.position = "absolute";
        pageNum.style.top = "8px";
        pageNum.style.left = "8px";
        pageNum.style.padding = "2px 8px";
        pageNum.style.background = "rgba(0,0,0,0.6)";
        pageNum.style.color = "#fff";
        pageNum.style.borderRadius = "4px";
        pageNum.style.fontSize = "12px";
        pageNum.style.fontWeight = "500";
        pageNum.style.pointerEvents = "none";
        pageNum.style.zIndex = "5";
        inner.appendChild(pageNum);
      }
      pageNum.textContent = `Page ${i + 1}`;

      // Store canvas data for rendering
      const canvasData = pageCanvases.get(block.id) || { canvas, ctx: null, page: null, viewport: null, renderTask: null, block, wrapper: inner, hasBitmap: false };
      canvasData.canvas = canvas;
      canvasData.block = block;
      canvasData.wrapper = inner;
      pageCanvases.set(block.id, canvasData);
    }

    // Remove wrappers for pages that no longer exist
    for (const [pageId, wrapper] of existingWrappers) {
      if (!layout.blocks.some((b) => b.id === pageId)) {
        wrapper.remove();
        pageCanvases.delete(pageId);
      }
    }
  }

  // Release bitmap for a page (keep canvas element for layout, clear bitmap)
  async function releasePageBitmap(pageId) {
    const canvasData = pageCanvases.get(pageId);
    if (!canvasData || !canvasData.hasBitmap) return;

    // Queue the release work
    await queueRender(pageId, async () => {
      // Re-check after queue wait
      if (!canvasData.hasBitmap) return;

      // Cancel any pending render task and await settlement
      if (canvasData.renderTask) {
        canvasData.renderTask.cancel();
        try {
          await canvasData.renderTask.promise;
        } catch (e) {
          if (e.name !== "RenderingCancelledException") {
            console.warn("Render task failed during release:", e);
          }
        }
        canvasData.renderTask = null;
      }

      // Release bitmap by setting width/height to 0
      canvasData.canvas.width = 0;
      canvasData.canvas.height = 0;
      canvasData.ctx = null;
      canvasData.page = null;
      canvasData.viewport = null;
      canvasData.hasBitmap = false;
    });
  }

  // Per-page render queue: serialize all canvas operations (render, release, zoom changes)
  // Returns a promise that resolves when the queued work completes
  function queueRender(pageId, work) {
    const canvasData = pageCanvases.get(pageId);
    if (!canvasData) return Promise.resolve();

    // Initialize render chain and generation if not present
    if (!canvasData.renderChain) canvasData.renderChain = Promise.resolve();
    if (!canvasData.renderGeneration) canvasData.renderGeneration = 0;

    // Increment generation for this new request
    const thisGeneration = ++canvasData.renderGeneration;

    // Chain the work onto the existing render chain
    canvasData.renderChain = canvasData.renderChain.then(async () => {
      // If a newer request has superseded this one, skip
      if (canvasData.renderGeneration !== thisGeneration) return;
      await work();
    }).catch((e) => {
      // Swallow errors to keep chain alive; work() handles its own errors
      if (e.name !== "RenderingCancelledException") console.warn("Render queue error:", e);
    });

    return canvasData.renderChain;
  }

  // Render a specific page's canvas
  async function renderPageCanvas(pageId) {
    const state = getState();
    const page = state.pages.find((p) => p.id === pageId);
    if (!page) return;

    const source = getSource(page.sourceId);
    if (!source) return;

    const canvasData = pageCanvases.get(pageId);
    if (!canvasData) return;

    const rotation = getEffectiveRotation(page);

    // Queue the render work - only one render per canvas at a time
    await queueRender(pageId, async () => {
      // Re-check state after queue wait (page might have been released/removed)
      const currentState = getState();
      const currentPage = currentState.pages.find((p) => p.id === pageId);
      if (!currentPage) return;

      const currentSource = getSource(currentPage.sourceId);
      if (!currentSource) return;

      // If already has bitmap at current zoom, skip
      if (canvasData.hasBitmap && canvasData.viewport && Math.abs(canvasData.viewport.scale - zoom) < 0.001) {
        return;
      }

      if (currentSource.kind === "pdf") {
      // Load pdf.js document if needed
      if (!pdfjsDoc || pdfjsDoc._sourceId !== currentSource.id) {
        const { getDocument } = await import("/vendor/pdfjs/pdf.min.js");
        pdfjsDoc = await getDocument({
          data: source.bytes.slice(),
          workerSrc: "/vendor/pdfjs/pdf.worker.min.js",
          cMapUrl: "/vendor/pdfjs/cmaps/",
          cMapPacked: true,
          standardFontDataUrl: "/vendor/pdfjs/standard_fonts/",
          wasmUrl: "/vendor/pdfjs/wasm/",
          isEvalSupported: false,
          enableXfa: false,
        }).promise;
        pdfjsDoc._sourceId = currentSource.id;
      }

      canvasData.page = await pdfjsDoc.getPage(currentPage.index + 1);
      canvasData.viewport = canvasData.page.getViewport({ scale: zoom, rotation });
      canvasData.canvas.width = canvasData.viewport.width;
      canvasData.canvas.height = canvasData.viewport.height;
      canvasData.ctx = canvasData.canvas.getContext("2d");
      canvasData.hasBitmap = true;

      canvasData.renderTask = canvasData.page.render({ canvasContext: canvasData.ctx, viewport: canvasData.viewport });
      try {
        await canvasData.renderTask.promise;
        renderOverlayForPage(pageId);
      } catch (e) {
        if (e.name !== "RenderingCancelledException") {
          console.warn("Page render failed:", e);
        }
        canvasData.hasBitmap = false;
      }
    } else if (currentSource.kind === "image") {
      // Render image source
      // Get visual dimensions for the rotated page
      const { visualW, visualH } = visualDims(currentSource.width, currentSource.height, rotation);
      canvasData.viewport = { scale: zoom, rotation, width: visualW, height: visualH };
      canvasData.canvas.width = Math.round(visualW * zoom);
      canvasData.canvas.height = Math.round(visualH * zoom);
      canvasData.ctx = canvasData.canvas.getContext("2d");
      canvasData.hasBitmap = true;

      // Draw the image bitmap with rotation transform
      const ctx = canvasData.ctx;
      ctx.save();
      ctx.translate(canvasData.canvas.width / 2, canvasData.canvas.height / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      // Draw image centered
      ctx.drawImage(
        currentSource.imageBitmap,
        -visualW * zoom / 2,
        -visualH * zoom / 2,
        visualW * zoom,
        visualH * zoom
      );
      ctx.restore();

      // For image pages, rendering is synchronous - no render task
      renderOverlayForPage(pageId);
    }
  }); // end queueRender
}

  // Render overlay for a specific page
  function renderOverlayForPage(pageId) {
    const canvasData = pageCanvases.get(pageId);
    if (!canvasData) return;

    const state = getState();
    const page = state.pages.find((p) => p.id === pageId);
    if (!page) return;

    const overlay = canvasData.wrapper.querySelector(".annotate-overlay");
    if (!overlay) return;

    const rotation = getEffectiveRotation(page);
    const visualWidth = canvasData.canvas.width;
    const visualHeight = canvasData.canvas.height;

    // Clear overlay
    overlay.innerHTML = "";

    // Render annotations from state
    const anns = getPageAnnotations(state.annotations || {}, page.id);
    for (const ann of anns) {
      if (ann.type === "text") {
        renderTextAnnotation(ann, page, rotation, visualWidth, visualHeight, overlay);
      } else if (ann.type === "highlight") {
        renderHighlightAnnotation(ann, page, rotation, visualWidth, visualHeight, overlay);
      } else if (ann.type === "image") {
        renderImageAnnotation(ann, page, rotation, visualWidth, visualHeight, overlay);
      }
    }

    // If drawing highlight on this page, show preview
    if (isDrawingHighlight && currentTool === "highlight" && highlightPageId === pageId) {
      renderHighlightPreview(pageId, page, rotation, visualWidth, visualHeight, overlay);
    }

    // Re-add text input if exists on this page (but not during commit to avoid re-append/blur issues)
    if (!isCommittingText && textInput && textInput.dataset.draftPageId === pageId) {
      overlay.appendChild(textInput);
    }
  }

  // Render all overlays
  function renderAllOverlays() {
    for (const pageId of pageCanvases.keys()) {
      renderOverlayForPage(pageId);
    }
  }

  function renderTextAnnotation(ann, page, rotation, visualWidth, visualHeight, overlay) {
    const screen = pageToScreenForBlock(ann.x, ann.y, { visualW: visualWidth / zoom, visualH: visualHeight / zoom, rotation }, {
      left: 0, top: 0, width: visualWidth, height: visualHeight,
    });
    if (!screen) return;

    const el = document.createElement("div");
    el.className = `annotate-text-annotation${ann.id === selectedAnnotationId ? " selected" : ""}`;
    el.dataset.annotationId = ann.id;
    el.style.left = `${screen.clientX}px`;
    el.style.top = `${screen.clientY}px`;
    el.style.fontSize = `${ann.fontSize || DEFAULT_TEXT_FONT_SIZE}px`;
    el.style.color = ann.color || DEFAULT_TEXT_COLOR;
    el.style.transform = `rotate(${(rotation * Math.PI) / 180}rad)`;
    el.style.transformOrigin = "left bottom";
    el.textContent = ann.text || "";
    el.tabIndex = -1;
    el.setAttribute("role", "button");
    el.setAttribute("aria-label", `Text annotation: ${ann.text || "empty"}`);

    el.addEventListener("click", (e) => {
      e.stopPropagation();
      el.focus();
      selectAnnotation(ann.id, page.id);
    });
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        startEditingText(ann.id, page.id);
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteSelectedAnnotation();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        nudgeAnnotation(0, e.shiftKey ? -10 : -1);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        nudgeAnnotation(0, e.shiftKey ? 10 : 1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        nudgeAnnotation(e.shiftKey ? -10 : -1, 0);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        nudgeAnnotation(e.shiftKey ? 10 : 1, 0);
      }
    });

    overlay.appendChild(el);
  }

  function renderHighlightAnnotation(ann, page, rotation, visualWidth, visualHeight, overlay) {
    const mockBlock = { visualW: visualWidth / zoom, visualH: visualHeight / zoom, rotation };
    const mockRect = { left: 0, top: 0, width: visualWidth, height: visualHeight };

    // Highlight is a rectangle in page space: x, y, width, height (origin bottom-left)
    const corners = [
      { x: ann.x, y: ann.y },
      { x: ann.x + ann.width, y: ann.y },
      { x: ann.x + ann.width, y: ann.y + ann.height },
      { x: ann.x, y: ann.y + ann.height },
    ];
    const screenCorners = corners.map((c) => pageToScreenForBlock(c.x, c.y, mockBlock, mockRect)).filter(Boolean);
    if (screenCorners.length < 4) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const c of screenCorners) {
      minX = Math.min(minX, c.clientX);
      minY = Math.min(minY, c.clientY);
      maxX = Math.max(maxX, c.clientX);
      maxY = Math.max(maxY, c.clientY);
    }

    const el = document.createElement("div");
    el.className = `annotate-highlight-annotation${ann.id === selectedAnnotationId ? " selected" : ""}`;
    el.dataset.annotationId = ann.id;
    el.style.left = `${minX}px`;
    el.style.top = `${minY}px`;
    el.style.width = `${maxX - minX}px`;
    el.style.height = `${maxY - minY}px`;
    el.style.background = ann.color || DEFAULT_HIGHLIGHT_COLOR;
    el.style.opacity = ann.opacity ?? DEFAULT_HIGHLIGHT_OPACITY;
    el.tabIndex = -1;
    el.setAttribute("role", "button");
    el.setAttribute("aria-label", `Highlight annotation`);

    el.addEventListener("click", (e) => {
      e.stopPropagation();
      el.focus();
      selectAnnotation(ann.id, page.id);
    });
    el.addEventListener("keydown", (e) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteSelectedAnnotation();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        nudgeAnnotation(0, e.shiftKey ? -10 : -1);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        nudgeAnnotation(0, e.shiftKey ? 10 : 1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        nudgeAnnotation(e.shiftKey ? -10 : -1, 0);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        nudgeAnnotation(e.shiftKey ? 10 : 1, 0);
      }
    });

    overlay.appendChild(el);
  }

  function renderHighlightPreview(pageId, page, rotation, visualWidth, visualHeight, overlay) {
    const existing = overlay.querySelector(".annotate-highlight-preview");
    if (existing) existing.remove();

    const x = Math.min(highlightStart.x, dragAnnotationStart.x);
    const y = Math.min(highlightStart.y, dragAnnotationStart.y);
    const width = Math.abs(highlightStart.x - dragAnnotationStart.x);
    const height = Math.abs(highlightStart.y - dragAnnotationStart.y);

    if (width < 1 || height < 1) return;

    const mockBlock = { visualW: visualWidth / zoom, visualH: visualHeight / zoom, rotation };
    const mockRect = { left: 0, top: 0, width: visualWidth, height: visualHeight };

    const corners = [
      { x, y },
      { x: x + width, y },
      { x: x + width, y: y + height },
      { x, y: y + height },
    ];
    const screenCorners = corners.map((c) => pageToScreenForBlock(c.x, c.y, mockBlock, mockRect)).filter(Boolean);
    if (screenCorners.length < 4) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const c of screenCorners) {
      minX = Math.min(minX, c.clientX);
      minY = Math.min(minY, c.clientY);
      maxX = Math.max(maxX, c.clientX);
      maxY = Math.max(maxY, c.clientY);
    }

    // Use store state for preview color and opacity
    const state = getState();
    const highlightDefaults = annotationDefaultsFromState(state, "highlight");

    const el = document.createElement("div");
    el.className = "annotate-highlight-preview";
    el.style.left = `${minX}px`;
    el.style.top = `${minY}px`;
    el.style.width = `${maxX - minX}px`;
    el.style.height = `${maxY - minY}px`;
    el.style.background = highlightDefaults.color;
    el.style.opacity = highlightDefaults.opacity;
    el.style.pointerEvents = "none";

    overlay.appendChild(el);
  }

  // Position the floating tool palette at the left edge of the page area,
  // just right of the rail's Annotate item. The Text button's center lines up
  // with the Annotate rail item's center. Under 900px it becomes a horizontal
  // bar centered at the top of the page area (handled in CSS).
  function positionPalette() {
    if (!palette) return;
    const railItem = document.getElementById("rail-annotate");
    if (!railItem) return;
    const isNarrow = window.innerWidth <= 900;
    if (isNarrow) {
      // Horizontal bar centered at the top of the page area.
      palette.hidden = false;
      palette.style.position = "fixed";
      palette.style.left = "50%";
      palette.style.top = "8px";
      palette.style.transform = "translateX(-50%)";
      palette.style.zIndex = "50";
      return;
    }
    // Left edge of the page area (just right of the rail). Measure while
    // visible and fixed so offsetTop is taken against the palette.
    palette.hidden = false;
    palette.style.position = "fixed";
    palette.style.transform = "none";
    palette.style.zIndex = "50";

    const rect = railItem.getBoundingClientRect();
    const left = rect.right + 8;
    const textButton = palette.querySelector('[data-tool="text"]');
    let top;
    if (textButton) {
      top = paletteTopForTextButton(rect, textButton.offsetTop, textButton.offsetHeight);
    } else {
      // Fallback: center the whole palette on the rail item.
      const paletteRect = palette.getBoundingClientRect();
      top = rect.top + (rect.height - paletteRect.height) / 2;
    }
    palette.style.left = `${Math.max(0, left)}px`;
    palette.style.top = `${Math.max(0, top)}px`;
  }

  function renderImageAnnotation(ann, page, rotation, visualWidth, visualHeight, overlay) {
    const asset = getAsset(ann.assetId);
    if (!asset) return;

    // Apply drag offset visually during drag (committed to store on pointerup)
    const dragOffset = isDraggingImage && selectedAnnotationId === ann.id ? imageDragOffset : { x: 0, y: 0 };
    const drawX = ann.x + dragOffset.x;
    const drawY = ann.y + dragOffset.y;
    const block = { pageW: page.width, pageH: page.height, visualW: visualWidth / zoom, visualH: visualHeight / zoom, rotation };
    const rect = { left: 0, top: 0, width: visualWidth, height: visualHeight };
    // Use all 4 corners so width/height stay positive at rotations 180/270
    // (where pageToScreenForBlock flips the Y axis and a naive corner delta
    // collapses to a negative size).
    const screen = pageRectToScreen(drawX, drawY, ann.width, ann.height, block, rect);
    if (!screen) return;

    const el = document.createElement("div");
    el.className = `annotate-image-annotation${ann.id === selectedAnnotationId ? " selected" : ""}`;
    el.dataset.annotationId = ann.id;
    el.style.left = `${screen.left}px`;
    el.style.top = `${screen.top}px`;
    el.style.width = `${screen.width}px`;
    el.style.height = `${screen.height}px`;
    el.style.backgroundImage = `url(${asset.dataUrl})`;
    el.style.backgroundSize = "contain";
    el.style.backgroundRepeat = "no-repeat";
    el.style.backgroundPosition = "center";
    el.style.opacity = ann.opacity ?? DEFAULT_IMAGE_OPACITY;
    el.style.border = ann.id === selectedAnnotationId ? `2px solid var(--color-electric-capture-blue)` : "none";
    el.tabIndex = -1;
    el.setAttribute("role", "button");
    el.setAttribute("aria-label", `Image annotation`);

    el.addEventListener("click", (e) => {
      e.stopPropagation();
      el.focus();
      selectAnnotation(ann.id, page.id);
    });
    el.addEventListener("keydown", (e) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteSelectedAnnotation();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        nudgeAnnotation(0, e.shiftKey ? -10 : -1);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        nudgeAnnotation(0, e.shiftKey ? 10 : 1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        nudgeAnnotation(e.shiftKey ? -10 : -1, 0);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        nudgeAnnotation(e.shiftKey ? 10 : 1, 0);
      }
    });

    overlay.appendChild(el);

    if (ann.id === selectedAnnotationId) {
      renderImageHandles(ann, page, rotation, visualWidth, visualHeight, overlay);
    }
  }

  function renderImageHandles(ann, page, rotation, visualWidth, visualHeight, overlay) {
    const asset = getAsset(ann.assetId);
    if (!asset) return;

    const block = { pageW: page.width, pageH: page.height, visualW: visualWidth / zoom, visualH: visualHeight / zoom, rotation };
    const rect = { left: 0, top: 0, width: visualWidth, height: visualHeight };

    const corners = [
      { key: "nw", x: ann.x, y: ann.y },
      { key: "ne", x: ann.x + ann.width, y: ann.y },
      { key: "sw", x: ann.x, y: ann.y + ann.height },
      { key: "se", x: ann.x + ann.width, y: ann.y + ann.height },
    ];
    // Apply drag offset visually during drag
    const dragOffset = isDraggingImage && selectedAnnotationId === ann.id ? imageDragOffset : { x: 0, y: 0 };
    const screenCorners = {};
    for (const c of corners) {
      const s = pageToScreenForBlock(c.x + dragOffset.x, c.y + dragOffset.y, block, rect);
      if (s) screenCorners[c.key] = s;
    }

    const handleSize = 8;
    const touchSize = 24;
    const offset = (touchSize - handleSize) / 2;

    for (const c of corners) {
      const s = screenCorners[c.key];
      if (!s) continue;
      const el = document.createElement("div");
      el.className = "annotate-image-handle";
      el.dataset.corner = c.key;
      el.style.left = `${s.clientX - offset}px`;
      el.style.top = `${s.clientY - offset}px`;
      el.style.width = `${touchSize}px`;
      el.style.height = `${touchSize}px`;
      el.style.position = "absolute";
      const inner = document.createElement("div");
      inner.style.position = "absolute";
      inner.style.left = `${(touchSize - handleSize) / 2}px`;
      inner.style.top = `${(touchSize - handleSize) / 2}px`;
      inner.style.width = `${handleSize}px`;
      inner.style.height = `${handleSize}px`;
      inner.style.background = "#0d44e8";
      inner.style.border = "1px solid #fff";
      inner.style.boxSizing = "border-box";
      el.appendChild(inner);
      overlay.appendChild(el);
    }
  }

  function selectAnnotation(id, pageId) {
    selectedAnnotationId = id;
    selectedPageId = pageId;
    publishSelection();
    updateToolButtons();
    renderAllOverlays();
    scrollAnnotationIntoView(id, pageId);
  }

  // Scroll the selected annotation into the visible part of the scroll area,
  // centering it when it is not fully visible. No-op when the element cannot
  // be found (e.g. its page is not rendered).
  function scrollAnnotationIntoView(annotationId, pageId) {
    const canvasData = pageCanvases.get(pageId);
    if (!canvasData) return;
    const overlay = canvasData.wrapper.querySelector(".annotate-overlay");
    if (!overlay) return;
    const el = overlay.querySelector(`[data-annotation-id="${annotationId}"]`);
    if (!el) return;
    const wrapRect = pagesWrap.getBoundingClientRect();
    const rect = el.getBoundingClientRect();
    if (rect.top < wrapRect.top || rect.bottom > wrapRect.bottom) {
      pagesWrap.scrollTop += rect.top - wrapRect.top - (wrapRect.height - rect.height) / 2;
    }
  }

  function deleteSelectedAnnotation() {
    if (!selectedAnnotationId || !selectedPageId) return;
    updateAnnotations((anns) => deleteAnnotation(anns, selectedPageId, selectedAnnotationId));
    selectedAnnotationId = null;
    selectedPageId = null;
    publishSelection();
    updateToolButtons();
    renderAllOverlays();
  }

  function nudgeAnnotation(dx, dy) {
    if (!selectedAnnotationId || !selectedPageId) return;
    updateAnnotations((anns) => coreNudgeAnnotation(anns, selectedPageId, selectedAnnotationId, dx, dy));
    renderOverlayForPage(selectedPageId);
  }

  function startEditingText(annotationId, pageId) {
    const state = getState();
    const page = state.pages.find((p) => p.id === pageId);
    if (!page) return;
    const ann = getPageAnnotations(state.annotations || {}, page.id).find((a) => a.id === annotationId);
    if (!ann || ann.type !== "text") return;

    const canvasData = pageCanvases.get(pageId);
    if (!canvasData) return;

    const screen = pageToScreenForBlock(ann.x, ann.y, canvasData.block, canvasData.canvas.getBoundingClientRect());
    if (!screen) return;

    cancelTextInput();

    textInput = document.createElement("textarea");
    textInput.className = "annotate-text-input";
    textInput.dataset.annotationId = ann.id;
    textInput.dataset.draftPageX = String(ann.x);
    textInput.dataset.draftPageY = String(ann.y);
    textInput.dataset.draftPageId = pageId;
    textInput.value = ann.text || "";
    textInput.style.left = `${screen.clientX - pagesWrap.getBoundingClientRect().left}px`;
    textInput.style.top = `${screen.clientY - pagesWrap.getBoundingClientRect().top}px`;
    textInput.style.fontSize = `${ann.fontSize || DEFAULT_TEXT_FONT_SIZE}px`;
    textInput.style.color = ann.color || DEFAULT_TEXT_COLOR;
    const rotation = getEffectiveRotation(page);
    textInput.style.transform = `rotate(${(rotation * Math.PI) / 180}rad)`;
    textInput.style.transformOrigin = "left bottom";
    const overlay = canvasData.wrapper.querySelector(".annotate-overlay");
    if (overlay) overlay.appendChild(textInput);
    textInput.focus();
    textInput.setSelectionRange(textInput.value.length, textInput.value.length);

    textInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        commitTextInput();
      } else if (e.key === "Escape") {
        cancelTextInput();
      }
    });
    textInput.addEventListener("blur", () => {
      setTimeout(() => {
        if (textInput) commitTextInput();
      }, 100);
    });
    textInput.addEventListener("input", () => {
      textInput.style.height = "auto";
      textInput.style.height = `${textInput.scrollHeight}px`;
    });

    selectedAnnotationId = ann.id;
    selectedPageId = pageId;
    publishSelection();
    updateToolButtons();
  }

  // Pointer event handlers
  function onPointerDown(e) {
    // Handle image handle clicks (corner resize) first
    const handle = e.target.closest(".annotate-image-handle");
    if (handle && selectedAnnotationId && selectedPageId) {
      e.preventDefault();
      e.stopPropagation();
      const corner = handle.dataset.corner;
      if (!corner) return;
      const page = getState().pages.find((p) => p.id === selectedPageId);
      const ann = getPageAnnotations(getState().annotations || {}, selectedPageId).find((a) => a.id === selectedAnnotationId);
      if (!page || !ann || ann.type !== "image") return;
      isResizingImage = true;
      imageResizeCorner = corner;
      imageResizeStart = { x: ann.x, y: ann.y, width: ann.width, height: ann.height };
      const canvasData = pageCanvases.get(selectedPageId);
      const rect = canvasData ? canvasData.canvas.getBoundingClientRect() : null;
      const start = screenToPageForBlock(e.clientX, e.clientY, canvasData.block, rect);
      imageDragStart = start ? { x: start.x, y: start.y } : { x: e.clientX, y: e.clientY };
      return;
    }

    // Find which page wrapper was clicked
    const wrapper = e.target.closest(".annotate-page-wrapper");
    if (!wrapper) return;
    const pageId = wrapper.dataset.pageId;
    const page = getState().pages.find((p) => p.id === pageId);
    if (!page) return;

    const canvasData = pageCanvases.get(pageId);
    if (!canvasData) return;

    const canvasRect = canvasData.canvas.getBoundingClientRect();
    const pagePoint = screenToPageForBlock(e.clientX, e.clientY, canvasData.block, canvasRect);
    if (!pagePoint) return;

    if (currentTool === "text") {
      // Check if clicking on an existing text annotation
      const annEl = e.target.closest(".annotate-text-annotation");
      if (annEl) {
        selectAnnotation(annEl.dataset.annotationId, pageId);
        startEditingText(annEl.dataset.annotationId, pageId);
      } else {
        // Schedule text input creation on pointerup to avoid blur issue
        scheduleTextInputAt(pagePoint.x, pagePoint.y, pageId);
      }
    } else if (currentTool === "highlight") {
      isDrawingHighlight = true;
      highlightStart = { ...pagePoint };
      dragAnnotationStart = { ...pagePoint };
      highlightPageId = pageId;
    } else if (currentTool === "image") {
      // Click to place an image: open file picker, then insert at click position.
      // Placement is computed in visual space (centered on the visual click, aspect
      // preserved, clamped) and converted to page space, so it stays correct at
      // every rotation.
      e.preventDefault();
      const rotation = getEffectiveRotation(page);
      pickImageFile().then(async (file) => {
        if (!file) return;
        try {
          const { assetId, width: naturalWidth, height: naturalHeight } = await registerAsset(file);
          const { x, y, width: placeW, height: placeH } = computeImagePlacement(
            pagePoint.x,
            pagePoint.y,
            naturalWidth,
            naturalHeight,
            page.width,
            page.height,
            rotation,
          );
          const ann = createImageAnnotation(x, y, placeW, placeH, { assetId });
          updateAnnotations((anns) => addAnnotation(anns, pageId, ann));
          // Select the newly placed image
          const pageAnns = getPageAnnotations(getState().annotations || {}, pageId);
          selectedAnnotationId = pageAnns[pageAnns.length - 1]?.id;
          selectedPageId = pageId;
          publishSelection();
          updateToolButtons();
          renderAllOverlays();
          // Switch to select so the newly placed image can be dragged immediately
          setTool("select");
        } catch (err) {
          console.warn("Failed to insert image:", err);
        }
      });
    } else if (currentTool === "select") {
      // Check if clicking on an annotation
      const annEl = e.target.closest(".annotate-text-annotation, .annotate-highlight-annotation, .annotate-image-annotation");
      if (annEl) {
        selectAnnotation(annEl.dataset.annotationId, pageId);
        const ann = getPageAnnotations(getState().annotations || {}, pageId).find((a) => a.id === selectedAnnotationId);
        if (ann && ann.type === "image") {
          // Start image drag (committed once on pointerup)
          isDraggingImage = true;
          imageDragStartPos = { x: ann.x, y: ann.y };
          imageDragOffset = { x: 0, y: 0 };
          imageDragStart = pagePoint;
        } else if (ann) {
          isDragging = true;
          dragStart = { x: e.clientX, y: e.clientY };
          dragStartPage = { ...pagePoint };
          dragAnnotationStart = { x: ann.x, y: ann.y };
        }
      } else {
        selectedAnnotationId = null;
        selectedPageId = null;
        publishSelection();
        updateToolButtons();
        renderAllOverlays();
      }
    }
  }

  function onPointerMove(e) {
    if (!isDrawingHighlight && !isDraggingImage && !isResizingImage && !isDragging) return;

    const wrapper = e.target.closest(".annotate-page-wrapper");
    if (!wrapper) return;
    const pageId = wrapper.dataset.pageId;
    const page = getState().pages.find((p) => p.id === pageId);
    if (!page) return;

    const canvasData = pageCanvases.get(pageId);
    if (!canvasData) return;

    const canvasRect = canvasData.canvas.getBoundingClientRect();

    // Compute the current page point once, in this function's scope, so every
    // branch (highlight preview, image move/resize, select drag) can use it.
    // Previously `pagePoint` was declared with `const` inside nested blocks,
    // so `dragAnnotationStart = pagePoint;` in the highlight branch threw
    // "ReferenceError: pagePoint is not defined".
    const pagePoint = screenToPageForBlock(e.clientX, e.clientY, canvasData.block, canvasRect);
    if (!pagePoint) return;

    if (isResizingImage && selectedAnnotationId && selectedPageId === pageId) {
      const dx = pagePoint.x - imageDragStart.x;
      const dy = pagePoint.y - imageDragStart.y;
      const ann = getPageAnnotations(getState().annotations || {}, selectedPageId).find((a) => a.id === selectedAnnotationId);
      if (!ann || ann.type !== "image") return;
      let newW = imageResizeStart.width;
      let newH = imageResizeStart.height;
      let newX = imageResizeStart.x;
      let newY = imageResizeStart.y;
      const corner = imageResizeCorner;
      // Compute desired deltas per corner
      let dw = 0, dh = 0;
      if (corner === "se") { dw = dx; dh = dy; }
      else if (corner === "ne") { dw = dx; dh = -dy; newY = imageResizeStart.y - dy; }
      else if (corner === "sw") { dw = -dx; dh = dy; newX = imageResizeStart.x - dx; }
      else if (corner === "nw") { dw = -dx; dh = -dy; newX = imageResizeStart.x - dx; newY = imageResizeStart.y - dy; }
      // Aspect ratio: if shift is not held, free resize; if held, lock aspect.
      // Always lock aspect for simplicity (keep proportions).
      const aspect = imageResizeStart.width / imageResizeStart.height;
      // Apply width/height changes, keeping min size
      const candW = Math.max(10, newW + dw);
      const candH = Math.max(10, newH + dh);
      // Lock aspect based on which corner drives
      let finalW, finalH;
      if (corner === "se" || corner === "nw") {
        // Use horizontal delta as driver
        finalW = candW;
        finalH = Math.max(10, finalW / aspect);
      } else {
        finalH = candH;
        finalW = Math.max(10, finalH * aspect);
      }
      // Recompute position for top-left anchors
      if (corner === "nw" || corner === "sw" || corner === "ne") {
        // top or left changed: adjust position so opposite corner stays
        if (corner === "nw") { newX = imageResizeStart.x + (imageResizeStart.width - finalW); newY = imageResizeStart.y + (imageResizeStart.height - finalH); }
        else if (corner === "ne") { newY = imageResizeStart.y + (imageResizeStart.height - finalH); }
        else if (corner === "sw") { newX = imageResizeStart.x + (imageResizeStart.width - finalW); }
      }
      updateAnnotations((anns) =>
        updateAnnotation(anns, selectedPageId, selectedAnnotationId, { x: newX, y: newY, width: finalW, height: finalH })
      );
      renderOverlayForPage(pageId);
      return;
    }

    if (isDraggingImage && selectedAnnotationId && selectedPageId === pageId) {
      const dx = pagePoint.x - imageDragStart.x;
      const dy = pagePoint.y - imageDragStart.y;
      imageDragOffset = { x: dx, y: dy };
      renderOverlayForPage(pageId);
      return;
    }

    if (isDragging && selectedAnnotationId && selectedPageId === pageId) {
      // Drag the selected non-image annotation by the page-space delta from
      // where the drag started.
      const ann = getPageAnnotations(getState().annotations || {}, selectedPageId).find((a) => a.id === selectedAnnotationId);
      if (!ann) return;
      updateAnnotations((anns) =>
        updateAnnotation(anns, selectedPageId, selectedAnnotationId, {
          x: dragAnnotationStart.x + (pagePoint.x - dragStartPage.x),
          y: dragAnnotationStart.y + (pagePoint.y - dragStartPage.y),
        })
      );
      renderOverlayForPage(pageId);
      return;
    }

    if (!isDrawingHighlight) return;
    if (pageId !== highlightPageId) return; // Clamp to page where drag started

    dragAnnotationStart = pagePoint;
    renderHighlightPreview(pageId, page, getEffectiveRotation(page), canvasData.canvas.width, canvasData.canvas.height, canvasData.wrapper.querySelector(".annotate-overlay"));
  }

  function onPointerUp(e) {
    // Create text input if scheduled
    if (pendingTextInput) {
      createTextInputAt(pendingTextInput.pageX, pendingTextInput.pageY, pendingTextInput.pageId);
      pendingTextInput = null;
    }

    // Commit image drag once on pointerup (clamped to page, 20pt margin)
    if (isDraggingImage && selectedAnnotationId && selectedPageId) {
      isDraggingImage = false;
      const state = getState();
      const page = state.pages.find((p) => p.id === selectedPageId);
      const ann = getPageAnnotations(state.annotations || {}, selectedPageId).find((a) => a.id === selectedAnnotationId);
      if (page && ann && ann.type === "image") {
        let newX = imageDragStartPos.x + imageDragOffset.x;
        let newY = imageDragStartPos.y + imageDragOffset.y;
        const clamp = 20;
        newX = Math.max(clamp, Math.min(newX, page.width - clamp - ann.width));
        newY = Math.max(clamp, Math.min(newY, page.height - clamp - ann.height));
        updateAnnotations((anns) =>
          updateAnnotation(anns, selectedPageId, selectedAnnotationId, { x: newX, y: newY })
        );
      }
      imageDragOffset = { x: 0, y: 0 };
      renderAllOverlays();
    }

    if (isResizingImage) {
      isResizingImage = false;
      imageResizeCorner = null;
      renderAllOverlays();
    }

    if (isDragging) {
      isDragging = false;
    }

    if (isDrawingHighlight) {
      isDrawingHighlight = false;
      const state = getState();
      const page = state.pages.find((p) => p.id === highlightPageId);
      if (!page) return;

      // Normalize rectangle
      const x = Math.min(highlightStart.x, dragAnnotationStart.x);
      const y = Math.min(highlightStart.y, dragAnnotationStart.y);
      const width = Math.abs(highlightStart.x - dragAnnotationStart.x);
      const height = Math.abs(highlightStart.y - dragAnnotationStart.y);

      if (width > 1 && height > 1) {
        const highlightDefaults = annotationDefaultsFromState(state, "highlight");
        const ann = createHighlightAnnotation(x, y, width, height, {
          color: highlightDefaults.color,
          opacity: highlightDefaults.opacity,
        });
        updateAnnotations((anns) => addAnnotation(anns, highlightPageId, ann));
      }
      renderAllOverlays();
    }
  }

  // Keyboard navigation
  function onKeyDown(e) {
    if (e.target === textInput) return; // Let text input handle its own keys

    if (e.key === "Escape") {
      if (isDrawingHighlight) {
        isDrawingHighlight = false;
        renderAllOverlays();
      } else if (textInput) {
        cancelTextInput();
      } else if (selectedAnnotationId) {
        selectedAnnotationId = null;
        selectedPageId = null;
        publishSelection();
        updateToolButtons();
        renderAllOverlays();
      } else {
        done();
      }
      return;
    }

    // Tool shortcuts
    if (!e.ctrlKey && !e.metaKey && !e.altKey) {
      if (e.key === "v" || e.key === "V") setTool("select");
      else if (e.key === "t" || e.key === "T") setTool("text");
      else if (e.key === "h" || e.key === "H") setTool("highlight");
      else if (e.key === "i" || e.key === "I") setTool("image");
    }

    // Arrow keys for nudging selected annotation
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
      if (selectedAnnotationId) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        let dx = 0, dy = 0;
        if (e.key === "ArrowUp") dy = -step;
        else if (e.key === "ArrowDown") dy = step;
        else if (e.key === "ArrowLeft") dx = -step;
        else if (e.key === "ArrowRight") dx = step;
        nudgeAnnotation(dx, dy);
      }
    }

    // Page navigation with PageUp/PageDown
    if (e.key === "PageUp") {
      e.preventDefault();
      const current = findCurrentPage(layout.blocks, pagesWrap.scrollTop, pagesWrap.clientHeight);
      if (current && current.index > 0) {
        jumpToPage(current.index - 1);
      }
    } else if (e.key === "PageDown") {
      e.preventDefault();
      const current = findCurrentPage(layout.blocks, pagesWrap.scrollTop, pagesWrap.clientHeight);
      if (current && current.index < getState().pages.length - 1) {
        jumpToPage(current.index + 1);
      }
    }

    // Zoom
    if (e.key === "=" || e.key === "+") {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        zoomIn();
      }
    } else if (e.key === "-") {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        zoomOut();
      }
    } else if (e.key === "0") {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        zoomFitWidth();
      }
    }

  }

  // Document-level Delete/Backspace handler for the annotate mode. Runs when
  // focus is on the page, on a selected annotation, or on the body — but never
  // while typing in a text field, and never when another handler already dealt
  // with the event (defaultPrevented).
  function onDocumentKeyDown(e) {
    if (e.defaultPrevented) return;
    const target = e.target;
    if (target &&
      (target.isContentEditable ||
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT")) {
      return;
    }
    if ((e.key === "Delete" || e.key === "Backspace") && selectedAnnotationId) {
      e.preventDefault();
      deleteSelectedAnnotation();
    }
  }

  function jumpToPage(index) {
    const state = getState();
    if (index < 0 || index >= state.pages.length) return;
    const block = layout.blocks[index];
    if (!block) return;
    pagesWrap.scrollTo({ top: block.top, behavior: "smooth" });
  }

  function updatePageIndicator() {
    const state = getState();
    const current = findCurrentPage(layout.blocks, pagesWrap.scrollTop, pagesWrap.clientHeight);
    if (current) {
      pageIndicator.textContent = `Page ${current.index + 1} of ${state.pages.length}`;
      if (current.pageId !== currentPageId) {
        currentPageId = current.pageId;
        publishAnnotateState();
      }
    }
  }

  function zoomIn() {
    zoom = Math.min(zoom * 1.2, 5);
    updateZoom();
  }

  function zoomOut() {
    zoom = Math.max(zoom / 1.2, 0.25);
    updateZoom();
  }

  function zoomFitWidth() {
    const wrapRect = pagesWrap.getBoundingClientRect();
    const state = getState();
    if (!state.pages.length) return;
    // Fit to width of the widest page
    let maxVisualW = 0;
    for (const page of state.pages) {
      const rotation = getEffectiveRotation(page);
      const { visualW } = visualDims(page.width, page.height, rotation);
      maxVisualW = Math.max(maxVisualW, visualW);
    }
    zoom = (wrapRect.width - 48) / maxVisualW;
    zoom = Math.min(zoom, 3);
    updateZoom();
  }

  function updateZoom() {
    zoomLevelEl.textContent = `${Math.round(zoom * 100)}%`;
    // Rebuild layout and re-render
    buildPageStructure();
    renderVisiblePages();
  }

  // IntersectionObserver for lazy rendering
  function setupIntersectionObserver() {
    if (intersectionObserver) {
      intersectionObserver.disconnect();
    }
    intersectionObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const pageId = entry.target.dataset.pageId;
        if (!pageId) continue;
        if (entry.isIntersecting) {
          // Page entered viewport (or buffer) - render it
          renderPageCanvas(pageId);
        } else {
          // Page left viewport - could release bitmap, but keep for now
        }
      }
    }, {
      root: pagesWrap,
      rootMargin: `${pagesWrap.clientHeight * 1.5}px`,
      threshold: 0,
    });

    // Observe all page wrappers
    for (const wrapper of pagesEl.querySelectorAll(".annotate-page-wrapper")) {
      intersectionObserver.observe(wrapper);
    }
  }

  // Render pages within the render window and release bitmaps outside it
  async function renderVisiblePages() {
    const scrollTop = pagesWrap.scrollTop;
    const viewportHeight = pagesWrap.clientHeight;
    const indices = getRenderWindow(layout.blocks, scrollTop, viewportHeight, RENDER_BUFFER);
    const windowSet = new Set(indices.map(i => layout.blocks[i].id));

    // First, render pages in the window
    for (const i of indices) {
      const pageId = layout.blocks[i].id;
      renderPageCanvas(pageId);
    }

    // Release bitmaps for pages outside the window
    for (const [pageId, canvasData] of pageCanvases) {
      if (!windowSet.has(pageId) && canvasData.hasBitmap) {
        releasePageBitmap(pageId);
      }
    }

    // Cap live canvases at MAX_LIVE_CANVASES by distance to viewport center
    const viewportCenter = scrollTop + viewportHeight / 2;
    const livePages = Array.from(pageCanvases.entries())
      .filter(([, data]) => data.hasBitmap)
      .map(([pageId, data]) => {
        const blockCenter = data.block.top + data.block.height / 2;
        return { pageId, distance: Math.abs(blockCenter - viewportCenter) };
      })
      .sort((a, b) => a.distance - b.distance);

    if (livePages.length > MAX_LIVE_CANVASES) {
      for (let i = MAX_LIVE_CANVASES; i < livePages.length; i++) {
        releasePageBitmap(livePages[i].pageId);
      }
    }
  }

  async function onScroll() {
    updatePageIndicator();
    try {
      await renderVisiblePages();
    } catch (e) {
      console.warn("Scroll render failed:", e);
    }
    // Re-observe with updated rootMargin
    if (intersectionObserver) {
      intersectionObserver.disconnect();
      setupIntersectionObserver();
    }
    positionPalette();
  }

  async function enter(startPageIndex = 0) {
    cancelTextInput();
    view.hidden = false;
    view.setAttribute("aria-hidden", "false");

    // Set up resize handler first (needs pagesWrap)
    resizeHandler = () => {
      if (!view.hidden) {
        zoomFitWidth();
        positionPalette();
      }
    };
    window.addEventListener("resize", resizeHandler);

    // First: fit-width zoom -> computes zoom and rebuilds layout
    zoomFitWidth();
    positionPalette();

    // Re-align after the next paint (palette size may not be settled yet) and
    // once more after that; also keep watching the page area for size changes
    // so the Text button stays centered on the Annotate rail item.
    const alignPalette = () => { if (!view.hidden) positionPalette(); };
    requestAnimationFrame(() => {
      alignPalette();
      requestAnimationFrame(alignPalette);
    });
    paletteResizeObserver = new ResizeObserver(alignPalette);
    paletteResizeObserver.observe(pagesWrap);

    // Now layout is at the correct zoom; build structure if needed (zoomFitWidth calls updateZoom -> buildPageStructure)
    // Set up intersection observer
    setupIntersectionObserver();

    // Scroll to start page using the fit-width layout
    if (startPageIndex >= 0 && startPageIndex < layout.blocks.length) {
      const block = layout.blocks[startPageIndex];
      pagesWrap.scrollTop = block.top;
    }

    // Initial render at the correct scroll position
    await renderVisiblePages();

    // Set up scroll handler
    scrollHandler = onScroll;
    pagesWrap.addEventListener("scroll", scrollHandler);

    // Focus the view for keyboard shortcuts
    view.focus();
    updatePageIndicator();
    publishAnnotateState();

    // Document-level Delete/Backspace so the keyboard works from the page, the
    // selected annotation or the body (never while typing in a text field)
    documentKeyDownHandler = onDocumentKeyDown;
    document.addEventListener("keydown", documentKeyDownHandler);
  }

  async function cleanup() {
    cancelTextInput();
    view.hidden = true;
    view.setAttribute("aria-hidden", "true");
    // Clear selection when leaving the mode
    if (selectedAnnotationId) {
      selectedAnnotationId = null;
      selectedPageId = null;
      publishSelection();
    }
    // Reset annotate state for next time the mode opens
    currentTool = "select";
    currentPageId = null;
    publishAnnotateState();
    // Remove the document-level keyboard handler
    if (documentKeyDownHandler) {
      document.removeEventListener("keydown", documentKeyDownHandler);
      documentKeyDownHandler = null;
    }

    // Clean up
    if (scrollHandler) {
      pagesWrap.removeEventListener("scroll", scrollHandler);
      scrollHandler = null;
    }
    if (resizeHandler) {
      window.removeEventListener("resize", resizeHandler);
      resizeHandler = null;
    }
    if (paletteResizeObserver) {
      paletteResizeObserver.disconnect();
      paletteResizeObserver = null;
    }
    if (palette) palette.hidden = true;
    if (intersectionObserver) {
      intersectionObserver.disconnect();
      intersectionObserver = null;
    }
    // Cancel all render tasks and await settlement
    for (const canvasData of pageCanvases.values()) {
      if (canvasData.renderTask) {
        canvasData.renderTask.cancel();
        try {
          await canvasData.renderTask.promise;
        } catch (e) {
          if (e.name !== "RenderingCancelledException") {
            console.warn("Render task failed during cleanup:", e);
          }
        }
        canvasData.renderTask = null;
      }
    }
  }

  function close() {
    cleanup();
  }

  async function done() {
    await cleanup();
    onDone?.();
  }

  // Event listeners
  paletteButtons.forEach((btn) => {
    btn.addEventListener("click", () => setTool(btn.dataset.tool));
  });

  if (undoBtn) {
    undoBtn.addEventListener("click", () => {
      opts.store?.undo?.();
      updateToolButtons();
    });
  }
  if (redoBtn) {
    redoBtn.addEventListener("click", () => {
      opts.store?.redo?.();
      updateToolButtons();
    });
  }

  doneBtn.addEventListener("click", done);

  pagesWrap.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);

  zoomInBtn.addEventListener("click", zoomIn);
  zoomOutBtn.addEventListener("click", zoomOut);
  zoomFitBtn.addEventListener("click", zoomFitWidth);

  // Wheel zoom
  pagesWrap.addEventListener("wheel", (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      if (e.deltaY < 0) zoomIn(); else zoomOut();
    }
  }, { passive: false });

  // Keyboard
  view.addEventListener("keydown", onKeyDown);

  // Listen for store changes to refresh overlay (for undo/redo while view open)
  const unsubscribe = opts.subscribe?.((state) => {
    if (!view.hidden && !isCommittingText) {
      // Rebuild layout if pages changed (count, order, rotation)
      const oldPageCount = layout.blocks.length;
      const newPageCount = state.pages.length;
      if (oldPageCount !== newPageCount) {
        buildPageStructure();
        setupIntersectionObserver();
      }
      renderAllOverlays();
      updatePageIndicator();
      updateToolButtons();
    }
  }) || (() => {});

  return {
    enter,
    close,
    isOpen: () => !view.hidden,
    refreshFromState: () => {
      renderAllOverlays();
      updatePageIndicator();
      updateToolButtons();
    },
    // Test helper: programmatically select an annotation (sets internal state and publishes to store)
    selectAnnotation: (annotationId, pageId) => {
      selectAnnotation(annotationId, pageId);
    },
    destroy: () => {
      cleanup();
      unsubscribe();
      view.remove();
    },
  };
}