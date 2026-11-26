// Annotation data model and operations. Pure JS, no DOM.
// Annotations are stored in UNROTATED page space (PDF points, origin bottom-left, y up).
// Keyed by pageId: annotations[pageId] = array of { id, type: "text" | "highlight", ... }

// Simple ID generator
let annotationIdCounter = 1;
function newAnnotationId() {
  return `a${annotationIdCounter++}`;
}

function resetAnnotationIdCounter() {
  annotationIdCounter = 1;
}

// Annotation structure:
// Text: { id, type: "text", x, y, text, fontSize, color }
// Highlight: { id, type: "highlight", x, y, width, height, color, opacity }
// Image: { id, type: "image", x, y, width, height, assetId, opacity }

export const DEFAULT_TEXT_FONT_SIZE = 14;
export const DEFAULT_TEXT_COLOR = "#000000";
export const DEFAULT_HIGHLIGHT_COLOR = "#ffe14d";
export const DEFAULT_HIGHLIGHT_OPACITY = 0.4;
export const DEFAULT_IMAGE_OPACITY = 1;

// Pure helper functions that take annotations object and return new one
// All functions are pure - they don't mutate the input, they return new objects

export function getPageAnnotations(annotations, pageId) {
  return annotations[pageId] ? [...annotations[pageId]] : [];
}

export function getAllAnnotations(annotations) {
  const result = {};
  for (const [pageId, anns] of Object.entries(annotations)) {
    result[pageId] = [...anns];
  }
  return result;
}

export function setPageAnnotations(annotations, pageId, anns) {
  const result = { ...annotations };
  result[pageId] = anns.map((a) => ({ ...a }));
  return result;
}

export function addAnnotation(annotations, pageId, annotation) {
  const anns = getPageAnnotations(annotations, pageId);
  const newAnn = { ...annotation, id: annotation.id || newAnnotationId() };
  const newAnns = [...anns, newAnn];
  return setPageAnnotations(annotations, pageId, newAnns);
}

export function updateAnnotation(annotations, pageId, annotationId, updates) {
  const anns = getPageAnnotations(annotations, pageId);
  const idx = anns.findIndex((a) => a.id === annotationId);
  if (idx === -1) return annotations;
  const newAnns = [...anns];
  newAnns[idx] = { ...newAnns[idx], ...updates };
  return setPageAnnotations(annotations, pageId, newAnns);
}

export function deleteAnnotation(annotations, pageId, annotationId) {
  const anns = getPageAnnotations(annotations, pageId);
  const filtered = anns.filter((a) => a.id !== annotationId);
  if (filtered.length === anns.length) return annotations;
  return setPageAnnotations(annotations, pageId, filtered);
}

export function moveAnnotation(annotations, pageId, annotationId, dx, dy) {
  const anns = getPageAnnotations(annotations, pageId);
  const ann = anns.find((a) => a.id === annotationId);
  if (!ann) return annotations;
  const newAnns = anns.map((a) =>
    a.id === annotationId ? { ...a, x: (a.x || 0) + dx, y: (a.y || 0) + dy } : a
  );
  return setPageAnnotations(annotations, pageId, newAnns);
}

export function nudgeAnnotation(annotations, pageId, annotationId, dx, dy) {
  return moveAnnotation(annotations, pageId, annotationId, dx, dy);
}

// Duplicate a page's annotations with new IDs
export function duplicatePageAnnotations(annotations, fromPageId, toPageId) {
  const anns = getPageAnnotations(annotations, fromPageId);
  if (!anns.length) return annotations;
  const newAnns = anns.map((a) => ({ ...a, id: newAnnotationId() }));
  return setPageAnnotations(annotations, toPageId, newAnns);
}

// Delete a page's annotations
export function deletePageAnnotations(annotations, pageId) {
  if (!(pageId in annotations)) return annotations;
  const result = { ...annotations };
  delete result[pageId];
  return result;
}

// Get annotation count for a page (for badge display)
export function getAnnotationCount(annotations, pageId) {
  return annotations[pageId]?.length || 0;
}

// Check if a text annotation contains unsupported characters for Helvetica
// Helvetica (standard PDF font) supports Latin-1 (ISO-8859-1) subset
export function validateTextForHelvetica(text) {
  // Helvetica in pdf-lib supports WinAnsiEncoding (subset of Latin-1)
  // Characters outside this range will render as .notdef
  // We check for characters that are NOT in the WinAnsi set
  // WinAnsi covers roughly U+0020-U+007E (ASCII printable) plus some extended
  // For safety, we only allow: ASCII 32-126 + common Latin-1 (160-255 except control)
  // But the simplest approach: check if all chars are in the standard Helvetica repertoire
  // pdf-lib's StandardFonts.Helvetica uses the built-in Helvetica which is WinAnsiEncoding
  // WinAnsiEncoding covers U+0020-U+007E and U+00A0-U+00FF (mostly)
  // Characters like emoji, CJK, etc. are NOT supported

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    // Allow ASCII printable (32-126) and common Latin-1 supplement (160-255)
    // but NOT control characters (0-31, 127-159)
    if (code < 32 || (code >= 127 && code <= 159)) {
      return { valid: false, char: text[i], code, position: i };
    }
    // Also reject characters above 255 (non-Latin-1)
    if (code > 255) {
      return { valid: false, char: text[i], code, position: i };
    }
  }
  return { valid: true };
}

// Create a text annotation with defaults
export function createTextAnnotation(x, y, text, options = {}) {
  return {
    type: "text",
    x,
    y,
    text,
    fontSize: options.fontSize ?? DEFAULT_TEXT_FONT_SIZE,
    color: options.color ?? DEFAULT_TEXT_COLOR,
  };
}

// Create a highlight annotation with defaults
export function createHighlightAnnotation(x, y, width, height, options = {}) {
  return {
    type: "highlight",
    x,
    y,
    width,
    height,
    color: options.color ?? DEFAULT_HIGHLIGHT_COLOR,
    opacity: options.opacity ?? DEFAULT_HIGHLIGHT_OPACITY,
  };
}

// Create an image annotation with defaults
export function createImageAnnotation(x, y, width, height, options = {}) {
  return {
    type: "image",
    x,
    y,
    width,
    height,
    assetId: options.assetId || null,
    opacity: options.opacity ?? DEFAULT_IMAGE_OPACITY,
  };
}

// Get annotation defaults from store state (pure function)
// Returns options for "highlight" or "text" type
export function annotationDefaultsFromState(state, type) {
  if (type === "highlight") {
    return {
      color: state.annotateHighlightColor ?? DEFAULT_HIGHLIGHT_COLOR,
      opacity: state.annotateHighlightOpacity ?? DEFAULT_HIGHLIGHT_OPACITY,
    };
  }
  if (type === "text") {
    return {
      fontSize: state.annotateFontSize ?? DEFAULT_TEXT_FONT_SIZE,
      color: state.annotateTextColor ?? DEFAULT_TEXT_COLOR,
    };
  }
  return {};
}

// Control values for the annotate panel. When an annotation is selected its own
// values are shown; otherwise the store defaults (for new annotations) apply.
// Pure.
export function panelControlValues(state, selectedAnnotation) {
  const fontSize = selectedAnnotation?.type === "text"
    ? selectedAnnotation.fontSize ?? state.annotateFontSize ?? DEFAULT_TEXT_FONT_SIZE
    : state.annotateFontSize ?? DEFAULT_TEXT_FONT_SIZE;
  const textColor = selectedAnnotation?.type === "text"
    ? selectedAnnotation.color ?? state.annotateTextColor ?? DEFAULT_TEXT_COLOR
    : state.annotateTextColor ?? DEFAULT_TEXT_COLOR;
  const highlightColor = selectedAnnotation?.type === "highlight"
    ? selectedAnnotation.color ?? state.annotateHighlightColor ?? DEFAULT_HIGHLIGHT_COLOR
    : state.annotateHighlightColor ?? DEFAULT_HIGHLIGHT_COLOR;
  const opacity = selectedAnnotation?.type === "image"
    ? selectedAnnotation.opacity ?? state.annotateImageOpacity ?? DEFAULT_IMAGE_OPACITY
    : selectedAnnotation?.type === "highlight"
      ? selectedAnnotation.opacity ?? state.annotateHighlightOpacity ?? DEFAULT_HIGHLIGHT_OPACITY
      : state.annotateHighlightOpacity ?? DEFAULT_HIGHLIGHT_OPACITY;
  return { fontSize, textColor, highlightColor, opacity };
}


// Serialize for undo history (tracked in store)
export function toJSON(annotations) {
  const result = {};
  for (const [pageId, anns] of Object.entries(annotations)) {
    result[pageId] = anns.map((a) => ({ ...a }));
  }
  return result;
}

// Restore from undo history
export function fromJSON(data) {
  const annotations = {};
  if (data && typeof data === "object") {
    for (const [pageId, anns] of Object.entries(data)) {
      if (Array.isArray(anns)) {
        annotations[pageId] = anns.map((a) => ({ ...a }));
      }
    }
  }
  // Update ID counter to avoid collisions
  let maxId = 0;
  for (const anns of Object.values(annotations)) {
    for (const a of anns) {
      const num = parseInt(String(a.id).slice(1), 10);
      if (!isNaN(num) && num > maxId) maxId = num;
    }
  }
  annotationIdCounter = maxId + 1;
  return annotations;
}

export function clear() {
  resetAnnotationIdCounter();
  return {};
}