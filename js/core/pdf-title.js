// Pulls the document's Title entry out of a PDF's raw bytes, for pre-filling
// the metadata title field when a single PDF is opened. The bytes are searched
// as Latin-1 text, so this works on real PDFs without parsing the whole file.
//
// /Title ( ... )        literal string form
// /Title \xfe\xff ...   UTF-16BE string with BOM (PDFDocEncoding marker)
//
// Returns undefined when there is no Title entry. Callers keep the field
// untouched once the user has edited it, so this never overwrites a user title.

const TITLE = /\/Title\s*\(([^)]*)\)/;
// Bytes 0xFE 0xFF (the UTF-16BE BOM) read as Latin-1 become two chars: þÿ.
const BOM = "þÿ";

export function extractTitle(bytes) {
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 65536));
  const match = TITLE.exec(head);
  if (!match) return undefined;
  let title = match[1].replace(/\\(.)/g, (_m, ch) => ch);
  if (title.startsWith(BOM)) {
    const units = title.slice(2);
    const chars = [];
    for (let k = 0; k + 1 < units.length; k += 2) {
      chars.push(String.fromCharCode((units.charCodeAt(k) << 8) | units.charCodeAt(k + 1)));
    }
    title = chars.join("");
  }
  return title.trim() || undefined;
}
