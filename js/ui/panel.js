// Right-hand editor panel: document info, export options, export controls,
// live privacy counter, the source-file list and keyboard shortcuts. All
// mutations go through callbacks.
import { formatBytes } from "../file-manager.js";
import { subscribe as subscribeMeter } from "../core/privacy-meter.js";
import { hydrateIcons } from "../icons.js";
import { validateWatermark } from "../core/overlay.js";
import { initDisclosures } from "../core/disclosure.js";
import {
  getAnnotationCount,
  getPageAnnotations,
  createTextAnnotation,
  createHighlightAnnotation,
  createImageAnnotation,
  addAnnotation,
  updateAnnotation,
  deleteAnnotation,
  DEFAULT_HIGHLIGHT_COLOR,
  DEFAULT_HIGHLIGHT_OPACITY,
  panelControlValues,
  MARKUP_STYLES,
  DEFAULT_MARKUP_STYLE,
  DEFAULT_MARKUP_THICKNESS,
  MARKUP_THICKNESS_MIN,
  MARKUP_THICKNESS_MAX,
  markupColorFromState,
  markupOpacityFromState,
  markupThicknessFromState,
} from "../core/annotations.js";
import { getAsset, registerAsset } from "../core/image-assets.js";

export function mountPanel(root, opts = {}) {
  const {
    onFileNameChange,
    onExportModeChange,
    onDownloadPDF,
    onSplitPDF,
    onPreview,
    onExportOptionsChange,
    onSourceRemove,
    getState,
    updateAnnotations,
    store,
    onAnnotationSelect,
  } = opts;

  const docName = root.querySelector("#doc-name");
  const statPages = root.querySelector("#stat-pages");
  const statSource = root.querySelector("#stat-source");
  const statSize = root.querySelector("#stat-size");
  const sourceList = root.querySelector("#source-files");
  const exportAll = root.querySelector("#export-all");
  const exportSelected = root.querySelector("#export-selected");
  const downloadPdf = root.querySelector("#download-pdf");
  const privacyCount = root.querySelector("#privacy-count");
  const previewBtn = root.querySelector("#btn-preview");
  const splitBtn = root.querySelector("#btn-split");

  // Options controls.
  const pageNumberMode = root.querySelector("#page-number-mode");
  const pageNumberFormat = root.querySelector("#page-number-format");
  const pageNumberSkipFirst = root.querySelector("#page-number-skip-first");
  const watermarkText = root.querySelector("#watermark-text");
  const watermarkError = root.querySelector("#watermark-error");
  const watermarkAngle = root.querySelector("#watermark-angle");
  const watermarkOpacity = root.querySelector("#watermark-opacity");
  const metaTitle = root.querySelector("#meta-title");
  const metaAuthor = root.querySelector("#meta-author");
  const splitMode = root.querySelector("#split-mode");
  const splitEvery = root.querySelector("#split-every");
  const splitRanges = root.querySelector("#split-ranges");

  // New controls (may not exist in older HTML — guard with optional chaining).
  const pageNumberPosition = root.querySelector("#page-number-position");
  const pageNumberStart = root.querySelector("#page-number-start");
  const pageNumberFontSize = root.querySelector("#page-number-font-size");
  const pageNumberMargin = root.querySelector("#page-number-margin");
  const pageNumberApplyTo = root.querySelector("#page-number-apply-to");
  const watermarkEnabled = root.querySelector("#watermark-enabled");
  const watermarkSizeMode = root.querySelector("#watermark-size-mode");
  const watermarkFixedSize = root.querySelector("#watermark-fixed-size");
  const metaSubject = root.querySelector("#meta-subject");
  const metaKeywords = root.querySelector("#meta-keywords");
  const metaClear = root.querySelector("#meta-clear");
  const splitSummary = root.querySelector("#split-summary");
  const splitRangesError = root.querySelector("#split-ranges-error");

  // Annotate panel controls
  const annotatePanelSection = root.querySelector("#annotate-panel-section");
  const annotateAriaLive = root.querySelector("#annotate-aria-live");
  const annotateMarkupStyleGroup = root.querySelector("#annotate-markup-style");
  const annotateMarkupColors = root.querySelector("#annotate-markup-colors");
  const annotateMarkupSegments = () => root.querySelectorAll(".annotate-markup-segment");
  const annotateMarkupColorSwatches = () => root.querySelectorAll("#annotate-markup-colors .ds-color-swatch");
  const annotateThicknessField = root.querySelector("#annotate-thickness-field");
  const annotateThickness = root.querySelector("#annotate-thickness");
  const annotateOpacityField = root.querySelector("#annotate-opacity-field");
  const annotateOpacity = root.querySelector("#annotate-opacity");
  const annotateDeleteBtn = root.querySelector("#annotate-panel-delete");
  const annotateAnnotationList = root.querySelector("#annotate-annotation-list");

  // Group wrappers — exactly one visible at a time
  const annotateGroupMarkup = root.querySelector("#annotate-group-markup");
  const annotateGroupText = root.querySelector("#annotate-group-text");
  const annotateGroupImage = root.querySelector("#annotate-image-options");
  const annotateEmpty = root.querySelector("#annotate-empty");
  const annotateTextControls = root.querySelector("#annotate-text-controls");

  // Image annotation options (inside the image group)
  const annotateImageOpacity = root.querySelector("#annotate-image-opacity");
  const annotateImageKeepProportions = root.querySelector("#annotate-image-keep-proportions");
  const annotateImageChoose = root.querySelector("#annotate-image-choose");
  const annotateImageReplace = root.querySelector("#annotate-image-replace");
  const annotateImageDelete = root.querySelector("#annotate-image-delete");

  // Collapsible annotation list state (persists across re-renders)
  let annotationListExpanded = false;

  // Text annotation controls (font size + text color). editor.html intentionally
  // does not hardcode #annotate-font-size (css-classes static guard), so we
  // create the controls here when absent and reuse them when present.
  const TEXT_SIZES = [8, 10, 12, 14, 16, 18, 24, 36, 48, 72];
  const TEXT_COLORS = [
    "#000000", "#ffffff", "#ff0000", "#0066ff", "#00aa00", "#ff8800", "#aa00aa", "#00aaaa",
  ];

  // Markup color dots (five dots, new order). Hardcoded in editor.html; created
  // here when the container is empty (e.g. smoke-test fake DOM).
  const MARKUP_COLORS = ["#d92d20", "#0f0f12", "#0d44e8", "#ffe14d", "#6bbf6b"];
  const MARKUP_COLOR_NAMES = {
    "#d92d20": "Red",
    "#0f0f12": "Black",
    "#0d44e8": "Blue",
    "#ffe14d": "Yellow",
    "#6bbf6b": "Green",
  };

  function segmentIconName(style) {
    return style === "highlight" ? "highlighter" : style === "underline" ? "underline" : "strikethrough";
  }

  // Ensure the markup style segments exist. panel.js creates them when the
  // container is empty; editor.html hardcodes them. Returns the segment buttons.
  function ensureMarkupSegments() {
    if (!annotateMarkupStyleGroup) return [];
    const existing = annotateMarkupSegments();
    if (existing.length) return existing;
    MARKUP_STYLES.forEach((style) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `ds-segment annotate-markup-segment`;
      btn.dataset.style = style;
      btn.setAttribute("role", "radio");
      btn.setAttribute("aria-checked", style === DEFAULT_MARKUP_STYLE ? "true" : "false");
      btn.setAttribute("aria-label", style.charAt(0).toUpperCase() + style.slice(1));
      const icon = document.createElement("i");
      icon.setAttribute("data-icon", segmentIconName(style));
      btn.appendChild(icon);
      annotateMarkupStyleGroup.appendChild(btn);
    });
    return annotateMarkupSegments();
  }

  // Ensure the markup color dots exist (see ensureMarkupSegments).
  function ensureMarkupColorSwatches() {
    if (!annotateMarkupColors) return [];
    const existing = annotateMarkupColorSwatches();
    if (existing.length) return existing;
    MARKUP_COLORS.forEach((color) => {
      const swatch = document.createElement("button");
      swatch.type = "button";
      swatch.className = "ds-color-swatch annotate-color-dot";
      swatch.dataset.color = color;
      swatch.setAttribute("aria-checked", "false");
      swatch.setAttribute("aria-label", `${MARKUP_COLOR_NAMES[color]} color`);
      swatch.setAttribute("title", MARKUP_COLOR_NAMES[color]);
      swatch.style.backgroundColor = color;
      swatch.style.borderColor = "var(--color-border-input)";
      annotateMarkupColors.appendChild(swatch);
    });
    return annotateMarkupColorSwatches();
  }

  function createFontSizeField() {
    const field = document.createElement("div");
    field.className = "ds-form-field annotate-font-size-field";
    field.id = "annotate-font-size-field";
    const label = document.createElement("label");
    label.className = "ds-field-label ds-sr-only";
    label.textContent = "Size";
    label.setAttribute("for", "annotate-font-size");
    const select = document.createElement("select");
    select.id = "annotate-font-size";
    select.className = "ds-input";
    for (const size of TEXT_SIZES) {
      const o = document.createElement("option");
      o.value = String(size);
      o.textContent = String(size);
      select.appendChild(o);
    }
    field.appendChild(label);
    field.appendChild(select);
    return field;
  }

  function createTextColorField() {
    const field = document.createElement("div");
    field.className = "ds-form-field annotate-text-color-field";
    field.id = "annotate-text-color-field";
    const label = document.createElement("label");
    label.className = "ds-field-label ds-sr-only";
    label.textContent = "Color";
    label.setAttribute("for", "annotate-text-colors");
    const group = document.createElement("div");
    group.className = "ds-color-swatch-group annotate-text-colors";
    group.id = "annotate-text-colors";
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", "Text color");
    for (const color of TEXT_COLORS) {
      const swatch = document.createElement("button");
      swatch.type = "button";
      swatch.className = "ds-color-swatch";
      swatch.dataset.color = color;
      swatch.setAttribute("aria-checked", "false");
      group.appendChild(swatch);
    }
    field.appendChild(label);
    field.appendChild(group);
    return field;
  }

  // Text controls live inside the text group; fall back to the panel section
  // when the text-controls container is absent (older markup).
  const textControlsTarget = annotateTextControls || annotatePanelSection;
  if (!root.querySelector("#annotate-font-size")) textControlsTarget.appendChild(createFontSizeField());
  if (!root.querySelector("#annotate-text-colors")) textControlsTarget.appendChild(createTextColorField());

  const annotateFontSize = root.querySelector("#annotate-font-size");
  const annotateTextColorGroup = root.querySelector("#annotate-text-colors");

  const watermarkColorSwatches = () => root.querySelectorAll('[name="watermark-color"]');

  const unsubscribe = subscribeMeter((n) => {
    privacyCount.textContent = n;
  });

  // Annotate panel event listeners

  // Markup style segmented radiogroup (icon-only)
  if (annotateMarkupStyleGroup) {
    const applyStyle = (style) => {
      const state = getState?.();
      // If a mark is selected, restyle it in place: keep its other attributes,
      // clamp thickness to the new style's range, a single undo entry, then
      // re-render. Otherwise set the active style for new marks.
      if (state && state.annotateSelectedAnnotationId && state.annotateSelectedPageId) {
        const ann = getPageAnnotations(state.annotations, state.annotateSelectedPageId).find(
          (a) => a.id === state.annotateSelectedAnnotationId,
        );
        if (ann) {
          const thickness =
            style === "highlight"
              ? undefined
              : Math.max(
                  MARKUP_THICKNESS_MIN,
                  Math.min(MARKUP_THICKNESS_MAX, Number(ann.thickness ?? DEFAULT_MARKUP_THICKNESS)),
                );
          updateAnnotations((anns) =>
            updateAnnotation(anns, state.annotateSelectedPageId, state.annotateSelectedAnnotationId, {
              style,
              thickness,
            }),
          );
        }
      } else {
        store?.patch({ annotateMarkupStyle: style });
      }
    };
    // Ensure segments exist (created here when the container is empty), then
    // attach direct listeners (the fake DOM used by tests does not bubble).
    ensureMarkupSegments().forEach((btn) => {
      btn.addEventListener("click", () => {
        annotateMarkupSegments().forEach((b) => b.setAttribute("aria-checked", String(b === btn)));
        applyStyle(btn.dataset.style);
      });
      btn.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          annotateMarkupSegments().forEach((b) => b.setAttribute("aria-checked", String(b === btn)));
          applyStyle(btn.dataset.style);
        }
      });
    });
  }

  // Markup color swatches — write to the per-style store key for the current style
  ensureMarkupColorSwatches().forEach((swatch) => {
    swatch.addEventListener("click", () => {
      annotateMarkupColorSwatches().forEach((s) => s.setAttribute("aria-checked", "false"));
      swatch.setAttribute("aria-checked", "true");
      const color = swatch.dataset.color;
      const state = getState?.();
      const style = state?.annotateMarkupStyle ?? DEFAULT_MARKUP_STYLE;
      const key = style === "underline" ? "annotateMarkupUnderlineColor"
        : style === "strikethrough" ? "annotateMarkupStrikethroughColor"
        : "annotateHighlightColor";
      store?.patch({ [key]: color });
      // Update selected annotation if any
      if (state && state.annotateSelectedAnnotationId && state.annotateSelectedPageId) {
        updateAnnotations((anns) => updateAnnotation(anns, state.annotateSelectedPageId, state.annotateSelectedAnnotationId, { color }));
      }
    });
  });

  // Thickness slider (only meaningful for underline/strikethrough)
  if (annotateThickness) {
    annotateThickness.addEventListener("input", () => {
      const state = getState?.();
      const style = state?.annotateMarkupStyle ?? DEFAULT_MARKUP_STYLE;
      if (style === "highlight") return;
      const thickness = Number(annotateThickness.value);
      const key = style === "underline" ? "annotateMarkupUnderlineThickness" : "annotateMarkupStrikethroughThickness";
      store?.patch({ [key]: thickness });
      if (state && state.annotateSelectedAnnotationId && state.annotateSelectedPageId) {
        updateAnnotations((anns) => updateAnnotation(anns, state.annotateSelectedPageId, state.annotateSelectedAnnotationId, { thickness }));
      }
    });
  }

  if (annotateOpacity) {
    annotateOpacity.addEventListener("input", () => {
      const opacity = Number(annotateOpacity.value) / 100;
      // Update store setting for new annotations
      store?.patch({ annotateHighlightOpacity: opacity });
      // Update selected annotation if any
      const state = getState?.();
      if (state && state.annotateSelectedAnnotationId && state.annotateSelectedPageId) {
        updateAnnotations((anns) => updateAnnotation(anns, state.annotateSelectedPageId, state.annotateSelectedAnnotationId, { opacity }));
      }
    });
  }

  // Font size: one undo per change. Edits the selected text annotation when a
  // text mark is selected, otherwise sets the store default for new text marks.
  if (annotateFontSize) {
    annotateFontSize.addEventListener("change", () => {
      const size = Number(annotateFontSize.value);
      const state = getState?.();
      if (
        state &&
        state.annotateSelectedAnnotationId &&
        state.annotateSelectedPageId
      ) {
        const sel = getPageAnnotations(state.annotations || {}, state.annotateSelectedPageId).find(
          (a) => a.id === state.annotateSelectedAnnotationId,
        );
        if (sel && sel.type === "text") {
          updateAnnotations((anns) =>
            updateAnnotation(anns, state.annotateSelectedPageId, state.annotateSelectedAnnotationId, {
              fontSize: size,
            }),
          );
          return;
        }
      }
      store?.patch({ annotateFontSize: size });
    });
  }

  // Text color dots: one undo per change. Edits the selected text annotation or
  // sets the store default for new text marks.
  if (annotateTextColorGroup) {
    const setTextColor = (color) => {
      const state = getState?.();
      if (state && state.annotateSelectedAnnotationId && state.annotateSelectedPageId) {
        const sel = getPageAnnotations(state.annotations || {}, state.annotateSelectedPageId).find(
          (a) => a.id === state.annotateSelectedAnnotationId,
        );
        if (sel && sel.type === "text") {
          updateAnnotations((anns) =>
            updateAnnotation(anns, state.annotateSelectedPageId, state.annotateSelectedAnnotationId, {
              color,
            }),
          );
          return;
        }
      }
      store?.patch({ annotateTextColor: color });
    };
    annotateTextColorGroup.querySelectorAll(".ds-color-swatch").forEach((swatch) => {
      swatch.addEventListener("click", () => {
        annotateTextColorGroup.querySelectorAll(".ds-color-swatch").forEach((s) =>
          s.setAttribute("aria-checked", String(s === swatch)),
        );
        setTextColor(swatch.dataset.color);
      });
    });
  }

  if (annotateDeleteBtn) {
    annotateDeleteBtn.addEventListener("click", () => {
      const state = getState?.();
      if (state && state.annotateSelectedAnnotationId && state.annotateSelectedPageId) {
        updateAnnotations((anns) => deleteAnnotation(anns, state.annotateSelectedPageId, state.annotateSelectedAnnotationId));
      }
    });
  }

  // Open a file picker limited to images and return the selected File (or null).
  function pickImageFile() {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp";
      input.style.display = "none";
      document.body.appendChild(input);
      input.onchange = () => resolve(input.files?.[0] ?? null);
      input.oncancel = () => resolve(null);
      input.click();
      document.body.removeChild(input);
    });
  }

  if (annotateImageOpacity) {
    annotateImageOpacity.addEventListener("input", () => {
      const opacity = Number(annotateImageOpacity.value) / 100;
      store?.patch({ annotateImageOpacity: opacity });
      const state = getState?.();
      if (state && state.annotateSelectedAnnotationId && state.annotateSelectedPageId) {
        updateAnnotations((anns) =>
          updateAnnotation(anns, state.annotateSelectedPageId, state.annotateSelectedAnnotationId, { opacity })
        );
      }
    });
  }

  if (annotateImageKeepProportions) {
    annotateImageKeepProportions.addEventListener("change", () => {
      store?.patch({ annotateImageKeepProportions: annotateImageKeepProportions.checked });
    });
  }

  if (annotateImageChoose) {
    annotateImageChoose.addEventListener("click", async () => {
      const state = getState?.();
      if (!state) return;
      const pageId = state.annotateCurrentPageId;
      if (!pageId) return;
      const file = await pickImageFile();
      if (!file) return;
      try {
        const { assetId, width, height } = await registerAsset(file);
        const maxW = 300;
        const scale = Math.min(1, maxW / width);
        const ann = createImageAnnotation(100, 100, width * scale, height * scale, { assetId });
        updateAnnotations((anns) => addAnnotation(anns, pageId, ann));
      } catch (err) {
        console.warn("Failed to insert image:", err);
      }
    });
  }

  if (annotateImageReplace) {
    annotateImageReplace.addEventListener("click", async () => {
      const state = getState?.();
      if (!state || !state.annotateSelectedAnnotationId || !state.annotateSelectedPageId) return;
      const file = await pickImageFile();
      if (!file) return;
      try {
        const { assetId } = await registerAsset(file);
        updateAnnotations((anns) =>
          updateAnnotation(anns, state.annotateSelectedPageId, state.annotateSelectedAnnotationId, { assetId })
        );
      } catch (err) {
        console.warn("Failed to replace image:", err);
      }
    });
  }

  if (annotateImageDelete) {
    annotateImageDelete.addEventListener("click", () => {
      const state = getState?.();
      if (state && state.annotateSelectedAnnotationId && state.annotateSelectedPageId) {
        updateAnnotations((anns) => deleteAnnotation(anns, state.annotateSelectedPageId, state.annotateSelectedAnnotationId));
      }
    });
  }

  let editingName = false;

  // Initialize disclosure groups once the panel is in the DOM.
  initDisclosures(root);

  docName.addEventListener("focus", () => {
    editingName = true;
  });
  docName.addEventListener("blur", () => {
    editingName = false;
    const value = docName.value.trim();
    if (value && onFileNameChange) onFileNameChange(value);
  });

  exportAll.addEventListener("click", () => {
    if (onExportModeChange) onExportModeChange("all");
  });
  exportSelected.addEventListener("click", () => {
    if (onExportModeChange) onExportModeChange("selected");
  });
  downloadPdf.addEventListener("click", () => {
    if (onDownloadPDF) onDownloadPDF();
  });
  previewBtn.addEventListener("click", () => {
    if (onPreview) onPreview();
  });
  splitBtn.addEventListener("click", () => {
    if (onSplitPDF) onSplitPDF();
  });

  // ---------- Options ----------

  // One level of nesting: { pageNumbers: {...}, watermark: {...}, ... }.
  function patch(partial) {
    if (!onExportOptionsChange) return;
    const current = readOptions();
    const next = { ...current };
    for (const [key, value] of Object.entries(partial)) {
      next[key] = { ...current[key], ...value };
    }
    onExportOptionsChange(next);
  }

  function readOptions() {
    const wColor = [...watermarkColorSwatches()].find((s) => s.getAttribute("aria-checked") === "true")?.dataset.color ?? "gray";
    return {
      pageNumbers: {
        mode: pageNumberMode?.value ?? "none",
        format: pageNumberFormat?.value ?? "n",
        position: pageNumberPosition?.value ?? "bottom-center",
        start: Number(pageNumberStart?.value ?? 1),
        fontSize: Number(pageNumberFontSize?.value ?? 10),
        margin: Number(pageNumberMargin?.value ?? 36),
        applyTo: pageNumberApplyTo?.value ?? "all",
        skipFirst: pageNumberSkipFirst?.getAttribute("aria-checked") === "true",
      },
      watermark: {
        enabled: watermarkEnabled?.getAttribute("aria-checked") === "true",
        text: watermarkText?.value ?? "",
        color: wColor,
        angle: Number(watermarkAngle?.value ?? 0),
        opacity: Number(watermarkOpacity?.value ?? 30),
        sizeMode: watermarkSizeMode?.value ?? "auto",
        fixedSize: Number(watermarkFixedSize?.value ?? 72),
        applyTo: "all", // TODO: add UI for watermark apply-to if needed
      },
      metadata: {
        title: metaTitle?.value ?? "",
        author: metaAuthor?.value ?? "",
        subject: metaSubject?.value ?? "",
        keywords: metaKeywords?.value ?? "",
      },
      split: {
        mode: splitMode?.value ?? "every",
        every: splitEvery?.value ?? "1",
        ranges: splitRanges?.value ?? "",
      },
    };
  }

  function setIfNotFocused(element, value) {
    if (element && document.activeElement !== element) element.value = value;
  }

  function toggleSwitch(button) {
    if (!button) return;
    const checked = button.getAttribute("aria-checked") === "true";
    button.setAttribute("aria-checked", String(!checked));
    patch({ pageNumbers: { skipFirst: !checked } });
  }

  pageNumberMode?.addEventListener("change", () => {
    patch({ pageNumbers: { mode: pageNumberMode.value } });
  });
  pageNumberFormat?.addEventListener("change", () => {
    patch({ pageNumbers: { format: pageNumberFormat.value } });
  });
  pageNumberPosition?.addEventListener("change", () => {
    patch({ pageNumbers: { position: pageNumberPosition.value } });
  });
  pageNumberStart?.addEventListener("change", () => {
    patch({ pageNumbers: { start: Number(pageNumberStart.value) } });
  });
  pageNumberFontSize?.addEventListener("change", () => {
    patch({ pageNumbers: { fontSize: Number(pageNumberFontSize.value) } });
  });
  pageNumberMargin?.addEventListener("change", () => {
    patch({ pageNumbers: { margin: Number(pageNumberMargin.value) } });
  });
  pageNumberApplyTo?.addEventListener("change", () => {
    patch({ pageNumbers: { applyTo: pageNumberApplyTo.value } });
  });
  pageNumberSkipFirst?.addEventListener("click", () => toggleSwitch(pageNumberSkipFirst));
  pageNumberSkipFirst?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggleSwitch(pageNumberSkipFirst);
    }
  });

  watermarkEnabled?.addEventListener("click", () => {
    const checked = watermarkEnabled.getAttribute("aria-checked") === "true";
    watermarkEnabled.setAttribute("aria-checked", String(!checked));
    patch({ watermark: { enabled: !checked } });
  });
  watermarkEnabled?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const checked = watermarkEnabled.getAttribute("aria-checked") === "true";
      watermarkEnabled.setAttribute("aria-checked", String(!checked));
      patch({ watermark: { enabled: !checked } });
    }
  });

  watermarkColorSwatches().forEach((swatch) => {
    swatch.addEventListener("click", () => {
      watermarkColorSwatches().forEach((s) => {
        s.setAttribute("aria-checked", String(s === swatch));
      });
      patch({ watermark: { color: swatch.dataset.color } });
    });
  });

  watermarkText?.addEventListener("input", () => {
    patch({ watermark: { text: watermarkText.value } });
    const invalid = validateWatermark(watermarkText.value);
    if (watermarkError) {
      watermarkError.hidden = !invalid;
      if (invalid) watermarkError.textContent = invalid;
      watermarkText.toggleAttribute("aria-invalid", !!invalid);
    }
  });

  watermarkAngle?.addEventListener("change", () => {
    patch({ watermark: { angle: Number(watermarkAngle.value) } });
  });
  watermarkOpacity?.addEventListener("input", () => {
    patch({ watermark: { opacity: Number(watermarkOpacity.value) } });
  });
  watermarkSizeMode?.addEventListener("change", () => {
    patch({ watermark: { sizeMode: watermarkSizeMode.value } });
    updateWatermarkSizeDisable();
  });
  watermarkFixedSize?.addEventListener("change", () => {
    patch({ watermark: { fixedSize: Number(watermarkFixedSize.value) } });
  });

  metaTitle?.addEventListener("input", () => {
    patch({ metadata: { title: metaTitle.value } });
  });
  metaAuthor?.addEventListener("input", () => {
    patch({ metadata: { author: metaAuthor.value } });
  });
  metaSubject?.addEventListener("input", () => {
    patch({ metadata: { subject: metaSubject.value } });
  });
  metaKeywords?.addEventListener("input", () => {
    patch({ metadata: { keywords: metaKeywords.value } });
  });
  metaClear?.addEventListener("click", () => {
    if (metaTitle) metaTitle.value = "";
    if (metaAuthor) metaAuthor.value = "";
    if (metaSubject) metaSubject.value = "";
    if (metaKeywords) metaKeywords.value = "";
    patch({ metadata: { title: "", author: "", subject: "", keywords: "" } });
  });

  splitMode?.addEventListener("change", () => {
    patch({ split: { mode: splitMode.value } });
    updateSplitDisable();
    updateSplitSummary();
  });
  splitEvery?.addEventListener("input", () => {
    patch({ split: { every: splitEvery.value } });
    updateSplitSummary();
  });
  splitRanges?.addEventListener("input", () => {
    patch({ split: { ranges: splitRanges.value } });
    updateSplitSummary();
    validateSplitRangesInline();
  });

  function updateWatermarkSizeDisable() {
    if (!watermarkSizeMode || !watermarkFixedSize) return;
    const fixed = watermarkSizeMode.value === "fixed";
    watermarkFixedSize.disabled = !fixed;
  }

  function updateSplitDisable() {
    if (!splitMode || !splitEvery || !splitRanges) return;
    const everyMode = splitMode.value === "every";
    const onePerPageMode = splitMode.value === "onePerPage";
    splitEvery.disabled = !everyMode;
    splitRanges.disabled = everyMode || onePerPageMode;
  }

  function validateSplitRangesInline() {
    if (!splitRanges || !splitRangesError) return;
    const ranges = splitRanges.value.trim();
    const pageCount = Number(statPages?.textContent) || 0;
    if (splitMode?.value === "custom" && ranges) {
      const { error } = parseCustomRanges(ranges, pageCount);
      if (error) {
        splitRangesError.textContent = error;
        splitRangesError.hidden = false;
        splitRanges.setAttribute("aria-invalid", "true");
        splitRanges.setAttribute("aria-describedby", "split-ranges-error");
        splitRangesError.setAttribute("role", "alert");
        splitRangesError.setAttribute("id", "split-ranges-error");
      } else {
        splitRangesError.hidden = true;
        splitRanges.removeAttribute("aria-invalid");
        splitRanges.removeAttribute("aria-describedby");
      }
    } else {
      splitRangesError.hidden = true;
      splitRanges.removeAttribute("aria-invalid");
      splitRanges.removeAttribute("aria-describedby");
    }
  }

  function updateSplitSummary() {
    if (!splitSummary) return;
    const pageCount = Number(statPages?.textContent) || 0;
    if (pageCount === 0) {
      splitSummary.textContent = "";
      splitSummary.hidden = true;
      return;
    }
    const mode = splitMode?.value ?? "every";
    let parts = [];
    if (mode === "every") {
      const n = Number(splitEvery?.value ?? 1);
      if (n >= 1) {
        for (let start = 1; start <= pageCount; start += n) {
          parts.push({ start, end: Math.min(start + n - 1, pageCount) });
        }
      }
    } else if (mode === "onePerPage") {
      for (let i = 1; i <= pageCount; i++) {
        parts.push({ start: i, end: i });
      }
    } else {
      const ranges = splitRanges?.value ?? "";
      if (ranges.trim()) {
        const parsed = parseCustomRanges(ranges, pageCount);
        if (!parsed.error) parts = parsed.parts;
      }
    }
    if (parts.length === 0) {
      splitSummary.textContent = "";
      splitSummary.hidden = true;
      return;
    }
    const rangesText = parts.map((p) => (p.start === p.end ? String(p.start) : `${p.start}-${p.end}`)).join(", ");
    splitSummary.textContent = `${parts.length} file${parts.length !== 1 ? "s" : ""}: pages ${rangesText}`;
    splitSummary.hidden = false;
    // Cap at 500 parts
    if (parts.length > 500) {
      splitSummary.textContent += " — exceeds 500-part limit";
    }
  }

  // Shared range parser (kept in sync with split-plan.js).
  function parseCustomRanges(text, pageCount) {
    if (!text || !text.trim()) {
      return { parts: null, error: "Enter page ranges, for example 1-3, 5, 8-end." };
    }
    const parts = [];
    for (const raw of text.split(",")) {
      const part = raw.trim();
      if (!part) return { parts: null, error: "Empty range between commas." };
      let start, end;
      const range = /^(\d+)\s*-\s*(\d+|end)$/.exec(part);
      if (range) {
        start = Number(range[1]);
        end = range[2] === "end" ? pageCount : Number(range[2]);
      } else {
        const single = /^(\d+)$/.exec(part);
        if (!single) return { parts: null, error: `Unrecognisable range "${part}". Use 1-3, 5, 8-end.` };
        start = end = Number(single[1]);
      }
      if (start < 1 || end > pageCount) {
        return { parts: null, error: `Range ${start}-${end} is outside the document (1-${pageCount}).` };
      }
      if (start > end) return { parts: null, error: `Range ${start}-${end} starts after it ends.` };
      parts.push({ start, end });
    }
    return { parts, error: undefined };
  }

  return {
    render(state) {
      // Show/hide annotate panel section based on view mode
      const isAnnotateMode = state.view === "annotate";
      if (annotatePanelSection) {
        annotatePanelSection.hidden = !isAnnotateMode;
      }

      statPages.textContent = state.pages.length;
      statSource.textContent = state.sourceFiles.length;
      statSize.textContent = formatBytes(state.totalSize);

      exportSelected.textContent = `Selected (${state.selected.length})`;
      exportAll.classList.toggle("ds-segment--active", state.exportMode === "all");
      exportSelected.classList.toggle("ds-segment--active", state.exportMode === "selected");

      const hasPages = state.pages.length > 0;
      exportAll.disabled = !hasPages;
      exportSelected.disabled = !hasPages || !state.selected.length;
      downloadPdf.disabled = !hasPages;
      previewBtn.disabled = !hasPages;
      splitBtn.disabled = !hasPages;

      if (!editingName) docName.value = state.fileName.replace(/\.pdf$/i, "");

      const options = state.exportOptions || {};
      const pageNumbers = options.pageNumbers || {};
      const watermark = options.watermark || {};
      const metadata = options.metadata || {};
      const split = options.split || {};

      setIfNotFocused(pageNumberMode, pageNumbers.mode ?? "none");
      setIfNotFocused(pageNumberFormat, pageNumbers.format ?? "n");
      setIfNotFocused(pageNumberPosition, pageNumbers.position ?? "bottom-center");
      setIfNotFocused(pageNumberStart, String(pageNumbers.start ?? 1));
      setIfNotFocused(pageNumberFontSize, String(pageNumbers.fontSize ?? 10));
      setIfNotFocused(pageNumberMargin, String(pageNumbers.margin ?? 36));
      setIfNotFocused(pageNumberApplyTo, pageNumbers.applyTo ?? "all");
      pageNumberSkipFirst?.setAttribute("aria-checked", String(pageNumbers.skipFirst === true));

      setIfNotFocused(watermarkText, watermark.text ?? "");
      const invalid = validateWatermark(watermarkText?.value ?? "");
      if (watermarkError) {
        watermarkError.hidden = !invalid;
        if (invalid) watermarkError.textContent = invalid;
        watermarkText?.toggleAttribute("aria-invalid", !!invalid);
      }
      watermarkColorSwatches().forEach((swatch) => {
        swatch.setAttribute("aria-checked", String(swatch.dataset.color === (watermark.color ?? "gray")));
      });
      setIfNotFocused(watermarkAngle, String(watermark.angle ?? 0));
      setIfNotFocused(watermarkOpacity, String(watermark.opacity ?? 30));
      watermarkEnabled?.setAttribute("aria-checked", String(watermark.enabled === true));
      setIfNotFocused(watermarkSizeMode, watermark.sizeMode ?? "auto");
      setIfNotFocused(watermarkFixedSize, String(watermark.fixedSize ?? 72));
      updateWatermarkSizeDisable();

      setIfNotFocused(metaTitle, metadata.title ?? "");
      setIfNotFocused(metaAuthor, metadata.author ?? "");
      setIfNotFocused(metaSubject, metadata.subject ?? "");
      setIfNotFocused(metaKeywords, metadata.keywords ?? "");

      setIfNotFocused(splitMode, split.mode ?? "every");
      setIfNotFocused(splitEvery, String(split.every ?? 1));
      setIfNotFocused(splitRanges, split.ranges ?? "");
      updateSplitDisable();
      updateSplitSummary();
      validateSplitRangesInline();

      // Render annotate panel if in annotate mode
      if (isAnnotateMode && annotatePanelSection && getState) {
        const currentPageId = state.annotateCurrentPageId;
        const selectedAnnotationId = state.annotateSelectedAnnotationId;
        const selectedPageId = state.annotateSelectedPageId;
        const currentTool = state.annotateCurrentTool || "select";

        if (currentPageId) {
          const pageIndex = state.pages.findIndex((p) => p.id === currentPageId) + 1;
          // Announce selection changes for screen readers
          if (annotateAriaLive) {
            const count = getAnnotationCount(state.annotations || {}, currentPageId);
            annotateAriaLive.textContent = currentTool === "select"
              ? selectedAnnotationId
                ? "Annotation selected"
                : `${count} annotation(s) on this page`
              : currentTool === "text"
                ? "Text tool"
                : currentTool === "highlight"
                  ? "Markup tool"
                  : "Image tool";
          }

          // Find the selected annotation object (if any) so the panel shows its
          // own values rather than the store defaults for new annotations.
          let selectedAnnotation = null;
          if (state.annotateSelectedAnnotationId) {
            const pageAnns = getPageAnnotations(state.annotations || {}, state.annotateSelectedPageId || currentPageId);
            selectedAnnotation = pageAnns.find((a) => a.id === state.annotateSelectedAnnotationId);
          }

          const style = state.annotateMarkupStyle ?? DEFAULT_MARKUP_STYLE;
          // Exactly one group at a time. The selected annotation's type wins over
          // the active tool; select + nothing selected shows the empty state.
          let showMarkup = false;
          let showText = false;
          let showImage = false;
          if (selectedAnnotation) {
            if (selectedAnnotation.type === "highlight") showMarkup = true;
            else if (selectedAnnotation.type === "text") showText = true;
            else if (selectedAnnotation.type === "image") showImage = true;
          } else {
            if (currentTool === "highlight") showMarkup = true;
            else if (currentTool === "text") showText = true;
            else if (currentTool === "image") showImage = true;
          }
          if (annotateGroupMarkup) annotateGroupMarkup.hidden = !showMarkup;
          if (annotateGroupText) annotateGroupText.hidden = !showText;
          if (annotateGroupImage) annotateGroupImage.hidden = !showImage;
          // Empty state: select tool with nothing selected
          if (annotateEmpty) annotateEmpty.hidden = !(currentTool === "select" && !selectedAnnotation);
          // Thickness slider only for underline/strikethrough; opacity slider only for highlight
          if (annotateThicknessField) annotateThicknessField.hidden = style === "highlight";
          if (annotateOpacityField) annotateOpacityField.hidden = style !== "highlight";
          // The shared opacity slider drives the selected annotation's opacity
          // (highlight or image); hide it while image options are shown so only
          // the image-specific slider is visible.
          if (annotateOpacity) annotateOpacity.hidden = showImage;

          // Controls reflect the selected annotation's values, falling back to
          // the store defaults (panelControlValues is pure, in annotations.js).
          const values = panelControlValues(state, selectedAnnotation);

          // Update markup style segments
          if (annotateMarkupStyleGroup) {
            annotateMarkupSegments().forEach((btn) => {
              const active = btn.dataset.style === values.markupStyle;
              btn.setAttribute("aria-checked", String(active));
              btn.classList.toggle("ds-segment--active", active);
            });
          }

          // Update markup color swatches
          const markupColor = values.highlightColor;
          annotateMarkupColorSwatches().forEach((swatch) => {
            swatch.setAttribute("aria-checked", String(swatch.dataset.color === markupColor));
          });

          // Update thickness slider
          if (annotateThickness) {
            annotateThickness.value = String(values.markupThickness ?? DEFAULT_MARKUP_THICKNESS);
          }

          // Update opacity
          if (annotateOpacity) {
            annotateOpacity.value = String(Math.round(values.opacity * 100));
          }

          // Update image-specific controls when an image is selected
          if (annotateImageOpacity) {
            annotateImageOpacity.value = String(Math.round(values.opacity * 100));
          }
          if (annotateImageKeepProportions) {
            annotateImageKeepProportions.checked = state.annotateImageKeepProportions !== false;
          }
          const isImageSelected = selectedAnnotation?.type === "image";
          if (annotateImageReplace) annotateImageReplace.hidden = !isImageSelected;
          if (annotateImageDelete) annotateImageDelete.hidden = !isImageSelected;

          // Text controls: font size preset + text color dots, shown for the
          // text tool or a selected text annotation.
          const annotateFontSizeField = root.querySelector("#annotate-font-size-field");
          const annotateTextColorField = root.querySelector("#annotate-text-color-field");
          if (annotateFontSizeField) annotateFontSizeField.hidden = !showText;
          if (annotateTextColorField) annotateTextColorField.hidden = !showText;
          if (annotateFontSize) annotateFontSize.value = String(values.fontSize);
          if (annotateTextColorGroup) {
            annotateTextColorGroup.querySelectorAll(".ds-color-swatch").forEach((s) => {
              s.setAttribute("aria-checked", String(s.dataset.color === values.textColor));
            });
          }

          // Show/hide delete button
          if (annotateDeleteBtn) {
            annotateDeleteBtn.hidden = !selectedAnnotationId;
          }

          // Render annotation list for current page
          if (annotateAnnotationList) {
            annotateAnnotationList.innerHTML = "";
            const anns = getPageAnnotations(state.annotations || {}, currentPageId);

            const itemsWrap = document.createElement("div");
            itemsWrap.id = "annotate-annotation-list-items";
            itemsWrap.hidden = !annotationListExpanded;

            if (anns.length === 0) {
              const empty = document.createElement("div");
              empty.className = "ds-sr-only";
              empty.textContent = "No annotations on this page";
              itemsWrap.appendChild(empty);
            } else {
              for (const ann of anns) {
                const item = document.createElement("button");
                item.className = `annotate-annotation-item${ann.id === selectedAnnotationId ? " selected" : ""}`;
                item.type = "button";
                item.dataset.annotationId = ann.id;

                const icon = document.createElement("i");
                icon.className = "annotate-annotation-icon";
                icon.setAttribute("data-icon", ann.type === "text" ? "type" : ann.type === "image" ? "image" : "highlighter");
                icon.setAttribute("aria-hidden", "true");
                item.appendChild(icon);

                const label = document.createElement("span");
                label.className = "annotate-annotation-label";
                if (ann.type === "text") {
                  label.textContent = (ann.text || "Empty text").slice(0, 50);
                } else if (ann.type === "image") {
                  label.textContent = `Image ${Math.round(ann.width || 0)}×${Math.round(ann.height || 0)} pt`;
                } else {
                  const styleName = ann.style === "underline" ? "Underline" : ann.style === "strikethrough" ? "Strikethrough" : "Highlight";
                  label.textContent = `${styleName} ${Math.round(ann.width)}×${Math.round(ann.height)} pt`;
                }
                item.appendChild(label);

                const pageLabel = document.createElement("span");
                pageLabel.className = "annotate-annotation-page";
                pageLabel.textContent = `Page ${pageIndex}`;
                item.appendChild(pageLabel);

                item.addEventListener("click", () => {
                  // Select the annotation in the annotate view and scroll it into view
                  if (onAnnotationSelect) {
                    onAnnotationSelect(ann.id, currentPageId);
                  }
                });

                hydrateIcons(item);
                itemsWrap.appendChild(item);
              }
            }

            const header = document.createElement("button");
            header.type = "button";
            header.id = "annotate-annotation-header";
            header.className = "annotate-annotation-header";
            header.setAttribute("role", "button");
            header.setAttribute("aria-expanded", String(annotationListExpanded));
            header.textContent = `${anns.length} on this page`;
            header.hidden = anns.length === 0;
            header.addEventListener("click", () => {
              annotationListExpanded = !annotationListExpanded;
              header.setAttribute("aria-expanded", String(annotationListExpanded));
              itemsWrap.hidden = !annotationListExpanded;
            });

            annotateAnnotationList.appendChild(header);
            annotateAnnotationList.appendChild(itemsWrap);
          }
        }
      }

      sourceList.textContent = "";
      state.sourceFiles.forEach((file) => {
        const item = document.createElement("div");
        item.className = "source-item";

        const name = document.createElement("span");
        name.className = "source-item-name";
        const type = file.type === "application/pdf" ? "PDF" : "image";
        name.textContent = `${file.name} · ${formatBytes(file.size)} · ${type}`;
        item.appendChild(name);

        const remove = document.createElement("button");
        remove.className = "ds-icon-btn";
        remove.setAttribute("aria-label", `Remove ${file.name}`);
        remove.innerHTML = '<i data-icon="x"></i>';
        remove.addEventListener("click", (event) => {
          event.stopPropagation();
          onSourceRemove?.(file.id);
        });
        item.appendChild(remove);

        hydrateIcons(item);
        sourceList.appendChild(item);
      });
    },
    destroy() {
      unsubscribe();
    },
  };
}