// Pure visibility logic for the editor.
// No DOM, no side effects — used by editor.js and tests.

/**
 * Compute visibility flags from content state and view mode.
 * @param {Object} state - { mode: "empty"|"loading"|"loaded", view: "pages"|"annotate", pages: Array }
 * @returns {Object} { emptyHidden, loadingHidden, gridHidden, annotateHidden }
 */
export function visibilityFor(state) {
  const mode = state.mode; // "empty" | "loading" | "loaded"
  const view = state.view; // "pages" | "annotate"
  const hasPages = (state.pages || []).length > 0;

  // Default: everything hidden
  let emptyHidden = true;
  let loadingHidden = true;
  let gridHidden = true;
  let annotateHidden = true;

  if (mode === "empty") {
    // Empty state visible (also when view is "pages")
    emptyHidden = false;
    // Annotate rail item shows "open a document first" behavior (handled by panel)
  } else if (mode === "loading") {
    // Loading state visible
    loadingHidden = false;
  } else if (mode === "loaded") {
    if (view === "pages") {
      // Grid visible, annotate view hidden
      gridHidden = false;
      annotateHidden = true;
    } else if (view === "annotate") {
      // Annotate view visible, grid hidden
      gridHidden = true;
      annotateHidden = false;
    }
  }

  // If no pages and in annotate view, return to pages view and show empty state
  // This is handled by the caller (editor.js) when pages are removed
  // but we can also reflect it here for completeness:
  if (mode === "loaded" && view === "annotate" && !hasPages) {
    gridHidden = false;
    annotateHidden = true;
    // Note: the caller should also transition view to "pages" and mode to "empty"
  }

  return { emptyHidden, loadingHidden, gridHidden, annotateHidden };
}