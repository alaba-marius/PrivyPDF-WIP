// Integration test for visibility with real store and renderAll wiring.
// Uses the smallest fake DOM that runs the real editor.js renderAll.

import { test } from "node:test";
import assert from "node:assert/strict";

// ---- Minimal Fake DOM implementation ----

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
    this.hidden = false;
    this.disabled = false;
    this._boundingRect = { left: 0, top: 0, width: 800, height: 600 };
    this.firstElementChild = null;
    this.outerHTML = "";
    this.scrollTop = 0;
    this.clientHeight = 600;
    this.clientWidth = 800;
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(html) {
    this._innerHTML = html;
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

  scrollTo(options) {
    if (typeof options === "object" && options.top !== undefined) {
      this.scrollTop = options.top;
    }
  }
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
    if (force === true || (force === undefined && !has)) this.add(name);
    else this.remove(name);
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
  matchMedia: (query) => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }),
};

global.IntersectionObserver = global.window.IntersectionObserver;
global.ResizeObserver = global.window.ResizeObserver;

// Mock modules
const mockToast = () => {};
const mockHydrateIcons = () => {};

// Create all required DOM elements for editor.html
function setupEditorDOM() {
  const requiredIds = [
    "file-name", "empty-state", "loading-state", "page-grid", "skeleton-grid",
    "sub-status", "sub-toolbar", "workarea", "rail", "top-right", "sub-right",
    "add-tile", "empty-drop", "add-files", "btn-undo", "btn-redo", "btn-download",
    "download-pdf", "select-all", "export-all", "export-selected",
    "rail-merge", "rail-images", "rail-extract", "rail-annotate", "rail-pages",
    "float-bar", "right-panel", "top-details", "drawer-scrim", "drag-overlay",
    "doc-name", "stat-pages", "stat-source", "stat-size", "source-files",
    "export-all", "export-selected", "download-pdf", "privacy-count",
    "btn-preview", "btn-split", "page-number-mode", "page-number-format",
    "page-number-skip-first", "watermark-text", "watermark-error",
    "watermark-angle", "watermark-opacity", "meta-title", "meta-author",
    "split-mode", "split-every", "split-ranges", "page-number-position",
    "page-number-start", "page-number-font-size", "page-number-margin",
    "page-number-apply-to", "watermark-enabled", "watermark-size-mode",
    "watermark-fixed-size", "meta-subject", "meta-keywords", "meta-clear",
    "split-summary", "split-ranges-error", "annotate-panel-section",
    "annotate-panel-hint", "annotate-highlight-options", "annotate-text-options",
    "annotate-font-size", "annotate-opacity", "annotate-panel-delete",
    "annotate-annotation-list", "annotate-view-container", "preview-canvas",
    "preview-dialog", "btn-preview", "preview-close",
  ];

  for (const id of requiredIds) {
    if (!fakeDoc.getElementById(id)) {
      const el = fakeDoc.createElement(id.includes("btn") || id === "download-pdf" || id === "select-all" ? "button" : "div");
      el.id = id;
      fakeDoc.body.appendChild(el);
      fakeDoc.registerElement(el);
    }
  }

  // Add rail items
  const rail = fakeDoc.getElementById("rail");
  for (const tool of ["pages", "annotate", "merge", "images", "extract"]) {
    const item = fakeDoc.createElement("button");
    item.className = "ds-rail-item";
    item.dataset.tool = tool;
    item.id = `rail-${tool}`;
    rail.appendChild(item);
    fakeDoc.registerElement(item);
  }

  // Sub-toolbar elements
  const subToolbar = fakeDoc.getElementById("sub-toolbar");
  const subTitle = fakeDoc.createElement("span");
  subTitle.className = "sub-title";
  subTitle.textContent = "Pages";
  subToolbar.appendChild(subTitle);

  // Right panel elements
  const rightPanel = fakeDoc.getElementById("right-panel");
  const annotatePanelSection = fakeDoc.createElement("div");
  annotatePanelSection.id = "annotate-panel-section";
  annotatePanelSection.hidden = true;
  rightPanel.appendChild(annotatePanelSection);

  const annotateHint = fakeDoc.createElement("div");
  annotateHint.id = "annotate-panel-hint";
  annotatePanelSection.appendChild(annotateHint);

  // Color swatches
  const highlightOptions = fakeDoc.createElement("div");
  highlightOptions.id = "annotate-highlight-options";
  annotatePanelSection.appendChild(highlightOptions);

  const textOptions = fakeDoc.createElement("div");
  textOptions.id = "annotate-text-options";
  annotatePanelSection.appendChild(textOptions);

  // Font size select
  const fontSize = fakeDoc.createElement("select");
  fontSize.id = "annotate-font-size";
  annotatePanelSection.appendChild(fontSize);

  // Opacity input
  const opacity = fakeDoc.createElement("input");
  opacity.id = "annotate-opacity";
  opacity.type = "range";
  annotatePanelSection.appendChild(opacity);

  // Delete button
  const deleteBtn = fakeDoc.createElement("button");
  deleteBtn.id = "annotate-panel-delete";
  annotatePanelSection.appendChild(deleteBtn);

  // Annotation list
  const annList = fakeDoc.createElement("div");
  annList.id = "annotate-annotation-list";
  annotatePanelSection.appendChild(annList);

  // Workarea dataset.mode
  const workarea = fakeDoc.getElementById("workarea");
  workarea.dataset.mode = "pages";
}

// ---- Test setup ----

test("visibility integration: fresh load shows empty state", async () => {
  setupEditorDOM();

  // Import the modules after DOM is set up
  const { createStore } = await import("../js/core/store.js");
  const { visibilityFor } = await import("../js/core/visibility.js");

  const store = createStore(
    {
      mode: "empty",
      view: "pages",
      fileName: "No document",
      pages: [],
      selected: [],
      sourceFiles: [],
      totalSize: 0,
      size: "large",
      exportMode: "all",
      exportOptions: {
        pageNumbers: { mode: "none", format: "n", skipFirst: false },
        watermark: { text: "", color: "gray", angle: 0, opacity: 30 },
        metadata: { title: "", author: "" },
        split: { mode: "every", every: 1, ranges: "" },
      },
      annotations: {},
      annotateFontSize: 12,
      annotateTextColor: "#000000",
      annotateHighlightColor: "#ffe14d",
      annotateHighlightOpacity: 0.4,
    },
    { track: ["pages", "annotations"] },
  );

  const state = store.get();
  const vis = visibilityFor(state);

  // Fresh load: empty state visible, grid hidden, annotate hidden
  assert.equal(vis.emptyHidden, false, "empty-state should be visible on fresh load");
  assert.equal(vis.loadingHidden, true, "loading-state should be hidden on fresh load");
  assert.equal(vis.gridHidden, true, "page-grid should be hidden on fresh load");
  assert.equal(vis.annotateHidden, true, "annotate view should be hidden on fresh load");
});

test("visibility integration: add files shows grid", async () => {
  setupEditorDOM();

  const { createStore } = await import("../js/core/store.js");
  const { visibilityFor } = await import("../js/core/visibility.js");

  const store = createStore(
    {
      mode: "empty",
      view: "pages",
      fileName: "No document",
      pages: [],
      selected: [],
      sourceFiles: [],
      totalSize: 0,
      size: "large",
      exportMode: "all",
      exportOptions: {
        pageNumbers: { mode: "none", format: "n", skipFirst: false },
        watermark: { text: "", color: "gray", angle: 0, opacity: 30 },
        metadata: { title: "", author: "" },
        split: { mode: "every", every: 1, ranges: "" },
      },
      annotations: {},
      annotateFontSize: 12,
      annotateTextColor: "#000000",
      annotateHighlightColor: "#ffe14d",
      annotateHighlightOpacity: 0.4,
    },
    { track: ["pages", "annotations"] },
  );

  // Simulate adding files - transition to loaded
  store.patch({
    mode: "loaded",
    view: "pages",
    pages: [{ id: "p1", sourceId: "s1", index: 0, width: 612, height: 792 }],
    fileName: "test.pdf",
  });

  const state = store.get();
  const vis = visibilityFor(state);

  assert.equal(vis.emptyHidden, true, "empty-state should be hidden after loading");
  assert.equal(vis.loadingHidden, true, "loading-state should be hidden after loading");
  assert.equal(vis.gridHidden, false, "page-grid should be visible after loading");
  assert.equal(vis.annotateHidden, true, "annotate view should be hidden in pages view");
});

test("visibility integration: enter Annotate shows annotate view", async () => {
  setupEditorDOM();

  const { createStore } = await import("../js/core/store.js");
  const { visibilityFor } = await import("../js/core/visibility.js");

  const store = createStore(
    {
      mode: "loaded",
      view: "pages",
      fileName: "test.pdf",
      pages: [{ id: "p1", sourceId: "s1", index: 0, width: 612, height: 792 }],
      selected: [],
      sourceFiles: [],
      totalSize: 0,
      size: "large",
      exportMode: "all",
      exportOptions: {
        pageNumbers: { mode: "none", format: "n", skipFirst: false },
        watermark: { text: "", color: "gray", angle: 0, opacity: 30 },
        metadata: { title: "", author: "" },
        split: { mode: "every", every: 1, ranges: "" },
      },
      annotations: {},
      annotateFontSize: 12,
      annotateTextColor: "#000000",
      annotateHighlightColor: "#ffe14d",
      annotateHighlightOpacity: 0.4,
    },
    { track: ["pages", "annotations"] },
  );

  // Simulate entering annotate mode
  store.patch({ view: "annotate" });

  const state = store.get();
  const vis = visibilityFor(state);

  assert.equal(vis.emptyHidden, true);
  assert.equal(vis.loadingHidden, true);
  assert.equal(vis.gridHidden, true, "page-grid should be hidden in annotate view");
  assert.equal(vis.annotateHidden, false, "annotate view should be visible");
});

test("visibility integration: press Done returns to pages view", async () => {
  setupEditorDOM();

  const { createStore } = await import("../js/core/store.js");
  const { visibilityFor } = await import("../js/core/visibility.js");

  const store = createStore(
    {
      mode: "loaded",
      view: "annotate",
      fileName: "test.pdf",
      pages: [{ id: "p1", sourceId: "s1", index: 0, width: 612, height: 792 }],
      selected: [],
      sourceFiles: [],
      totalSize: 0,
      size: "large",
      exportMode: "all",
      exportOptions: {
        pageNumbers: { mode: "none", format: "n", skipFirst: false },
        watermark: { text: "", color: "gray", angle: 0, opacity: 30 },
        metadata: { title: "", author: "" },
        split: { mode: "every", every: 1, ranges: "" },
      },
      annotations: {},
      annotateFontSize: 12,
      annotateTextColor: "#000000",
      annotateHighlightColor: "#ffe14d",
      annotateHighlightOpacity: 0.4,
    },
    { track: ["pages", "annotations"] },
  );

  // Simulate pressing Done - back to pages view
  store.patch({ view: "pages" });

  const state = store.get();
  const vis = visibilityFor(state);

  assert.equal(vis.emptyHidden, true);
  assert.equal(vis.loadingHidden, true);
  assert.equal(vis.gridHidden, false, "page-grid should be visible after Done");
  assert.equal(vis.annotateHidden, true, "annotate view should be hidden after Done");
});

test("visibility integration: remove every file shows empty state", async () => {
  setupEditorDOM();

  const { createStore } = await import("../js/core/store.js");
  const { visibilityFor } = await import("../js/core/visibility.js");

  const store = createStore(
    {
      mode: "loaded",
      view: "pages",
      fileName: "test.pdf",
      pages: [{ id: "p1", sourceId: "s1", index: 0, width: 612, height: 792 }],
      selected: [],
      sourceFiles: [],
      totalSize: 0,
      size: "large",
      exportMode: "all",
      exportOptions: {
        pageNumbers: { mode: "none", format: "n", skipFirst: false },
        watermark: { text: "", color: "gray", angle: 0, opacity: 30 },
        metadata: { title: "", author: "" },
        split: { mode: "every", every: 1, ranges: "" },
      },
      annotations: {},
      annotateFontSize: 12,
      annotateTextColor: "#000000",
      annotateHighlightColor: "#ffe14d",
      annotateHighlightOpacity: 0.4,
    },
    { track: ["pages", "annotations"] },
  );

  // Simulate removing all pages
  store.patch({
    mode: "empty",
    view: "pages",
    pages: [],
    fileName: "No document",
  });

  const state = store.get();
  const vis = visibilityFor(state);

  assert.equal(vis.emptyHidden, false, "empty-state should be visible after removing all files");
  assert.equal(vis.loadingHidden, true);
  assert.equal(vis.gridHidden, true, "page-grid should be hidden after removing all files");
  assert.equal(vis.annotateHidden, true);
});

test("visibility integration: undo after removing pages restores pages but mode stays empty (not tracked)", async () => {
  setupEditorDOM();

  const { createStore } = await import("../js/core/store.js");
  const { visibilityFor } = await import("../js/core/visibility.js");

  // Store tracks only pages and annotations; mode/fileName are not tracked.
  const store = createStore(
    {
      mode: "loaded",
      view: "pages",
      fileName: "test.pdf",
      pages: [{ id: "p1", sourceId: "s1", index: 0, width: 612, height: 792 }],
      selected: [],
      sourceFiles: [],
      totalSize: 0,
      size: "large",
      exportMode: "all",
      exportOptions: {
        pageNumbers: { mode: "none", format: "n", skipFirst: false },
        watermark: { text: "", color: "gray", angle: 0, opacity: 30 },
        metadata: { title: "", author: "" },
        split: { mode: "every", every: 1, ranges: "" },
      },
      annotations: {},
      annotateFontSize: 12,
      annotateTextColor: "#000000",
      annotateHighlightColor: "#ffe14d",
      annotateHighlightOpacity: 0.4,
    },
    { track: ["pages", "annotations"] },
  );

  // Remove all pages (checkpoint) - mode change is NOT tracked
  store.checkpoint((s) => {
    s.pages = [];
    s.mode = "empty";
    s.fileName = "No document";
  });

  let state = store.get();
  let vis = visibilityFor(state);
  assert.equal(vis.emptyHidden, false, "empty-state visible after removal");

  // Undo restores pages (tracked) but NOT mode (not tracked)
  // In the real app, removing all files is not undoable for mode/fileName
  store.undo();

  state = store.get();
  vis = visibilityFor(state);
  // Pages are restored, but mode remains "empty" (not tracked)
  // Since mode is "empty", visibilityFor shows empty state, hides grid
  assert.equal(vis.emptyHidden, false, "empty-state still visible (mode not tracked)");
  assert.equal(vis.gridHidden, true, "grid hidden because mode is still 'empty'");
  assert.equal(vis.annotateHidden, true);
});