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
  updateAnnotation,
  deleteAnnotation,
  DEFAULT_TEXT_FONT_SIZE,
  DEFAULT_TEXT_COLOR,
  DEFAULT_HIGHLIGHT_COLOR,
  DEFAULT_HIGHLIGHT_OPACITY,
  panelControlValues,
} from "../core/annotations.js";

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
  const annotateHint = root.querySelector("#annotate-panel-hint");
  const annotateHighlightOptions = root.querySelector("#annotate-highlight-options");
  const annotateTextOptions = root.querySelector("#annotate-text-options");
  const annotateFontSize = root.querySelector("#annotate-font-size");
  const annotateOpacity = root.querySelector("#annotate-opacity");
  const annotateDeleteBtn = root.querySelector("#annotate-panel-delete");
  const annotateAnnotationList = root.querySelector("#annotate-annotation-list");
  const annotateHighlightColorSwatches = () => root.querySelectorAll("#annotate-highlight-options .ds-color-swatch");
  const annotateTextColorSwatches = () => root.querySelectorAll("#annotate-text-options .ds-color-swatch");

  const watermarkColorSwatches = () => root.querySelectorAll('[name="watermark-color"]');

  const unsubscribe = subscribeMeter((n) => {
    privacyCount.textContent = n;
  });

  // Annotate panel event listeners
  if (annotateFontSize) {
    annotateFontSize.innerHTML = [8, 10, 12, 14, 16, 18, 24, 36, 48, 72].map(
      (s) => `<option value="${s}"${s === DEFAULT_TEXT_FONT_SIZE ? " selected" : ""}>${s} pt</option>`
    ).join("");
    annotateFontSize.addEventListener("change", () => {
      const state = getState?.();
      // Update store setting for new annotations
      store?.patch({ annotateFontSize: Number(annotateFontSize.value) });
      // Update selected annotation if any
      if (state && state.annotateSelectedAnnotationId && state.annotateSelectedPageId) {
        updateAnnotations((anns) => {
          const pageAnns = getPageAnnotations(anns, state.annotateSelectedPageId);
          const ann = pageAnns.find((a) => a.id === state.annotateSelectedAnnotationId);
          if (ann && ann.type === "text") {
            return updateAnnotation(anns, state.annotateSelectedPageId, state.annotateSelectedAnnotationId, { fontSize: Number(annotateFontSize.value) });
          }
          return anns;
        });
      }
    });
  }

  annotateHighlightColorSwatches().forEach((swatch) => {
    swatch.addEventListener("click", () => {
      annotateHighlightColorSwatches().forEach((s) => s.setAttribute("aria-checked", "false"));
      swatch.setAttribute("aria-checked", "true");
      const color = swatch.dataset.color;
      // Update store setting for new annotations
      store?.patch({ annotateHighlightColor: color });
      // Update selected annotation if any
      const state = getState?.();
      if (state && state.annotateSelectedAnnotationId && state.annotateSelectedPageId) {
        updateAnnotations((anns) => updateAnnotation(anns, state.annotateSelectedPageId, state.annotateSelectedAnnotationId, { color }));
      }
    });
  });

  annotateTextColorSwatches().forEach((swatch) => {
    swatch.addEventListener("click", () => {
      annotateTextColorSwatches().forEach((s) => s.setAttribute("aria-checked", "false"));
      swatch.setAttribute("aria-checked", "true");
      const color = swatch.dataset.color;
      // Update store setting for new annotations
      store?.patch({ annotateTextColor: color });
      // Update selected annotation if any
      const state = getState?.();
      if (state && state.annotateSelectedAnnotationId && state.annotateSelectedPageId) {
        updateAnnotations((anns) => updateAnnotation(anns, state.annotateSelectedPageId, state.annotateSelectedAnnotationId, { color }));
      }
    });
  });

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

  if (annotateDeleteBtn) {
    annotateDeleteBtn.addEventListener("click", () => {
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
          annotateHint.textContent = currentTool === "select"
            ? `${getAnnotationCount(state.annotations || {}, currentPageId)} annotation(s) — click to select, drag to move, Del to delete`
            : currentTool === "text"
              ? "Click on the page to add a text box. Type, then press Enter or click away to commit. Esc to cancel."
              : "Drag on the page to create a highlight. Click away or press Esc to cancel.";

          // Find the selected annotation object (if any) so the panel shows its
          // own values rather than the store defaults for new annotations.
          let selectedAnnotation = null;
          if (state.annotateSelectedAnnotationId) {
            const pageAnns = getPageAnnotations(state.annotations || {}, state.annotateSelectedPageId || currentPageId);
            selectedAnnotation = pageAnns.find((a) => a.id === state.annotateSelectedAnnotationId);
          }

          // Show/hide option groups: match the active tool OR the selected
          // annotation's type (a selected highlight shows highlight options even
          // when the tool is "select", and vice versa).
          const showHighlight = currentTool === "highlight" || selectedAnnotation?.type === "highlight";
          const showText = currentTool === "text" || selectedAnnotation?.type === "text";
          if (annotateHighlightOptions) annotateHighlightOptions.hidden = !showHighlight;
          if (annotateTextOptions) annotateTextOptions.hidden = !showText;

          // Controls reflect the selected annotation's values, falling back to
          // the store defaults (panelControlValues is pure, in annotations.js).
          const values = panelControlValues(state, selectedAnnotation);

          // Update color swatches for highlight
          const highlightColor = values.highlightColor;
          annotateHighlightColorSwatches().forEach((swatch) => {
            swatch.setAttribute("aria-checked", String(swatch.dataset.color === highlightColor));
          });

          // Update color swatches for text
          const textColor = values.textColor;
          annotateTextColorSwatches().forEach((swatch) => {
            swatch.setAttribute("aria-checked", String(swatch.dataset.color === textColor));
          });

          // Update font size; guarantee the select contains the value even if
          // it is not one of the preset options.
          if (annotateFontSize) {
            annotateFontSize.value = String(values.fontSize);
            if (annotateFontSize.value !== String(values.fontSize)) {
              const options = annotateFontSize.options || [];
              const exists = options.some((o) => o.value === String(values.fontSize));
              if (!exists) {
                const option = document.createElement("option");
                option.value = String(values.fontSize);
                option.textContent = `${values.fontSize} pt`;
                annotateFontSize.appendChild(option);
              }
              annotateFontSize.value = String(values.fontSize);
            }
          }

          // Update opacity
          if (annotateOpacity) {
            annotateOpacity.value = String(Math.round(values.opacity * 100));
          }

          // Show/hide delete button
          if (annotateDeleteBtn) {
            annotateDeleteBtn.hidden = !selectedAnnotationId;
          }

          // Render annotation list for current page
          if (annotateAnnotationList) {
            annotateAnnotationList.innerHTML = "";
            const anns = getPageAnnotations(state.annotations || {}, currentPageId);
            if (anns.length === 0) {
              const empty = document.createElement("div");
              empty.className = "ds-sr-only";
              empty.textContent = "No annotations on this page";
              annotateAnnotationList.appendChild(empty);
            } else {
              for (const ann of anns) {
                const item = document.createElement("button");
                item.className = `annotate-annotation-item${ann.id === selectedAnnotationId ? " selected" : ""}`;
                item.type = "button";
                item.dataset.annotationId = ann.id;

                const icon = document.createElement("i");
                icon.className = "annotate-annotation-icon";
                icon.setAttribute("data-icon", ann.type === "text" ? "type" : "highlighter");
                icon.setAttribute("aria-hidden", "true");
                item.appendChild(icon);

                const label = document.createElement("span");
                label.className = "annotate-annotation-label";
                if (ann.type === "text") {
                  label.textContent = (ann.text || "Empty text").slice(0, 50);
                } else {
                  label.textContent = `Highlight ${Math.round(ann.width)}×${Math.round(ann.height)} pt`;
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
                annotateAnnotationList.appendChild(item);
              }
            }
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