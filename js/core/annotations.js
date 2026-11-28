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
export const DEFAULT_HIGHLIGHT_OPACITY = 0.7;
export const DEFAULT_IMAGE_OPACITY = 1;

// Markup styles: "highlight" | "underline" | "strikethrough"
// Highlight reuses the existing highlight color/opacity store keys; underline
// and strikethrough keep their own per-style color memory.
export const DEFAULT_MARKUP_STYLE = "highlight";
export const MARKUP_STYLES = ["highlight", "underline", "strikethrough"];
export const MARKUP_THICKNESS_MIN = 0.5;
export const MARKUP_THICKNESS_MAX = 8;
export const DEFAULT_MARKUP_THICKNESS = 1.5;
export const DEFAULT_MARKUP_UNDERLINE_COLOR = "#d92d20";
export const DEFAULT_MARKUP_UNDERLINE_OPACITY = 1;
export const DEFAULT_MARKUP_UNDERLINE_THICKNESS = 1.5;
export const DEFAULT_MARKUP_STRIKETHROUGH_COLOR = "#d92d20";
export const DEFAULT_MARKUP_STRIKETHROUGH_OPACITY = 1;
export const DEFAULT_MARKUP_STRIKETHROUGH_THICKNESS = 1.5;

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
  const style = options.style ?? DEFAULT_MARKUP_STYLE;
  const ann = {
    type: "highlight",
    x,
    y,
    width,
    height,
    style,
    dir: options.dir ?? 0,
    color: options.color ?? markupColorForStyle(style),
    opacity: options.opacity ?? markupOpacityForStyle(style),
  };
  if (style !== "highlight") {
    ann.thickness = options.thickness ?? DEFAULT_MARKUP_THICKNESS;
  }
  return ann;
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

// Style-only default color / opacity for a markup style (no store involved).
function markupColorForStyle(style) {
  switch (style) {
    case "underline": return DEFAULT_MARKUP_UNDERLINE_COLOR;
    case "strikethrough": return DEFAULT_MARKUP_STRIKETHROUGH_COLOR;
    default: return DEFAULT_HIGHLIGHT_COLOR;
  }
}
function markupOpacityForStyle(style) {
  switch (style) {
    case "underline": return DEFAULT_MARKUP_UNDERLINE_OPACITY;
    case "strikethrough": return DEFAULT_MARKUP_STRIKETHROUGH_OPACITY;
    default: return DEFAULT_HIGHLIGHT_OPACITY;
  }
}

// Store-aware default color / opacity / thickness for a markup style.
export function markupColorFromState(state, style) {
  switch (style) {
    case "underline": return state.annotateMarkupUnderlineColor ?? DEFAULT_MARKUP_UNDERLINE_COLOR;
    case "strikethrough": return state.annotateMarkupStrikethroughColor ?? DEFAULT_MARKUP_STRIKETHROUGH_COLOR;
    default: return state.annotateHighlightColor ?? DEFAULT_HIGHLIGHT_COLOR;
  }
}
export function markupOpacityFromState(state, style) {
  switch (style) {
    case "underline": return state.annotateMarkupUnderlineOpacity ?? DEFAULT_MARKUP_UNDERLINE_OPACITY;
    case "strikethrough": return state.annotateMarkupStrikethroughOpacity ?? DEFAULT_MARKUP_STRIKETHROUGH_OPACITY;
    default: return state.annotateHighlightOpacity ?? DEFAULT_HIGHLIGHT_OPACITY;
  }
}
export function markupThicknessFromState(state, style) {
  if (style === "highlight") return undefined;
  switch (style) {
    case "underline": return state.annotateMarkupUnderlineThickness ?? DEFAULT_MARKUP_UNDERLINE_THICKNESS;
    case "strikethrough": return state.annotateMarkupStrikethroughThickness ?? DEFAULT_MARKUP_STRIKETHROUGH_THICKNESS;
    default: return DEFAULT_MARKUP_THICKNESS;
  }
}

// (right, down) unit vectors for each dir, in page space (PDF points, origin
// bottom-left, y up).
//   right: direction the mark's length runs (visual rightward / baseline axis).
//   down : direction toward the visual bottom edge (the text-bottom side).
// The band sits at the text-bottom edge: its fraction line is f of the box
// extent above visual bottom (anti-down direction), and its thickness runs
// inward from there toward visual bottom (underline) or is centered there
// (strikethrough). The band spans the full box extent along the right axis.
const MARKUP_DIR_VECTORS = {
  0:   { right: { x: 1, y: 0 }, down: { x: 0, y: -1 } },
  90:  { right: { x: 0, y: 1 }, down: { x: 1, y: 0 } },
  180: { right: { x: -1, y: 0 }, down: { x: 0, y: 1 } },
  270: { right: { x: 0, y: -1 }, down: { x: -1, y: 0 } },
};

// Page-space rect to draw for a markup annotation.
// - highlight: the box itself.
// - underline: a band of `thickness` at the text-bottom edge: its top edge is
//   11% of the box extent above visual bottom, thickness runs toward visual
//   bottom, spanning full length along dir.
// - strikethrough: a band of `thickness` centered at 45% of the box extent,
//   spanning full length along dir.
// All coordinates are unrotated page space (PDF points, origin bottom-left, y up).
export function markupLineRect(ann) {
  const style = ann.style || DEFAULT_MARKUP_STYLE;
  if (style === "highlight") {
    return { x: ann.x || 0, y: ann.y || 0, width: ann.width || 0, height: ann.height || 0 };
  }
  const dir = ((ann.dir || 0) % 360 + 360) % 360;
  const vec = MARKUP_DIR_VECTORS[dir];
  if (!vec) {
    return { x: ann.x || 0, y: ann.y || 0, width: ann.width || 0, height: ann.height || 0 };
  }
  const thickness = Math.max(MARKUP_THICKNESS_MIN, Math.min(MARKUP_THICKNESS_MAX, ann.thickness ?? DEFAULT_MARKUP_THICKNESS));
  const fraction = style === "underline" ? 0.11 : 0.45;

  const x0 = ann.x || 0;
  const y0 = ann.y || 0;
  const x1 = x0 + (ann.width || 0);
  const y1 = y0 + (ann.height || 0);

  // Thickness axis is the down axis; length axis is the right axis.
  const thickAxis = Math.abs(vec.down.x) ? "x" : "y";
  const thickSign = vec.down[thickAxis]; // +1 or -1
  const lenAxis = thickAxis === "x" ? "y" : "x";

  const lenMin = lenAxis === "x" ? x0 : y0;
  const lenMax = lenAxis === "x" ? x1 : y1;
  const thickMin = thickAxis === "x" ? x0 : y0;
  const thickMax = thickAxis === "x" ? x1 : y1;
  const thickExtent = thickMax - thickMin;

  // Visual bottom (text-bottom side) on the thickness axis = end in the down direction.
  const thickBottom = thickSign === 1 ? thickMax : thickMin;

  // Fraction line measured from visual bottom going anti-down (opposite of down).
  const fractionLine = thickBottom - fraction * thickExtent * thickSign;

  let thickOrigin;
  if (style === "strikethrough") {
    thickOrigin = fractionLine - thickness / 2;
  } else {
    // Underline: band runs from the fraction line toward visual bottom (down direction).
    thickOrigin = thickSign === 1 ? fractionLine : fractionLine - thickness;
  }

  let x, y, width, height;
  if (lenAxis === "x") {
    x = lenMin;
    width = lenMax - lenMin;
    y = thickOrigin;
    height = thickness;
  } else {
    x = thickOrigin;
    width = thickness;
    y = lenMin;
    height = lenMax - lenMin;
  }
  return { x, y, width, height };
}

// Get annotation defaults from store state (pure function)
// Returns options for "highlight" or "text" type
export function annotationDefaultsFromState(state, type, style) {
  if (type === "highlight") {
    const markupStyle = style ?? state.annotateMarkupStyle ?? DEFAULT_MARKUP_STYLE;
    return {
      style: markupStyle,
      color: markupColorFromState(state, markupStyle),
      opacity: markupOpacityFromState(state, markupStyle),
      thickness: markupThicknessFromState(state, markupStyle),
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
    ? selectedAnnotation.color ?? markupColorFromState(state, state.annotateMarkupStyle ?? DEFAULT_MARKUP_STYLE)
    : markupColorFromState(state, state.annotateMarkupStyle ?? DEFAULT_MARKUP_STYLE);
  const opacity = selectedAnnotation?.type === "image"
    ? selectedAnnotation.opacity ?? state.annotateImageOpacity ?? DEFAULT_IMAGE_OPACITY
    : selectedAnnotation?.type === "highlight"
      ? selectedAnnotation.opacity ?? markupOpacityFromState(state, state.annotateMarkupStyle ?? DEFAULT_MARKUP_STYLE)
      : markupOpacityFromState(state, state.annotateMarkupStyle ?? DEFAULT_MARKUP_STYLE);
  const markupStyle = selectedAnnotation?.type === "highlight"
    ? selectedAnnotation.style ?? state.annotateMarkupStyle ?? DEFAULT_MARKUP_STYLE
    : state.annotateMarkupStyle ?? DEFAULT_MARKUP_STYLE;
  const markupThickness = selectedAnnotation?.type === "highlight" && selectedAnnotation.style !== "highlight"
    ? selectedAnnotation.thickness ?? markupThicknessFromState(state, markupStyle)
    : markupThicknessFromState(state, markupStyle);
  return { fontSize, textColor, highlightColor, opacity, markupStyle, markupThickness };
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