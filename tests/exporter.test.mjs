import { test } from "node:test";
import assert from "node:assert/strict";
import { createExporter } from "../js/core/exporter.js";

function makePDFLib() {
  const ops = [];
  const pages = [];

  // A fake pdf-lib page: tracks its rotation and records drawText calls.
  // Strict: asserts pdf-lib's real signatures (text, size) and (string, options).
  function pageWithRotation(index, doc) {
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
      drawRectangle(opts) {
        if (opts && typeof opts !== "object") throw new Error("drawRectangle opts must be object");
        ops.push(["drawRectangle", { ...opts }]);
      },
      // Scale with size like real pdf-lib: at size 100, width ≈ text.length * 10
      widthOfTextAtSize(text, size) {
        if (typeof text !== "string") throw new Error("widthOfTextAtSize text must be string");
        if (typeof size !== "number") throw new Error("widthOfTextAtSize size must be number");
        return text.length * size * 0.1;
      },
      getWidth: () => 612,
      getHeight: () => 792,
      doc, // reference to the document for embedFont
    };
  }

  const PDFDocument = {
    async create() {
      ops.push(["create"]);
      const doc = {
        setProducer(text) { ops.push(["producer", text]); },
        setCreator(text) { ops.push(["creator", text]); },
        setTitle(text) { ops.push(["setTitle", text]); },
        setAuthor(text) { ops.push(["setAuthor", text]); },
        setSubject(text) { ops.push(["setSubject", text]); },
        setKeywords(text) { ops.push(["setKeywords", text]); },
        addPage(page) {
          // A real page object (e.g. copied from a source PDF) is stored as-is;
          // a dimension array [w, h] (image pages) gets a fresh blank page.
          const p = page && page.drawImage ? page : pageWithRotation(pages.length, doc);
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
          return indexes.map((index) => pageWithRotation(index, doc));
        },
        getPageCount: () => pages.length,
        getPage: (index) => pages[index],
      };
      return doc;
    },
    async load(bytes) {
      ops.push(["load", bytes.length]);
      const doc = {
        async copyPages(_doc, indexes) {
          ops.push(["copy", ...indexes]);
          return indexes.map((index) => pageWithRotation(index, doc));
        },
      };
      return doc;
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

// --- Annotation tests ---

function drawnRects(PDFLib) {
  return PDFLib.ops.filter((o) => o[0] === "drawRectangle").map((o) => o[1]);
}

test("exportPages draws text annotations at correct position on unrotated page", async (t) => {
  const PDFLib = makePDFLib();
  const exporter = createExporter({ PDFLib });
  const pages = [{ id: "p1", sourceId: "s1", index: 0, rotated: 0 }];
  const sources = new Map([["s1", { kind: "pdf", bytes: new Uint8Array([1]), type: "application/pdf", size: 1, pageCount: 1 }]]);
  await exporter.exportPages({
    pages, getSource: (id) => sources.get(id), fileName: "x",
    exportMode: "all", selected: new Set(),
    pageNumbers: { mode: "all", format: "n", skipFirst: false, position: "bottom-center", start: 1, fontSize: 10, margin: 36, applyTo: "all" },
    annotations: {
      p1: [
        { id: "a1", type: "text", x: 100, y: 200, text: "Hello", fontSize: 14, color: "#000000" },
      ],
    },
  });
  const drawn = drawnTexts(PDFLib);
  // 1 page number + 1 annotation = 2 drawText calls
  assert.equal(drawn.length, 2);
  const ann = drawn.find((d) => d.text === "Hello");
  assert.ok(ann, "annotation text should be drawn");
  assert.equal(ann.x, 100);
  assert.equal(ann.y, 200);
  assert.equal(ann.size, 14);
  assert.deepStrictEqual(ann.color, [0, 0, 0]);
  assert.equal(ann.rotate.angle, 0); // rotation 0
});

test("exportPages draws text annotations with correct rotation on rotated pages", async (t) => {
  const PDFLib = makePDFLib();
  const exporter = createExporter({ PDFLib });
  const pages = [
    { id: "p1", sourceId: "s1", index: 0, rotated: 90 },
    { id: "p2", sourceId: "s1", index: 1, rotated: 180 },
  ];
  const sources = new Map([["s1", { kind: "pdf", bytes: new Uint8Array([1]), type: "application/pdf", size: 1, pageCount: 2 }]]);
  await exporter.exportPages({
    pages, getSource: (id) => sources.get(id), fileName: "x",
    exportMode: "all", selected: new Set(),
    annotations: {
      p1: [{ id: "a1", type: "text", x: 100, y: 200, text: "R90", fontSize: 14, color: "#000000" }],
      p2: [{ id: "a2", type: "text", x: 300, y: 400, text: "R180", fontSize: 14, color: "#000000" }],
    },
  });
  const drawn = drawnTexts(PDFLib);
  const ann1 = drawn.find((d) => d.text === "R90");
  const ann2 = drawn.find((d) => d.text === "R180");
  assert.ok(ann1);
  assert.ok(ann2);
  // Annotation should be rotated by effective rotation to appear upright in visual space
  assert.equal(ann1.rotate.angle, 90);
  assert.equal(ann2.rotate.angle, 180);
});

test("exportPages draws highlight annotations on unrotated page", async (t) => {
  const PDFLib = makePDFLib();
  const exporter = createExporter({ PDFLib });
  const pages = [{ id: "p1", sourceId: "s1", index: 0, rotated: 0 }];
  const sources = new Map([["s1", { kind: "pdf", bytes: new Uint8Array([1]), type: "application/pdf", size: 1, pageCount: 1 }]]);
  await exporter.exportPages({
    pages, getSource: (id) => sources.get(id), fileName: "x",
    exportMode: "all", selected: new Set(),
    annotations: {
      p1: [
        { id: "h1", type: "highlight", x: 100, y: 100, width: 200, height: 50, color: "#ffe14d", opacity: 0.4 },
      ],
    },
  });
  const rects = drawnRects(PDFLib);
  assert.equal(rects.length, 1);
  const rect = rects[0];
  // Page space rectangle at (100,100) width 200 height 50
  assert.equal(rect.x, 100);
  assert.equal(rect.y, 100);
  assert.equal(rect.width, 200);
  assert.equal(rect.height, 50);
  assert.deepStrictEqual(rect.color, [1, 0.8823529411764706, 0.30196078431372547]); // #ffe14d
  assert.equal(rect.opacity, 0.4);
});

test("exportPages draws highlight annotations with correct position on rotated page (90°)", async (t) => {
  const PDFLib = makePDFLib();
  const exporter = createExporter({ PDFLib });
  const pages = [{ id: "p1", sourceId: "s1", index: 0, rotated: 90 }];
  const sources = new Map([["s1", { kind: "pdf", bytes: new Uint8Array([1]), type: "application/pdf", size: 1, pageCount: 1 }]]);
  await exporter.exportPages({
    pages, getSource: (id) => sources.get(id), fileName: "x",
    exportMode: "all", selected: new Set(),
    annotations: {
      p1: [
        { id: "h1", type: "highlight", x: 100, y: 100, width: 200, height: 50, color: "#ffe14d", opacity: 0.4 },
      ],
    },
  });
  const rects = drawnRects(PDFLib);
  assert.equal(rects.length, 1);
  const rect = rects[0];
  // For rotation 90: pageToVisual({x:100, y:100}, 612, 792, 90) = {x: 100, y: 512}
  // pageToVisual({x:300, y:100}) = {x: 100, y: 312}
  // pageToVisual({x:300, y:150}) = {x: 150, y: 312}
  // pageToVisual({x:100, y:150}) = {x: 150, y: 512}
  // Visual bounds: x in [100, 150], y in [312, 512]
  // Back to page space (r=90): visualToPage({x:100, y:312}) = {x: 300, y: 100}
  // visualToPage({x:150, y:512}) = {x: 100, y: 150}
  // So rect in page space: x=100, y=100, width=200, height=50
  assert.equal(rect.x, 100);
  assert.equal(rect.y, 100);
  assert.equal(rect.width, 200);
  assert.equal(rect.height, 50);
});

test("exportPages draws highlight annotations with correct position on rotated page (180°)", async (t) => {
  const PDFLib = makePDFLib();
  const exporter = createExporter({ PDFLib });
  const pages = [{ id: "p1", sourceId: "s1", index: 0, rotated: 180 }];
  const sources = new Map([["s1", { kind: "pdf", bytes: new Uint8Array([1]), type: "application/pdf", size: 1, pageCount: 1 }]]);
  await exporter.exportPages({
    pages, getSource: (id) => sources.get(id), fileName: "x",
    exportMode: "all", selected: new Set(),
    annotations: {
      p1: [
        { id: "h1", type: "highlight", x: 100, y: 100, width: 200, height: 50, color: "#ffe14d", opacity: 0.4 },
      ],
    },
  });
  const rects = drawnRects(PDFLib);
  assert.equal(rects.length, 1);
  const rect = rects[0];
  // For rotation 180: visual bounds for page-space rect (100,100)-(300,150)
  // corners: (100,100)->(512,692), (300,100)->(312,692), (300,150)->(312,642), (100,150)->(512,642)
  // visual bounds: x in [312,512], y in [642,692]
  // Back to page space: visualToPage({x:312,y:642}) = {x:300,y:150}, visualToPage({x:512,y:692}) = {x:100,y:100}
  // So rect in page space: x=100, y=100, width=200, height=50 (same as original since 180 is symmetric)
  assert.equal(rect.x, 100);
  assert.equal(rect.y, 100);
  assert.equal(rect.width, 200);
  assert.equal(rect.height, 50);
});

test("exportPages draws highlight annotations with correct position on rotated page (270°)", async (t) => {
  const PDFLib = makePDFLib();
  const exporter = createExporter({ PDFLib });
  const pages = [{ id: "p1", sourceId: "s1", index: 0, rotated: 270 }];
  const sources = new Map([["s1", { kind: "pdf", bytes: new Uint8Array([1]), type: "application/pdf", size: 1, pageCount: 1 }]]);
  await exporter.exportPages({
    pages, getSource: (id) => sources.get(id), fileName: "x",
    exportMode: "all", selected: new Set(),
    annotations: {
      p1: [
        { id: "h1", type: "highlight", x: 100, y: 100, width: 200, height: 50, color: "#ffe14d", opacity: 0.4 },
      ],
    },
  });
  const rects = drawnRects(PDFLib);
  assert.equal(rects.length, 1);
  const rect = rects[0];
  // For rotation 270: pageToVisual({x:100, y:100}, 612, 792, 270) = {x: 692, y: 100}
  // pageToVisual({x:300, y:100}) = {x: 692, y: 300}
  // pageToVisual({x:300, y:150}) = {x: 642, y: 300}
  // pageToVisual({x:100, y:150}) = {x: 642, y: 100}
  // Visual bounds: x in [642, 692], y in [100, 300]
  // Back to page space (r=270): visualToPage({x:642,y:100}) = {x:100,y:150}, visualToPage({x:692,y:300}) = {x:300,y:100}
  // So rect in page space: x=100, y=100, width=200, height=50
  assert.equal(rect.x, 100);
  assert.equal(rect.y, 100);
  assert.equal(rect.width, 200);
  assert.equal(rect.height, 50);
});

test("exportPages uses custom highlight color and opacity", async (t) => {
  const PDFLib = makePDFLib();
  const exporter = createExporter({ PDFLib });
  const pages = [{ id: "p1", sourceId: "s1", index: 0, rotated: 0 }];
  const sources = new Map([["s1", { kind: "pdf", bytes: new Uint8Array([1]), type: "application/pdf", size: 1, pageCount: 1 }]]);
  await exporter.exportPages({
    pages, getSource: (id) => sources.get(id), fileName: "x",
    exportMode: "all", selected: new Set(),
    annotations: {
      p1: [
        { id: "h1", type: "highlight", x: 0, y: 0, width: 100, height: 100, color: "#ff0000", opacity: 0.7 },
      ],
    },
  });
  const rects = drawnRects(PDFLib);
  assert.equal(rects.length, 1);
  assert.deepStrictEqual(rects[0].color, [1, 0, 0]); // #ff0000
  assert.equal(rects[0].opacity, 0.7);
});

test("exportPages does not draw empty text annotations", async (t) => {
  const PDFLib = makePDFLib();
  const exporter = createExporter({ PDFLib });
  const pages = [{ id: "p1", sourceId: "s1", index: 0, rotated: 0 }];
  const sources = new Map([["s1", { kind: "pdf", bytes: new Uint8Array([1]), type: "application/pdf", size: 1, pageCount: 1 }]]);
  await exporter.exportPages({
    pages, getSource: (id) => sources.get(id), fileName: "x",
    exportMode: "all", selected: new Set(),
    annotations: {
      p1: [
        { id: "a1", type: "text", x: 100, y: 100, text: "", fontSize: 14, color: "#000000" },
        { id: "a2", type: "text", x: 100, y: 200, text: "   ", fontSize: 14, color: "#000000" },
        { id: "a3", type: "text", x: 100, y: 300, text: "Valid", fontSize: 14, color: "#000000" },
      ],
    },
  });
  const drawn = drawnTexts(PDFLib);
  // 1 page number + 1 valid annotation = 2 drawText calls
  assert.equal(drawn.length, 2);
  const ann = drawn.find((d) => d.text === "Valid");
  assert.ok(ann);
});

test("exportPages does not draw zero-size highlights", async (t) => {
  const PDFLib = makePDFLib();
  const exporter = createExporter({ PDFLib });
  const pages = [{ id: "p1", sourceId: "s1", index: 0, rotated: 0 }];
  const sources = new Map([["s1", { kind: "pdf", bytes: new Uint8Array([1]), type: "application/pdf", size: 1, pageCount: 1 }]]);
  await exporter.exportPages({
    pages, getSource: (id) => sources.get(id), fileName: "x",
    exportMode: "all", selected: new Set(),
    annotations: {
      p1: [
        { id: "h1", type: "highlight", x: 0, y: 0, width: 0, height: 100, color: "#ffe14d", opacity: 0.4 },
        { id: "h2", type: "highlight", x: 0, y: 0, width: 100, height: 0, color: "#ffe14d", opacity: 0.4 },
        { id: "h3", type: "highlight", x: 0, y: 0, width: 100, height: 100, color: "#ffe14d", opacity: 0.4 },
      ],
    },
  });
  const rects = drawnRects(PDFLib);
  assert.equal(rects.length, 1); // Only the valid one
  assert.equal(rects[0].width, 100);
  assert.equal(rects[0].height, 100);
});

test("exportPages handles annotations for multiple pages", async (t) => {
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
    pageNumbers: { mode: "all", format: "n", skipFirst: false, position: "bottom-center", start: 1, fontSize: 10, margin: 36, applyTo: "all" },
    annotations: {
      p1: [{ id: "a1", type: "text", x: 0, y: 0, text: "Page 1", fontSize: 14, color: "#000000" }],
      p3: [{ id: "a2", type: "text", x: 0, y: 0, text: "Page 3", fontSize: 14, color: "#000000" }],
    },
  });
  const drawn = drawnTexts(PDFLib);
  // 3 page numbers + 2 annotations = 5 drawText calls
  assert.equal(drawn.length, 5);
  const texts = drawn.map((d) => d.text);
  assert.ok(texts.includes("Page 1"));
  assert.ok(texts.includes("Page 3"));
});

test("exportPages exports selected pages with their annotations", async (t) => {
  const PDFLib = makePDFLib();
  const exporter = createExporter({ PDFLib });
  const pages = [
    { id: "p1", sourceId: "s1", index: 0, rotated: 0 },
    { id: "p2", sourceId: "s1", index: 1, rotated: 0 },
  ];
  const sources = new Map([["s1", { kind: "pdf", bytes: new Uint8Array([1]), type: "application/pdf", size: 1, pageCount: 2 }]]);
  await exporter.exportPages({
    pages, getSource: (id) => sources.get(id), fileName: "x",
    exportMode: "selected", selected: new Set(["p2"]),
    pageNumbers: { mode: "selected", format: "n", skipFirst: false, position: "bottom-center", start: 1, fontSize: 10, margin: 36, applyTo: "selected" },
    annotations: {
      p1: [{ id: "a1", type: "text", x: 0, y: 0, text: "Page 1", fontSize: 14, color: "#000000" }],
      p2: [{ id: "a2", type: "text", x: 0, y: 0, text: "Page 2", fontSize: 14, color: "#000000" }],
    },
  });
  const drawn = drawnTexts(PDFLib);
  // 1 page number (for selected page) + 1 annotation = 2 drawText calls
  assert.equal(drawn.length, 2);
  const texts = drawn.map((d) => d.text);
  assert.ok(texts.includes("Page 2"));
  assert.ok(!texts.includes("Page 1"));
});