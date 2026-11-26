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
        "annotate-panel-section", "annotate-panel-hint", "annotate-highlight-options",
        "annotate-text-options", "annotate-font-size", "annotate-opacity",
        "annotate-panel-delete", "annotate-annotation-list",
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

  // Verify hint text
  const hint = container.querySelector("#annotate-panel-hint");
  assert.ok(hint.textContent.includes("annotation"), "Hint should mention annotations");

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
      <div id="annotate-highlight-options" hidden></div>
      <div id="annotate-text-options" hidden></div>
      <select id="annotate-font-size"></select>
      <input id="annotate-opacity" type="range" min="0" max="100" value="40">
      <button id="annotate-panel-delete" hidden>Delete</button>
      <div id="annotate-annotation-list"></div>
    </div>
  `;

  // Tool is "select" but a highlight annotation is selected: highlight options
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

  const highlightOptions = container.querySelector("#annotate-highlight-options");
  const textOptions = container.querySelector("#annotate-text-options");
  assert.equal(highlightOptions.hidden, false, "Highlight options should show when a highlight is selected even with tool 'select'");
  assert.equal(textOptions.hidden, true, "Text options should stay hidden when a highlight is selected with tool 'select'");

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
      <div id="annotate-highlight-options" hidden></div>
      <div id="annotate-text-options" hidden></div>
      <select id="annotate-font-size"></select>
      <input id="annotate-opacity" type="range" min="0" max="100" value="40">
      <button id="annotate-panel-delete" hidden>Delete</button>
      <div id="annotate-annotation-list"></div>
    </div>
  `;

  // Store default font size is 12 but the selected text annotation t1 has 14:
  // the panel must show 14.
  const storeFontDefault12 = {
    ...mockStore,
    get: () => ({
      ...mockStore.get(),
      annotateFontSize: 12,
      annotateCurrentTool: "select",
      annotateSelectedAnnotationId: "t1",
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
    getState: () => storeFontDefault12.get(),
    updateAnnotations: mockUpdateAnnotations,
    store: storeFontDefault12,
  });

  panel.render(storeFontDefault12.get());

  const fontSize = container.querySelector("#annotate-font-size");
  assert.equal(fontSize.value, "14", "Font size should show the selected text annotation's 14, not the store default 12");

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
      <div id="annotate-highlight-options" hidden></div>
      <div id="annotate-text-options" hidden></div>
      <select id="annotate-font-size"></select>
      <input id="annotate-opacity" type="range" min="0" max="100" value="40">
      <button id="annotate-panel-delete" hidden>Delete</button>
      <div id="annotate-annotation-list"></div>
    </div>
  `;

  // Selected text annotation uses font size 20, which is not one of the preset
  // options [8,10,12,14,16,18,24,36,48,72]: the select must still show 20.
  const annotationsFont20 = {
    p1: [
      { id: "t20", type: "text", x: 100, y: 200, text: "Big", fontSize: 20, color: "#000000" },
    ],
  };
  const storeFont20 = {
    ...mockStore,
    get: () => ({
      ...mockStore.get(),
      annotations: annotationsFont20,
      annotateFontSize: 12,
      annotateCurrentTool: "select",
      annotateSelectedAnnotationId: "t20",
      annotateSelectedPageId: "p1",
    }),
    annotations: annotationsFont20,
  };

  const panel = mountPanel(container, {
    onFileNameChange: mockOnFileNameChange,
    onExportModeChange: mockOnExportModeChange,
    onDownloadPDF: mockOnDownloadPDF,
    onSplitPDF: mockOnSplitPDF,
    onPreview: mockOnPreview,
    onExportOptionsChange: mockOnExportOptionsChange,
    onSourceRemove: mockOnSourceRemove,
    getState: () => storeFont20.get(),
    updateAnnotations: mockUpdateAnnotations,
    store: storeFont20,
  });

  panel.render(storeFont20.get());

  const fontSize = container.querySelector("#annotate-font-size");
  assert.equal(fontSize.value, "20", "Font size should show the selected annotation's 20 even though it is not a preset option");

  panel.destroy();
});

