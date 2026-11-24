// Store-only ZIP writer: local file headers (sizes known up front, so no data
// descriptors), a central directory and an end-of-central-directory record.
// No compression (method 0): every file already lives in this tab's memory,
// so zipping is just bundling, and unzipping anywhere needs no special codec.
//
// Limits: entries larger than ~3.5 GB in total are rejected (no ZIP64).
// Names are UTF-8 with the UTF-8 flag (bit 0x800) set when needed.

const LOCAL = 0x04034b50;  // "PK\x03\x04"
const CENTRAL = 0x02014b50; // "PK\x01\x02"
const END = 0x06054b50;     // "PK\x05\x06"
const GB_LIMIT = 3.5 * 1024 * 1024 * 1024;

// CRC-32, IEEE 802.3 polynomial, table built once.
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  crcTable[n] = c;
}
function crc32(data) {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = (crc >>> 8) ^ crcTable[(crc ^ data[i]) & 0xff];
  return crc ^ 0xffffffff;
}

// Fixed DOS date/time: 1980-01-01 00:00:00.
const DOS_DATE = 0x0021; // day 1, month 1, year 1980
const DOS_TIME = 0x0000;

function writeUint32(view, offset, value) { view.setUint32(offset, value, true); }
function writeUint16(view, offset, value) { view.setUint16(offset, value, true); }

export function writeZip(entries) {
  // entries: { name: string, bytes: Uint8Array }[]
  let total = 0;
  for (const entry of entries) total += entry.bytes.byteLength;
  if (total > GB_LIMIT) throw new Error("ZIP is too large (over 3.5 GB uncompressed).");

  const parts = [];      // ArrayBuffers and Uint8Arrays, in file order
  let offset = 0;
  const central = [];    // { name, flags, crc, size, localOffset }

  for (const entry of entries) {
    const name = new TextEncoder().encode(entry.name);
    const data = entry.bytes;
    const crc = crc32(data);
    const flags = /[^\x00-\x7f]/.test(new TextDecoder("latin1").decode(name)) ? 0x0800 : 0;

    const localHeader = new ArrayBuffer(30);
    const lh = new DataView(localHeader);
    writeUint32(lh, 0, LOCAL);
    writeUint16(lh, 4, 20); // version needed to extract
    writeUint16(lh, 6, flags);
    writeUint16(lh, 8, 0); // method 0 = stored
    writeUint16(lh, 10, DOS_TIME);
    writeUint16(lh, 12, DOS_DATE);
    writeUint32(lh, 14, crc);
    writeUint32(lh, 18, data.byteLength);
    writeUint32(lh, 22, data.byteLength);
    writeUint16(lh, 26, name.byteLength);
    writeUint16(lh, 28, 0);

    parts.push(localHeader, name, data);
    central.push({ name, flags, crc, size: data.byteLength, localOffset: offset });
    offset += 30 + name.byteLength + data.byteLength;
  }

  const centralParts = [];
  let centralOffset = 0;
  for (const entry of central) {
    const ch = new ArrayBuffer(46);
    const cv = new DataView(ch);
    writeUint32(cv, 0, CENTRAL);
    writeUint16(cv, 4, 20); // version made by
    writeUint16(cv, 6, 20); // version needed to extract
    writeUint16(cv, 8, entry.flags);
    writeUint16(cv, 10, 0);
    writeUint16(cv, 12, DOS_TIME);
    writeUint16(cv, 14, DOS_DATE);
    writeUint32(cv, 16, entry.crc);
    writeUint32(cv, 20, entry.size);
    writeUint32(cv, 24, entry.size);
    writeUint16(cv, 28, entry.name.byteLength);
    writeUint16(cv, 30, 0);
    writeUint16(cv, 32, 0);
    writeUint16(cv, 34, 0);
    writeUint16(cv, 36, 0);
    writeUint32(cv, 38, 0); // internal attributes
    writeUint32(cv, 42, entry.localOffset);
    centralParts.push(ch, entry.name);
    centralOffset += 46 + entry.name.byteLength;
  }

  const eocd = new ArrayBuffer(22);
  const ev = new DataView(eocd);
  writeUint32(ev, 0, END);
  writeUint16(ev, 4, 0);
  writeUint16(ev, 6, 0);
  writeUint16(ev, 8, central.length);
  writeUint16(ev, 10, central.length);
  writeUint32(ev, 12, centralOffset);
  writeUint32(ev, 16, offset);
  writeUint16(ev, 20, 0);

  const out = new Uint8Array(offset + centralOffset + 22);
  let written = 0;
  for (const part of [...parts, ...centralParts, eocd]) {
    out.set(new Uint8Array(part), written);
    written += part.byteLength;
  }
  return out;
}
