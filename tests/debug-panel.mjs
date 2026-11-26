// Debug test for panel.js delete button
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Setup fake DOM
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
    this.textContent = "";
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
  get hidden() { return this._hidden; }
  set hidden(val) { this._hidden = Boolean(val); console.log(`  [hidden setter] ${this.id}: ${this._hidden} (val=${val})`); }
  setAttribute(name, value) { this.attributes.set(name, value); if (name === "hidden") this.hidden = value === "true" || value === ""; }
  getAttribute(name) { return this.attributes.get(name) || null; }
  removeAttribute(name) { this.attributes.delete(name); if (name === "hidden") this.hidden = false; }
  toggleAttribute(name, force) { if (force) this.setAttribute(name, ""); else this.attributes.delete(name); }
  get classList() { return new FakeClassList(this); }
  querySelector(selector) { if (selector.startsWith("#")) return this.findById(selector.slice(1)); if (selector.startsWith(".")) return this.findByClass(selector.slice(1)); return this.findByTag(selector); }
  querySelectorAll(selector) { const results = []; this.collectBySelector(selector, results); return results; }
  collectBySelector(selector, results) { if (selector.startsWith("#")) { const found = this.findById(selector.slice(1)); if (found) results.push(found); } else if (selector.startsWith(".")) { this.collectByClass(selector.slice(1), results); } else { this.collectByTag(selector.toUpperCase(), results); } }
  collectByClass(cls, results) { if (this.className.split(" ").includes(cls)) results.push(this); for (const child of this.children) child.collectByClass(cls, results); }
  collectByTag(tag, results) { if (this.tagName === tag) results.push(this); for (const child of this.children) child.collectByTag(tag, results); }
  findById(id) { if (this.id === id) return this; for (const c of this.children) { const f = c.findById(id); if (f) return f; } return null; }
  findByClass(cls) { if (this.className.split(" ").includes(cls)) return this; for (const c of this.children) { const f = c.findByClass(cls); if (f) return f; } return null; }
  findByTag(tag) { if (this.tagName === tag.toUpperCase()) return this; for (const c of this.children) { const f = c.findByTag(tag); if (f) return f; } return null; }
  appendChild(child) { if (!child) return null; child.parent = this; this.children.push(child); this.firstElementChild = this.children[0]; return child; }
  set innerHTML(html) {
    this._innerHTML = html;
    if (html && !this.firstElementChild) {
      const elementIds = [
        "doc-name", "stat-pages", "stat-source", "stat-size", "source-files",
        "export-all", "export-selected", "download-pdf", "privacy-count",
        "btn-preview", "btn-split", "annotate-panel-delete",
      ];
      for (const id of elementIds) {
        const tag = (id.includes("btn") || id === "download-pdf" || id === "btn-preview" || id === "btn-split" || id === "annotate-panel-delete") ? "button" : "input";
        const el = new FakeElement(tag);
        el.id = id;
        if (id === "annotate-panel-delete") el.hidden = true;
        this.appendChild(el);
      }
    }
  }
}

class FakeClassList {
  constructor(el) { this.el = el; }
  add(...n) { for (const x of n) if (!this.el.className.split(" ").includes(x)) this.el.className += (this.el.className ? " " : "") + x; }
  remove(...n) { this.el.className = this.el.className.split(" ").filter(x => !n.includes(x)).join(" "); }
  toggle(n, f) { const h = this.el.className.split(" ").includes(n); if (f === true) this.add(n); else if (f === false) this.remove(n); else { if (h) this.remove(n); else this.add(n); } return !h; }
  contains(n) { return this.el.className.split(" ").includes(n); }
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
  createElement(tagName) { const el = new FakeElement(tagName); this._allElements.push(el); return el; }
  createElementNS(ns, tagName) { return this.createElement(tagName); }
  getElementById(id) { return this._elementsById.get(id) || null; }
  registerElement(el) { if (el.id) this._elementsById.set(el.id, el); }
  querySelector(selector) { if (selector.startsWith("#")) return this.getElementById(selector.slice(1)); return this.body.querySelector(selector); }
  querySelectorAll(selector) { return this.body.querySelectorAll(selector); }
}

const fakeDoc = new FakeDocument();
global.document = fakeDoc;
global.window = {
  addEventListener: () => {}, removeEventListener: () => {},
  requestAnimationFrame: (cb) => setTimeout(cb, 0),
  cancelAnimationFrame: (id) => clearTimeout(id),
  getComputedStyle: () => ({}),
  IntersectionObserver: class { constructor(cb) { this.cb = cb; } observe() {} unobserve() {} disconnect() {} },
  ResizeObserver: class { constructor(cb) { this.cb = cb; } observe() {} unobserve() {} disconnect() {} },
  HTMLElement: FakeElement, Element: FakeElement,
};
global.IntersectionObserver = global.window.IntersectionObserver;
global.ResizeObserver = global.window.ResizeObserver;

// Mocks
const hydrateIcons = (el) => {};
const initDisclosures = (root) => {};
const validateWatermark = (text) => { if (!text) return null; if (text.length > 200) return "Watermark text too long"; return null; };
const subscribeMeter = (fn) => { fn(0); return () => {}; };

// Mock store
function createMockStore() {
  const annotations = { p1: [{ id: "h1", type: "highlight", x: 100, y: 100, width: 200, height: 50, color: "#ffe14d", opacity: 0.4 }] };
  return {
    get: () => ({
      pages: [{ id: "p1", sourceId: "s1", index: 0, baseRotation: 0, rotated: 0, width: 612, height: 792 }],
      sourceFiles: [{ id: "s1", name: "test.pdf", size: 102400, type: "application/pdf" }],
      totalSize: 102400,
      selected: [],
      fileName: "test.pdf",
      exportMode: "all",
      exportOptions: { pageNumbers: { mode: "none" }, watermark: { enabled: false }, metadata: {}, split: { mode: "every" } },
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
    patch: () => {},
    subscribe: (fn) => { fn(mockStore.get()); return () => {}; },
    undo: () => false, redo: () => false, canUndo: () => false, canRedo: () => false,
    annotations,
  };
}

const mockStore = createMockStore();
const mockGetSource = (sourceId) => Promise.resolve({ id: sourceId, kind: "pdf", bytes: new Uint8Array(100), type: "application/pdf", size: 100, pageCount: 1 });
const mockUpdateAnnotations = (mutator) => { const currentAnns = mockStore.get().annotations; const newAnns = mutator(currentAnns); mockStore.annotations = newAnns; return newAnns; };
const mockOnFileNameChange = () => {};
const mockOnExportModeChange = () => {};
const mockOnDownloadPDF = () => {};
const mockOnSplitPDF = () => {};
const mockOnPreview = () => {};
const mockOnExportOptionsChange = () => {};
const mockOnSourceRemove = () => {};

// Import the actual panel module
// We need to mock the imports first
const originalImport = globalThis.import;
globalThis.import = async (specifier) => {
  if (specifier === "../file-manager.js") {
    return { formatBytes: (b) => b + " B" };
  }
  if (specifier === "../core/privacy-meter.js") {
    return { subscribe: (fn) => { fn(0); return () => {}; } };
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

const { mountPanel } = await import("../js/ui/panel.js");

globalThis.import = originalImport;

// Test
const container = fakeDoc.createElement("div");
container.id = "panel-root";
fakeDoc.body.appendChild(container);

container.innerHTML = "test";

console.log("Container children:", container.children.map(c => c.id));

// Check the delete button before mountPanel
const deleteBtnBefore = container.querySelector("#annotate-panel-delete");
console.log("deleteBtnBefore:", deleteBtnBefore);
console.log("deleteBtnBefore.addEventListener:", typeof deleteBtnBefore?.addEventListener);
console.log("deleteBtnBefore.constructor:", deleteBtnBefore?.constructor?.name);

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

console.log("Panel mounted");

// Test 1: render with selection
console.log("\n--- Test 1: render with selection ---");
const state = mockStore.get();
console.log("State view:", state.view);
console.log("State annotateSelectedAnnotationId:", state.annotateSelectedAnnotationId);

panel.render(state);

const deleteBtn = container.querySelector("#annotate-panel-delete");
console.log("deleteBtn.hidden after render:", deleteBtn.hidden);

// Test 2: render without selection
console.log("\n--- Test 2: render without selection ---");
const stateNoSel = { ...mockStore.get(), annotateSelectedAnnotationId: null, annotateSelectedPageId: null };
console.log("State view:", stateNoSel.view);
console.log("State annotateSelectedAnnotationId:", stateNoSel.annotateSelectedAnnotationId);

panel.render(stateNoSel);
console.log("deleteBtn.hidden after render:", deleteBtn.hidden);

panel.destroy();
console.log("\nDone");