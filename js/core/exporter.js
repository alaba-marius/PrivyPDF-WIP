// PDF export built in this tab with the vendored pdf-lib. pdFLib is injected
// (tests pass a fake); otherwise it is dynamically imported from the vendored
// bundle the first time someone exports.
import { formatPageNumber, placeLabel, validateWatermark, watermarkPlacement, watermarkAutoSize, DEFAULT_MARGIN } from "./overlay.js";
import { getAsset } from "./image-assets.js";
import { markupLineRect, DEFAULT_HIGHLIGHT_OPACITY } from "./annotations.js";

const PDFLIB_URL = "/vendor/pdf-lib/pdf-lib.esm.min.js";

const PAGE_NUMBER_GRAY = 1 / 3;

export function sanitizeName(fileName) {
  return String(fileName || "document")
    .replace(/\.pdf$/i, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .slice(0, 96) || "document";
}

export function createExporter({ PDFLib } = {}) {
  let pdfLibPromise;

  async function getPDFLib() {
    if (PDFLib) return PDFLib;
    if (!pdfLibPromise) {
      pdfLibPromise = import(PDFLIB_URL);
    }
    return pdfLibPromise;
  }

  // Dark gray, black, red, blue, green swatches — matched to the panel UI.
  // `rgb` comes from the loaded pdf-lib, so it is passed in at call time.
  function watermarkColor(rgb, name) {
    switch (name) {
      case "black": return rgb(0, 0, 0);
      case "red": return rgb(1, 0, 0);
      case "blue": return rgb(0, 0, 1);
      case "green": return rgb(0, 0.5, 0);
      case "gray":
      default: return rgb(0.4, 0.4, 0.4);
    }
  }

  // Convert hex color string to pdf-lib rgb
  function hexToRgb(rgb, hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!m) return rgb(0, 0, 0);
    return rgb(
      parseInt(m[1], 16) / 255,
      parseInt(m[2], 16) / 255,
      parseInt(m[3], 16) / 255
    );
  }

  // Visible-box origin (CropBox ∩ MediaBox lower-left) of an output page, in
  // pdf-lib user space. pdf-lib reports MediaBox/CropBox as {x, y, width, height};
  // getCropBox falls back to the MediaBox when the page has no CropBox, so
  // image-source pages (MediaBox [0, 0, w, h]) yield {0, 0} naturally.
  // Computed once per output page in the export loop — store pages never carry
  // a visible-box origin, so the store record is never consulted here.
  function outputPageOrigin(outPage) {
    const media = outPage.getMediaBox() ?? { x: 0, y: 0 };
    const crop = outPage.getCropBox() ?? media;
    return {
      x: Math.max(media.x, crop.x),
      y: Math.max(media.y, crop.y),
    };
  }

  // Draw text annotations on a page
  async function drawAnnotations(outPage, annotations, pageW, pageH, effectiveRotation, rgb, fontCache, degrees, assetCache, origin, BlendMode) {
    if (!annotations || !annotations.length) return;

    // Page-space (visible-box origin) → pdf-lib user space: shift by the
    // visible-box origin of the output page. Computed once in the export loop
    // — the single conversion point for every pdf-lib draw call below.
    const pageX = (x) => x + origin.x;
    const pageY = (y) => y + origin.y;

    // Load Helvetica font for annotations (shared with page numbers)
    if (!fontCache.Helvetica) {
      fontCache.Helvetica = await outPage.doc.embedFont(fontCache.StandardFonts.Helvetica);
    }
    const font = fontCache.Helvetica;

    for (const ann of annotations) {
      if (ann.type === "text") {
        // Text annotation: stored in page space (bottom-left origin, y up).
        // pdf-lib drawText expects page-space coordinates and rotates COUNTERCLOCKWISE.
        // To appear upright on a page rotated R° clockwise, we rotate CCW by R°.
        // Pass page-space coordinates directly - NO visual space conversion.
        const text = ann.text || "";
        if (!text) continue;

        const fontSize = ann.fontSize || 14;
        const textColor = ann.color ? hexToRgb(rgb, ann.color) : rgb(0, 0, 0);

        // Handle multi-line text: split on \n, draw each line with line height
        // Lines stack DOWN in visual orientation at all rotations.
        // Page-space offset for line k (0-indexed):
        //   dx = k * lineHeight * sin(t)
        //   dy = -k * lineHeight * cos(t)
        // where t = effectiveRotation in radians, lineHeight = 1.2 * fontSize.
        // Round to 3 decimals to avoid -0 and float noise.
        const lines = text.split("\n");
        const lineHeight = fontSize * 1.2; // typical leading
        const rad = (effectiveRotation * Math.PI) / 180;
        const sin = Math.sin(rad);
        const cos = Math.cos(rad);

        for (let k = 0; k < lines.length; k++) {
          const line = lines[k];
          if (!line && k === lines.length - 1) continue; // skip trailing empty line

          const dx = Number((k * lineHeight * sin).toFixed(3));
          const dy = Number((-k * lineHeight * cos).toFixed(3));

          outPage.drawText(line, {
            x: pageX(ann.x + dx),
            y: pageY(ann.y + dy),
            size: fontSize,
            font,
            color: textColor,
            rotate: degrees(effectiveRotation),
          });
        }
      } else if (ann.type === "highlight") {
        // Highlight / underline / strikethrough: stored in page space (x, y, width, height).
        // pdf-lib drawRectangle works in page space - use stored values directly.
        // NO coordinate conversion needed. Highlight draws the box itself;
        // underline/strikethrough draw a band via markupLineRect.
        const drawRect = markupLineRect(ann);
        const x = drawRect.x;
        const y = drawRect.y;
        const width = drawRect.width;
        const height = drawRect.height;
        if (width <= 0 || height <= 0) continue;

        const highlightColor = ann.color ? hexToRgb(rgb, ann.color) : rgb(1, 0.88, 0.3); // default yellow
        const opacity = Math.max(0, Math.min(1, ann.opacity ?? DEFAULT_HIGHLIGHT_OPACITY));

        const rectOpts = {
          x: pageX(x),
          y: pageY(y),
          width,
          height,
          color: highlightColor,
          opacity,
        };
        // Highlight bands blend with the page content beneath them so
        // overlapping marks and the underlying text stay legible.
        if (ann.style === "highlight") {
          rectOpts.blendMode = BlendMode.Multiply;
        }
        outPage.drawRectangle(rectOpts);
      } else if (ann.type === "image") {
        // Image annotation: stored in page space (x, y, width, height).
        // pdf-lib drawImage rotates COUNTERCLOCKWISE about its draw origin
        // (bottom-left corner). The page's /Rotate (effectiveRotation) rotates
        // all page content CLOCKWISE when displayed. To make the image appear
        // upright and fill the stored page-space rectangle, draw it rotated CCW
        // by effectiveRotation with origin/size per derivation:
        //   r=0:   origin (x, y),      size (w, h), rotate 0
        //   r=90:  origin (x+w, y),    size (h, w), rotate 90
        //   r=180: origin (x+w, y+h),  size (w, h), rotate 180
        //   r=270: origin (x, y+h),    size (h, w), rotate 270
        const asset = getAsset(ann.assetId);
        if (!asset) continue;

        const x = ann.x || 0;
        const y = ann.y || 0;
        const width = ann.width || 0;
        const height = ann.height || 0;
        if (width <= 0 || height <= 0) continue;

        const opacity = Math.max(0, Math.min(1, ann.opacity ?? 1));

        const r = effectiveRotation % 360;
        let drawX = x;
        let drawY = y;
        let drawW = width;
        let drawH = height;
        if (r === 90) {
          drawX = x + width;
          drawW = height;
          drawH = width;
        } else if (r === 180) {
          drawX = x + width;
          drawY = y + height;
        } else if (r === 270) {
          drawY = y + height;
          drawW = height;
          drawH = width;
        }

        // Per-document asset cache: embed each asset once per exportPages call
        // (a fresh cache per call, so split parts each embed their own assets).
        let embed = assetCache.get(ann.assetId);
        if (!embed) {
          embed = asset.mimeType === "image/jpeg"
            ? await outPage.doc.embedJpg(asset.bytes)
            : await outPage.doc.embedPng(asset.bytes);
          assetCache.set(ann.assetId, embed);
        }

        outPage.drawImage(embed, {
          x: pageX(drawX),
          y: pageY(drawY),
          width: drawW,
          height: drawH,
          rotate: degrees(r),
          opacity,
        });
      }
    }
  }

  async function exportPages({
    pages, getSource, fileName, exportMode, selected,
    pageNumbers = { mode: "none" },
    watermark = { text: "", enabled: false },
    metadata = {},
    annotations = {}, // pageId -> annotations[]
  } = {}) {
    const lib = await getPDFLib();
    const { PDFDocument, degrees, StandardFonts, rgb, BlendMode } = lib;
    const color = watermarkColor(rgb, watermark.color);

    // getSource is keyed by source id and returns { kind, bytes, type, width, height }.
    const targets =
      exportMode === "selected"
        ? pages.filter((page) => selected.has(page.id))
        : pages.slice();

    const outDoc = await PDFDocument.create();
    outDoc.setProducer("PrivyPDF");
    outDoc.setCreator("PrivyPDF");

    const pageNumberFont = await outDoc.embedFont(StandardFonts.Helvetica);
    const watermarkFont = await outDoc.embedFont(StandardFonts.HelveticaBold);
    const pageNumberColor = rgb(PAGE_NUMBER_GRAY, PAGE_NUMBER_GRAY, PAGE_NUMBER_GRAY);

    // Font cache for annotations
    const fontCache = { StandardFonts, Helvetica: null };

    const sourceDocs = new Map(); // source id -> opened pdf-lib document
    const assetCache = new Map(); // assetId -> embedded image (per exportPages call)
    let processed = 0;

    for (let i = 0; i < targets.length; i++) {
      const page = targets[i];
      const source = getSource(page.sourceId);
      if (!source) throw new Error(`No source found for page ${page.id}`);

      if (source.kind === "pdf") {
        let doc = sourceDocs.get(source.id);
        if (!doc) {
          doc = await PDFDocument.load(source.bytes);
          sourceDocs.set(source.id, doc);
        }
        // The copied page's rotation already includes the file's own /Rotate
        // (baseRotation); add the user's rotation on top. copyPages must be
        // called on the output document, not the source document, otherwise
        // adding the copied page to the output throws ForeignPageError.
        const [copied] = await outDoc.copyPages(doc, [page.index]);
        copied.setRotation(degrees(((copied.getRotation().angle ?? 0) + page.rotated) % 360));
        outDoc.addPage(copied);
      } else {
        const embed =
          source.type === "image/jpeg" ? await outDoc.embedJpg(source.bytes) : await outDoc.embedPng(source.bytes);
        const imagePage = outDoc.addPage([source.width, source.height]);
        imagePage.drawImage(embed, 0, 0, source.width, source.height);
      }

      const outPage = outDoc.getPage(outDoc.getPageCount() - 1);
      const effectiveRotation = outPage.getRotation().angle ?? 0;
      const pageW = outPage.getWidth();
      const pageH = outPage.getHeight();

      // Visible-box origin of this output page (CropBox ∩ MediaBox lower-left)
      // in pdf-lib user space. Page numbers, watermarks and annotations share
      // the same origin, so every mark lands relative to the visible box —
      // never at the raw MediaBox corner — and nothing is compensated twice.
      const origin = outputPageOrigin(outPage);

      // --- Page numbers -----------------------------------------------------
      // n counts within the exported document; skipFirst skips the first
      // exported page. "applyTo" controls whether page numbers apply to all
      // pages or only selected pages.
      if (pageNumbers.mode !== "none") {
        const appliesToAll = pageNumbers.applyTo === "all";
        const applies = appliesToAll || selected.has(page.id);
        if (applies && !(i === 0 && pageNumbers.skipFirst)) {
          const n = pageNumbers.start + i;
          const text = formatPageNumber(n, targets.length, pageNumbers.format);
          const fontSize = pageNumbers.fontSize ?? 10;
          const textWidth = pageNumberFont.widthOfTextAtSize(text, fontSize);
          const margin = pageNumbers.margin ?? DEFAULT_MARGIN;
          const { x, y, rotateDegrees } = placeLabel({
            position: pageNumbers.position ?? "bottom-center",
            pageW, pageH, rotation: effectiveRotation,
            fontSize, textWidth,
            margin,
            visualAngle: 0, // labels are always upright
          });
          outPage.drawText(text, {
            x: x + origin.x, y: y + origin.y, size: fontSize, font: pageNumberFont,
            color: pageNumberColor, rotate: degrees(rotateDegrees),
          });
        }
      }

      // --- Watermark --------------------------------------------------------
      if (watermark.enabled && watermark.text) {
        const invalid = validateWatermark(watermark.text);
        if (invalid) throw new Error(invalid);

        let size;
        if (watermark.sizeMode === "fixed") {
          size = watermark.fixedSize ?? 72;
          // Clamp fixed size so rotated box fits 80% of both visual dimensions.
          const { size: clampedSize } = watermarkAutoSize({
            pageW, pageH, rotation: effectiveRotation, angle: watermark.angle,
            text: watermark.text, measure: watermarkFont.widthOfTextAtSize.bind(watermarkFont),
            maxFontSize: size,
          });
          size = clampedSize;
        } else {
          // Auto size: largest font size fitting 80% of both visual dimensions.
          const { size: autoSize } = watermarkAutoSize({
            pageW, pageH, rotation: effectiveRotation, angle: watermark.angle,
            text: watermark.text, measure: watermarkFont.widthOfTextAtSize.bind(watermarkFont),
          });
          size = autoSize;
        }

        const textWidth = watermarkFont.widthOfTextAtSize(watermark.text, size);
        const { x, y, rotateDegrees } = watermarkPlacement({
          pageW, pageH, rotation: effectiveRotation, angle: watermark.angle,
          fontSize: size, textWidth,
        });
        outPage.drawText(watermark.text, {
          x: x + origin.x, y: y + origin.y, size, font: watermarkFont,
          color, opacity: Math.max(0, Math.min(100, Number(watermark.opacity) || 30)) / 100,
          rotate: degrees(rotateDegrees),
        });
      }

      // --- Annotations ------------------------------------------------------
      const pageAnnotations = annotations[page.id] || [];
      await drawAnnotations(outPage, pageAnnotations, pageW, pageH, effectiveRotation, rgb, fontCache, degrees, assetCache, origin, BlendMode);

      processed++;
      // Yield to the main thread every few pages so long exports stay
      // responsive instead of blocking the tab for seconds.
      if (processed % 8 === 0 && processed < targets.length) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    // Metadata is part of the document, so it must be set before saving.
    if (metadata.title) outDoc.setTitle(metadata.title);
    if (metadata.author) outDoc.setAuthor(metadata.author);
    if (metadata.subject) outDoc.setSubject(metadata.subject);
    if (metadata.keywords) {
      // pdf-lib's setKeywords takes a string array. Split on commas and semicolons,
      // trim, drop empties, limit to 50 keywords and 200 characters per keyword.
      const keywords = String(metadata.keywords)
        .split(/[,;]/)
        .map((k) => k.trim())
        .filter((k) => k.length > 0)
        .slice(0, 50)
        .map((k) => k.slice(0, 200));
      outDoc.setKeywords(keywords);
    }

    const bytes = await outDoc.save();
    return { name: `${sanitizeName(fileName)}.pdf`, bytes };
  }

  return { exportPages };
}