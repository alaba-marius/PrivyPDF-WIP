import {
  addAnnotation,
  updateAnnotation,
  deleteAnnotation,
  createTextAnnotation,
} from "./annotations.js";

/**
 * Pure function: commit a text annotation draft.
 * Returns an action to apply to annotations, or null if no change (empty text on new).
 * The action is a function: (annotations) => newAnnotations
 * This is a pure function with no side effects — used by annotate.js to keep
 * commit logic testable and isolated from DOM/store.
 *
 * @param {Object} opts
 * @param {Object} opts.draft - { pageX, pageY, pageId } — the creation position
 * @param {string} opts.text - User-entered text (trimmed)
 * @param {string} [opts.annotationId] - If editing existing annotation
 * @param {Object} [opts.defaults] - { fontSize, color }
 * @returns {Function|null} Action to apply: (annotations) => newAnnotations, or null
 */
export function commitTextDraft({ draft, text, annotationId, defaults = {} }) {
  const { pageX, pageY, pageId } = draft;
  const trimmed = text.trim();

  // Editing existing annotation
  if (annotationId) {
    if (trimmed) {
      // Update with new text
      return (annotations) => updateAnnotation(annotations, pageId, annotationId, { text: trimmed });
    } else {
      // Empty text -> delete
      return (annotations) => deleteAnnotation(annotations, pageId, annotationId);
    }
  }

  // Creating new annotation
  if (trimmed) {
    // Create new text annotation
    const ann = createTextAnnotation(pageX, pageY, trimmed, defaults);
    return (annotations) => addAnnotation(annotations, pageId, ann);
  }

  // Empty text on new -> no action
  return null;
}