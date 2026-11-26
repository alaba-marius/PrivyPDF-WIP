import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../js/core/store.js";
import { registerShortcuts } from "../js/core/shortcuts.js";

// A window that records the keydown handler registerShortcuts installs, so the
// test can drive synthetic key events through the real registration.
function capturingWindow() {
  let keydownHandler = null;
  return {
    handler() {
      return keydownHandler;
    },
    addEventListener(type, handler) {
      if (type === "keydown") keydownHandler = handler;
    },
    removeEventListener() {},
    dispatchEvent() {
      return true;
    },
  };
}

function keyEvent(key, mods = {}) {
  return {
    key,
    ctrlKey: !!mods.ctrl,
    metaKey: !!mods.meta,
    shiftKey: !!mods.shift,
    target: null, // set at dispatch time
    preventDefault() {},
  };
}

test("registerShortcuts: page actions run in pages view, are gated in annotate view; undo/redo/download always run", (t) => {
  const win = capturingWindow();
  const origWindow = global.window;
  global.window = win;

  try {
    const store = createStore(
      {
        view: "pages",
        pages: [
          { id: "p1", index: 0 },
          { id: "p2", index: 1 },
        ],
        selected: ["p1", "p2"],
      },
      { track: ["pages"] }
    );

    let deleteCalls = 0;
    let rotateCalls = 0;
    let undoCalls = 0;
    let redoCalls = 0;
    let downloadCalls = 0;

    const onDelete = () => {
      deleteCalls++;
      store.checkpoint((s) => {
        s.pages = s.pages.filter((p) => !s.selected.includes(p.id));
        s.selected = [];
      });
    };
    const onRotate = () => {
      rotateCalls++;
      store.checkpoint((s) => {
        s.pages = s.pages.map((p) => ({ ...p, rotation: (p.rotation || 0) + 90 }));
      });
    };
    const onUndo = () => {
      undoCalls++;
      store.undo();
    };
    const onRedo = () => {
      redoCalls++;
      store.redo();
    };
    const onDownload = () => {
      downloadCalls++;
    };

    registerShortcuts({
      onRotate,
      onDelete,
      onUndo,
      onRedo,
      onDownload,
      isPageShortcutsEnabled: () => store.get().view !== "annotate",
    });
    const handler = win.handler();
    assert.ok(handler, "registerShortcuts installed a keydown listener");

    const dispatch = (key, mods) =>
      handler({ ...keyEvent(key, mods), target: win });

    assert.equal(store.canUndo(), false, "no history before delete");

    // --- pages view: Delete removes both selected pages (one history entry) ---
    dispatch("Delete");
    assert.equal(deleteCalls, 1, "Delete ran onDelete in pages view");
    assert.equal(store.get().pages.length, 0, "Delete removed both selected pages");
    assert.equal(store.canUndo(), true, "one history entry added");

    // --- annotate view: page actions are gated, no new history entry ---
    store.patch({ view: "annotate", selected: ["p1", "p2"] });
    dispatch("Delete");
    dispatch("r");
    assert.equal(deleteCalls, 1, "Delete did not run onDelete in annotate view");
    assert.equal(rotateCalls, 0, "Rotate did not run in annotate view");
    assert.equal(store.canUndo(), true, "no new history entry added in annotate view");

    // undo / redo / download still run in annotate view
    dispatch("z", { ctrl: true });
    assert.equal(undoCalls, 1, "Ctrl+Z (undo) still runs in annotate view");
    assert.equal(store.canUndo(), false, "undo consumed the history entry");
    dispatch("y", { ctrl: true });
    assert.equal(redoCalls, 1, "Ctrl+Y (redo) still runs in annotate view");
    assert.equal(store.canUndo(), true, "redo re-added the history entry");
    dispatch("s", { ctrl: true });
    assert.equal(downloadCalls, 1, "Ctrl+S (download) still runs in annotate view");
  } finally {
    global.window = origWindow;
  }
});

test("registerShortcuts: Delete with an empty page selection adds no history entry", (t) => {
  const win = capturingWindow();
  const origWindow = global.window;
  global.window = win;

  try {
    const store = createStore(
      { view: "pages", pages: [{ id: "p1", index: 0 }, { id: "p2", index: 1 }], selected: [] },
      { track: ["pages"] }
    );

    let deleteCalls = 0;
    const onDelete = () => {
      deleteCalls++;
      // Mirrors the fixed editor.js deleteSelected: no-op (and no checkpoint)
      // when nothing is selected.
      if (!store.get().selected.length) return;
      store.checkpoint((s) => {
        s.pages = s.pages.filter((p) => !s.selected.includes(p.id));
        s.selected = [];
      });
    };

    registerShortcuts({ onDelete, isPageShortcutsEnabled: () => store.get().view !== "annotate" });
    const handler = win.handler();
    const dispatch = (key) => handler({ ...keyEvent(key), target: win });

    assert.equal(store.canUndo(), false, "no history before delete");
    dispatch("Delete");
    assert.equal(deleteCalls, 1, "Delete invoked onDelete even with empty selection");
    assert.equal(store.canUndo(), false, "empty selection added no history entry");
    assert.equal(store.get().pages.length, 2, "no pages were deleted");
  } finally {
    global.window = origWindow;
  }
});
