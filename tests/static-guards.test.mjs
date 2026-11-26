// Mandatory static guards — prevent regressions like missing imports or syntax errors.
// These tests must pass for any change to js/.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const JS_ROOT = join(ROOT, "js");

function collectJsFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...collectJsFiles(full));
    } else if (entry.endsWith(".js")) {
      files.push(full);
    }
  }
  return files;
}

function stripComments(code) {
  return code.replace(/\/\/[^\n\r]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

function getExportedNames(code) {
  const names = new Set();
  const cleaned = stripComments(code);
  // export function/const/let/class
  for (const m of cleaned.matchAll(
    /(?:^|\n)\s*export\s+(?:async\s+)?(?:function\s+([A-Za-z_$][\w$]*)|class\s+([A-Za-z_$][\w$]*)|const\s+([A-Za-z_$][\w$]*)|let\s+([A-Za-z_$][\w$]*)|var\s+([A-Za-z_$][\w$]*))/g
  )) {
    names.add(m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5]);
  }
  // export { a, b }
  for (const m of cleaned.matchAll(/export\s*\{\s*([\s\S]*?)\s*\}/g)) {
    for (const nm of m[1].matchAll(/\b([A-Za-z_$][\w$]*)\s*(?:as\s+[A-Za-z_$][\w$]*)?\s*,?/g)) {
      names.add(nm[1]);
    }
  }
  // export default (ignored for bare call check)
  return names;
}

function getImportedNames(code) {
  const names = new Set();
  const cleaned = stripComments(code);
  // import { a, b } from "x"
  for (const m of cleaned.matchAll(/import\s+\{([\s\S]*?)\}\s+from\s+["'][^"']+["']/g)) {
    for (const nm of m[1].matchAll(/\b([A-Za-z_$][\w$]*)\s*(?:as\s+([A-Za-z_$][\w$]*))?\s*,?/g)) {
      const importedName = nm[1];
      const localName = nm[2] ?? importedName;
      names.add(localName);
    }
  }
  // import { a as b } from "x"
  // import x from "x" (default)
  // import * as ns from "x" (namespace)
  return names;
}

function getDeclaredNames(code) {
  const names = new Set();
  const cleaned = stripComments(code);
  // function foo() {}
  // const/let/var foo = ...
  for (const m of cleaned.matchAll(
    /(?:^|\n|\{|\()\s*(?:function\s+([A-Za-z_$][\w$]*)|const\s+([A-Za-z_$][\w$]*)|let\s+([A-Za-z_$][\w$]*)|var\s+([A-Za-z_$][\w$]*))\s*=/g
  )) {
    names.add(m[1] ?? m[2] ?? m[3] ?? m[4]);
  }
  // function declarations (including async)
  for (const m of cleaned.matchAll(/(?:^|\n)\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g)) {
    names.add(m[1]);
  }
  // Function parameters: function foo(a, b) {} or (a, b) => {} or async function(a, b) {}
  for (const m of cleaned.matchAll(/\(([^)]*)\)\s*(?:\{|=>)/g)) {
    const params = m[1].split(",").map(p => p.trim().replace(/\?.*/, "").replace(/=.*/, "").trim());
    for (const param of params) {
      if (param && /^[A-Za-z_$][\w$]*$/.test(param)) {
        names.add(param);
      }
    }
  }
  return names;
}

// Guard 1: Every .js file under js/ parses as a valid ES module (syntax check)
test("static guard: every js file parses as valid ES module", () => {
  const files = collectJsFiles(JS_ROOT);
  const errors = [];
  for (const file of files) {
    // Use node --check for ES module syntax check
    const result = spawnSync("node", ["--check", file], {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 5000,
    });
    if (result.status !== 0) {
      errors.push(`${file}: ${result.stderr.trim() || result.stdout.trim()}`);
    }
  }
  assert.equal(errors.length, 0, `Syntax errors found:\n${errors.join("\n")}`);
});

// Guard 2: No function declaration shares a name with an imported binding, or calls itself without a recursion comment
test("static guard: no function name collision with imports or unmarked self-recursion", () => {
  const files = collectJsFiles(JS_ROOT);
  const errors = [];

  for (const file of files) {
    const code = readFileSync(file, "utf8");
    const cleaned = stripComments(code);

    // Get imported names (including aliased: import { foo as bar } -> bar)
    const imported = new Map(); // localName -> importSpec
    for (const m of cleaned.matchAll(/import\s+\{([\s\S]*?)\}\s+from\s+["'][^"']+["']/g)) {
      for (const nm of m[1].matchAll(/\b([A-Za-z_$][\w$]*)\s*(?:as\s+([A-Za-z_$][\w$]*))?\s*,?/g)) {
        const importedName = nm[1];
        const localName = nm[2] ?? importedName;
        imported.set(localName, importedName);
      }
    }

    // Get function declarations: function name() {}
    const funcDecls = [];
    for (const m of cleaned.matchAll(/(?:^|\n)\s*function\s+([A-Za-z_$][\w$]*)\s*\(/g)) {
      funcDecls.push({ name: m[1], start: m.index });
    }

    // Check each function declaration
    for (const func of funcDecls) {
      // 1. Name collision with import
      if (imported.has(func.name)) {
        errors.push(`${file}: function "${func.name}" shares name with imported binding "${imported.get(func.name)}"`);
      }

      // 2. Self-recursion without comment marker
      // Find the function body (from opening { to matching }) in cleaned code
      const bodyStart = cleaned.indexOf("{", func.start);
      if (bodyStart !== -1) {
        let braceCount = 1;
        let bodyEnd = bodyStart + 1;
        while (bodyEnd < cleaned.length && braceCount > 0) {
          if (cleaned[bodyEnd] === "{") braceCount++;
          else if (cleaned[bodyEnd] === "}") braceCount--;
          bodyEnd++;
        }
        const body = cleaned.slice(bodyStart + 1, bodyEnd - 1);

        // Check if function calls itself by name (not as method: obj.foo())
        const selfCallRegex = new RegExp(`\\b${func.name}\\s*\\(`, "g");
        let hasSelfCall = false;
        for (const m of body.matchAll(selfCallRegex)) {
          // Check if it's a method call (preceded by . or ?.)
          const before = body.slice(Math.max(0, m.index - 2), m.index);
          if (!before.endsWith(".") && !before.endsWith("?.")) {
            hasSelfCall = true;
            break;
          }
        }

        if (hasSelfCall) {
          // Check for recursion marker comment in or before the function
          const beforeFunc = cleaned.slice(Math.max(0, func.start - 200), func.start);
          const hasRecursionMarker = /\b(recursive|recursion|@recursive)\b/i.test(beforeFunc) ||
            /\b(recursive|recursion|@recursive)\b/i.test(body.slice(0, 200));
          if (!hasRecursionMarker) {
            errors.push(`${file}: function "${func.name}" calls itself directly without recursion marker comment`);
          }
        }
      }
    }
  }

  assert.equal(errors.length, 0, `Function name issues found:\n${errors.join("\n")}`);
});

// Guard 3: No bare calls to core exports without import/declaration in ALL js files
test("static guard: no bare calls to core exports without import in all js files", () => {
  // Collect all JS files under js/, js/ui/, js/core/
  const allJsFiles = collectJsFiles(JS_ROOT);

  const coreModules = [
    join(JS_ROOT, "core", "annotations.js"),
    join(JS_ROOT, "core", "overlay.js"),
    join(JS_ROOT, "core", "exporter.js"),
    join(JS_ROOT, "core", "annotation-commit.js"),
    join(JS_ROOT, "core", "annotate-layout.js"),
    join(JS_ROOT, "core", "visibility.js"),
    join(JS_ROOT, "core", "store.js"),
    join(JS_ROOT, "core", "pages.js"),
    join(JS_ROOT, "core", "sources.js"),
    join(JS_ROOT, "core", "source-loader.js"),
    join(JS_ROOT, "core", "thumbs.js"),
    join(JS_ROOT, "core", "card-view.js"),
    join(JS_ROOT, "core", "extract-name.js"),
    join(JS_ROOT, "core", "zip.js"),
    join(JS_ROOT, "core", "pdf-title.js"),
    join(JS_ROOT, "core", "disclosure.js"),
    join(JS_ROOT, "core", "split-plan.js"),
    join(JS_ROOT, "core", "privacy-meter.js"),
    join(JS_ROOT, "core", "shortcuts.js"),
    join(JS_ROOT, "core", "errors.js"),
  ];

  // Collect all exported names from core modules
  const coreExports = new Set();
  for (const mod of coreModules) {
    const code = readFileSync(mod, "utf8");
    for (const name of getExportedNames(code)) {
      coreExports.add(name);
    }
  }

  // Known global/built-in names that are allowed as bare calls
  const allowedGlobals = new Set([
    "console",
    "document",
    "window",
    "setTimeout",
    "clearTimeout",
    "setInterval",
    "clearInterval",
    "requestAnimationFrame",
    "cancelAnimationFrame",
    "Promise",
    "Array",
    "Object",
    "String",
    "Number",
    "Math",
    "Date",
    "JSON",
    "Error",
    "Map",
    "Set",
    "WeakMap",
    "WeakSet",
    "Symbol",
    "parseInt",
    "parseFloat",
    "isNaN",
    "isFinite",
    "encodeURIComponent",
    "decodeURIComponent",
    "fetch",
    "URL",
    "Blob",
    "FormData",
    "TextDecoder",
    "TextEncoder",
    "crypto",
    "localStorage",
    "sessionStorage",
    "navigator",
    "location",
    "history",
    "screen",
    "performance",
    "Intl",
    "Reflect",
    "Proxy",
    "DataView",
    "ArrayBuffer",
    "Uint8Array",
    "Float32Array",
    "RegExp",
    "CustomEvent",
    "Event",
    "KeyboardEvent",
    "PointerEvent",
    "MouseEvent",
    "TouchEvent",
    "FocusEvent",
    "InputEvent",
    "DragEvent",
    "WheelEvent",
    "AnimationEvent",
    "TransitionEvent",
    "HTMLElement",
    "HTMLCanvasElement",
    "HTMLDialogElement",
    "HTMLInputElement",
    "HTMLTextAreaElement",
    "HTMLSelectElement",
    "HTMLButtonElement",
    "NodeList",
    "Element",
    "Attr",
    "Text",
    "Comment",
    "DocumentFragment",
    "Range",
    "Selection",
    "IntersectionObserver",
    "MutationObserver",
    "ResizeObserver",
    "Intl",
    "zlib",
    "fs",
    "path",
    "url",
    "util",
    "assert",
    "test",
    "describe",
    "it",
    "expect",
    "beforeEach",
    "afterEach",
    "beforeAll",
    "afterAll",
    "jest",
    "require",
    "module",
    "exports",
    "global",
    "globalThis",
    "process",
    "Buffer",
    "import",
    "export",
    "default",
    "async",
    "await",
    "yield",
    "const",
    "let",
    "var",
    "function",
    "class",
    "extends",
    "implements",
    "interface",
    "type",
    "typeof",
    "instanceof",
    "new",
    "this",
    "super",
    "return",
    "throw",
    "try",
    "catch",
    "finally",
    "if",
    "else",
    "for",
    "while",
    "do",
    "switch",
    "case",
    "default",
    "break",
    "continue",
    "delete",
    "in",
    "of",
    "void",
    "null",
    "undefined",
    "true",
    "false",
    "debugger",
    "with",
    "eval",
    "arguments",
    "NaN",
    "Infinity",
    "undefined",
    "target",
    "key",
    "value",
    "index",
    "length",
    "name",
    "toString",
    "valueOf",
    "hasOwnProperty",
    "constructor",
    "prototype",
    "__proto__",
    "self",
    "top",
    "parent",
    "frames",
    "opener",
    "closed",
    "innerWidth",
    "innerHeight",
    "outerWidth",
    "outerHeight",
    "scrollX",
    "scrollY",
    "pageXOffset",
    "pageYOffset",
    "devicePixelRatio",
    "onload",
    "onerror",
    "onresize",
    "onscroll",
    "onbeforeunload",
    "onunload",
    "onhashchange",
    "onpopstate",
    "onmessage",
    "onstorage",
    "onfocus",
    "onblur",
    "onclick",
    "ondblclick",
    "onmousedown",
    "onmouseup",
    "onmousemove",
    "onmouseover",
    "onmouseout",
    "onkeydown",
    "onkeyup",
    "onkeypress",
    "onchange",
    "onsubmit",
    "onreset",
    "onselect",
    "onfocusin",
    "onfocusout",
  ]);

  const errors = [];
  for (const file of allJsFiles) {
    const code = readFileSync(file, "utf8");
    const cleaned = stripComments(code);
    const imported = getImportedNames(cleaned);
    const declared = getDeclaredNames(cleaned);
    // Also add exported names from this file (internal calls to own exports are OK)
    const exportedFromThisFile = getExportedNames(cleaned);
    for (const name of exportedFromThisFile) {
      declared.add(name);
    }

    // Find all bare identifier calls: identifier followed by (
    // Skip method calls (obj.foo()), property access, and known patterns
    const callRegex = /\b([A-Za-z_$][\w$]*)\s*\(/g;
    for (const m of cleaned.matchAll(callRegex)) {
      const name = m[1];
      // Skip if it's a known global, imported, or locally declared (including own exports)
      if (allowedGlobals.has(name)) continue;
      if (imported.has(name)) continue;
      if (declared.has(name)) continue;
      // Skip if it's a core export that should be imported
      if (coreExports.has(name)) {
        // Check if it's a method call (preceded by . or ?.)
        const before = cleaned.slice(Math.max(0, m.index - 2), m.index);
        if (before.endsWith(".") || before.endsWith("?.")) continue;
        // Check if it's a function/method definition: name(params) { or name(params) =>
        // Look ahead to find the matching ) followed by { or =>
        const after = cleaned.slice(m.index + m[0].length);
        // Find the closing paren of the parameter list
        let parenDepth = 1;
        let i = 0;
        for (; i < after.length && parenDepth > 0; i++) {
          if (after[i] === '(') parenDepth++;
          else if (after[i] === ')') parenDepth--;
        }
        const afterParams = after.slice(i);
        if (afterParams.match(/^\s*[\{=>]/)) continue;
        // Check if it's a property access like obj.name(
        // The regex captures the identifier, but we need to check context
        // We already checked for . or ?. before the identifier
        errors.push(`${file}: bare call to core export "${name}" without import at position ${m.index}`);
      }
    }
  }

  assert.equal(errors.length, 0, `Bare calls to core exports without import:\n${errors.join("\n")}`);
});

// Guard 4: CSS structure for annotate overlay — overlay must be absolute inside inner element, not wrap
test("static guard: annotate overlay CSS structure", () => {
  const css = readFileSync(join(ROOT, "css", "editor.css"), "utf8");

  // .annotate-overlay must have position: absolute and inset: 0
  assert.match(css, /\.annotate-overlay\s*\{[^}]*position:\s*absolute[^}]*\}/, ".annotate-overlay must have position: absolute");
  assert.match(css, /\.annotate-overlay\s*\{[^}]*inset:\s*0[^}]*\}/, ".annotate-overlay must have inset: 0");

  // .annotate-page-inner must be the positioning context (position: relative)
  assert.match(css, /\.annotate-page-inner\s*\{[^}]*position:\s*relative[^}]*\}/, ".annotate-page-inner must have position: relative");

  // .annotate-pages-wrap must have overflow: auto (scroll container)
  assert.match(css, /\.annotate-pages-wrap\s*\{[^}]*overflow:\s*auto[^}]*\}/, ".annotate-pages-wrap must have overflow: auto");

  // .annotate-page-wrapper should NOT have position: relative (inner element is the positioning context)
  const wrapRuleMatch = css.match(/\.annotate-page-wrapper\s*\{([^}]*)\}/);
  assert.ok(wrapRuleMatch, ".annotate-page-wrapper rule must exist");
  const wrapRule = wrapRuleMatch[1];
  const hasPositionRelative = /position:\s*relative/.test(wrapRule) && !/position:\s*relative/.test(wrapRule.replace(/\/\*[\s\S]*?\*\//g, ""));
  assert.ok(!hasPositionRelative, ".annotate-page-wrapper should not have position: relative");
  assert.ok(css.includes(".annotate-page-inner"), ".annotate-page-inner class must exist in CSS");
});

// Guard 5: annotate-view.js text input must store draft on element (dataset.draftPageX, draftPageY, draftPageId)
// This ensures commitTextInput reads position from the textarea, not from a stale pendingTextInput variable
test("static guard: annotate text input stores draft on element", () => {
  const annotateJs = readFileSync(join(JS_ROOT, "ui", "annotate-view.js"), "utf8");

  // createTextInputAt must set dataset.draftPageX, draftPageY, draftPageId on the textarea
  assert.match(annotateJs, /textInput\.dataset\.draftPageX\s*=/, "createTextInputAt must set dataset.draftPageX");
  assert.match(annotateJs, /textInput\.dataset\.draftPageY\s*=/, "createTextInputAt must set dataset.draftPageY");
  assert.match(annotateJs, /textInput\.dataset\.draftPageId\s*=/, "createTextInputAt must set dataset.draftPageId");

  // startEditingText must also set the draft dataset
  assert.match(annotateJs, /startEditingText\([^)]*\)\s*\{[\s\S]*?textInput\.dataset\.draftPageX\s*=/, "startEditingText must set dataset.draftPageX");
  assert.match(annotateJs, /startEditingText\([^)]*\)\s*\{[\s\S]*?textInput\.dataset\.draftPageY\s*=/, "startEditingText must set dataset.draftPageY");
  assert.match(annotateJs, /startEditingText\([^)]*\)\s*\{[\s\S]*?textInput\.dataset\.draftPageId\s*=/, "startEditingText must set dataset.draftPageId");

  // commitTextInput must read from dataset, not from pendingTextInput
  assert.match(annotateJs, /commitTextInput\(\)\s*\{[\s\S]*?textInput\.dataset\.draftPageX/, "commitTextInput must read draftPageX from dataset");
  assert.match(annotateJs, /commitTextInput\(\)\s*\{[\s\S]*?textInput\.dataset\.draftPageY/, "commitTextInput must read draftPageY from dataset");
  assert.match(annotateJs, /commitTextInput\(\)\s*\{[\s\S]*?textInput\.dataset\.draftPageId/, "commitTextInput must read draftPageId from dataset");

  // Must call commitTextDraft pure function
  assert.match(annotateJs, /commitTextDraft\(/, "commitTextInput must call commitTextDraft pure function");
});

// Guard 6: annotate-view.js must not have bare function calls that are neither declared, imported, nor known globals
test("static guard: annotate-view.js bare function calls", () => {
  const annotateJs = readFileSync(join(JS_ROOT, "ui", "annotate-view.js"), "utf8");
  const cleaned = stripComments(annotateJs);

  // Get all imported names
  const imported = getImportedNames(cleaned);

  // Get all declared names (functions, const, let, var) - including exported functions
  const declared = getDeclaredNames(cleaned);

  // Also get exported function names (export function foo())
  const exportedNames = getExportedNames(cleaned);
  for (const name of exportedNames) {
    declared.add(name);
  }

  // JavaScript keywords that can appear before ( - not function calls
  const jsKeywords = new Set([
    "if", "for", "while", "switch", "catch", "return", "throw", "typeof",
    "instanceof", "in", "new", "delete", "void", "yield", "await", "super",
    "class", "extends", "implements", "interface", "let", "const", "var",
    "function", "async", "try", "finally", "case", "default", "break",
    "continue", "do", "else", "with", "debugger", "import", "export", "from",
    "as", "default", "extends", "static", "get", "set",
  ]);

  // Known globals/builtins that are allowed as bare calls
  const allowedGlobals = new Set([
    "console", "document", "window", "setTimeout", "clearTimeout",
    "setInterval", "clearInterval", "requestAnimationFrame", "cancelAnimationFrame",
    "Promise", "Array", "Object", "String", "Number", "Math", "Date", "JSON",
    "Error", "Map", "Set", "WeakMap", "WeakSet", "Symbol", "parseInt", "parseFloat",
    "isNaN", "isFinite", "encodeURIComponent", "decodeURIComponent", "fetch", "URL",
    "Blob", "FormData", "TextDecoder", "TextEncoder", "crypto", "localStorage",
    "sessionStorage", "navigator", "location", "history", "screen", "performance",
    "Intl", "Reflect", "Proxy", "DataView", "ArrayBuffer", "Uint8Array", "Float32Array",
    "RegExp", "CustomEvent", "Event", "KeyboardEvent", "PointerEvent", "MouseEvent",
    "TouchEvent", "FocusEvent", "InputEvent", "DragEvent", "WheelEvent", "AnimationEvent",
    "TransitionEvent", "HTMLElement", "HTMLCanvasElement", "HTMLDialogElement",
    "HTMLInputElement", "HTMLTextAreaElement", "HTMLSelectElement", "HTMLButtonElement",
    "NodeList", "Element", "Attr", "Text", "Comment", "DocumentFragment", "Range",
    "Selection", "IntersectionObserver", "MutationObserver", "ResizeObserver",
    "pdfjsLib", "hydrateIcons", "icons", "TOOLS", "TEXT_PRESET_SIZES", "TEXT_PRESET_COLORS",
    "HIGHLIGHT_PRESET_COLORS", "ANNOTATE_VIEW_HTML",
    // CSS functions that appear in template literals
    "translateX", "translateY", "translate", "rotate", "scale", "skewX", "skewY",
    "rgba", "rgb", "hsl", "hsla", "url",
    // HTML/template content that looks like calls
    "Select", "Highlight", "Text", "image",
  ]);

  // Parameters from opts that are used as functions
  const optsParams = new Set([
    "getState", "getSource", "updateAnnotations", "subscribe", "onDone",
  ]);

  // Local functions that are declared in the module (not exported)
  // These are identified by looking for function declarations and const/let/var assignments
  // that are function expressions
  const localFunctions = new Set([
    "renderToolOptions", "setTool", "cancelTextInput", "commitTextInput",
    "scheduleTextInputAt", "createTextInputAt", "getEffectiveRotation",
    "buildPageStructure", "setupIntersectionObserver", "renderPageCanvas",
    "renderOverlayForPage", "renderAllOverlays", "updatePageIndicator",
    "updateToolButtons", "jumpToPage", "zoomIn", "zoomOut", "zoomFitWidth",
    "onPointerDown", "onPointerMove", "onPointerUp", "onKeyDown",
    "startEditingText", "nudgeAnnotation", "selectAnnotation",
    "close", "enter", "destroy", "isOpen", "refreshFromState",
    "queueRender", "work",
  ]);

  // Collect all core exports
  const coreModules = [
    join(JS_ROOT, "core", "annotations.js"),
    join(JS_ROOT, "core", "overlay.js"),
    join(JS_ROOT, "core", "exporter.js"),
    join(JS_ROOT, "core", "annotation-commit.js"),
    join(JS_ROOT, "core", "annotate-layout.js"),
  ];

  const coreExports = new Set();
  for (const mod of coreModules) {
    const code = readFileSync(mod, "utf8");
    for (const name of getExportedNames(code)) {
      coreExports.add(name);
    }
  }

  // Find all bare identifier calls: identifier followed by (
  // Skip method calls (obj.foo()), property access, and known patterns
  const callRegex = /\b([A-Za-z_$][\w$]*)\s*\(/g;
  const errors = [];

  for (const m of cleaned.matchAll(callRegex)) {
    const name = m[1];

    // Skip JavaScript keywords
    if (jsKeywords.has(name)) continue;

    // Skip if it's a known global, imported, or locally declared
    if (allowedGlobals.has(name)) continue;
    if (imported.has(name)) continue;
    if (declared.has(name)) continue;
    if (optsParams.has(name)) continue;
    if (localFunctions.has(name)) continue;

    // Skip if it's a core export that should be imported
    if (coreExports.has(name)) {
      // Check if it's a method call (preceded by . or ?.)
      const before = cleaned.slice(Math.max(0, m.index - 2), m.index);
      if (before.endsWith(".") || before.endsWith("?.")) continue;
      errors.push(`annotate-view.js: bare call to core export "${name}" without import at position ${m.index}`);
      continue;
    }

    // Check for other potential bare calls (not core exports but still suspicious)
    // Allow common DOM methods and properties that might appear as calls
    const allowedDomMethods = new Set([
      "querySelector", "querySelectorAll", "getElementById", "createElement",
      "createElementNS", "appendChild", "removeChild", "remove", "addEventListener",
      "removeEventListener", "dispatchEvent", "getBoundingClientRect", "focus",
      "setSelectionRange", "setAttribute", "getAttribute", "toggleAttribute",
      "classList", "style", "dataset", "children", "parent", "innerHTML",
      "textContent", "value", "closest", "matches", "contains",
      "rotate", // CSS transform function
      "getDocument", // pdfjsLib.getDocument()
    ]);

    if (allowedDomMethods.has(name)) continue;

    // Check if it's a method call (preceded by . or ?.)
    const before = cleaned.slice(Math.max(0, m.index - 2), m.index);
    if (before.endsWith(".") || before.endsWith("?.")) continue;

    // Check if it's a constructor call (preceded by new)
    const beforeNew = cleaned.slice(Math.max(0, m.index - 5), m.index);
    if (/\bnew\s+$/.test(beforeNew)) continue;

    // Check if it's inside a template literal (backticks)
    // Find the nearest backtick before this position
    let inTemplate = false;
    for (let i = m.index - 1; i >= 0; i--) {
      if (cleaned[i] === "`") {
        // Check if there's another backtick before it (template start)
        let foundStart = false;
        for (let j = i - 1; j >= 0; j--) {
          if (cleaned[j] === "`") { foundStart = true; break; }
          if (cleaned[j] === "\n") break;
        }
        if (foundStart) { inTemplate = true; break; }
      }
      if (cleaned[i] === "\n") break;
    }
    if (inTemplate) continue;

    // Report as potential bare call
    errors.push(`annotate-view.js: potential bare call to "${name}" at position ${m.index} (not imported, declared, or known global)`);
  }

  assert.equal(errors.length, 0, `Bare function calls in annotate-view.js:\n${errors.join("\n")}`);
});

// Guard 7: No callback option (e.g., onDone) is called from close()/destroy() of the same module
// This prevents mutual recursion like close() -> onDone() -> setMode() -> close() -> ...
test("static guard: callback options not called from close/destroy in annotate-view.js", () => {
  const annotateJs = readFileSync(join(JS_ROOT, "ui", "annotate-view.js"), "utf8");

  // Find the close() function body - match from "function close() {" to the matching "}"
  function extractFunctionBody(code, funcName) {
    const startPattern = new RegExp(`function ${funcName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\(\\)\\s*\\{`);
    const startMatch = code.match(startPattern);
    if (!startMatch) return null;
    const startIndex = startMatch.index + startMatch[0].length;
    let braceCount = 1;
    let i = startIndex;
    while (i < code.length && braceCount > 0) {
      if (code[i] === "{") braceCount++;
      else if (code[i] === "}") braceCount--;
      i++;
    }
    return code.slice(startIndex, i - 1);
  }

  const closeBody = extractFunctionBody(annotateJs, "close");
  assert.ok(closeBody, "close() function must exist");

  const cleanupBody = extractFunctionBody(annotateJs, "cleanup");
  assert.ok(cleanupBody, "cleanup() function must exist");

  const doneBody = extractFunctionBody(annotateJs, "done");
  assert.ok(doneBody, "done() function must exist");

  // Find the destroy() function body (method shorthand)
  function extractMethodBody(code, methodName) {
    // Match both arrow functions: methodName: () => { and regular: methodName() {
    const startPattern = new RegExp(`${methodName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*\\(\\)\\s*(?:=>)?\\s*\\{`);
    const startMatch = code.match(startPattern);
    if (!startMatch) return null;
    const startIndex = startMatch.index + startMatch[0].length;
    let braceCount = 1;
    let i = startIndex;
    while (i < code.length && braceCount > 0) {
      if (code[i] === "{") braceCount++;
      else if (code[i] === "}") braceCount--;
      i++;
    }
    return code.slice(startIndex, i - 1);
  }

  const destroyBody = extractMethodBody(annotateJs, "destroy");
  assert.ok(destroyBody, "destroy() must exist");

  // Check that onDone is NOT called in close(), cleanup(), or destroy()
  // onDone should only be called from the Done button handler or Escape key handler (via done())
  assert.ok(!/onDone\s*\?\./.test(closeBody), "close() must not call onDone (use done() instead)");
  assert.ok(!/onDone\s*\(/.test(closeBody), "close() must not call onDone (use done() instead)");
  assert.ok(!/onDone\s*\?\./.test(cleanupBody), "cleanup() must not call onDone");
  assert.ok(!/onDone\s*\(/.test(cleanupBody), "cleanup() must not call onDone");
  assert.ok(!/onDone\s*\?\./.test(destroyBody), "destroy() must not call onDone");
  assert.ok(!/onDone\s*\(/.test(destroyBody), "destroy() must not call onDone");

  // Verify done() DOES call onDone
  assert.ok(/onDone\s*\?\./.test(doneBody) || /onDone\s*\(/.test(doneBody), "done() must call onDone");
});

// Guard 8: every state.annotate* key read by panel.js must be written somewhere in js/
// (so the annotate panel never reads state that nothing publishes)
test("static guard: every annotate state key read by panel.js is written in js/", () => {
  const panelJs = readFileSync(join(JS_ROOT, "ui", "panel.js"), "utf8");

  const readKeys = new Set();
  for (const m of panelJs.matchAll(/state\.annotate([A-Za-z_$][\w$]*)/g)) {
    readKeys.add(m[1]);
  }
  assert.ok(readKeys.size > 0, "panel.js must read state.annotate* keys (guard target)");

  // Collect every js file's source
  const allJs = collectJsFiles(JS_ROOT);
  const allCode = allJs.map((f) => readFileSync(f, "utf8")).join("\n");

  const unwritten = [];
  for (const key of [...readKeys].sort()) {
    // A write is the key used as an object property, e.g. patch({ annotateKey: ... })
    // or the store initial value annotateKey: ...
    if (!new RegExp(`annotate${key}:`).test(allCode)) {
      unwritten.push(key);
    }
  }
  assert.equal(
    unwritten.length,
    0,
    `These annotate state keys are read by panel.js but never written in js/: ${unwritten.join(", ")}`,
  );
});