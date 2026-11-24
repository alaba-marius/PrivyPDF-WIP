// Store-only ZIP writer: CRC-32, local headers, central directory, EOCD.
// Verifies the written ZIP by parsing it back — no browser.
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeZip } from "../js/core/zip.js";

const LOCAL = 0x04034b50;
const CENTRAL = 0x02014b50;
const END = 0x06054b50;

function u32(buf, off) { return new DataView(buf.buffer, buf.byteOffset + off, 4).getUint32(0, true); }
function u16(buf, off) { return new DataView(buf.buffer, buf.byteOffset + off, 2).getUint16(0, true); }

// Parse the produced ZIP back into { entries: [{name, data}], centralCount, eocd }.
function parseZip(bytes) {
  const entries = [];
  let i = 0;
  // Local headers: walk until a central directory signature.
  while (i + 4 <= bytes.length && u32(bytes, i) === LOCAL) {
    const nameLen = u16(bytes, i + 26);
    const extraLen = u16(bytes, i + 28);
    const dataLen = u32(bytes, i + 18);
    const dataStart = i + 30 + nameLen + extraLen;
    entries.push({
      name: new TextDecoder().decode(bytes.subarray(i + 30, i + 30 + nameLen)),
      data: bytes.subarray(dataStart, dataStart + dataLen),
      crc: u32(bytes, i + 14),
    });
    i = dataStart + dataLen;
  }
  // Central directory.
  const central = [];
  while (i + 4 <= bytes.length && u32(bytes, i) === CENTRAL) {
    const nameLen = u16(bytes, i + 28);
    const localOffset = u32(bytes, i + 42);
    central.push({ nameLen, localOffset });
    i += 46 + nameLen;
  }
  // EOCD.
  const eocdSig = u32(bytes, i);
  const eocd = {
    sig: eocdSig,
    count: u16(bytes, i + 8),
    centralSize: u32(bytes, i + 12),
    centralOffset: u32(bytes, i + 16),
  };
  return { entries, central, eocd };
}

test("writeZip produces a parseable ZIP with local headers, central directory and EOCD", () => {
  const bytes = writeZip([
    { name: "part-1.pdf", bytes: new Uint8Array([1, 2, 3]) },
    { name: "part-2.pdf", bytes: new Uint8Array([4, 5]) },
  ]);
  const { entries, central, eocd } = parseZip(bytes);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].name, "part-1.pdf");
  assert.deepStrictEqual([...entries[0].data], [1, 2, 3]);
  assert.equal(entries[1].name, "part-2.pdf");
  assert.deepStrictEqual([...entries[1].data], [4, 5]);
  assert.equal(central.length, 2);
  assert.equal(eocd.sig, END);
  assert.equal(eocd.count, 2);
  assert.ok(eocd.centralOffset <= bytes.length);
});

test("writeZip local header CRC, sizes and name length match the entry", () => {
  const data = new TextEncoder().encode("hello world");
  const bytes = writeZip([{ name: "a.txt", bytes: data }]);
  const { entries } = parseZip(bytes);
  assert.equal(entries[0].name, "a.txt");
  assert.equal(entries[0].data.length, data.length);
  assert.deepStrictEqual([...entries[0].data], [...data]);
});

test("writeZip sets the UTF-8 flag for non-ASCII names", () => {
  const bytes = writeZip([{ name: "räpport-小.pdf", bytes: new Uint8Array([9]) }]);
  const { entries } = parseZip(bytes);
  // Flag bit 0x800 lives in local header offset 6 and central offset 8.
  const nameBytes = new TextEncoder().encode("räpport-小.pdf");
  // Find local header.
  let i = 0;
  while (u32(bytes, i) !== LOCAL) i++;
  const localFlags = u16(bytes, i + 6);
  assert.ok((localFlags & 0x0800) !== 0, "UTF-8 flag set in local header");
  assert.equal(new TextDecoder().decode(bytes.subarray(i + 30, i + 30 + nameBytes.length)), "räpport-小.pdf");
});

test("writeZip rejects a total over 3.5 GB", () => {
  // No 3.6 GB allocation: the limit is checked on byteLength before any data
  // is touched, so a bytes-like object with a large byteLength suffices.
  const tooBig = { byteLength: Math.floor(3.5 * 1024 * 1024 * 1024) + 1 };
  assert.throws(() => writeZip([{ name: "big.pdf", bytes: tooBig }]), /3.5 GB/);
});

test("writeZip handles an empty entry list", () => {
  const bytes = writeZip([]);
  const { eocd } = parseZip(bytes);
  assert.equal(eocd.sig, END);
  assert.equal(eocd.count, 0);
});

test("writeZip fixed DOS date and stored method", () => {
  const bytes = writeZip([{ name: "x.pdf", bytes: new Uint8Array([1]) }]);
  let i = 0;
  while (u32(bytes, i) !== LOCAL) i++;
  assert.equal(u16(bytes, i + 8), 0); // method 0 = stored
  assert.equal(u16(bytes, i + 10), 0); // time
  assert.equal(u16(bytes, i + 12), 0x0021); // 1980-01-01
});
