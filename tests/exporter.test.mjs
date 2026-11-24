import { test } from "node:test";
import assert from "node:assert/strict";
import { createExporter } from "../js/core/exporter.js";

function makePDFLib() {
  const ops = [];
  const pages = [];

  // A fake pdf-lib page: tracks its rotation and records drawText calls.
  // Strict: asserts pdf-lib's real signatures (text, size) and (string, options).
  function pageWithRotation(index) {
    let rotation = 0;
    return {
      getRotation: () => ({ angle: rotation }),
      setRotation(angle) {
        rotation = angle.angle ?? angle;
        ops.push(["setRotation", index, rotation]);
      },
      drawImage() {},
      drawText(text, opts) {
        if (typeof text !== "string") throw new Error("drawText text must be string");
        if (opts && typeof opts !== "object") throw new Error("drawText opts must be object");
        ops.push(["drawText", { ...opts, text }]);
      },
      // Scale with size like real pdf-lib: at size 100, width ≈ text.length * 10
      widthOfTextAtSize(text, size) {
        if (typeof text !== "string") throw new Error("widthOfTextAtSize text must be string");
        if (typeof size !== "number") throw new Error("widthOfTextAtSize size must be number");
        return text.length * size * 0.1;
      },
      getWidth: () => 612,
      getHeight: () => 792,
    };
  }

  const PDFDocument = {
    async create() {
      ops.push(["create"]);
      return {
        setProducer(text) { ops.push(["producer", text]); },
        setCreator(text) { ops.push(["creator", text]); },
        setTitle(text) { ops.push(["setTitle", text]); },
        setAuthor(text) { ops.push(["setAuthor", text]); },
        setSubject(text) { ops.push(["setSubject", text]); },
        setKeywords(text) { ops.push(["setKeywords", text]); },
        addPage(page) {
          // A real page object (e.g. copied from a source PDF) is stored as-is;
          // a dimension array [w, h] (image pages) gets a fresh blank page.
          const p = page && page.drawImage ? page : pageWithRotation(pages.length);
          pages.push(p);
          return p;
        },
        async embedJpg(bytes) {
          ops.push(["embedJpg", bytes.length]);
          return {};
        },
        async embedPng(bytes) {
          ops.push(["embedPng", bytes.length]);
          return {};
        },
        async embedFont() {
          ops.push(["embedFont"]);
          return {
            // Scale with size like real pdf-lib
            widthOfTextAtSize(text, size) {
              if (typeof text !== "string") throw new Error("widthOfTextAtSize text must be string");
              if (typeof size !== "number") throw new Error("widthOfTextAtSize size must be number");
              return text.length * size * 0.1;
            },
          };
        },
        async save() {
          ops.push(["save"]);
          return new Uint8Array([0x25, 0x50, 0x44, 0x46]);
        },
        async copyPages(_doc, indexes) {
          ops.push(["copy", ...indexes]);
          return indexes.map((index) => pageWithRotation(index));
        },
        getPageCount: () => pages.length,
        getPage: (index) => pages[index],
      };
    },
    async load(bytes) {
      ops.push(["load", bytes.length]);
      return {
        async copyPages(_doc, indexes) {
          ops.push(["copy", ...indexes]);
          return indexes.map((index) => pageWithRotation(index));
        },
      };
    },
  };
  return {
    ops,
    pages,
    PDFDocument,
    degrees: (angle) => ({ angle }),
    StandardFonts: { Helvetica: "Helvetica", HelveticaBold: "Helvetica-Bold" },
    rgb: (...components) => components,
    async embedJpg(bytes) {
      ops.push(["embedJpg", bytes.length]);
      return {};
    },
    async embedPng(bytes) {
      ops.push(["embedPng", bytes.length]);
      return {};
    },
  };
}

test("exportPages copies PDF pages and adds the user rotation on top of the file rotation", async (t) => {
  const PDFLib = makePDFLib();
  const exporter = createExporter({ PDFLib });
  const pages = [{ id: "p1", sourceId: "s1", index: 0, rotated: 90 }];
  const sources = new Map([["s1", { kind: "pdf", bytes: new Uint8Array([1, 2, 3]), type: "application/pdf", size: 3, pageCount: 1 }]]);
  const { name, bytes } = await exporter.exportPages({
    pages, getSource: (id) => sources.get(id), fileName: "report", exportMode: "all", selected: new Set(),
  });
  assert.equal(name, "report.pdf");
  assert.deepStrictEqual([...bytes], [0x25, 0x50, 0x44, 0x46]);
  assert.deepStrictEqual(PDFLib.ops, [
    ["create"],
    ["producer", "PrivyPDF"],
    ["creator", "PrivyPDF"],
    ["embedFont"],
    ["embedFont"],
    ["load", 3],
    ["copy", 0],
    ["setRotation", 0, 90],
    ["save"],
  ]);
});

test("exportPages exports only the selected pages in selected mode", async (t) => {
  const PDFLib = makePDFLib();
  const exporter = createExporter({ PDFLib });
  const pages = [
    { id: "p1", sourceId: "s1", index: 0, rotated: 0 },
    { id: "p2", sourceId: "s1", index: 1, rotated: 0 },
  ];
  const sources = new Map([["s1", { kind: "pdf", bytes: new Uint8Array([9]), type: "application/pdf", size: 1, pageCount: 2 }]]);
  await exporter.exportPages({
    pages, getSource: (id) => sources.get(id), fileName: "x", exportMode: "selected", selected: new Set(["p2"]),
  });
  assert.deepStrictEqual(PDFLib.ops.filter((o) => o[0] === "copy"), [["copy", 1]]);
});

test("exportPages embeds each image as its own page", async (t) => {
  const PDFLib = makePDFLib();
  const exporter = createExporter({ PDFLib });
  const jpgBytes = new Uint8Array([0xff, 0xd8, 0xff]);
  const pages = [{ id: "p1", sourceId: "s1", index: 0, rotated: 0, width: 200, height: 300 }];
  const sources = new Map([["s1", { kind: "image", bytes: jpgBytes, type: "image/jpeg", width: 200, height: 300, size: 3, pageCount: 1 }]]);
  await exporter.exportPages({
    pages, getSource: (id) => sources.get(id), fileName: "x", exportMode: "all", selected: new Set(),
  });
  assert.deepStrictEqual(PDFLib.ops.filter((o) => o[0] === "embedJpg"), [["embedJpg", 3]]);
  assert.equal(PDFLib.pages.length, 1);
});

test("exportPages throws when a page has no source", async (t) => {
  const exporter = createExporter({ PDFLib: makePDFLib() });
  await assert.rejects(
    exporter.exportPages({
      pages: [{ id: "p1", sourceId: "s9", index: 0, rotated: 0 }],
      getSource: () => undefined,
      fileName: "x",
      exportMode: "all",
      selected: new Set(),
    }),
    /No source found/,
  );
});

test("exportPages sanitizes the output file name", async (t) => {
  const PDFLib = makePDFLib();
  const exporter = createExporter({ PDFLib });
  const { name } = await exporter.exportPages({
    pages: [{ id: "p1", sourceId: "s1", index: 0, rotated: 0 }],
    getSource: () => ({ kind: "pdf", bytes: new Uint8Array([1]), type: "application/pdf", size: 1, pageCount: 1 }),
    fileName: "weird/name*.pdf",
    exportMode: "all",
    selected: new Set(),
  });
  assert.equal(name, "weird_name_.pdf");
});

function drawnTexts(PDFLib) {
  return PDFLib.ops.filter((o) => o[0] === "drawText").map((o) => o[1]);
}

test("exportPages draws page numbers on all pages, counter-rotated per page rotation", async (t) => {
  const PDFLib = makePDFLib();
  const exporter = createExporter({ PDFLib });
  const pages = [
    { id: "p1", sourceId: "s1", index: 0, rotated: 0 },
    { id: "p2", sourceId: "s1", index: 1, rotated: 90 },
    { id: "p3", sourceId: "s1", index: 2, rotated: 180 },
  ];
  const sources = new Map([["s1", { kind: "pdf", bytes: new Uint8Array([1]), type: "application/pdf", size: 1, pageCount: 3 }]]);
  await exporter.exportPages({
    pages, getSource: (id) => sources.get(id), fileName: "x",
    exportMode: "all", selected: new Set(),
    pageNumbers: { mode: "all", format: "n-of-total", skipFirst: false, position: "bottom-center", start: 1, fontSize: 10, margin: 36, applyTo: "all" },
  });
  const drawn = drawnTexts(PDFLib);
  assert.deepStrictEqual(drawn.map((d) => d.text), ["1 / 3", "2 / 3", "3 / 3"]);
  assert.deepStrictEqual(drawn.map((d) => d.size), [10, 10, 10]);
  // New math: rotateDegrees = visualAngle + rotation = 0 + rotation
  assert.deepStrictEqual(drawn.map((d) => d.rotate.angle), [0, 90, 180]);
  for (const d of drawn) {
    assert.deepStrictEqual(d.color, [1 / 3, 1 / 3, 1 / 3]);
  }
});

test("exportPages skips the page number on the first page when skipFirst", async (t) => {
  const PDFLib = makePDFLib();
  const exporter = createExporter({ PDFLib });
  const pages = [
    { id: "p1", sourceId: "s1", index: 0, rotated: 0 },
    { id: "p2", sourceId: "s1", index: 1, rotated: 0 },
    { id: "p3", sourceId: "s1", index: 2, rotated: 0 },
  ];
  const sources = new Map([["s1", { kind: "pdf", bytes: new Uint8Array([1]), type: "application/pdf", size: 1, pageCount: 3 }]]);
  await exporter.exportPages({
    pages, getSource: (id) => sources.get(id), fileName: "x",
    exportMode: "all", selected: new Set(),
    pageNumbers: { mode: "all", format: "n", skipFirst: true, position: "bottom-center", start: 1, fontSize: 10, margin: 36, applyTo: "all" },
  });
  const drawn = drawnTexts(PDFLib);
  assert.deepStrictEqual(drawn.map((d) => d.text), ["2", "3"]);
});

test("exportPages page numbers apply to selected pages only in selected mode", async (t) => {
  const PDFLib = makePDFLib();
  const exporter = createExporter({ PDFLib });
  const pages = [
    { id: "p1", sourceId: "s1", index: 0, rotated: 0 },
    { id: "p2", sourceId: "s1", index: 1, rotated: 0 },
    { id: "p3", sourceId: "s1", index: 2, rotated: 0 },
  ];
  const sources = new Map([["s1", { kind: "pdf", bytes: new Uint8Array([1]), type: "application/pdf", size: 1, pageCount: 3 }]]);
  await exporter.exportPages({
    pages, getSource: (id) => sources.get(id), fileName: "x",
    exportMode: "selected", selected: new Set(["p2"]),
    pageNumbers: { mode: "selected", format: "n-of-total", skipFirst: false, position: "bottom-center", start: 1, fontSize: 10, margin: 36, applyTo: "selected" },
  });
  const drawn = drawnTexts(PDFLib);
  assert.deepStrictEqual(drawn.map((d) => d.text), ["1 / 1"]);
});

test("exportPages uses the requested page number format", async (t) => {
  const PDFLib = makePDFLib();
  const exporter = createExporter({ PDFLib });
  const pages = [{ id: "p1", sourceId: "s1", index: 0, rotated: 0 }];
  const sources = new Map([["s1", { kind: "pdf", bytes: new Uint8Array([1]), type: "application/pdf", size: 1, pageCount: 1 }]]);
  await exporter.exportPages({
    pages, getSource: (id) => sources.get(id), fileName: "x",
    exportMode: "all", selected: new Set(),
    pageNumbers: { mode: "all", format: "page-of-total", skipFirst: false, position: "bottom-center", start: 1, fontSize: 10, margin: 36, applyTo: "all" },
  });
  const drawn = drawnTexts(PDFLib);
  assert.deepStrictEqual(drawn.map((d) => d.text), ["Page 1 of 1"]);
});

test("exportPages draws the watermark with auto-size fitting 80% of visual dimensions", async (t) => {
  const PDFLib = makePDFLib();
  const exporter = createExporter({ PDFLib });
  const pages = [{ id: "p1", sourceId: "s1", index: 0, rotated: 0 }];
  const sources = new Map([["s1", { kind: "pdf", bytes: new Uint8Array([1]), type: "application/pdf", size: 1, pageCount: 1 }]]);
  await exporter.exportPages({
    pages, getSource: (id) => sources.get(id), fileName: "x",
    exportMode: "all", selected: new Set(),
    watermark: { enabled: true, text: "DRAFT", color: "red", angle: 45, opacity: 50, sizeMode: "auto", fixedSize: 72, applyTo: "all" },
  });
  const drawn = drawnTexts(PDFLib);
  assert.equal(drawn.length, 1);
  assert.equal(drawn[0].text, "DRAFT");
  assert.deepStrictEqual(drawn[0].color, [1, 0, 0]);
  assert.equal(drawn[0].opacity, 0.5);
  // New math: for rotation=0, angle=45 (CCW), rotateDegrees = visualAngle + rotation = 45 + 0 = 45
  assert.equal(drawn[0].rotate.angle, 45);
  // Auto-size: largest font size where rotated box fits 80% of both visual dims.
  // For "DRAFT" (5 chars) at 45° on 612x792: max size is 500 (capped by maxFontSize).
  assert.equal(drawn[0].size, 500);
  // Verify the box fits within 80% of visual dimensions.
  const w = 5 * drawn[0].size * 0.1; // fake font metric
  const h = 0.72 * drawn[0].size;
  const a = (45 * Math.PI) / 180;
  const cosA = Math.abs(Math.cos(a));
  const sinA = Math.abs(Math.sin(a));
  const boxW = w * cosA + h * sinA;
  const boxH = w * sinA + h * cosA;
  assert.ok(boxW <= 0.8 * 612 + 1e-6, `boxW ${boxW} <= 489.6`);
  assert.ok(boxH <= 0.8 * 792 + 1e-6, `boxH ${boxH} <= 633.6`);
});

test("exportPages shrinks an over-wide watermark to fit 80% of both visual dimensions", async (t) => {
  const PDFLib = makePDFLib();
  const exporter = createExporter({ PDFLib });
  const pages = [{ id: "p1", sourceId: "s1", index: 0, rotated: 0 }];
  const sources = new Map([["s1", { kind: "pdf", bytes: new Uint8Array([1]), type: "application/pdf", size: 1, pageCount: 1 }]]);
  const longText = "A".repeat(60);
  await exporter.exportPages({
    pages, getSource: (id) => sources.get(id), fileName: "x",
    exportMode: "all", selected: new Set(),
    watermark: { enabled: true, text: longText, color: "gray", angle: 0, opacity: 30, sizeMode: "auto", fixedSize: 72, applyTo: "all" },
  });
  const drawn = drawnTexts(PDFLib);
  assert.equal(drawn.length, 1);
  // Auto-size: for 60 chars at 0° on 612x792, max size where boxW=6*size <= 489.6 => size <= 81
  assert.equal(drawn[0].size, 81);
  assert.equal(drawn[0].opacity, 0.3);
  // Verify box fits
  const w = 60 * drawn[0].size * 0.1;
  const h = 0.72 * drawn[0].size;
  const boxW = w; // angle=0
  const boxH = h;
  assert.ok(boxW <= 0.8 * 612 + 1e-6, `boxW ${boxW} <= 489.6`);
  assert.ok(boxH <= 0.8 * 792 + 1e-6, `boxH ${boxH} <= 633.6`);
});

test("exportPages rejects an invalid watermark", async (t) => {
  const PDFLib = makePDFLib();
  const exporter = createExporter({ PDFLib });
  const pages = [{ id: "p1", sourceId: "s1", index: 0, rotated: 0 }];
  const sources = new Map([["s1", { kind: "pdf", bytes: new Uint8Array([1]), type: "application/pdf", size: 1, pageCount: 1 }]]);
  await assert.rejects(
    exporter.exportPages({
      pages, getSource: (id) => sources.get(id), fileName: "x",
      exportMode: "all", selected: new Set(),
      watermark: { enabled: true, text: "bad✅text", color: "gray", angle: 0, opacity: 30, sizeMode: "auto", fixedSize: 72, applyTo: "all" },
    }),
    /Use Latin letters/,
  );
});

test("exportPages sets metadata title, author, subject, keywords", async (t) => {
  const PDFLib = makePDFLib();
  const exporter = createExporter({ PDFLib });
  const pages = [{ id: "p1", sourceId: "s1", index: 0, rotated: 0 }];
  const sources = new Map([["s1", { kind: "pdf", bytes: new Uint8Array([1]), type: "application/pdf", size: 1, pageCount: 1 }]]);
  await exporter.exportPages({
    pages, getSource: (id) => sources.get(id), fileName: "x",
    exportMode: "all", selected: new Set(),
    metadata: { title: "Quarterly Report", author: "Marius", subject: "Finance", keywords: "report, quarterly, 2026" },
  });
  assert.ok(PDFLib.ops.some((o) => o[0] === "setTitle" && o[1] === "Quarterly Report"));
  assert.ok(PDFLib.ops.some((o) => o[0] === "setAuthor" && o[1] === "Marius"));
  assert.ok(PDFLib.ops.some((o) => o[0] === "setSubject" && o[1] === "Finance"));
  // Keywords are now split on commas/semicolons and passed as an array
  assert.ok(PDFLib.ops.some((o) => o[0] === "setKeywords" && Array.isArray(o[1]) && o[1].includes("report") && o[1].includes("quarterly") && o[1].includes("2026")));
});

test("exportPages omits metadata setters when all fields are blank", async (t) => {
  const PDFLib = makePDFLib();
  const exporter = createExporter({ PDFLib });
  const pages = [{ id: "p1", sourceId: "s1", index: 0, rotated: 0 }];
  const sources = new Map([["s1", { kind: "pdf", bytes: new Uint8Array([1]), type: "application/pdf", size: 1, pageCount: 1 }]]);
  await exporter.exportPages({
    pages, getSource: (id) => sources.get(id), fileName: "x",
    exportMode: "all", selected: new Set(),
    metadata: { title: "", author: "", subject: "", keywords: "" },
  });
  assert.ok(!PDFLib.ops.some((o) => o[0] === "setTitle"));
  assert.ok(!PDFLib.ops.some((o) => o[0] === "setAuthor"));
  assert.ok(!PDFLib.ops.some((o) => o[0] === "setSubject"));
  assert.ok(!PDFLib.ops.some((o) => o[0] === "setKeywords"));
});

test("exportPages respects pageNumbers applyTo: selected", async (t) => {
  const PDFLib = makePDFLib();
  const exporter = createExporter({ PDFLib });
  const pages = [
    { id: "p1", sourceId: "s1", index: 0, rotated: 0 },
    { id: "p2", sourceId: "s1", index: 1, rotated: 0 },
  ];
  const sources = new Map([["s1", { kind: "pdf", bytes: new Uint8Array([1]), type: "application/pdf", size: 1, pageCount: 2 }]]);
  await exporter.exportPages({
    pages, getSource: (id) => sources.get(id), fileName: "x",
    exportMode: "all", selected: new Set(["p2"]),
    pageNumbers: { mode: "all", format: "n", skipFirst: false, position: "bottom-center", start: 1, fontSize: 10, margin: 36, applyTo: "selected" },
  });
  const drawn = drawnTexts(PDFLib);
  assert.equal(drawn.length, 1);
  assert.equal(drawn[0].text, "2"); // second page in export (index 1)
});

test("exportPages respects pageNumbers custom position, fontSize, margin, start", async (t) => {
  const PDFLib = makePDFLib();
  const exporter = createExporter({ PDFLib });
  const pages = [{ id: "p1", sourceId: "s1", index: 0, rotated: 0 }];
  const sources = new Map([["s1", { kind: "pdf", bytes: new Uint8Array([1]), type: "application/pdf", size: 1, pageCount: 1 }]]);
  await exporter.exportPages({
    pages, getSource: (id) => sources.get(id), fileName: "x",
    exportMode: "all", selected: new Set(),
    pageNumbers: { mode: "all", format: "n", skipFirst: false, position: "top-right", start: 5, fontSize: 14, margin: 20, applyTo: "all" },
  });
  const drawn = drawnTexts(PDFLib);
  assert.equal(drawn.length, 1);
  assert.equal(drawn[0].text, "5");
  assert.equal(drawn[0].size, 14);
  // rotateDegrees should be 0 for rotation=0
  assert.equal(drawn[0].rotate.angle, 0);
});

test("exportPages respects watermark fixed size mode", async (t) => {
  const PDFLib = makePDFLib();
  const exporter = createExporter({ PDFLib });
  const pages = [{ id: "p1", sourceId: "s1", index: 0, rotated: 0 }];
  const sources = new Map([["s1", { kind: "pdf", bytes: new Uint8Array([1]), type: "application/pdf", size: 1, pageCount: 1 }]]);
  await exporter.exportPages({
    pages, getSource: (id) => sources.get(id), fileName: "x",
    exportMode: "all", selected: new Set(),
    watermark: { enabled: true, text: "TEST", color: "gray", angle: 0, opacity: 50, sizeMode: "fixed", fixedSize: 48, applyTo: "all" },
  });
  const drawn = drawnTexts(PDFLib);
  assert.equal(drawn.length, 1);
  assert.equal(drawn[0].size, 48);
});

test("exportPages does not draw watermark when enabled is false", async (t) => {
  const PDFLib = makePDFLib();
  const exporter = createExporter({ PDFLib });
  const pages = [{ id: "p1", sourceId: "s1", index: 0, rotated: 0 }];
  const sources = new Map([["s1", { kind: "pdf", bytes: new Uint8Array([1]), type: "application/pdf", size: 1, pageCount: 1 }]]);
  await exporter.exportPages({
    pages, getSource: (id) => sources.get(id), fileName: "x",
    exportMode: "all", selected: new Set(),
    watermark: { enabled: false, text: "TEST", color: "gray", angle: 0, opacity: 50, sizeMode: "auto", fixedSize: 72, applyTo: "all" },
  });
  const drawn = drawnTexts(PDFLib);
  assert.equal(drawn.length, 0);
});