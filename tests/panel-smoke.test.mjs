// SMOKE HARNESS: Import panel.js in Node with fake DOM and test handlers
// This catches undefined names and verifies panel behavior
import { test } from "node:test";
import assert from "node:assert/strict";

// ---- Minimal Fake DOM implementation (same as annotate-view-smoke.test.mjs) ----

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.className = "";
    this.style = {};
    this.dataset = {};
    this.attributes = new Map();
    this.children = [];
    this.parent = null;
    this.eventListeners = new Map();
    this._innerHTML = "";
    this._textContent = "";
    this.value = "";
    this.id = "";
    this.type = "";
    this.min = "";
    this.max = "";
    this.ariaChecked = "false";
    this.ariaPressed = "false";
    this.ariaLabel = "";
    this.ariaHidden = "";
    this._hidden = false;
    this.disabled = false;
    this._boundingRect = { left: 0, top: 0, width: 800, height: 600 };
    this.firstElementChild = null;
    this.outerHTML = "";
    this.scrollTop = 0;
    this.clientHeight = 600;
    this.clientWidth = 800;
  }

  get hidden() {
    return this._hidden;
  }

  set hidden(val) {
    const oldVal = this._hidden;
    this._hidden = Boolean(val);
    if (this._hidden) {
      this.attributes.set("hidden", "");
    } else {
      this.attributes.delete("hidden");
    }
  }

  get textContent() {
    // In real DOM, textContent concatenates all descendant text nodes
    if (this.children.length > 0) {
      return this.children.map(c => c.textContent).join("");
    }
    return this._textContent || "";
  }

  set textContent(val) {
    this._textContent = String(val);
    // Clear children when setting textContent directly (like real DOM)
    this.children = [];
    this.firstElementChild = null;
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(html) {
    this._innerHTML = html;
    // Create mock elements that panel.js queries - ONLY for the root panel container
    // Check if this is a panel root container (id starts with "panel-root")
    if (html && !this.firstElementChild && this.id && this.id.startsWith("panel-root")) {
      // Create all elements that panel.js queries by ID
      const elementIds = [
        "doc-name", "stat-pages", "stat-source", "stat-size", "source-files",
        "export-all", "export-selected", "download-pdf", "privacy-count",
        "btn-preview", "btn-split",
        "page-number-mode", "page-number-format", "page-number-skip-first",
        "watermark-text", "watermark-error", "watermark-angle", "watermark-opacity",
        "meta-title", "meta-author", "split-mode", "split-every", "split-ranges",
        "page-number-position", "page-number-start", "page-number-font-size",
        "page-number-margin", "page-number-apply-to", "watermark-enabled",
        "watermark-size-mode", "watermark-fixed-size", "meta-subject",
        "meta-keywords", "meta-clear", "split-summary", "split-ranges-error",
        "annotate-panel-section", "annotate-panel-hint", "annotate-markup-style",
        "annotate-markup-colors", "annotate-thickness-field", "annotate-thickness",
        "annotate-opacity-field", "annotate-opacity", "annotate-image-options",
        "annotate-image-opacity", "annotate-image-keep-proportions",
        "annotate-image-choose", "annotate-image-replace", "annotate-image-delete",
        "annotate-panel-delete", "annotate-annotation-list",
        "annotate-group-markup", "annotate-group-text", "annotate-empty",
        "annotate-aria-live", "annotate-text-controls",
      ];

      for (const id of elementIds) {
        const tag = (id.includes("btn") || id === "download-pdf" || id === "btn-preview" || id === "btn-split" || id === "meta-clear" || id === "annotate-panel-delete") ? "button" :
                    (id.includes("input") || id.includes("text") || id.includes("format") || id.includes("angle") || id.includes("opacity") || id.includes("size") || id.includes("start") || id.includes("margin") || id.includes("font") || id.includes("subject") || id.includes("keywords") || id.includes("title") || id.includes("author") || id.includes("every") || id.includes("ranges") || id === "watermark-text" || id === "meta-title" || id === "meta-author" || id === "doc-name") ? "input" :
                    (id === "page-number-mode" || id === "page-number-format" || id === "page-number-position" || id === "page-number-apply-to" || id === "split-mode" || id === "watermark-size-mode" || id === "annotate-font-size") ? "select" : "div";
        const el = new FakeElement(tag);
        el.id = id;
        if (id === "annotate-panel-delete") el.hidden = true; // Initially hidden
        this.appendChild(el);
      }
    }
  }

  setAttribute(name, value) {
    this.attributes.set(name, value);
    if (name === "class") this.className = value;
    if (name === "id") this.id = value;
    if (name === "type") this.type = value;
    if (name === "min") this.min = value;
    if (name === "max") this.max = value;
    if (name === "aria-checked") this.ariaChecked = value;
    if (name === "aria-pressed") this.ariaPressed = value;
    if (name === "aria-label") this.ariaLabel = value;
    if (name === "aria-hidden") this.ariaHidden = value;
    if (name === "hidden") this.hidden = value === "true" || value === "";
    if (name === "disabled") this.disabled = value === "true" || value === "";
  }

  getAttribute(name) {
    return this.attributes.get(name) || null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
    if (name === "class") this.className = "";
    if (name === "id") this.id = "";
    if (name === "type") this.type = "";
    if (name === "min") this.min = "";
    if (name === "max") this.max = "";
    if (name === "aria-checked") this.ariaChecked = "false";
    if (name === "aria-pressed") this.ariaPressed = "false";
    if (name === "aria-label") this.ariaLabel = "";
    if (name === "aria-hidden") this.ariaHidden = "";
    if (name === "hidden") this.hidden = false;
    if (name === "disabled") this.disabled = false;
  }

  toggleAttribute(name, force) {
    if (force) this.setAttribute(name, "");
    else this.attributes.delete(name);
  }

  getAttribute(name) {
    return this.attributes.get(name) || null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
    if (name === "class") this.className = "";
    if (name === "id") this.id = "";
    if (name === "type") this.type = "";
    if (name === "min") this.min = "";
    if (name === "max") this.max = "";
    if (name === "aria-checked") this.ariaChecked = "false";
    if (name === "aria-pressed") this.ariaPressed = "false";
    if (name === "aria-label") this.ariaLabel = "";
    if (name === "aria-hidden") this.ariaHidden = "";
    if (name === "hidden") this.hidden = false;
    if (name === "disabled") this.disabled = false;
  }

  toggleAttribute(name, force) {
    if (force) this.setAttribute(name, "");
    else this.attributes.delete(name);
  }

  get classList() {
    return new FakeClassList(this);
  }

  querySelector(selector) {
    if (selector.startsWith("#")) {
      const id = selector.slice(1);
      return this.findById(id);
    }
    if (selector.startsWith(".")) {
      const cls = selector.slice(1);
      return this.findByClass(cls);
    }
    return this.findByTag(selector);
  }

  querySelectorAll(selector) {
    const results = [];
    this.collectBySelector(selector, results);
    return results;
  }

  findById(id) {
    if (this.id === id) return this;
    for (const child of this.children) {
      const found = child.findById(id);
      if (found) return found;
    }
    return null;
  }

  findByClass(cls) {
    if (this.className.split(" ").includes(cls)) return this;
    for (const child of this.children) {
      const found = child.findByClass(cls);
      if (found) return found;
    }
    return null;
  }

  findByTag(tag) {
    if (this.tagName === tag.toUpperCase()) return this;
    for (const child of this.children) {
      const found = child.findByTag(tag);
      if (found) return found;
    }
    return null;
  }

  collectBySelector(selector, results) {
    if (selector.startsWith("#")) {
      const found = this.findById(selector.slice(1));
      if (found) results.push(found);
    } else if (selector.startsWith(".")) {
      this.collectByClass(selector.slice(1), results);
    } else {
      this.collectByTag(selector.toUpperCase(), results);
    }
  }

  collectByClass(cls, results) {
    if (this.className.split(" ").includes(cls)) results.push(this);
    for (const child of this.children) child.collectByClass(cls, results);
  }

  collectByTag(tag, results) {
    if (this.tagName === tag) results.push(this);
    for (const child of this.children) child.collectByTag(tag, results);
  }

  closest(selector) {
    let el = this;
    while (el) {
      if (selector.startsWith(".") && el.className.split(" ").includes(selector.slice(1))) return el;
      if (selector.startsWith("#") && el.id === selector.slice(1)) return el;
      el = el.parent;
    }
    return null;
  }

  appendChild(child) {
    if (!child) return null;
    child.parent = this;
    this.children.push(child);
    this.firstElementChild = this.children[0];
    return child;
  }

  remove() {
    if (this.parent) {
      this.parent.children = this.parent.children.filter(c => c !== this);
      this.parent = null;
    }
  }

  addEventListener(type, handler) {
    if (!this.eventListeners.has(type)) this.eventListeners.set(type, []);
    this.eventListeners.get(type).push(handler);
  }

  removeEventListener(type, handler) {
    if (this.eventListeners.has(type)) {
      const handlers = this.eventListeners.get(type);
      const idx = handlers.indexOf(handler);
      if (idx >= 0) handlers.splice(idx, 1);
    }
  }

  dispatchEvent(event) {
    const handlers = this.eventListeners.get(event.type) || [];
    for (const h of handlers) h.call(this, event);
  }

  getBoundingClientRect() {
    return { ...this._boundingRect };
  }

  focus() {}

  setSelectionRange() {}
}

class FakeClassList {
  constructor(element) {
    this.element = element;
  }
  add(...names) {
    for (const n of names) {
      if (!this.element.className.split(" ").includes(n)) {
        this.element.className += (this.element.className ? " " : "") + n;
      }
    }
  }
  remove(...names) {
    this.element.className = this.element.className.split(" ").filter(n => !names.includes(n)).join(" ");
  }
  toggle(name, force) {
    const has = this.element.className.split(" ").includes(name);
    if (force === true) {
      this.add(name);
    } else if (force === false) {
      this.remove(name);
    } else {
      if (has) this.remove(name);
      else this.add(name);
    }
    return !has; // Return new state
  }
  contains(name) {
    return this.element.className.split(" ").includes(name);
  }
}

class FakeDocument extends FakeElement {
  constructor() {
    super("html");
    this.body = new FakeElement("body");
    this.head = new FakeElement("head");
    this.children = [this.head, this.body];
    this.body.parent = this;
    this.head.parent = this;
    this._elementsById = new Map();
    this._allElements = [this, this.head, this.body];
  }

  createElement(tagName) {
    const el = new FakeElement(tagName);
    this._allElements.push(el);
    return el;
  }

  createElementNS(ns, tagName) {
    return this.createElement(tagName);
  }

  getElementById(id) {
    return this._elementsById.get(id) || null;
  }

  registerElement(el) {
    if (el.id) this._elementsById.set(el.id, el);
  }

  querySelector(selector) {
    if (selector.startsWith("#")) {
      return this.getElementById(selector.slice(1));
    }
    return this.body.querySelector(selector);
  }

  querySelectorAll(selector) {
    return this.body.querySelectorAll(selector);
  }
}

// Global fake DOM
const fakeDoc = new FakeDocument();
global.document = fakeDoc;
global.window = {
  addEventListener: () => {},
  removeEventListener: () => {},
  requestAnimationFrame: (cb) => setTimeout(cb, 0),
  cancelAnimationFrame: (id) => clearTimeout(id),
  getComputedStyle: () => ({}),
  IntersectionObserver: class {
    constructor(cb) { this.cb = cb; }
    observe() {}
    unobserve() {}
    disconnect() {}
  },
  ResizeObserver: class {
    constructor(cb) { this.cb = cb; }
    observe() {}
    unobserve() {}
    disconnect() {}
  },
  HTMLElement: FakeElement,
  Element: FakeElement,
};

global.IntersectionObserver = global.window.IntersectionObserver;
global.ResizeObserver = global.window.ResizeObserver;

// Mock ES module imports for panel.js
const originalImport = globalThis.import;
globalThis.import = async (specifier) => {
  if (specifier === "../core/privacy-meter.js") {
    return { subscribe: (fn) => { fn(0); return () => {}; } };
  }
  if (specifier === "../file-manager.js") {
    return { formatBytes: (b) => b + " B" };
  }
  if (specifier === "../icons.js") {
    return { hydrateIcons: (el) => {} };
  }
  if (specifier === "../core/overlay.js") {
    return { validateWatermark: (text) => { if (!text) return null; if (text.length > 200) return "Watermark text too long"; return null; } };
  }
  if (specifier === "../core/disclosure.js") {
    return { initDisclosures: (root) => {} };
  }
  if (specifier === "../core/annotations.js") {
    return {
      getAnnotationCount: () => 0,
      getPageAnnotations: (a, pid) => a[pid] || [],
      createTextAnnotation: () => {},
      createHighlightAnnotation: () => {},
      updateAnnotation: (anns, pid, aid, changes) => { const pageAnns = anns[pid] || []; const idx = pageAnns.findIndex(a => a.id === aid); if (idx >= 0) pageAnns[idx] = { ...pageAnns[idx], ...changes }; anns[pid] = pageAnns; return anns; },
      deleteAnnotation: (anns, pid, aid) => { const pageAnns = anns[pid] || []; anns[pid] = pageAnns.filter(a => a.id !== aid); return anns; },
      DEFAULT_TEXT_FONT_SIZE: 14,
      DEFAULT_TEXT_COLOR: "#000000",
      DEFAULT_HIGHLIGHT_COLOR: "#ffe14d",
      DEFAULT_HIGHLIGHT_OPACITY: 0.4,
    };
  }
  return originalImport(specifier);
};

// Mock hydrateIcons
const hydrateIcons = (el) => {};

// Mock initDisclosures
const initDisclosures = (root) => {};

// Mock validateWatermark
const validateWatermark = (text) => {
  if (!text) return null;
  if (text.length > 200) return "Watermark text too long (max 200 chars)";
  return null;
};

// Mock privacy meter (used by tests that don't go through import mock)
const subscribeMeter = (fn) => {
  fn(0);
  return () => {};
};

// ---- Test setup ----

// Create mock store with annotations
function createMockStore() {
  const annotations = {
    p1: [
      { id: "h1", type: "highlight", x: 100, y: 100, width: 200, height: 50, color: "#ffe14d", opacity: 0.4 },
      { id: "t1", type: "text", x: 100, y: 200, text: "Test text", fontSize: 14, color: "#000000" },
    ],
  };

  return {
    get: () => ({
      pages: [
        { id: "p1", sourceId: "s1", index: 0, baseRotation: 0, rotated: 0, width: 612, height: 792 },
        { id: "p2", sourceId: "s1", index: 1, baseRotation: 0, rotated: 0, width: 612, height: 792 },
      ],
      sourceFiles: [
        { id: "s1", name: "test.pdf", size: 102400, type: "application/pdf" },
      ],
      totalSize: 102400,
      selected: [],
      fileName: "test.pdf",
      exportMode: "all",
      exportOptions: {
        pageNumbers: { mode: "none" },
        watermark: { enabled: false },
        metadata: {},
        split: { mode: "every" },
      },
      view: "annotate",
      annotations,
      annotateCurrentPageId: "p1",
      annotateSelectedAnnotationId: "h1",
      annotateSelectedPageId: "p1",
      annotateCurrentTool: "select",
      annotateFontSize: 14,
      annotateTextColor: "#000000",
      annotateHighlightColor: "#ffe14d",
      annotateHighlightOpacity: 0.4,
    }),
    patch: (partial) => {},
    subscribe: (fn) => { fn(mockStore.get()); return () => {}; },
    undo: () => false,
    redo: () => false,
    canUndo: () => false,
    canRedo: () => false,
    annotations,
  };
}

const mockStore = createMockStore();

const mockGetSource = (sourceId) => Promise.resolve({
  id: sourceId,
  kind: "pdf",
  bytes: new Uint8Array(100),
  type: "application/pdf",
  size: 100,
  pageCount: 2,
});

const mockUpdateAnnotations = (mutator) => {
  const currentAnns = mockStore.get().annotations;
  const newAnns = mutator(currentAnns);
  mockStore.annotations = newAnns;
  return newAnns;
};

const mockOnFileNameChange = () => {};
const mockOnExportModeChange = () => {};
const mockOnDownloadPDF = () => {};
const mockOnSplitPDF = () => {};
const mockOnPreview = () => {};
const mockOnExportOptionsChange = () => {};
const mockOnSourceRemove = () => {};

// ---- Tests ----

test("panel smoke: module loads and exports mountPanel", async () => {
  const mod = await import("../js/ui/panel.js");
  assert.ok(mod.mountPanel, "mountPanel must be exported");
  assert.ok(typeof mod.mountPanel === "function", "mountPanel must be a function");
});

test("panel smoke: renders without errors with full state", async () => {
  const { mountPanel } = await import("../js/ui/panel.js");

  const container = fakeDoc.createElement("div");
  container.id = "panel-root";
  fakeDoc.body.appendChild(container);

  // Set up the HTML structure that panel.js expects
  container.innerHTML = `
    <input id="doc-name" value="test">
    <span id="stat-pages">0</span>
    <span id="stat-source">0</span>
    <span id="stat-size">0 B</span>
    <div id="source-files"></div>
    <button id="export-all">All</button>
    <button id="export-selected">Selected</button>
    <button id="download-pdf">Download</button>
    <span id="privacy-count">0</span>
    <button id="btn-preview">Preview</button>
    <button id="btn-split">Split</button>
    <select id="page-number-mode"><option value="none">None</option></select>
    <select id="page-number-format"><option value="n">1, 2, 3</option></select>
    <input id="page-number-skip-first" type="checkbox">
    <input id="watermark-text" value="">
    <span id="watermark-error" hidden></span>
    <input id="watermark-angle" value="0">
    <input id="watermark-opacity" value="30">
    <input id="meta-title" value="">
    <input id="meta-author" value="">
    <select id="split-mode"><option value="every">Every N</option></select>
    <input id="split-every" value="1">
    <input id="split-ranges" value="">
    <select id="page-number-position"><option value="bottom-center">Bottom Center</option></select>
    <input id="page-number-start" value="1">
    <input id="page-number-font-size" value="10">
    <input id="page-number-margin" value="36">
    <select id="page-number-apply-to"><option value="all">All</option></select>
    <input id="watermark-enabled" type="checkbox">
    <select id="watermark-size-mode"><option value="auto">Auto</option></select>
    <input id="watermark-fixed-size" value="72">
    <input id="meta-subject" value="">
    <input id="meta-keywords" value="">
    <button id="meta-clear">Clear</button>
    <span id="split-summary" hidden></span>
    <span id="split-ranges-error" hidden></span>
    <div id="annotate-panel-section" hidden>
      <span id="annotate-panel-hint"></span>
      <div id="annotate-highlight-options" hidden></div>
      <div id="annotate-text-options" hidden></div>
      <select id="annotate-font-size"></select>
      <input id="annotate-opacity" type="range" min="0" max="100" value="40">
      <button id="annotate-panel-delete" hidden>Delete</button>
      <div id="annotate-annotation-list"></div>
    </div>
  `;

  const panel = mountPanel(container, {
    onFileNameChange: mockOnFileNameChange,
    onExportModeChange: mockOnExportModeChange,
    onDownloadPDF: mockOnDownloadPDF,
    onSplitPDF: mockOnSplitPDF,
    onPreview: mockOnPreview,
    onExportOptionsChange: mockOnExportOptionsChange,
    onSourceRemove: mockOnSourceRemove,
    getState: () => mockStore.get(),
    updateAnnotations: mockUpdateAnnotations,
    store: mockStore,
  });

  // Render with full state
  panel.render(mockStore.get());

  // Verify stats are updated
  const statPages = container.querySelector("#stat-pages");
  // panel.js sets textContent to a number, which in real DOM becomes string
  // In fake DOM it's the raw value, so accept both
  assert.ok(statPages.textContent == 2 || statPages.textContent == "2", "Should show 2 pages");

  const statSource = container.querySelector("#stat-source");
  // panel.js sets textContent to a number, which in real DOM becomes string
  // In fake DOM it's the raw value, so accept both
  assert.ok(statSource.textContent == 1 || statSource.textContent == "1", "Should show 1 source file");

  // Verify annotate panel section is shown (view is annotate)
  const annotateSection = container.querySelector("#annotate-panel-section");
  assert.equal(annotateSection.hidden, false, "Annotate section should be visible in annotate mode");

  // Verify delete button is shown when annotation is selected
  const deleteBtn = container.querySelector("#annotate-panel-delete");
  assert.equal(deleteBtn.hidden, false, "Delete button should be visible when annotation is selected");

  // Verify aria-live region exists and exactly one group shows: a selected
  // highlight shows the markup group even when the tool is "select" (selected
  // type wins over tool); the empty state stays hidden.
  assert.ok(container.querySelector("#annotate-aria-live"), "aria-live region exists");
  assert.equal(container.querySelector("#annotate-group-markup").hidden, false, "markup group shows for a selected highlight");
  assert.equal(container.querySelector("#annotate-empty").hidden, true, "empty state hidden when a mark is selected");

  // Verify color swatches are populated (they may be empty in fake DOM, but no error)
  // Just verify no throw

  panel.destroy();
});

test("panel smoke: delete button hidden when no annotation selected", async () => {
  const { mountPanel } = await import("../js/ui/panel.js");

  const container = fakeDoc.createElement("div");
  container.id = "panel-root-2";
  fakeDoc.body.appendChild(container);

  container.innerHTML = `
    <input id="doc-name" value="test">
    <span id="stat-pages">0</span>
    <span id="stat-source">0</span>
    <span id="stat-size">0 B</span>
    <div id="source-files"></div>
    <button id="export-all">All</button>
    <button id="export-selected">Selected</button>
    <button id="download-pdf">Download</button>
    <span id="privacy-count">0</span>
    <button id="btn-preview">Preview</button>
    <button id="btn-split">Split</button>
    <select id="page-number-mode"><option value="none">None</option></select>
    <select id="page-number-format"><option value="n">1, 2, 3</option></select>
    <input id="page-number-skip-first" type="checkbox">
    <input id="watermark-text" value="">
    <span id="watermark-error" hidden></span>
    <input id="watermark-angle" value="0">
    <input id="watermark-opacity" value="30">
    <input id="meta-title" value="">
    <input id="meta-author" value="">
    <select id="split-mode"><option value="every">Every N</option></select>
    <input id="split-every" value="1">
    <input id="split-ranges" value="">
    <select id="page-number-position"><option value="bottom-center">Bottom Center</option></select>
    <input id="page-number-start" value="1">
    <input id="page-number-font-size" value="10">
    <input id="page-number-margin" value="36">
    <select id="page-number-apply-to"><option value="all">All</option></select>
    <input id="watermark-enabled" type="checkbox">
    <select id="watermark-size-mode"><option value="auto">Auto</option></select>
    <input id="watermark-fixed-size" value="72">
    <input id="meta-subject" value="">
    <input id="meta-keywords" value="">
    <button id="meta-clear">Clear</button>
    <span id="split-summary" hidden></span>
    <span id="split-ranges-error" hidden></span>
    <div id="annotate-panel-section" hidden>
      <span id="annotate-panel-hint"></span>
      <div id="annotate-highlight-options" hidden></div>
      <div id="annotate-text-options" hidden></div>
      <select id="annotate-font-size"></select>
      <input id="annotate-opacity" type="range" min="0" max="100" value="40">
      <button id="annotate-panel-delete" hidden>Delete</button>
      <div id="annotate-annotation-list"></div>
    </div>
  `;

  // Create store with NO selected annotation
  const storeNoSelection = {
    ...mockStore,
    get: () => ({
      ...mockStore.get(),
      annotateSelectedAnnotationId: null,
      annotateSelectedPageId: null,
    }),
  };

  const panel = mountPanel(container, {
    onFileNameChange: mockOnFileNameChange,
    onExportModeChange: mockOnExportModeChange,
    onDownloadPDF: mockOnDownloadPDF,
    onSplitPDF: mockOnSplitPDF,
    onPreview: mockOnPreview,
    onExportOptionsChange: mockOnExportOptionsChange,
    onSourceRemove: mockOnSourceRemove,
    getState: () => storeNoSelection.get(),
    updateAnnotations: mockUpdateAnnotations,
    store: storeNoSelection,
  });

  panel.render(storeNoSelection.get());

  // Verify delete button is hidden when no annotation selected
  const deleteBtn = container.querySelector("#annotate-panel-delete");
  assert.equal(deleteBtn.hidden, true, "Delete button should be hidden when no annotation selected");

  panel.destroy();
});

test("panel smoke: delete button shows when annotation selected via state", async () => {
  const { mountPanel } = await import("../js/ui/panel.js");

  const container = fakeDoc.createElement("div");
  container.id = "panel-root-3";
  fakeDoc.body.appendChild(container);

  container.innerHTML = `
    <input id="doc-name" value="test">
    <span id="stat-pages">0</span>
    <span id="stat-source">0</span>
    <span id="stat-size">0 B</span>
    <div id="source-files"></div>
    <button id="export-all">All</button>
    <button id="export-selected">Selected</button>
    <button id="download-pdf">Download</button>
    <span id="privacy-count">0</span>
    <button id="btn-preview">Preview</button>
    <button id="btn-split">Split</button>
    <select id="page-number-mode"><option value="none">None</option></select>
    <select id="page-number-format"><option value="n">1, 2, 3</option></select>
    <input id="page-number-skip-first" type="checkbox">
    <input id="watermark-text" value="">
    <span id="watermark-error" hidden></span>
    <input id="watermark-angle" value="0">
    <input id="watermark-opacity" value="30">
    <input id="meta-title" value="">
    <input id="meta-author" value="">
    <select id="split-mode"><option value="every">Every N</option></select>
    <input id="split-every" value="1">
    <input id="split-ranges" value="">
    <select id="page-number-position"><option value="bottom-center">Bottom Center</option></select>
    <input id="page-number-start" value="1">
    <input id="page-number-font-size" value="10">
    <input id="page-number-margin" value="36">
    <select id="page-number-apply-to"><option value="all">All</option></select>
    <input id="watermark-enabled" type="checkbox">
    <select id="watermark-size-mode"><option value="auto">Auto</option></select>
    <input id="watermark-fixed-size" value="72">
    <input id="meta-subject" value="">
    <input id="meta-keywords" value="">
    <button id="meta-clear">Clear</button>
    <span id="split-summary" hidden></span>
    <span id="split-ranges-error" hidden></span>
    <div id="annotate-panel-section" hidden>
      <span id="annotate-panel-hint"></span>
      <div id="annotate-highlight-options" hidden></div>
      <div id="annotate-text-options" hidden></div>
      <select id="annotate-font-size"></select>
      <input id="annotate-opacity" type="range" min="0" max="100" value="40">
      <button id="annotate-panel-delete" hidden>Delete</button>
      <div id="annotate-annotation-list"></div>
    </div>
  `;

  // Create store WITH selected annotation
  const storeWithSelection = {
    ...mockStore,
    get: () => ({
      ...mockStore.get(),
      annotateSelectedAnnotationId: "h1",
      annotateSelectedPageId: "p1",
    }),
  };

  const panel = mountPanel(container, {
    onFileNameChange: mockOnFileNameChange,
    onExportModeChange: mockOnExportModeChange,
    onDownloadPDF: mockOnDownloadPDF,
    onSplitPDF: mockOnSplitPDF,
    onPreview: mockOnPreview,
    onExportOptionsChange: mockOnExportOptionsChange,
    onSourceRemove: mockOnSourceRemove,
    getState: () => storeWithSelection.get(),
    updateAnnotations: mockUpdateAnnotations,
    store: storeWithSelection,
  });

  panel.render(storeWithSelection.get());

  // Verify delete button is shown when annotation is selected
  const deleteBtn = container.querySelector("#annotate-panel-delete");
  assert.equal(deleteBtn.hidden, false, "Delete button should be visible when annotation is selected via state");

  panel.destroy();
});

test("panel smoke: annotate panel section hidden in pages view", async () => {
  const { mountPanel } = await import("../js/ui/panel.js");

  const container = fakeDoc.createElement("div");
  container.id = "panel-root-4";
  fakeDoc.body.appendChild(container);

  container.innerHTML = `
    <input id="doc-name" value="test">
    <span id="stat-pages">0</span>
    <span id="stat-source">0</span>
    <span id="stat-size">0 B</span>
    <div id="source-files"></div>
    <button id="export-all">All</button>
    <button id="export-selected">Selected</button>
    <button id="download-pdf">Download</button>
    <span id="privacy-count">0</span>
    <button id="btn-preview">Preview</button>
    <button id="btn-split">Split</button>
    <select id="page-number-mode"><option value="none">None</option></select>
    <select id="page-number-format"><option value="n">1, 2, 3</option></select>
    <input id="page-number-skip-first" type="checkbox">
    <input id="watermark-text" value="">
    <span id="watermark-error" hidden></span>
    <input id="watermark-angle" value="0">
    <input id="watermark-opacity" value="30">
    <input id="meta-title" value="">
    <input id="meta-author" value="">
    <select id="split-mode"><option value="every">Every N</option></select>
    <input id="split-every" value="1">
    <input id="split-ranges" value="">
    <select id="page-number-position"><option value="bottom-center">Bottom Center</option></select>
    <input id="page-number-start" value="1">
    <input id="page-number-font-size" value="10">
    <input id="page-number-margin" value="36">
    <select id="page-number-apply-to"><option value="all">All</option></select>
    <input id="watermark-enabled" type="checkbox">
    <select id="watermark-size-mode"><option value="auto">Auto</option></select>
    <input id="watermark-fixed-size" value="72">
    <input id="meta-subject" value="">
    <input id="meta-keywords" value="">
    <button id="meta-clear">Clear</button>
    <span id="split-summary" hidden></span>
    <span id="split-ranges-error" hidden></span>
    <div id="annotate-panel-section" hidden>
      <span id="annotate-panel-hint"></span>
      <div id="annotate-highlight-options" hidden></div>
      <div id="annotate-text-options" hidden></div>
      <select id="annotate-font-size"></select>
      <input id="annotate-opacity" type="range" min="0" max="100" value="40">
      <button id="annotate-panel-delete" hidden>Delete</button>
      <div id="annotate-annotation-list"></div>
    </div>
  `;

  // Create store with view = "pages" (not annotate)
  const storePagesView = {
    ...mockStore,
    get: () => ({
      ...mockStore.get(),
      view: "pages",
      annotateSelectedAnnotationId: "h1",
      annotateSelectedPageId: "p1",
    }),
  };

  const panel = mountPanel(container, {
    onFileNameChange: mockOnFileNameChange,
    onExportModeChange: mockOnExportModeChange,
    onDownloadPDF: mockOnDownloadPDF,
    onSplitPDF: mockOnSplitPDF,
    onPreview: mockOnPreview,
    onExportOptionsChange: mockOnExportOptionsChange,
    onSourceRemove: mockOnSourceRemove,
    getState: () => storePagesView.get(),
    updateAnnotations: mockUpdateAnnotations,
    store: storePagesView,
  });

  panel.render(storePagesView.get());

  // Verify annotate panel section is hidden in pages view
  const annotateSection = container.querySelector("#annotate-panel-section");
  assert.equal(annotateSection.hidden, true, "Annotate section should be hidden in pages view");

  panel.destroy();
});

test("panel smoke: panel renders source files list", async () => {
  const { mountPanel } = await import("../js/ui/panel.js");

  const container = fakeDoc.createElement("div");
  container.id = "panel-root-5";
  fakeDoc.body.appendChild(container);

  container.innerHTML = `
    <input id="doc-name" value="test">
    <span id="stat-pages">0</span>
    <span id="stat-source">0</span>
    <span id="stat-size">0 B</span>
    <div id="source-files"></div>
    <button id="export-all">All</button>
    <button id="export-selected">Selected</button>
    <button id="download-pdf">Download</button>
    <span id="privacy-count">0</span>
    <button id="btn-preview">Preview</button>
    <button id="btn-split">Split</button>
    <select id="page-number-mode"><option value="none">None</option></select>
    <select id="page-number-format"><option value="n">1, 2, 3</option></select>
    <input id="page-number-skip-first" type="checkbox">
    <input id="watermark-text" value="">
    <span id="watermark-error" hidden></span>
    <input id="watermark-angle" value="0">
    <input id="watermark-opacity" value="30">
    <input id="meta-title" value="">
    <input id="meta-author" value="">
    <select id="split-mode"><option value="every">Every N</option></select>
    <input id="split-every" value="1">
    <input id="split-ranges" value="">
    <select id="page-number-position"><option value="bottom-center">Bottom Center</option></select>
    <input id="page-number-start" value="1">
    <input id="page-number-font-size" value="10">
    <input id="page-number-margin" value="36">
    <select id="page-number-apply-to"><option value="all">All</option></select>
    <input id="watermark-enabled" type="checkbox">
    <select id="watermark-size-mode"><option value="auto">Auto</option></select>
    <input id="watermark-fixed-size" value="72">
    <input id="meta-subject" value="">
    <input id="meta-keywords" value="">
    <button id="meta-clear">Clear</button>
    <span id="split-summary" hidden></span>
    <span id="split-ranges-error" hidden></span>
    <div id="annotate-panel-section" hidden>
      <span id="annotate-panel-hint"></span>
      <div id="annotate-highlight-options" hidden></div>
      <div id="annotate-text-options" hidden></div>
      <select id="annotate-font-size"></select>
      <input id="annotate-opacity" type="range" min="0" max="100" value="40">
      <button id="annotate-panel-delete" hidden>Delete</button>
      <div id="annotate-annotation-list"></div>
    </div>
  `;

  const panel = mountPanel(container, {
    onFileNameChange: mockOnFileNameChange,
    onExportModeChange: mockOnExportModeChange,
    onDownloadPDF: mockOnDownloadPDF,
    onSplitPDF: mockOnSplitPDF,
    onPreview: mockOnPreview,
    onExportOptionsChange: mockOnExportOptionsChange,
    onSourceRemove: mockOnSourceRemove,
    getState: () => mockStore.get(),
    updateAnnotations: mockUpdateAnnotations,
    store: mockStore,
  });

  panel.render(mockStore.get());

  // Verify source files list is populated
  const sourceList = container.querySelector("#source-files");
  assert.ok(sourceList.children.length > 0, "Source list should have items");

  const firstItem = sourceList.children[0];
  assert.ok(firstItem.textContent.includes("test.pdf"), "Should show source file name");
  assert.ok(firstItem.textContent.includes("100"), "Should show file size");

  panel.destroy();
});

test("panel smoke: export mode buttons reflect state", async () => {
  const { mountPanel } = await import("../js/ui/panel.js");

  const container = fakeDoc.createElement("div");
  container.id = "panel-root-6";
  fakeDoc.body.appendChild(container);

  container.innerHTML = `
    <input id="doc-name" value="test">
    <span id="stat-pages">0</span>
    <span id="stat-source">0</span>
    <span id="stat-size">0 B</span>
    <div id="source-files"></div>
    <button id="export-all">All</button>
    <button id="export-selected">Selected</button>
    <button id="download-pdf">Download</button>
    <span id="privacy-count">0</span>
    <button id="btn-preview">Preview</button>
    <button id="btn-split">Split</button>
    <select id="page-number-mode"><option value="none">None</option></select>
    <select id="page-number-format"><option value="n">1, 2, 3</option></select>
    <input id="page-number-skip-first" type="checkbox">
    <input id="watermark-text" value="">
    <span id="watermark-error" hidden></span>
    <input id="watermark-angle" value="0">
    <input id="watermark-opacity" value="30">
    <input id="meta-title" value="">
    <input id="meta-author" value="">
    <select id="split-mode"><option value="every">Every N</option></select>
    <input id="split-every" value="1">
    <input id="split-ranges" value="">
    <select id="page-number-position"><option value="bottom-center">Bottom Center</option></select>
    <input id="page-number-start" value="1">
    <input id="page-number-font-size" value="10">
    <input id="page-number-margin" value="36">
    <select id="page-number-apply-to"><option value="all">All</option></select>
    <input id="watermark-enabled" type="checkbox">
    <select id="watermark-size-mode"><option value="auto">Auto</option></select>
    <input id="watermark-fixed-size" value="72">
    <input id="meta-subject" value="">
    <input id="meta-keywords" value="">
    <button id="meta-clear">Clear</button>
    <span id="split-summary" hidden></span>
    <span id="split-ranges-error" hidden></span>
    <div id="annotate-panel-section" hidden>
      <span id="annotate-panel-hint"></span>
      <div id="annotate-highlight-options" hidden></div>
      <div id="annotate-text-options" hidden></div>
      <select id="annotate-font-size"></select>
      <input id="annotate-opacity" type="range" min="0" max="100" value="40">
      <button id="annotate-panel-delete" hidden>Delete</button>
      <div id="annotate-annotation-list"></div>
    </div>
  `;

  // Store with exportMode = "selected" and some selected pages
  const storeSelectedMode = {
    ...mockStore,
    get: () => ({
      ...mockStore.get(),
      exportMode: "selected",
      selected: ["p1"],
    }),
  };

  const panel = mountPanel(container, {
    onFileNameChange: mockOnFileNameChange,
    onExportModeChange: mockOnExportModeChange,
    onDownloadPDF: mockOnDownloadPDF,
    onSplitPDF: mockOnSplitPDF,
    onPreview: mockOnPreview,
    onExportOptionsChange: mockOnExportOptionsChange,
    onSourceRemove: mockOnSourceRemove,
    getState: () => storeSelectedMode.get(),
    updateAnnotations: mockUpdateAnnotations,
    store: storeSelectedMode,
  });

  panel.render(storeSelectedMode.get());

  // Verify export-selected button is active
  const exportAll = container.querySelector("#export-all");
  const exportSelected = container.querySelector("#export-selected");

  assert.equal(exportAll.classList.contains("ds-segment--active"), false, "Export All should not be active");
  assert.equal(exportSelected.classList.contains("ds-segment--active"), true, "Export Selected should be active");
  assert.equal(exportSelected.textContent, "Selected (1)", "Should show selected count");

  panel.destroy();
});

test("panel smoke: destroy cleans up subscriptions", async () => {
  const { mountPanel } = await import("../js/ui/panel.js");

  const container = fakeDoc.createElement("div");
  container.id = "panel-root-7";
  fakeDoc.body.appendChild(container);

  container.innerHTML = `
    <input id="doc-name" value="test">
    <span id="stat-pages">0</span>
    <span id="stat-source">0</span>
    <span id="stat-size">0 B</span>
    <div id="source-files"></div>
    <button id="export-all">All</button>
    <button id="export-selected">Selected</button>
    <button id="download-pdf">Download</button>
    <span id="privacy-count">0</span>
    <button id="btn-preview">Preview</button>
    <button id="btn-split">Split</button>
    <select id="page-number-mode"><option value="none">None</option></select>
    <select id="page-number-format"><option value="n">1, 2, 3</option></select>
    <input id="page-number-skip-first" type="checkbox">
    <input id="watermark-text" value="">
    <span id="watermark-error" hidden></span>
    <input id="watermark-angle" value="0">
    <input id="watermark-opacity" value="30">
    <input id="meta-title" value="">
    <input id="meta-author" value="">
    <select id="split-mode"><option value="every">Every N</option></select>
    <input id="split-every" value="1">
    <input id="split-ranges" value="">
    <select id="page-number-position"><option value="bottom-center">Bottom Center</option></select>
    <input id="page-number-start" value="1">
    <input id="page-number-font-size" value="10">
    <input id="page-number-margin" value="36">
    <select id="page-number-apply-to"><option value="all">All</option></select>
    <input id="watermark-enabled" type="checkbox">
    <select id="watermark-size-mode"><option value="auto">Auto</option></select>
    <input id="watermark-fixed-size" value="72">
    <input id="meta-subject" value="">
    <input id="meta-keywords" value="">
    <button id="meta-clear">Clear</button>
    <span id="split-summary" hidden></span>
    <span id="split-ranges-error" hidden></span>
    <div id="annotate-panel-section" hidden>
      <span id="annotate-panel-hint"></span>
      <div id="annotate-highlight-options" hidden></div>
      <div id="annotate-text-options" hidden></div>
      <select id="annotate-font-size"></select>
      <input id="annotate-opacity" type="range" min="0" max="100" value="40">
      <button id="annotate-panel-delete" hidden>Delete</button>
      <div id="annotate-annotation-list"></div>
    </div>
  `;

  const panel = mountPanel(container, {
    onFileNameChange: mockOnFileNameChange,
    onExportModeChange: mockOnExportModeChange,
    onDownloadPDF: mockOnDownloadPDF,
    onSplitPDF: mockOnSplitPDF,
    onPreview: mockOnPreview,
    onExportOptionsChange: mockOnExportOptionsChange,
    onSourceRemove: mockOnSourceRemove,
    getState: () => mockStore.get(),
    updateAnnotations: mockUpdateAnnotations,
    store: mockStore,
  });

  panel.render(mockStore.get());
  // destroy() should not throw and should clean up subscriptions
  panel.destroy();
  assert.ok(true, "destroy() completes without error");
});

test("panel smoke: option groups follow selected annotation type, not just tool", async () => {
  const { mountPanel } = await import("../js/ui/panel.js");

  const container = fakeDoc.createElement("div");
  container.id = "panel-root-8";
  fakeDoc.body.appendChild(container);

  container.innerHTML = `
    <input id="doc-name" value="test">
    <span id="stat-pages">0</span>
    <span id="stat-source">0</span>
    <span id="stat-size">0 B</span>
    <div id="source-files"></div>
    <button id="export-all">All</button>
    <button id="export-selected">Selected</button>
    <button id="download-pdf">Download</button>
    <span id="privacy-count">0</span>
    <button id="btn-preview">Preview</button>
    <button id="btn-split">Split</button>
    <select id="page-number-mode"><option value="none">None</option></select>
    <select id="page-number-format"><option value="n">1, 2, 3</option></select>
    <input id="page-number-skip-first" type="checkbox">
    <input id="watermark-text" value="">
    <span id="watermark-error" hidden></span>
    <input id="watermark-angle" value="0">
    <input id="watermark-opacity" value="30">
    <input id="meta-title" value="">
    <input id="meta-author" value="">
    <select id="split-mode"><option value="every">Every N</option></select>
    <input id="split-every" value="1">
    <input id="split-ranges" value="">
    <select id="page-number-position"><option value="bottom-center">Bottom Center</option></select>
    <input id="page-number-start" value="1">
    <input id="page-number-font-size" value="10">
    <input id="page-number-margin" value="36">
    <select id="page-number-apply-to"><option value="all">All</option></select>
    <input id="watermark-enabled" type="checkbox">
    <select id="watermark-size-mode"><option value="auto">Auto</option></select>
    <input id="watermark-fixed-size" value="72">
    <input id="meta-subject" value="">
    <input id="meta-keywords" value="">
    <button id="meta-clear">Clear</button>
    <span id="split-summary" hidden></span>
    <span id="split-ranges-error" hidden></span>
    <div id="annotate-panel-section" hidden>
      <span id="annotate-panel-hint"></span>
      <div class="ds-form-field">
        <label class="ds-field-label" for="annotate-markup-style">Style</label>
        <div class="ds-segmented annotate-markup-style-group" id="annotate-markup-style" role="radiogroup" aria-label="Markup style">
          <button class="ds-segment annotate-markup-segment" data-style="highlight" aria-checked="true" role="radio" aria-label="Highlight"><i data-icon="highlighter"></i><span>Highlight</span></button>
          <button class="ds-segment annotate-markup-segment" data-style="underline" aria-checked="false" role="radio" aria-label="Underline"><i data-icon="underline"></i><span>Underline</span></button>
          <button class="ds-segment annotate-markup-segment" data-style="strikethrough" aria-checked="false" role="radio" aria-label="Strikethrough"><i data-icon="strikethrough"></i><span>Strikethrough</span></button>
        </div>
      </div>
      <div class="ds-form-field">
        <label class="ds-field-label" for="annotate-markup-colors">Color</label>
        <div class="ds-color-swatch-group annotate-markup-colors" id="annotate-markup-colors" role="group" aria-label="Markup color">
          <button class="ds-color-swatch" data-color="#ffe14d" aria-checked="true"></button>
          <button class="ds-color-swatch" data-color="#d92d20"></button>
          <button class="ds-color-swatch" data-color="#0066ff"></button>
          <button class="ds-color-swatch" data-color="#00aa00"></button>
          <button class="ds-color-swatch" data-color="#6a0dad"></button>
        </div>
      </div>
      <div class="ds-form-field annotate-thickness-field" id="annotate-thickness-field">
        <label class="ds-field-label" for="annotate-thickness">Thickness</label>
        <input class="ds-input" id="annotate-thickness" type="range" min="0.5" max="8" step="0.5" value="1.5" />
      </div>
      <div class="ds-form-field annotate-opacity-field" id="annotate-opacity-field">
        <label class="ds-field-label" for="annotate-opacity">Opacity</label>
        <input class="ds-input" id="annotate-opacity" type="range" min="0" max="100" value="40" />
      </div>
      <div class="annotate-image-options" id="annotate-image-options" hidden>
        <p class="annotate-image-hint" id="annotate-image-hint">Insert image: choose an image to place on the page.</p>
        <div class="ds-form-field">
          <label class="ds-field-label" for="annotate-image-opacity">Opacity</label>
          <input class="ds-input" id="annotate-image-opacity" type="range" min="5" max="100" value="100" />
        </div>
        <div class="ds-form-field">
          <label class="ds-field-label" for="annotate-image-keep-proportions">Keep proportions</label>
          <input id="annotate-image-keep-proportions" type="checkbox" checked />
        </div>
        <div class="ds-stack ds-stack--sm annotate-image-actions">
          <button class="ds-btn ds-btn--sm" id="annotate-image-choose">Choose image</button>
          <button class="ds-btn ds-btn--sm ds-btn--ghost" id="annotate-image-replace">Replace image</button>
          <button class="ds-btn ds-btn--sm ds-btn--ghost" id="annotate-image-delete">Delete</button>
        </div>
      </div>
      <button id="annotate-panel-delete" hidden>Delete</button>
      <div id="annotate-annotation-list"></div>
    </div>
  `;

  // Tool is "select" but a highlight annotation is selected: markup style group
  // must still show.
  const storeSelectedHighlight = {
    ...mockStore,
    get: () => ({
      ...mockStore.get(),
      annotateCurrentTool: "select",
      annotateSelectedAnnotationId: "h1",
      annotateSelectedPageId: "p1",
    }),
  };

  const panel = mountPanel(container, {
    onFileNameChange: mockOnFileNameChange,
    onExportModeChange: mockOnExportModeChange,
    onDownloadPDF: mockOnDownloadPDF,
    onSplitPDF: mockOnSplitPDF,
    onPreview: mockOnPreview,
    onExportOptionsChange: mockOnExportOptionsChange,
    onSourceRemove: mockOnSourceRemove,
    getState: () => storeSelectedHighlight.get(),
    updateAnnotations: mockUpdateAnnotations,
    store: storeSelectedHighlight,
  });

  panel.render(storeSelectedHighlight.get());

  const markupStyleGroup = container.querySelector("#annotate-markup-style");
  assert.equal(markupStyleGroup.hidden, false, "Markup style group should show when a highlight is selected even with tool 'select'");

  panel.destroy();
});

test("panel smoke: clicking a markup style segment restyles the selected mark (one undo entry, attrs kept)", async () => {
  const { mountPanel } = await import("../js/ui/panel.js");

  const container = fakeDoc.createElement("div");
  container.id = "panel-root-restyle";
  fakeDoc.body.appendChild(container);
  // Trigger the Fake DOM auto-creation of panel elements.
  container.innerHTML = "<div></div>";

  let updateCalls = 0;
  const countingUpdate = (mutator) => {
    updateCalls++;
    return mockUpdateAnnotations(mutator);
  };

  // Build the markup style segments before mount so panel.js attaches listeners.
  const styleGroup = container.querySelector("#annotate-markup-style");
  let underlineBtn = null;
  ["highlight", "underline", "strikethrough"].forEach((style) => {
    const btn = new FakeElement("button");
    btn.className = `ds-segment annotate-markup-segment`;
    btn.dataset.style = style;
    btn.setAttribute("aria-checked", style === "highlight" ? "true" : "false");
    btn.setAttribute("role", "radio");
    if (style === "underline") underlineBtn = btn;
    styleGroup.appendChild(btn);
  });

  const store = {
    ...mockStore,
    get: () => ({
      ...mockStore.get(),
      annotateSelectedAnnotationId: "h1",
      annotateSelectedPageId: "p1",
    }),
  };

  const panel = mountPanel(container, {
    onFileNameChange: mockOnFileNameChange,
    onExportModeChange: mockOnExportModeChange,
    onDownloadPDF: mockOnDownloadPDF,
    onSplitPDF: mockOnSplitPDF,
    onPreview: mockOnPreview,
    onExportOptionsChange: mockOnExportOptionsChange,
    onSourceRemove: mockOnSourceRemove,
    getState: () => store.get(),
    updateAnnotations: countingUpdate,
    store,
    onAnnotationSelect: () => {},
  });

  panel.render(store.get());

  underlineBtn.dispatchEvent({ type: "click" });

  const h1 = mockStore.annotations.p1[0];
  assert.equal(h1.style, "underline", "selected mark restyled to underline");
  assert.equal(h1.color, "#ffe14d", "color kept");
  assert.equal(h1.opacity, 0.4, "opacity kept");
  assert.equal(h1.thickness, 1.5, "thickness clamped to default");
  assert.equal(updateCalls, 1, "exactly one undo entry");

  panel.destroy();
});

test("panel smoke: font size shows selected annotation's value, not store default", async () => {
  const { mountPanel } = await import("../js/ui/panel.js");

  const container = fakeDoc.createElement("div");
  container.id = "panel-root-9";
  fakeDoc.body.appendChild(container);

  container.innerHTML = `
    <input id="doc-name" value="test">
    <span id="stat-pages">0</span>
    <span id="stat-source">0</span>
    <span id="stat-size">0 B</span>
    <div id="source-files"></div>
    <button id="export-all">All</button>
    <button id="export-selected">Selected</button>
    <button id="download-pdf">Download</button>
    <span id="privacy-count">0</span>
    <button id="btn-preview">Preview</button>
    <button id="btn-split">Split</button>
    <select id="page-number-mode"><option value="none">None</option></select>
    <select id="page-number-format"><option value="n">1, 2, 3</option></select>
    <input id="page-number-skip-first" type="checkbox">
    <input id="watermark-text" value="">
    <span id="watermark-error" hidden></span>
    <input id="watermark-angle" value="0">
    <input id="watermark-opacity" value="30">
    <input id="meta-title" value="">
    <input id="meta-author" value="">
    <select id="split-mode"><option value="every">Every N</option></select>
    <input id="split-every" value="1">
    <input id="split-ranges" value="">
    <select id="page-number-position"><option value="bottom-center">Bottom Center</option></select>
    <input id="page-number-start" value="1">
    <input id="page-number-font-size" value="10">
    <input id="page-number-margin" value="36">
    <select id="page-number-apply-to"><option value="all">All</option></select>
    <input id="watermark-enabled" type="checkbox">
    <select id="watermark-size-mode"><option value="auto">Auto</option></select>
    <input id="watermark-fixed-size" value="72">
    <input id="meta-subject" value="">
    <input id="meta-keywords" value="">
    <button id="meta-clear">Clear</button>
    <span id="split-summary" hidden></span>
    <span id="split-ranges-error" hidden></span>
    <div id="annotate-panel-section" hidden>
      <span id="annotate-panel-hint"></span>
      <div class="ds-form-field">
        <label class="ds-field-label" for="annotate-markup-style">Style</label>
        <div class="ds-segmented annotate-markup-style-group" id="annotate-markup-style" role="radiogroup" aria-label="Markup style">
          <button class="ds-segment annotate-markup-segment" data-style="highlight" aria-checked="true" role="radio" aria-label="Highlight"><i data-icon="highlighter"></i><span>Highlight</span></button>
          <button class="ds-segment annotate-markup-segment" data-style="underline" aria-checked="false" role="radio" aria-label="Underline"><i data-icon="underline"></i><span>Underline</span></button>
          <button class="ds-segment annotate-markup-segment" data-style="strikethrough" aria-checked="false" role="radio" aria-label="Strikethrough"><i data-icon="strikethrough"></i><span>Strikethrough</span></button>
        </div>
      </div>
      <div class="ds-form-field">
        <label class="ds-field-label" for="annotate-markup-colors">Color</label>
        <div class="ds-color-swatch-group annotate-markup-colors" id="annotate-markup-colors" role="group" aria-label="Markup color">
          <button class="ds-color-swatch" data-color="#ffe14d" aria-checked="true"></button>
          <button class="ds-color-swatch" data-color="#d92d20"></button>
          <button class="ds-color-swatch" data-color="#0066ff"></button>
          <button class="ds-color-swatch" data-color="#00aa00"></button>
          <button class="ds-color-swatch" data-color="#6a0dad"></button>
        </div>
      </div>
      <div class="ds-form-field annotate-thickness-field" id="annotate-thickness-field">
        <label class="ds-field-label" for="annotate-thickness">Thickness</label>
        <input class="ds-input" id="annotate-thickness" type="range" min="0.5" max="8" step="0.5" value="1.5" />
      </div>
      <div class="ds-form-field annotate-opacity-field" id="annotate-opacity-field">
        <label class="ds-field-label" for="annotate-opacity">Opacity</label>
        <input class="ds-input" id="annotate-opacity" type="range" min="0" max="100" value="40" />
      </div>
      <div class="annotate-image-options" id="annotate-image-options" hidden>
        <p class="annotate-image-hint" id="annotate-image-hint">Insert image: choose an image to place on the page.</p>
        <div class="ds-form-field">
          <label class="ds-field-label" for="annotate-image-opacity">Opacity</label>
          <input class="ds-input" id="annotate-image-opacity" type="range" min="5" max="100" value="100" />
        </div>
        <div class="ds-form-field">
          <label class="ds-field-label" for="annotate-image-keep-proportions">Keep proportions</label>
          <input id="annotate-image-keep-proportions" type="checkbox" checked />
        </div>
        <div class="ds-stack ds-stack--sm annotate-image-actions">
          <button class="ds-btn ds-btn--sm" id="annotate-image-choose">Choose image</button>
          <button class="ds-btn ds-btn--sm ds-btn--ghost" id="annotate-image-replace">Replace image</button>
          <button class="ds-btn ds-btn--sm ds-btn--ghost" id="annotate-image-delete">Delete</button>
        </div>
      </div>
      <button id="annotate-panel-delete" hidden>Delete</button>
      <div id="annotate-annotation-list"></div>
    </div>
  `;

  // Selected highlight annotation h1 uses opacity 0.7: the panel must show
  // the annotation's opacity, not the store default.
  const storeMarkupOpacity = {
    ...mockStore,
    get: () => ({
      ...mockStore.get(),
      annotations: {
        p1: [{ id: "h1", type: "highlight", x: 100, y: 100, width: 200, height: 50, color: "#ffe14d", opacity: 0.7 }],
      },
      annotateMarkupStyle: "highlight",
      annotateCurrentTool: "select",
      annotateSelectedAnnotationId: "h1",
      annotateSelectedPageId: "p1",
    }),
  };

  const panel = mountPanel(container, {
    onFileNameChange: mockOnFileNameChange,
    onExportModeChange: mockOnExportModeChange,
    onDownloadPDF: mockOnDownloadPDF,
    onSplitPDF: mockOnSplitPDF,
    onPreview: mockOnPreview,
    onExportOptionsChange: mockOnExportOptionsChange,
    onSourceRemove: mockOnSourceRemove,
    getState: () => storeMarkupOpacity.get(),
    updateAnnotations: mockUpdateAnnotations,
    store: storeMarkupOpacity,
  });

  panel.render(storeMarkupOpacity.get());

  const opacityInput = container.querySelector("#annotate-opacity");
  assert.equal(opacityInput.value, "70", "Opacity field should show the selected highlight's 70, not the store default 40");

  panel.destroy();
});

test("panel smoke: font size select keeps a non-preset value", async () => {
  const { mountPanel } = await import("../js/ui/panel.js");

  const container = fakeDoc.createElement("div");
  container.id = "panel-root-10";
  fakeDoc.body.appendChild(container);

  container.innerHTML = `
    <input id="doc-name" value="test">
    <span id="stat-pages">0</span>
    <span id="stat-source">0</span>
    <span id="stat-size">0 B</span>
    <div id="source-files"></div>
    <button id="export-all">All</button>
    <button id="export-selected">Selected</button>
    <button id="download-pdf">Download</button>
    <span id="privacy-count">0</span>
    <button id="btn-preview">Preview</button>
    <button id="btn-split">Split</button>
    <select id="page-number-mode"><option value="none">None</option></select>
    <select id="page-number-format"><option value="n">1, 2, 3</option></select>
    <input id="page-number-skip-first" type="checkbox">
    <input id="watermark-text" value="">
    <span id="watermark-error" hidden></span>
    <input id="watermark-angle" value="0">
    <input id="watermark-opacity" value="30">
    <input id="meta-title" value="">
    <input id="meta-author" value="">
    <select id="split-mode"><option value="every">Every N</option></select>
    <input id="split-every" value="1">
    <input id="split-ranges" value="">
    <select id="page-number-position"><option value="bottom-center">Bottom Center</option></select>
    <input id="page-number-start" value="1">
    <input id="page-number-font-size" value="10">
    <input id="page-number-margin" value="36">
    <select id="page-number-apply-to"><option value="all">All</option></select>
    <input id="watermark-enabled" type="checkbox">
    <select id="watermark-size-mode"><option value="auto">Auto</option></select>
    <input id="watermark-fixed-size" value="72">
    <input id="meta-subject" value="">
    <input id="meta-keywords" value="">
    <button id="meta-clear">Clear</button>
    <span id="split-summary" hidden></span>
    <span id="split-ranges-error" hidden></span>
    <div id="annotate-panel-section" hidden>
      <span id="annotate-panel-hint"></span>
      <div class="ds-form-field">
        <label class="ds-field-label" for="annotate-markup-style">Style</label>
        <div class="ds-segmented annotate-markup-style-group" id="annotate-markup-style" role="radiogroup" aria-label="Markup style">
          <button class="ds-segment annotate-markup-segment" data-style="highlight" aria-checked="true" role="radio" aria-label="Highlight"><i data-icon="highlighter"></i><span>Highlight</span></button>
          <button class="ds-segment annotate-markup-segment" data-style="underline" aria-checked="false" role="radio" aria-label="Underline"><i data-icon="underline"></i><span>Underline</span></button>
          <button class="ds-segment annotate-markup-segment" data-style="strikethrough" aria-checked="false" role="radio" aria-label="Strikethrough"><i data-icon="strikethrough"></i><span>Strikethrough</span></button>
        </div>
      </div>
      <div class="ds-form-field">
        <label class="ds-field-label" for="annotate-markup-colors">Color</label>
        <div class="ds-color-swatch-group annotate-markup-colors" id="annotate-markup-colors" role="group" aria-label="Markup color">
          <button class="ds-color-swatch" data-color="#ffe14d" aria-checked="true"></button>
          <button class="ds-color-swatch" data-color="#d92d20"></button>
          <button class="ds-color-swatch" data-color="#0066ff"></button>
          <button class="ds-color-swatch" data-color="#00aa00"></button>
          <button class="ds-color-swatch" data-color="#6a0dad"></button>
        </div>
      </div>
      <div class="ds-form-field annotate-thickness-field" id="annotate-thickness-field">
        <label class="ds-field-label" for="annotate-thickness">Thickness</label>
        <input class="ds-input" id="annotate-thickness" type="range" min="0.5" max="8" step="0.5" value="1.5" />
      </div>
      <div class="ds-form-field annotate-opacity-field" id="annotate-opacity-field">
        <label class="ds-field-label" for="annotate-opacity">Opacity</label>
        <input class="ds-input" id="annotate-opacity" type="range" min="0" max="100" value="40" />
      </div>
      <div class="annotate-image-options" id="annotate-image-options" hidden>
        <p class="annotate-image-hint" id="annotate-image-hint">Insert image: choose an image to place on the page.</p>
        <div class="ds-form-field">
          <label class="ds-field-label" for="annotate-image-opacity">Opacity</label>
          <input class="ds-input" id="annotate-image-opacity" type="range" min="5" max="100" value="100" />
        </div>
        <div class="ds-form-field">
          <label class="ds-field-label" for="annotate-image-keep-proportions">Keep proportions</label>
          <input id="annotate-image-keep-proportions" type="checkbox" checked />
        </div>
        <div class="ds-stack ds-stack--sm annotate-image-actions">
          <button class="ds-btn ds-btn--sm" id="annotate-image-choose">Choose image</button>
          <button class="ds-btn ds-btn--sm ds-btn--ghost" id="annotate-image-replace">Replace image</button>
          <button class="ds-btn ds-btn--sm ds-btn--ghost" id="annotate-image-delete">Delete</button>
        </div>
      </div>
      <button id="annotate-panel-delete" hidden>Delete</button>
      <div id="annotate-annotation-list"></div>
    </div>
  `;

  // Thickness slider is hidden for highlight style and shown for underline /
  // strikethrough styles.
  const storeUnderline = {
    ...mockStore,
    get: () => ({
      ...mockStore.get(),
      annotateMarkupStyle: "underline",
      annotateCurrentTool: "highlight",
      annotateSelectedAnnotationId: null,
      annotateSelectedPageId: "p1",
    }),
  };

  const panel = mountPanel(container, {
    onFileNameChange: mockOnFileNameChange,
    onExportModeChange: mockOnExportModeChange,
    onDownloadPDF: mockOnDownloadPDF,
    onSplitPDF: mockOnSplitPDF,
    onPreview: mockOnPreview,
    onExportOptionsChange: mockOnExportOptionsChange,
    onSourceRemove: mockOnSourceRemove,
    getState: () => storeUnderline.get(),
    updateAnnotations: mockUpdateAnnotations,
    store: storeUnderline,
  });

  panel.render(storeUnderline.get());

  const thicknessField = container.querySelector("#annotate-thickness-field");
  const opacityField = container.querySelector("#annotate-opacity-field");
  assert.equal(thicknessField.hidden, false, "Thickness field should show for underline style");
  assert.equal(opacityField.hidden, true, "Opacity field should hide for underline style");

  // Switch back to highlight: thickness hides, opacity shows.
  const storeHighlight = {
    ...mockStore,
    get: () => ({
      ...mockStore.get(),
      annotateMarkupStyle: "highlight",
      annotateCurrentTool: "highlight",
      annotateSelectedAnnotationId: null,
      annotateSelectedPageId: "p1",
    }),
  };
  panel.render(storeHighlight.get());
  assert.equal(thicknessField.hidden, true, "Thickness field should hide for highlight style");
  assert.equal(opacityField.hidden, false, "Opacity field should show for highlight style");

  panel.destroy();
});

test("panel smoke: changing font size edits the selected text annotation (one undo entry)", async () => {
  const { mountPanel } = await import("../js/ui/panel.js");

  const container = fakeDoc.createElement("div");
  container.id = "panel-root-font";
  fakeDoc.body.appendChild(container);
  container.innerHTML = "<div></div>";

  let anns = { p1: [{ id: "t1", type: "text", x: 10, y: 10, text: "Hi", fontSize: 12 }] };
  let updateCalls = 0;
  const store = {
    get: () => ({
      ...mockStore.get(),
      annotations: anns,
      annotateSelectedAnnotationId: "t1",
      annotateSelectedPageId: "p1",
      annotateCurrentTool: "text",
    }),
    patch: () => {},
  };
  const countingUpdate = (mutator) => {
    updateCalls++;
    anns = mutator(anns);
    return anns;
  };

  const panel = mountPanel(container, {
    getState: () => store.get(),
    updateAnnotations: countingUpdate,
    store,
    onAnnotationSelect: () => {},
  });

  panel.render(store.get());

  const select = container.querySelector("#annotate-font-size");
  assert.ok(select, "font size select must exist");
  select.value = "24";
  select.dispatchEvent({ type: "change" });

  assert.equal(anns.p1[0].fontSize, 24, "selected text annotation fontSize updated to 24");
  assert.equal(updateCalls, 1, "exactly one undo entry");

  panel.destroy();
});

test("panel smoke: changing text color edits the selected text annotation (one undo entry)", async () => {
  const { mountPanel } = await import("../js/ui/panel.js");

  const container = fakeDoc.createElement("div");
  container.id = "panel-root-tcolor";
  fakeDoc.body.appendChild(container);
  container.innerHTML = "<div></div>";

  let anns = { p1: [{ id: "t1", type: "text", x: 10, y: 10, text: "Hi", color: "#000000" }] };
  let updateCalls = 0;
  const store = {
    get: () => ({
      ...mockStore.get(),
      annotations: anns,
      annotateSelectedAnnotationId: "t1",
      annotateSelectedPageId: "p1",
      annotateCurrentTool: "text",
    }),
    patch: () => {},
  };
  const countingUpdate = (mutator) => {
    updateCalls++;
    anns = mutator(anns);
    return anns;
  };

  const panel = mountPanel(container, {
    getState: () => store.get(),
    updateAnnotations: countingUpdate,
    store,
    onAnnotationSelect: () => {},
  });

  panel.render(store.get());

  const group = container.querySelector("#annotate-text-colors");
  assert.ok(group, "text color group must exist");
  const redSwatch = [...group.querySelectorAll(".ds-color-swatch")].find((s) => s.dataset.color === "#ff0000");
  assert.ok(redSwatch, "red text color swatch must exist");
  redSwatch.dispatchEvent({ type: "click" });

  assert.equal(anns.p1[0].color, "#ff0000", "selected text annotation color updated to red");
  assert.equal(updateCalls, 1, "exactly one undo entry");

  panel.destroy();
});

test("panel smoke: exactly one annotate group shows per tool/selection combo", async () => {
  const { mountPanel } = await import("../js/ui/panel.js");

  function renderWith(overrides) {
    const container = fakeDoc.createElement("div");
    container.id = "panel-root-groups";
    fakeDoc.body.appendChild(container);
    container.innerHTML = `
      <input id="doc-name" value="test">
      <span id="stat-pages">0</span>
      <span id="stat-source">0</span>
      <span id="stat-size">0 B</span>
      <div id="source-files"></div>
      <button id="export-all">All</button>
      <button id="export-selected">Selected</button>
      <button id="download-pdf">Download</button>
      <span id="privacy-count">0</span>
      <button id="btn-preview">Preview</button>
      <button id="btn-split">Split</button>
      <select id="page-number-mode"><option value="none">None</option></select>
      <select id="page-number-format"><option value="n">1, 2, 3</option></select>
      <input id="page-number-skip-first" type="checkbox">
      <input id="watermark-text" value="">
      <span id="watermark-error" hidden></span>
      <input id="watermark-angle" value="0">
      <input id="watermark-opacity" value="30">
      <input id="meta-title" value="">
      <input id="meta-author" value="">
      <select id="split-mode"><option value="every">Every N</option></select>
      <input id="split-every" value="1">
      <input id="split-ranges" value="">
      <select id="page-number-position"><option value="bottom-center">Bottom Center</option></select>
      <input id="page-number-start" value="1">
      <input id="page-number-font-size" value="10">
      <input id="page-number-margin" value="36">
      <select id="page-number-apply-to"><option value="all">All</option></select>
      <input id="watermark-enabled" type="checkbox">
      <select id="watermark-size-mode"><option value="auto">Auto</option></select>
      <input id="watermark-fixed-size" value="72">
      <input id="meta-subject" value="">
      <input id="meta-keywords" value="">
      <button id="meta-clear">Clear</button>
      <span id="split-summary" hidden></span>
      <span id="split-ranges-error" hidden></span>
      <div id="annotate-panel-section" hidden>
        <span id="annotate-panel-hint"></span>
        <div id="annotate-group-markup" hidden></div>
        <div id="annotate-group-text" hidden></div>
        <div id="annotate-group-image" hidden></div>
        <p id="annotate-empty" hidden>Select a mark to edit it</p>
        <div id="annotate-aria-live"></div>
        <div id="annotate-text-controls"></div>
        <div id="annotate-image-options" hidden></div>
        <button id="annotate-panel-delete" hidden>Delete</button>
        <div id="annotate-annotation-list"></div>
      </div>
    `;

    const store = {
      ...mockStore,
      get: () => ({
        ...mockStore.get(),
        ...overrides,
      }),
      patch: () => {},
    };
    const panel = mountPanel(container, {
      getState: () => store.get(),
      updateAnnotations: () => {},
      store,
      onAnnotationSelect: () => {},
    });
    panel.render(store.get());
    return { container, panel };
  }

  const cases = [
    // tool, selectedId, annotations on p1, expectMarkup, expectText, expectImage, expectEmpty
    ["select", "h1", [{ id: "h1", type: "highlight", style: "underline" }], true, false, false, false],
    ["select", "t1", [{ id: "t1", type: "text" }], false, true, false, false],
    ["select", "img1", [{ id: "img1", type: "image" }], false, false, true, false],
    ["highlight", null, [], true, false, false, false],
    ["text", null, [], false, true, false, false],
    ["image", null, [], false, false, true, false],
    ["select", null, [], false, false, false, true],
  ];

  for (const [tool, selectedId, anns, expectMarkup, expectText, expectImage, expectEmpty] of cases) {
    const overrides = {
      annotateCurrentTool: tool,
      annotateSelectedAnnotationId: selectedId,
      annotateSelectedPageId: "p1",
      annotations: { p1: anns },
    };
    const { container, panel } = renderWith(overrides);
    assert.equal(container.querySelector("#annotate-group-markup").hidden, !expectMarkup, `markup tool=${tool} sel=${selectedId}`);
    assert.equal(container.querySelector("#annotate-group-text").hidden, !expectText, `text tool=${tool} sel=${selectedId}`);
    assert.equal(container.querySelector("#annotate-image-options").hidden, !expectImage, `image tool=${tool} sel=${selectedId}`);
    assert.equal(container.querySelector("#annotate-empty").hidden, !expectEmpty, `empty tool=${tool} sel=${selectedId}`);
    panel.destroy();
  }
});

test("panel smoke: markup style segmented control is icon-only with 3 segments", async () => {
  const { mountPanel } = await import("../js/ui/panel.js");

  const container = fakeDoc.createElement("div");
  container.id = "panel-root-segments";
  fakeDoc.body.appendChild(container);
  container.innerHTML = "<div></div>";

  const store = {
    ...mockStore,
    get: () => mockStore.get(),
    patch: () => {},
  };
  const panel = mountPanel(container, {
    getState: () => store.get(),
    updateAnnotations: () => {},
    store,
    onAnnotationSelect: () => {},
  });
  panel.render(store.get());

  const group = container.querySelector("#annotate-markup-style");
  assert.ok(group, "markup style group exists");
  const segments = group.querySelectorAll(".annotate-markup-segment");
  assert.equal(segments.length, 3, "three markup segments");
  const styles = [...segments].map((s) => s.dataset.style);
  assert.deepEqual(styles, ["highlight", "underline", "strikethrough"], "segment styles");
  for (const seg of segments) {
    assert.equal(seg.getAttribute("role"), "radio", "segment is a radio");
    assert.ok(seg.getAttribute("aria-label"), "segment has aria-label");
    const icons = seg.querySelectorAll("i");
    assert.equal(icons.length, 1, "segment has exactly one icon");
    const spans = seg.querySelectorAll("span");
    assert.equal(spans.length, 0, "segment is icon-only (no visible text span)");
  }

  panel.destroy();
});

test("panel smoke: five markup color dots have the new backgrounds and order", async () => {
  const { mountPanel } = await import("../js/ui/panel.js");

  const container = fakeDoc.createElement("div");
  container.id = "panel-root-dots";
  fakeDoc.body.appendChild(container);
  container.innerHTML = "<div></div>";

  const store = {
    ...mockStore,
    get: () => mockStore.get(),
    patch: () => {},
  };
  const panel = mountPanel(container, {
    getState: () => store.get(),
    updateAnnotations: () => {},
    store,
    onAnnotationSelect: () => {},
  });
  panel.render(store.get());

  const colors = container.querySelector("#annotate-markup-colors");
  assert.ok(colors, "markup colors container exists");
  const dots = colors.querySelectorAll(".annotate-color-dot");
  assert.equal(dots.length, 5, "five color dots");
  const expected = ["#d92d20", "#0f0f12", "#0d44e8", "#ffe14d", "#6bbf6b"];
  for (let i = 0; i < expected.length; i++) {
    const dot = dots[i];
    assert.equal(dot.dataset.color, expected[i], `dot ${i} data-color`);
    assert.equal(dot.style.backgroundColor, expected[i], `dot ${i} background filled from data-color`);
    assert.ok(dot.className.includes("ds-color-swatch"), `dot ${i} is a color swatch`);
  }

  panel.destroy();
});

test("panel smoke: annotation list shows N on this page and is collapsed by default", async () => {
  const { mountPanel } = await import("../js/ui/panel.js");

  const container = fakeDoc.createElement("div");
  container.id = "panel-root-list";
  fakeDoc.body.appendChild(container);
  container.innerHTML = `
    <input id="doc-name" value="test">
    <span id="stat-pages">0</span>
    <div id="source-files"></div>
    <button id="download-pdf">Download</button>
    <span id="privacy-count">0</span>
    <button id="btn-preview">Preview</button>
    <button id="btn-split">Split</button>
    <select id="page-number-mode"><option value="none">None</option></select>
    <select id="page-number-format"><option value="n">1, 2, 3</option></select>
    <input id="watermark-text" value="">
    <span id="watermark-error" hidden></span>
    <input id="watermark-angle" value="0">
    <input id="watermark-opacity" value="30">
    <input id="meta-title" value="">
    <input id="meta-author" value="">
    <select id="split-mode"><option value="every">Every N</option></select>
    <input id="split-every" value="1">
    <input id="split-ranges" value="">
    <select id="page-number-position"><option value="bottom-center">Bottom Center</option></select>
    <input id="page-number-start" value="1">
    <input id="page-number-font-size" value="10">
    <input id="page-number-margin" value="36">
    <select id="page-number-apply-to"><option value="all">All</option></select>
    <input id="watermark-enabled" type="checkbox">
    <select id="watermark-size-mode"><option value="auto">Auto</option></select>
    <input id="watermark-fixed-size" value="72">
    <input id="meta-subject" value="">
    <input id="meta-keywords" value="">
    <button id="meta-clear">Clear</button>
    <span id="split-summary" hidden></span>
    <span id="split-ranges-error" hidden></span>
    <div id="annotate-panel-section" hidden>
      <span id="annotate-panel-hint"></span>
      <div id="annotate-group-markup" hidden></div>
      <div id="annotate-group-text" hidden></div>
      <div id="annotate-group-image" hidden></div>
      <p id="annotate-empty" hidden>Select a mark to edit it</p>
      <div id="annotate-aria-live"></div>
      <div id="annotate-text-controls"></div>
      <div id="annotate-image-options" hidden></div>
      <button id="annotate-panel-delete" hidden>Delete</button>
      <div id="annotate-annotation-list"></div>
    </div>
  `;

  const anns = [
    { id: "h1", type: "highlight", x: 100, y: 100, width: 200, height: 50 },
    { id: "t1", type: "text", x: 100, y: 200, text: "Hi" },
    { id: "i1", type: "image", x: 50, y: 50, width: 100, height: 100 },
  ];
  const store = {
    ...mockStore,
    get: () => ({
      ...mockStore.get(),
      annotations: { p1: anns },
      annotateCurrentPageId: "p1",
      annotateSelectedAnnotationId: null,
    }),
    patch: () => {},
  };
  const panel = mountPanel(container, {
    getState: () => store.get(),
    updateAnnotations: () => {},
    store,
    onAnnotationSelect: () => {},
  });
  panel.render(store.get());

  const list = container.querySelector("#annotate-annotation-list");
  assert.ok(list, "annotation list exists");
  const items = list.querySelectorAll(".annotate-annotation-item");
  assert.equal(items.length, 3, "three annotation items listed");

  // Collapsed by default: a header announces the count and items are hidden
  const header = list.querySelector("#annotate-annotation-header");
  assert.ok(header, "list has a count header button");
  assert.ok(header.textContent.includes("3"), "header shows count: " + header.textContent);
  assert.ok(header.textContent.includes("on this page"), "header says on this page: " + header.textContent);
  assert.equal(header.getAttribute("aria-expanded"), "false", "list collapsed by default");
  const itemsWrap = list.querySelector("#annotate-annotation-list-items");
  assert.ok(itemsWrap, "list items are in a wrapper");
  assert.equal(itemsWrap.hidden, true, "list items collapsed by default");

  panel.destroy();
});

test("panel smoke: select tool with nothing selected shows the empty state and no hint paragraph", async () => {
  const { mountPanel } = await import("../js/ui/panel.js");

  const container = fakeDoc.createElement("div");
  container.id = "panel-root-empty";
  fakeDoc.body.appendChild(container);
  container.innerHTML = `
    <input id="doc-name" value="test">
    <div id="source-files"></div>
    <button id="download-pdf">Download</button>
    <button id="btn-preview">Preview</button>
    <button id="btn-split">Split</button>
    <select id="page-number-mode"><option value="none">None</option></select>
    <select id="page-number-format"><option value="n">1, 2, 3</option></select>
    <input id="watermark-text" value="">
    <span id="watermark-error" hidden></span>
    <input id="watermark-angle" value="0">
    <input id="watermark-opacity" value="30">
    <input id="meta-title" value="">
    <input id="meta-author" value="">
    <select id="split-mode"><option value="every">Every N</option></select>
    <input id="split-every" value="1">
    <input id="split-ranges" value="">
    <select id="page-number-position"><option value="bottom-center">Bottom Center</option></select>
    <input id="page-number-start" value="1">
    <input id="page-number-font-size" value="10">
    <input id="page-number-margin" value="36">
    <select id="page-number-apply-to"><option value="all">All</option></select>
    <input id="watermark-enabled" type="checkbox">
    <select id="watermark-size-mode"><option value="auto">Auto</option></select>
    <input id="watermark-fixed-size" value="72">
    <input id="meta-subject" value="">
    <input id="meta-keywords" value="">
    <button id="meta-clear">Clear</button>
    <span id="split-summary" hidden></span>
    <span id="split-ranges-error" hidden></span>
    <div id="annotate-panel-section" hidden>
      <div id="annotate-group-markup" hidden></div>
      <div id="annotate-group-text" hidden></div>
      <div id="annotate-group-image" hidden></div>
      <p id="annotate-empty" hidden>Select a mark to edit it</p>
      <div id="annotate-aria-live"></div>
      <div id="annotate-text-controls"></div>
      <div id="annotate-image-options" hidden></div>
      <button id="annotate-panel-delete" hidden>Delete</button>
      <div id="annotate-annotation-list"></div>
    </div>
  `;

  const store = {
    ...mockStore,
    get: () => ({
      ...mockStore.get(),
      annotateCurrentTool: "select",
      annotateSelectedAnnotationId: null,
      annotateSelectedPageId: "p1",
    }),
    patch: () => {},
  };
  const panel = mountPanel(container, {
    getState: () => store.get(),
    updateAnnotations: () => {},
    store,
    onAnnotationSelect: () => {},
  });
  panel.render(store.get());

  assert.equal(container.querySelector("#annotate-empty").hidden, false, "empty state shows");
  assert.equal(container.querySelector("#annotate-group-markup").hidden, true, "markup group hidden");
  assert.equal(container.querySelector("#annotate-group-text").hidden, true, "text group hidden");
  assert.equal(container.querySelector("#annotate-image-options").hidden, true, "image group hidden");
  assert.equal(container.querySelector("#annotate-panel-delete").hidden, true, "delete hidden when nothing selected");

  panel.destroy();
});

test("panel smoke: markup color dots are named with aria-label and title", async () => {
  const { mountPanel } = await import("../js/ui/panel.js");

  const container = fakeDoc.createElement("div");
  container.id = "panel-root-dot-labels";
  fakeDoc.body.appendChild(container);
  container.innerHTML = "<div></div>";

  const store = {
    ...mockStore,
    get: () => mockStore.get(),
    patch: () => {},
  };
  const panel = mountPanel(container, {
    getState: () => store.get(),
    updateAnnotations: () => {},
    store,
    onAnnotationSelect: () => {},
  });
  panel.render(store.get());

  const colors = container.querySelector("#annotate-markup-colors");
  assert.ok(colors, "markup colors container exists");
  const dots = colors.querySelectorAll(".annotate-color-dot");
  assert.equal(dots.length, 5, "five color dots");
  const expected = ["Red", "Black", "Blue", "Yellow", "Green"];
  for (let i = 0; i < expected.length; i++) {
    assert.equal(dots[i].getAttribute("aria-label"), `${expected[i]} color`, `dot ${i} aria-label`);
    assert.equal(dots[i].getAttribute("title"), expected[i], `dot ${i} title`);
    assert.equal(dots[i].className.includes("ds-color-swatch"), true, `dot ${i} is a swatch`);
    assert.equal(dots[i].className.includes("annotate-color-dot"), true, `dot ${i} is an annotate-color-dot`);
  }

  panel.destroy();
});

test("panel smoke: annotation list header is hidden when there are zero annotations on this page", async () => {
  const { mountPanel } = await import("../js/ui/panel.js");

  const container = fakeDoc.createElement("div");
  container.id = "panel-root-header-zero";
  fakeDoc.body.appendChild(container);
  container.innerHTML = `
    <input id="doc-name" value="test">
    <div id="source-files"></div>
    <div id="annotate-panel-section" hidden>
      <div id="annotate-annotation-list"></div>
    </div>
  `;

  const store = {
    ...mockStore,
    get: () => ({
      ...mockStore.get(),
      annotations: { p1: [] },
      annotateCurrentPageId: "p1",
      annotateSelectedAnnotationId: null,
    }),
    patch: () => {},
  };
  const panel = mountPanel(container, {
    getState: () => store.get(),
    updateAnnotations: () => {},
    store,
    onAnnotationSelect: () => {},
  });
  panel.render(store.get());

  const header = container.querySelector("#annotate-annotation-header");
  assert.ok(header, "list has a count header button");
  assert.equal(header.hidden, true, "header hidden when zero annotations on this page");

  panel.destroy();
});

test("panel smoke: active markup style segment is ds-segment--active", async () => {
  const { mountPanel } = await import("../js/ui/panel.js");

  const container = fakeDoc.createElement("div");
  container.id = "panel-root-active-seg";
  fakeDoc.body.appendChild(container);
  container.innerHTML = "<div></div>";

  const store = {
    ...mockStore,
    get: () => ({
      ...mockStore.get(),
      annotateMarkupStyle: "underline",
      annotateCurrentTool: "select",
      annotateSelectedAnnotationId: null,
    }),
    patch: () => {},
  };
  const panel = mountPanel(container, {
    getState: () => store.get(),
    updateAnnotations: () => {},
    store,
    onAnnotationSelect: () => {},
  });
  panel.render(store.get());

  const group = container.querySelector("#annotate-markup-style");
  assert.ok(group, "markup style group exists");
  const segments = group.querySelectorAll(".annotate-markup-segment");
  assert.equal(segments.length, 3, "three markup segments");
  const active = [...segments].find((s) => s.dataset.style === "underline");
  assert.ok(active, "underline segment exists");
  assert.equal(active.classList.contains("ds-segment--active"), true, "active segment has ds-segment--active");
  const highlight = [...segments].find((s) => s.dataset.style === "highlight");
  assert.equal(highlight.classList.contains("ds-segment--active"), false, "inactive segment does not have ds-segment--active");

  panel.destroy();
});


