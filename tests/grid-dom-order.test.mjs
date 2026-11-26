// Grid DOM Order Test: Verifies that page card DOM order matches store order
// after entering and exiting Annotate mode. Tests with 6 pages, plus a case
// with duplicated and reordered pages.
//
// This test uses the real mountGrid with a fake DOM that supports the
// necessary APIs, and simulates the store changes that occur when
// entering/exiting Annotate mode (mode patch + grid re-render).

import { test } from "node:test";
import assert from "node:assert/strict";

// ---- Minimal Fake DOM implementation ----

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.className = "";
    this.style = { setProperty: () => {} };
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
    this.offsetWidth = 196;
    this.offsetHeight = 254;
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(html) {
    this._innerHTML = html;
    // Don't parse - just store the string
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

  removeAttribute(name) {
    this.attributes.delete(name);
    if (name === "class") this.className = "";
    if (name === "id") this.id = "";
    if (name === "aria-selected") this.ariaSelected = "false";
  }

  get classList() {
    if (!this._classList) {
      this._classList = new FakeClassList(this);
    }
    return this._classList;
  }

  set classList(val) {
    this._classList = val;
  }

  querySelector(selector) {
    // Mock specific selectors used by cards.js syncCard
    if (selector === ".ds-sheet-page" || selector === ".page-canvas") {
      const mockEl = new FakeElement("div");
      mockEl.offsetWidth = 196;
      mockEl.offsetHeight = 254;
      mockEl._boundingRect = { left: 0, top: 0, width: 196, height: 254 };
      mockEl.getBoundingClientRect = () => ({ left: 0, top: 0, width: 196, height: 254 });
      mockEl.classList = { toggle: () => {}, add: () => {}, remove: () => {}, contains: () => false };
      return mockEl;
    }
    if (selector === ".ds-sheet") {
      const mockEl = new FakeElement("div");
      mockEl.dataset = { rotate: "0" };
      mockEl.style = { setProperty: () => {} };
      mockEl.classList = { toggle: () => {}, add: () => {}, remove: () => {}, contains: () => false };
      mockEl.querySelector = (sel) => {
        if (sel === ".ds-sheet-page" || sel === ".page-canvas") {
          const mockEl2 = new FakeElement("div");
          mockEl2.offsetWidth = 196;
          mockEl2.offsetHeight = 254;
          mockEl2._boundingRect = { left: 0, top: 0, width: 196, height: 254 };
          mockEl2.classList = { toggle: () => {}, add: () => {}, remove: () => {}, contains: () => false };
          return mockEl2;
        }
        if (sel === ".ds-check") return null;
        return null;
      };
      mockEl.insertAdjacentHTML = (pos, html) => {};
      return mockEl;
    }
    if (selector === ".ds-check") return null;
    if (selector === ".thumb-skeleton") return null;
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
    } else if (selector.startsWith("[")) {
      this.collectByAttribute(selector, results);
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

  collectByAttribute(selector, results) {
    const match = selector.match(/\[(\w+)(?:="([^"]*)")?\]/);
    if (match) {
      const attr = match[1];
      const value = match[2];
      this.collectByAttributeRecursive(attr, value, results);
    }
  }

  collectByAttributeRecursive(attr, value, results) {
    const hasAttr = this.attributes.has(attr) || (attr === "data-icon" && this.dataset && this.dataset.icon);
    if (hasAttr) {
      if (value === undefined || this.attributes.get(attr) === value || this.dataset[attr] === value) {
        results.push(this);
      }
    }
    for (const child of this.children) {
      child.collectByAttributeRecursive(attr, value, results);
    }
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
    // If child already has a parent, remove it from there first (simulate DOM move)
    if (child.parent) {
      child.parent.children = child.parent.children.filter(c => c !== child);
    }
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

  insertAdjacentHTML(position, html) {
    // Minimal parsing for sheetHtml structure
    if (position !== "beforeend") return;
    // Create mock children for the sheet structure
    const sheet = new FakeElement("div");
    sheet.className = "ds-sheet";
    sheet.dataset.rotate = "0";
    sheet.style = { setProperty: () => {} };
    sheet.classList = { toggle: () => {}, add: () => {}, remove: () => {}, contains: () => false };
    sheet.querySelector = (sel) => {
      if (sel === ".ds-sheet-page" || sel === ".page-canvas") {
        const mockEl = new FakeElement("div");
        mockEl.offsetWidth = 196;
        mockEl.offsetHeight = 254;
        mockEl._boundingRect = { left: 0, top: 0, width: 196, height: 254 };
        mockEl.classList = { toggle: () => {}, add: () => {}, remove: () => {}, contains: () => false };
        return mockEl;
      }
      if (sel === ".ds-check") return null;
      return null;
    };
    sheet.insertAdjacentHTML = () => {};
    this.appendChild(sheet);

    const pageNum = new FakeElement("span");
    pageNum.className = "page-number";
    this.appendChild(pageNum);
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

  matches(selector) {
    if (selector.startsWith(".")) {
      return this.className.split(" ").includes(selector.slice(1));
    }
    if (selector.startsWith("#")) {
      return this.id === selector.slice(1);
    }
    return this.tagName === selector.toUpperCase();
  }

  contains(el) {
    let current = el;
    while (current) {
      if (current === this) return true;
      current = current.parent;
    }
    return false;
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
    constructor(cb, options) { this.cb = cb; this.options = options; }
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
  location: { href: "http://localhost" },
  navigator: { userAgent: "node" },
  matchMedia: (query) => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }),
};
global.IntersectionObserver = global.window.IntersectionObserver;
global.ResizeObserver = global.window.ResizeObserver;
global.MutationObserver = class {
  constructor(cb) { this.cb = cb; }
  observe() {}
  disconnect() {}
};

// Fake PDF.js
const fakePdfjs = {
  getDocument: ({ data }) => ({
    promise: Promise.resolve({
      numPages: 6,
      getPage: (num) => Promise.resolve({
        getViewport: ({ scale, rotation }) => ({
          width: 612 * scale,
          height: 792 * scale,
          rotation,
        }),
        render: ({ canvasContext, viewport }) => ({
          promise: Promise.resolve(),
        }),
      }),
    }),
  }),
  GlobalWorkerOptions: { workerSrc: "" },
};

global.pdfjsLib = fakePdfjs;

// Mock createImageBitmap
global.createImageBitmap = async () => ({
  width: 196,
  height: 254,
  close: () => {},
});

// Mock hydrateIcons
const hydrateIcons = (el) => {};

// ---- Test helpers ----

function createPages(count, startId = 1) {
  const pages = [];
  for (let i = 0; i < count; i++) {
    pages.push({
      id: `p${startId + i}`,
      sourceId: "s1",
      index: i,
      baseRotation: 0,
      rotated: 0,
      width: 612,
      height: 792
    });
  }
  return pages;
}

function getGridPageOrder(gridEl) {
  const cards = gridEl.querySelectorAll(".page-card");
  const order = [];
  for (const card of cards) {
    order.push(card.dataset.id);
  }
  return order;
}

function createTestStore(initialState) {
  let state = initialState;
  const subscribers = new Set();

  function notify() {
    subscribers.forEach((fn) => fn(state));
  }

  return {
    get() { return state; },
    patch(partial) {
      state = { ...state, ...partial };
      notify();
    },
    subscribe(fn) {
      subscribers.add(fn);
      fn(state);
      return () => subscribers.delete(fn);
    },
    undo() { return false; },
    redo() { return false; },
    canUndo() { return false; },
    canRedo() { return false; },
    checkpoint(fn) {
      const draft = JSON.parse(JSON.stringify(state));
      fn(draft);
      state = draft;
      notify();
    },
  };
}

async function setupGrid(store) {
  const { mountGrid } = await import("../js/ui/cards.js");

  const pageGrid = document.createElement("div");
  pageGrid.id = "page-grid";
  const addTile = document.createElement("div");
  addTile.id = "add-tile";
  const workarea = document.createElement("div");
  workarea.id = "workarea";

  const gridCtl = mountGrid(pageGrid, addTile, workarea, {
    getState: () => store.get(),
    getSourceName: () => "Test.pdf",
    onToggle: () => {},
    onFocus: () => {},
    onSelectAll: () => {},
    onSelectNone: () => {},
    onSelectRange: () => {},
    onFocusNext: () => {},
    onSizeChange: () => {},
    onAdd: () => {},
    onMoveTo: () => {},
    renderThumbnail: async () => ({ bitmap: { width: 196, height: 254, close: () => {} } }),
  });

  return { gridCtl, pageGrid, addTile, workarea };
}

// ---- Tests ----

test("grid DOM order matches store order after Annotate enter/exit (6 pages)", async () => {
  // Create store with 6 pages
  const pages = createPages(6);
  const store = createTestStore({
    mode: "pages",
    fileName: "Test.pdf",
    pages,
    selected: [],
    sourceFiles: [{ id: "s1", name: "Test.pdf", size: 1000, type: "application/pdf", pages: 6 }],
    totalSize: 1000,
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
  });

  const { gridCtl, pageGrid } = await setupGrid(store);

  // Initial render
  gridCtl.render();
  const initialOrder = getGridPageOrder(pageGrid);
  assert.deepStrictEqual(initialOrder, ["p1", "p2", "p3", "p4", "p5", "p6"], "Initial grid order should match store");

  // Simulate entering Annotate mode (mode change)
  store.patch({ mode: "annotate" });
  // Grid doesn't re-render on mode change in this test (would be hidden anyway)

  // Simulate exiting Annotate mode (Done clicked) - mode changes back to pages
  store.patch({ mode: "pages" });
  // This triggers store subscription which calls gridCtl.render()
  gridCtl.render();

  const finalOrder = getGridPageOrder(pageGrid);
  assert.deepStrictEqual(finalOrder, ["p1", "p2", "p3", "p4", "p5", "p6"], "Grid order should match store after Annotate exit");
});

test("grid DOM order matches store order after Annotate exit with duplicated and reordered pages", async () => {
  const pages = createPages(6);
  const store = createTestStore({
    mode: "pages",
    fileName: "Test.pdf",
    pages,
    selected: [],
    sourceFiles: [{ id: "s1", name: "Test.pdf", size: 1000, type: "application/pdf", pages: 6 }],
    totalSize: 1000,
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
  });

  const { gridCtl, pageGrid } = await setupGrid(store);

  // Initial render
  gridCtl.render();
  const initialOrder = getGridPageOrder(pageGrid);
  assert.deepStrictEqual(initialOrder, ["p1", "p2", "p3", "p4", "p5", "p6"], "Initial grid order should match store");

  // Simulate duplicating page 2 (inserts after page 2)
  let state = store.get();
  const duplicatedPages = [...state.pages];
  const page2Index = duplicatedPages.findIndex(p => p.id === "p2");
  const dupe = { ...duplicatedPages[page2Index], id: "p7", rotated: 0 };
  duplicatedPages.splice(page2Index + 1, 0, dupe);
  store.patch({ pages: duplicatedPages });
  gridCtl.render();

  // Simulate moving page 1 to the end (reorder)
  state = store.get();
  const reorderedPages = [...state.pages];
  const page1 = reorderedPages.shift();
  reorderedPages.push(page1);
  store.patch({ pages: reorderedPages });
  gridCtl.render();

  // Expected order after duplication + reorder: p2, p7, p3, p4, p5, p6, p1
  const expectedAfterReorder = ["p2", "p7", "p3", "p4", "p5", "p6", "p1"];
  const reorderedOrder = getGridPageOrder(pageGrid);
  assert.deepStrictEqual(reorderedOrder, expectedAfterReorder, "Grid order should match reordered store");

  // Simulate entering Annotate mode
  store.patch({ mode: "annotate" });

  // Simulate exiting Annotate mode (Done clicked)
  store.patch({ mode: "pages" });
  gridCtl.render();

  const finalOrder = getGridPageOrder(pageGrid);
  assert.deepStrictEqual(finalOrder, expectedAfterReorder, "Grid order should match store after Annotate exit with reordered pages");
});