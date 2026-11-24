// PDF export built in this tab with the vendored pdf-lib. pdFLib is injected
// (tests pass a fake); otherwise it is dynamically imported from the vendored
// bundle the first time someone exports.
import { formatPageNumber, placeLabel, validateWatermark, watermarkPlacement, watermarkAutoSize, DEFAULT_MARGIN } from "./overlay.js";

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

  async function exportPages({
    pages, getSource, fileName, exportMode, selected,
    pageNumbers = { mode: "none" },
    watermark = { text: "", enabled: false },
    metadata = {},
  } = {}) {
    const lib = await getPDFLib();
    const { PDFDocument, degrees, StandardFonts, rgb } = lib;
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

    const sourceDocs = new Map(); // source id -> opened pdf-lib document
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
            x, y, size: fontSize, font: pageNumberFont,
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
          x, y, size, font: watermarkFont,
          color, opacity: Math.max(0, Math.min(100, Number(watermark.opacity) || 30)) / 100,
          rotate: degrees(rotateDegrees),
        });
      }

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