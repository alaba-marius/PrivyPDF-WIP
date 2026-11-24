// Split planning: pure logic, no DOM, no store.
import { test } from "node:test";
import assert from "node:assert/strict";
import { planSplit } from "../js/core/split-plan.js";

test("planSplit every mode: splits into equal parts", () => {
  const result = planSplit("every", 10, { every: 3 });
  assert.deepStrictEqual(result.parts, [
    { start: 1, end: 3 },
    { start: 4, end: 6 },
    { start: 7, end: 9 },
    { start: 10, end: 10 },
  ]);
  assert.equal(result.error, undefined);
});

test("planSplit every mode: whole document when N >= page count", () => {
  const result = planSplit("every", 5, { every: 5 });
  assert.deepStrictEqual(result.parts, [{ start: 1, end: 5 }]);
});

test("planSplit every mode: every 1 page gives one part per page", () => {
  const result = planSplit("every", 4, { every: 1 });
  assert.deepStrictEqual(result.parts, [
    { start: 1, end: 1 }, { start: 2, end: 2 }, { start: 3, end: 3 }, { start: 4, end: 4 },
  ]);
});

test("planSplit every mode: invalid N is rejected", () => {
  assert.equal(planSplit("every", 5, { every: 0 }).error, "Enter a whole number of pages of 1 or more.");
  assert.equal(planSplit("every", 5, { every: 2.5 }).error, "Enter a whole number of pages of 1 or more.");
  assert.equal(planSplit("every", 5, { every: -1 }).error, "Enter a whole number of pages of 1 or more.");
  assert.equal(planSplit("every", 5, { every: "nope" }).error, "Enter a whole number of pages of 1 or more.");
  assert.equal(planSplit("every", 5, {}).error, "Enter a whole number of pages of 1 or more.");
});

test("planSplit custom mode: parses ranges, singles and end", () => {
  const result = planSplit("custom", 10, { ranges: "1-3, 5, 8-end" });
  assert.deepStrictEqual(result.parts, [
    { start: 1, end: 3 },
    { start: 5, end: 5 },
    { start: 8, end: 10 },
  ]);
  assert.equal(result.error, undefined);
});

test("planSplit custom mode: single page range", () => {
  const result = planSplit("custom", 3, { ranges: "2" });
  assert.deepStrictEqual(result.parts, [{ start: 2, end: 2 }]);
});

test("planSplit custom mode: overlap between ranges is allowed", () => {
  const result = planSplit("custom", 5, { ranges: "1-3, 3-5" });
  assert.deepStrictEqual(result.parts, [{ start: 1, end: 3 }, { start: 3, end: 5 }]);
});

test("planSplit custom mode: validation errors", () => {
  assert.equal(planSplit("custom", 5, { ranges: "" }).error, "Enter page ranges, for example 1-3, 5, 8-end.");
  assert.equal(planSplit("custom", 5, { ranges: "1-3,, 5" }).error, "Empty range between commas.");
  assert.equal(planSplit("custom", 5, { ranges: "7-9" }).error, "Range 7-9 is outside the document (1-5).");
  assert.equal(planSplit("custom", 5, { ranges: "0-2" }).error, "Range 0-2 is outside the document (1-5).");
  assert.equal(planSplit("custom", 5, { ranges: "4-2" }).error, "Range 4-2 starts after it ends.");
  assert.equal(planSplit("custom", 5, { ranges: "abc" }).error, 'Unrecognisable range "abc". Use 1-3, 5, 8-end.');
});

test("planSplit custom mode: end means the last page", () => {
  const result = planSplit("custom", 4, { ranges: "3-end" });
  assert.deepStrictEqual(result.parts, [{ start: 3, end: 4 }]);
});

test("planSplit: empty document yields no parts and no error", () => {
  assert.deepStrictEqual(planSplit("every", 0, { every: 1 }), { parts: [], error: undefined });
  assert.deepStrictEqual(planSplit("custom", 0, { ranges: "1" }), { parts: [], error: undefined });
});

test("planSplit: more than 500 parts is rejected", () => {
  const result = planSplit("every", 1000, { every: 1 });
  assert.equal(result.parts, null);
  assert.ok(/more than the 500 limit/.test(result.error));
});
