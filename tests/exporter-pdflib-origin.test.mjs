// Real pdf-lib tests for the visible-box-origin (CropBox ∩ MediaBox lower-left)
// fix: exporter must read each output page's visible box (never the store page
// record, which carries no view), and thread that single origin into page
// numbers, watermarks and every annotation draw call.
// Input PDFs are hand-crafted with non-zero MediaBox/CropBox because pdf-lib's
// save() rejects hand-made PDFArray boxes ("sizeInBytes is not a function");
// loading/copying/saving those bytes round-trips fine.
import { test } from "node:test";
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { inflateSync } from "node:zlib";
import { createExporter } from "../js/core/exporter.js";
import { placeLabel, watermarkPlacement } from "../js/core/overlay.js";
import { registerRawBytes } from "../js/core/image-assets.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const {
  PDFDocument,
  StandardFonts,
  rgb,
  degrees,
} = await import(pathToFileURL(join(ROOT, "vendor", "pdf-lib", "pdf-lib.esm.min.js")).href);
const BlendMode = { Multiply: "Multiply", Screen: "Screen" };
const PDFLib = { PDFDocument, degrees, StandardFonts, rgb, BlendMode };

// Minimal valid 1x1 white PNG, for an image annotation asset.
const PNG_1X1 = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAAAAAABVgNqpjQAAAABJRU5ErkJggg==",
    "base64",
  ),
);

function objStr(num, content) {
  return `${num} 0 obj${content}endobj`;
}

// Hand-craft a multi-page PDF with per-page MediaBox/CropBox/Rotate and one
// content stream per page. Object numbering: 1 catalog, 2 pages, then each
// page object followed by its content object, pages object emitted last.
function buildMultiInputPdf(pageSpecs) {
  const numPages = pageSpecs.length;
  const parts = ["%PDF-1.4\n"];
  const offByNum = { 0: 0 };

  parts.push(objStr(1, "<</Type /Catalog /Pages 2 0 R>>\n"));
  let nextNum = 3;
  const pageRefs = [];
  for (let i = 0; i < numPages; i++) {
    const spec = pageSpecs[i];
    const pageNum = nextNum++;
    const contentNum = nextNum++;
    pageRefs.push(pageNum);
    const mediaBox = spec.mediaBox ?? [0, 0, 612, 792];
    const media = `/MediaBox [${mediaBox.join(" ")}]`;
    const cropBox = spec.cropBox ? `/CropBox [${spec.cropBox.join(" ")}]` : "";
    const rotate = spec.rotate ? `/Rotate ${spec.rotate}` : "";
    const content = `BT /F1 12 Tf 100 700 Td (page ${i + 1}) Tj ET`;
    parts.push(
      objStr(
        pageNum,
        `<</Type /Page /Parent 2 0 R ${media} ${cropBox} ${rotate} /Resources <<>> /Contents ${contentNum} 0 R>>\n`,
      ),
    );
    parts.push(objStr(contentNum, `<</Length ${content.length}>>stream\n${content}\nendstream\n`));
  }
  const kids = pageRefs.map((r) => `${r} 0 R`).join(" ");
  parts.push(objStr(2, `<</Type /Pages /Kids[${kids}] /Count ${numPages}>>\n`));

  let offset = 0;
  for (const part of parts) {
    const m = part.match(/^(\d+) 0 obj/);
    if (m) offByNum[Number(m[1])] = offset;
    offset += Buffer.byteLength(part, "latin1");
  }
  const body = parts.join("");
  const xrefLines = [];
  const maxNum = nextNum - 1;
  for (let n = 0; n <= maxNum; n++) {
    const off = offByNum[n] || 0;
    const type = n === 0 ? "f" : "n";
    xrefLines.push(`${String(off).padStart(10, "0")} 00000 ${type} `);
  }
  const xref = `xref\n0 ${maxNum + 1}\n${xrefLines.join("\n")}\n`;
  const trailer = `trailer <</Size ${maxNum + 1} /Root 1 0 R>>\n`;
  const startxref = `startxref\n${Buffer.byteLength(body, "latin1")}\n%%EOF\n`;
  return Buffer.from(body + xref + trailer + startxref, "latin1");
}

// All text content streams of an output page (original copied stream + any
// streams the exporter appends for annotations / labels / watermark).
function contentStreams(out, pageIndex) {
  const page = out.getPage(pageIndex);
  const contents = page.node.Contents();
  const refs = contents && typeof contents.array !== "undefined" ? contents.array : [contents];
  const streams = [];
  for (const ref of refs) {
    const streamData = out.context.lookup(ref);
    let bytes = streamData.contents;
    let text;
    try {
      text = inflateSync(bytes).toString("latin1");
    } catch {
      text = Buffer.from(bytes).toString("latin1");
    }
    streams.push(text);
  }
  return streams;
}

// Every `n n ... n op` tuple in the given streams (pdf-lib emits rectangles as
// a positioning `cm` followed by a path; it does not emit the `re` operator).
function findTuples(streams, op, arity) {
  const regex = new RegExp(`([\\d.-]+(?:\\s+[\\d.-]+){${arity - 1}})\\s+${op}\\b`, "g");
  const found = [];
  for (const stream of streams) {
    let match;
    while ((match = regex.exec(stream))) {
      found.push(match[1].split(/\s+/).map(Number));
    }
  }
  return found;
}

function containsTuple(tuples, expected, tol = 0.01) {
  return tuples.some(
    (t) =>
      t.length === expected.length &&
      expected.every((v, i) => Math.abs(t[i] - v) < tol),
  );
}

function pdfSource(bytes) {
  return { kind: "pdf", id: "s1", bytes, type: "application/pdf", pageCount: 2 };
}

// Five annotation kinds stored at page-space positions. On a page whose
// visible-box origin is (0, 7.83), each lands at stored + (0, 7.83):
//   highlight rect          [150, 557.83, 80, 20]
//   underline band          y = 650 + 0.11*20 - 2 = 650.2  →  658.03
//   strikethrough band      y = 750 + 0.45*20 - 1 = 758    →  765.83
//   text annotation         [300, 407.83]
//   image annotation        [100, 307.83], size 120x60
const baseAnnotations = {
  p1: [
    { id: "h1", type: "highlight", style: "highlight", x: 150, y: 550, width: 80, height: 20 },
    { id: "u1", type: "highlight", style: "underline", x: 150, y: 650, width: 80, height: 20, dir: 0, thickness: 2 },
    { id: "s1", type: "highlight", style: "strikethrough", x: 150, y: 750, width: 80, height: 20, dir: 0, thickness: 2 },
    { id: "t1", type: "text", text: "ANN", x: 300, y: 400, fontSize: 14, color: "#000000" },
    { id: "i1", type: "image", assetId: "img1", x: 100, y: 300, width: 120, height: 60 },
  ],
};

test("exporter with real pdf-lib: annotations drawn at stored position plus visible-box origin", async () => {
  registerRawBytes({ assetId: "img1", mimeType: "image/png", width: 120, height: 60, bytes: PNG_1X1 });

  // MediaBox [0, 7.83, 595.5, 850.08]: visible box starts 7.83pt above the
  // MediaBox bottom-left; stored coords must be shifted by that origin.
  const inputBytes = buildMultiInputPdf([{ mediaBox: [0, 7.83, 595.5, 850.08] }]);
  const pages = [{ id: "p1", sourceId: "s1", index: 0, rotated: 0 }];
  const exporter = createExporter({ PDFLib });
  const { bytes } = await exporter.exportPages({
    pages,
    getSource: () => pdfSource(inputBytes),
    fileName: "origin",
    exportMode: "all",
    annotations: baseAnnotations,
  });

  const out = await PDFDocument.load(bytes);
  assert.equal(out.getPageCount(), 1);
  const mediaBox = out.getPage(0).getMediaBox(); // pdf-lib: {x, y, width, height}
  assert.deepStrictEqual(mediaBox, { x: 0, y: 7.83, width: 595.5, height: 842.25 });

  const streams = contentStreams(out, 0);
  const cmTuples = findTuples(streams, "cm", 6);

  // Positioning cm for each draw call carries stored position + visible-box origin.
  assert.ok(containsTuple(cmTuples, [1, 0, 0, 1, 150, 557.83]), "highlight rect at stored position + origin");
  assert.ok(containsTuple(cmTuples, [1, 0, 0, 1, 150, 658.03]), "underline band at stored position + origin");
  assert.ok(containsTuple(cmTuples, [1, 0, 0, 1, 150, 765.83]), "strikethrough band at stored position + origin");
  // Image: positioning cm plus its size cm.
  assert.ok(containsTuple(cmTuples, [1, 0, 0, 1, 100, 307.83]), "image at stored position + origin");
  assert.ok(containsTuple(cmTuples, [120, 0, 0, 60, 0, 0]), "image drawn at stored size");
  // Text annotation: Tm carries stored position + origin.
  assert.ok(
    containsTuple(findTuples(streams, "Tm", 6), [1, 0, 0, 1, 300, 407.83]),
    "text Tm at stored position + origin",
  );
});

test("exporter with real pdf-lib: MediaBox lower-left offset is added to annotation coordinates", async () => {
  const inputBytes = buildMultiInputPdf([{ mediaBox: [20, 30, 632, 822] }]);
  const pages = [{ id: "p1", sourceId: "s1", index: 0, rotated: 0 }];
  const exporter = createExporter({ PDFLib });
  const { bytes } = await exporter.exportPages({
    pages,
    getSource: () => pdfSource(inputBytes),
    fileName: "offset",
    exportMode: "all",
    annotations: { p1: [{ id: "h1", type: "highlight", x: 100, y: 100, width: 200, height: 50 }] },
  });

  const out = await PDFDocument.load(bytes);
  const cmTuples = findTuples(contentStreams(out, 0), "cm", 6);
  // origin (20, 30): stored (100, 100, 200, 50) → positioned at (120, 130).
  assert.ok(
    containsTuple(cmTuples, [1, 0, 0, 1, 120, 130]),
    "MediaBox lower-left added to highlight rect",
  );
});

test("exporter with real pdf-lib: CropBox origin inside zero-origin MediaBox is added to annotation coordinates", async () => {
  const inputBytes = buildMultiInputPdf([
    { mediaBox: [0, 0, 612, 792], cropBox: [10, 15, 600, 780] },
  ]);
  const pages = [{ id: "p1", sourceId: "s1", index: 0, rotated: 0 }];
  const exporter = createExporter({ PDFLib });
  const { bytes } = await exporter.exportPages({
    pages,
    getSource: () => pdfSource(inputBytes),
    fileName: "cropbox",
    exportMode: "all",
    annotations: { p1: [{ id: "h1", type: "highlight", x: 100, y: 100, width: 200, height: 50 }] },
  });

  const out = await PDFDocument.load(bytes);
  const cmTuples = findTuples(contentStreams(out, 0), "cm", 6);
  // origin (10, 15): stored (100, 100, 200, 50) → positioned at (110, 115).
  assert.ok(
    containsTuple(cmTuples, [1, 0, 0, 1, 110, 115]),
    "CropBox origin added to highlight rect",
  );
});

test("exporter with real pdf-lib: /Rotate does not change the visible-box origin", async () => {
  const inputBytes = buildMultiInputPdf([
    { mediaBox: [0, 7.83, 595.5, 850.08], rotate: 90 },
  ]);
  const pages = [{ id: "p1", sourceId: "s1", index: 0, rotated: 0 }];
  const exporter = createExporter({ PDFLib });
  const { bytes } = await exporter.exportPages({
    pages,
    getSource: () => pdfSource(inputBytes),
    fileName: "rotate",
    exportMode: "all",
    annotations: { p1: [{ id: "h1", type: "highlight", x: 100, y: 100, width: 200, height: 50 }] },
  });

  const out = await PDFDocument.load(bytes);
  assert.equal(out.getPage(0).getRotation().angle, 90);
  const cmTuples = findTuples(contentStreams(out, 0), "cm", 6);
  // origin stays (0, 7.83) regardless of rotation: positioned at (100, 107.83).
  assert.ok(
    containsTuple(cmTuples, [1, 0, 0, 1, 100, 107.83]),
    "highlight rect uses visible-box origin unchanged by /Rotate",
  );
});

test("exporter with real pdf-lib: each output page uses its own visible-box origin (all and selected modes)", async () => {
  const inputBytes = buildMultiInputPdf([
    { mediaBox: [0, 0, 612, 792] },       // page 1: origin (0, 0)
    { mediaBox: [0, 20, 612, 792] },      // page 2: origin (0, 20)
  ]);
  const pages = [
    { id: "p1", sourceId: "s1", index: 0, rotated: 0 },
    { id: "p2", sourceId: "s1", index: 1, rotated: 0 },
  ];
  const exporter = createExporter({ PDFLib });
  const perPageAnnotations = {
    p1: [{ id: "h1", type: "highlight", x: 10, y: 10, width: 20, height: 20 }],
    p2: [{ id: "h2", type: "highlight", x: 10, y: 10, width: 20, height: 20 }],
  };

  const checkOrigins = async (bytes, label) => {
    const out = await PDFDocument.load(bytes);
    assert.equal(out.getPageCount(), 2, `${label}: two output pages`);
    const cm0 = findTuples(contentStreams(out, 0), "cm", 6);
    const cm1 = findTuples(contentStreams(out, 1), "cm", 6);
    // Page 1 keeps stored (10, 10, 20, 20).
    assert.ok(containsTuple(cm0, [1, 0, 0, 1, 10, 10]), `${label}: page 1 rect at stored position`);
    // Page 2 shifted by its own origin (0, 20): positioned at (10, 30).
    assert.ok(containsTuple(cm1, [1, 0, 0, 1, 10, 30]), `${label}: page 2 rect at stored position + its own origin`);
    // No cross-contamination.
    assert.ok(!containsTuple(cm0, [1, 0, 0, 1, 10, 30]), `${label}: page 1 has no foreign-origin rect`);
    assert.ok(!containsTuple(cm1, [1, 0, 0, 1, 10, 10]), `${label}: page 2 has no foreign-origin rect`);
  };

  // "all" mode exports both pages.
  const allBytes = (
    await exporter.exportPages({
      pages,
      getSource: () => pdfSource(inputBytes),
      fileName: "all-origins",
      exportMode: "all",
      annotations: perPageAnnotations,
    })
  ).bytes;
  await checkOrigins(allBytes, "all");

  // "selected" mode exports the same two pages in store order.
  const selectedBytes = (
    await exporter.exportPages({
      pages,
      getSource: () => pdfSource(inputBytes),
      fileName: "selected-origins",
      exportMode: "selected",
      selected: new Set(["p1", "p2"]),
      annotations: perPageAnnotations,
    })
  ).bytes;
  await checkOrigins(selectedBytes, "selected");
});

test("exporter with real pdf-lib: page number and watermark positioned relative to the visible box", async () => {
  const inputBytes = buildMultiInputPdf([{ mediaBox: [0, 7.83, 595.5, 850.08] }]);
  const pages = [{ id: "p1", sourceId: "s1", index: 0, rotated: 0 }];
  const exporter = createExporter({ PDFLib });

  // Mirror the exporter's measurements so expected positions are computed the
  // same way, then add the visible-box origin (0, 7.83).
  const meas = await PDFDocument.create();
  const pageNumberFont = await meas.embedFont(StandardFonts.Helvetica);
  const tw = pageNumberFont.widthOfTextAtSize("1 / 1", 10);
  const meas2 = await PDFDocument.create();
  const watermarkFont = await meas2.embedFont(StandardFonts.HelveticaBold);
  const tw2 = watermarkFont.widthOfTextAtSize("DRAFT", 36);

  const { bytes } = await exporter.exportPages({
    pages,
    getSource: () => pdfSource(inputBytes),
    fileName: "labels",
    exportMode: "all",
    pageNumbers: { mode: "all", applyTo: "all", start: 1, format: "n-of-total", position: "bottom-center", fontSize: 10, margin: 36 },
    watermark: { text: "DRAFT", enabled: true, sizeMode: "fixed", fixedSize: 36, angle: 0, color: "gray", opacity: 30 },
  });

  const out = await PDFDocument.load(bytes);
  const page = out.getPage(0);
  const pageW = page.getWidth();
  const pageH = page.getHeight();
  const originY = 7.83; // MediaBox [0, 7.83, ...]

  const label = placeLabel({
    position: "bottom-center",
    pageW,
    pageH,
    rotation: 0,
    fontSize: 10,
    textWidth: tw,
    margin: 36,
  });
  const watermark = watermarkPlacement({
    pageW,
    pageH,
    rotation: 0,
    angle: 0,
    fontSize: 36,
    textWidth: tw2,
  });

  const streams = contentStreams(out, 0);
  const tmTuples = findTuples(streams, "Tm", 6);
  const allText = streams.join("\n");
  // pdf-lib may encode drawn text strings as hex (<...>) or literals ((...)).
  const drawnHex = (s) => "<" + Buffer.from(s, "latin1").toString("hex").toUpperCase() + ">";
  const drawn = (s) => allText.includes(drawnHex(s)) || allText.includes("(" + s + ")");

  assert.ok(
    containsTuple(tmTuples, [1, 0, 0, 1, label.x, label.y + originY]),
    "page number at placeLabel position + visible-box origin",
  );
  assert.ok(
    containsTuple(tmTuples, [1, 0, 0, 1, watermark.x, watermark.y + originY]),
    "watermark at watermarkPlacement position + visible-box origin",
  );
  assert.ok(drawn("1 / 1"), "page number text drawn");
  assert.ok(drawn("DRAFT"), "watermark text drawn");
});
