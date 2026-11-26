# Annotate panel state keys fix

## Problem
The in-page Annotate mode's right panel read `state.annotateCurrentPageId` and `state.annotateCurrentTool` to show the page hint, tool-specific options and annotation list, but nothing published those keys — only `annotateSelectedAnnotationId`/`annotateSelectedPageId` were published (via `publishSelection()`). As a result the panel hint never followed the active tool, the highlight/text option groups never appeared, and Delete/Backspace only worked from the view's own keydown handler (not from page/body/annotation focus).

## Files changed
- `js/ui/annotate-view.js`
  - Added `publishAnnotateState()` next to `publishSelection()` — patches `annotateCurrentTool` + `annotateCurrentPageId` in one place.
  - Track `currentPageId`; `updatePageIndicator()` publishes only when the visible page changes (enter/scroll/jump/page changes), so the view's store subscriber can't loop.
  - `setTool()` publishes the tool; `enter()` publishes initial state (tool reset to "select" + current page); `cleanup()` resets tool to "select" and clears the page, then publishes.
  - Added a document-level Delete/Backspace handler (attached in `enter`, removed in `cleanup`): skips `defaultPrevented` events and typing targets (`input`/`textarea`/`select`/`contentEditable`), then deletes the selected annotation. Removed the Delete/Backspace block from the view's `onKeyDown`.
  - Annotation elements now get `tabIndex = -1` and `focus()` on click; `selectAnnotation()` scrolls the annotation into view.
- `js/ui/panel.js`
  - New `onAnnotationSelect` option; annotation list items call `onAnnotationSelect(id, currentPageId)` on click instead of being a no-op.
- `js/editor.js`
  - Wires `onAnnotationSelect` to `annotateView.selectAnnotation`.
- Tests (`tests/annotate-view-smoke.test.mjs`, `tests/static-guards.test.mjs`)
  - Combined real view + real panel + real store smoke test (selection, hint following the tool, option groups, panel delete → one undo entry, keyboard Delete from body, no delete in text fields, no delete on `defaultPrevented`, page scrolling publishes the current page).
  - Pure test that `annotateCurrentPageId` follows the scrolled page (page 1 → 3 → 2 → 1).
  - Static guard: every `state.annotate*` key read by `panel.js` is written as a property somewhere in `js/`.

## Test results (real `node --test` output)
- Tests: 792, pass: 792, fail: 0, cancelled: 0, skipped: 0
- Baseline before the change: 789 pass, 0 fail (the 3 new tests are the annotate panel state fix coverage).
- `node scripts/check-contrast.mjs`: All 12 pairs PASS (>= 4.5:1), exit 0.
- `node scripts/check-headers.mjs --local`: All header checks passed (CSP identical in vercel.json and _headers, etc.), exit 0.

## Not run
- Browser-based checks (real Chromium rendering / measurement of the annotate view and panel): NOT RUN — blocked by sandbox in this environment. Static checks all pass; the fake-DOM smoke tests cover the new publishing and delete behavior in Node.

## Related
- Rotation export bug (annotations/text edits at wrong place on 90°/270° pages): tracked separately, not touched by this fix.
- annotate-geometry.js and exporter.js intentionally not changed.

---

# Page shortcuts in Annotate mode fix

## Problem
In-page Annotate mode: draw a highlight, select it with the Select tool, press Delete — the highlight is removed but Ctrl+Z does not bring it back; a second Ctrl+Z does. Cause: `js/core/shortcuts.js` registers page-level shortcuts (`Delete -> onDelete: deleteSelected`, `R -> onRotate`) on the document, and they also run while the editor is in Annotate mode. So Delete ran BOTH the annotate-view annotation delete AND the page `deleteSelected`, which recorded an extra (empty) undo checkpoint. With pages selected in the grid it could also delete those pages while annotating.

## Fix
- `js/core/shortcuts.js`: `registerShortcuts` accepts `isPageShortcutsEnabled` and gates page-level actions (`rotate`, `delete`, `duplicate`) behind it; `undo`, `redo`, `download` always stay enabled in both views. Implemented in ONE place — the predicate; the Annotate view's own handlers keep owning Delete/Backspace there.
- `js/editor.js`: passes `isPageShortcutsEnabled: () => getState().view !== "annotate"` to `registerShortcuts`; `rotateSelected`, `duplicateSelected` and `deleteSelected` return early (no `store.checkpoint`) when there is no page selection, so an empty action never adds an undo entry in any view.
- `js/core/annotate-geometry.js` intentionally not changed; `js/core/exporter.js` not changed (no bug there).

## Tests (`tests/shortcuts-register.test.mjs`, 2 new tests, real store + real `registerShortcuts` wiring via a capturing window)
- In view `pages` with 2 pages selected: Delete removes them, exactly one history entry.
- In view `annotate` with pages selected: Delete/`R` leave pages untouched and add no history entry; Ctrl+Z/Ctrl+Y/Ctrl+S still run.
- `deleteSelected` with an empty page selection adds no history entry.

## Test results (real `node --test` output)
- Tests: 794, pass: 794, fail: 0, cancelled: 0, skipped: 0
- Baseline before the change: 792 pass, 0 fail (the 2 new tests are this fix's coverage).
- `node scripts/check-contrast.mjs`: All 12 pairs PASS (>= 4.5:1), exit 0.
- `node scripts/check-headers.mjs --local`: All header checks passed, exit 0.

## Not run
- Browser-based checks (real Chromium rendering / measurement): NOT RUN — blocked by sandbox in this environment. Static checks all pass; the shortcuts integration tests cover the gating and undo behavior in Node.


# Annotate option groups restored

## Problem
In Annotate mode the option-group panels (highlight options vs text options) and their control values were reverted / missing. When switching tools or selecting an annotation of a different type, the wrong option group stayed visible and the font-size select, color pickers and opacity slider showed stale values that did not match the selected annotation (or the store defaults for new annotations).

## Fix
- `js/core/annotations.js`: added pure `panelControlValues(state, selectedAnnotation)` returning `{ fontSize, textColor, highlightColor, opacity }`. When an annotation is selected its own values are shown; otherwise the store defaults apply. Reuses `DEFAULT_TEXT_FONT_SIZE`, `DEFAULT_TEXT_COLOR`, `DEFAULT_HIGHLIGHT_COLOR`, `DEFAULT_HIGHLIGHT_OPACITY` and `annotationDefaultsFromState`.
- `js/ui/panel.js`: imports `panelControlValues`; renders option groups keyed by tool/annotation type — highlight options show when `currentTool === "highlight" || selectedAnnotation.type === "highlight"`, text options show when `currentTool === "text" || selectedAnnotation.type === "text"`; the font-size select is guaranteed to contain the currently shown value (an `<option>` is added if missing).
- Page-shortcuts gating from the earlier task is KEPT untouched: `registerShortcuts(isPageShortcutsEnabled)` gates page actions behind `() => getState().view !== "annotate"`; undo/redo/download always enabled; `rotateSelected`/`duplicateSelected`/`deleteSelected` return early with no checkpoint on empty selection. `js/core/annotate-geometry.js` not changed; `js/core/exporter.js` not changed.
- Delete/Backspace behavior in Annotate mode is unchanged (Annotate view's own handlers own Delete there).

## Tests (`tests/annotations.test.mjs`, `tests/panel-smoke.test.mjs`, `tests/annotate-view-smoke.test.mjs`)
- `panelControlValues`: 7 pure tests — selected text/highlight annotation values win; store defaults apply when nothing is selected; defaults fall back to constants when store values are absent.
- `panel-smoke`: option-group visibility flips with tool type and selected annotation type; font-size option ensured present.
- `annotate-view-smoke`: line 1883 assertion corrected (`hidden, false`) so the text options panel is shown when a text annotation is selected.

## Test results (real `node --test` output)
- Tests: 803, pass: 803, fail: 0, cancelled: 0, skipped: 0
- `node scripts/check-contrast.mjs`: All 12 pairs PASS (>= 4.5:1), exit 0.
- `node scripts/check-headers.mjs --local`: All header checks passed, exit 0.

## Not run
- Browser-based checks (real Chromium rendering / measurement): NOT RUN — blocked by sandbox in this environment. Static checks all pass; the option-group and control-value behavior is covered by Node unit/smoke tests.


