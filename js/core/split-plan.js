// Split planning: pure logic, no DOM, no store.
// part = { start, end }, both 1-based and inclusive page positions.

// Max parts per split job: guards against runaway downloads.
const MAX_PARTS = 500;

function parseCustomRanges(text, pageCount) {
  if (!text || !text.trim()) {
    return { parts: null, error: "Enter page ranges, for example 1-3, 5, 8-end." };
  }
  const parts = [];
  for (const raw of text.split(",")) {
    const part = raw.trim();
    if (!part) return { parts: null, error: "Empty range between commas." };
    let start, end;
    const range = /^(\d+)\s*-\s*(\d+|end)$/.exec(part);
    if (range) {
      start = Number(range[1]);
      end = range[2] === "end" ? pageCount : Number(range[2]);
    } else {
      const single = /^(\d+)$/.exec(part);
      if (!single) return { parts: null, error: `Unrecognisable range "${part}". Use 1-3, 5, 8-end.` };
      start = end = Number(single[1]);
    }
    if (start < 1 || end > pageCount) {
      return { parts: null, error: `Range ${start}-${end} is outside the document (1-${pageCount}).` };
    }
    if (start > end) return { parts: null, error: `Range ${start}-${end} starts after it ends.` };
    parts.push({ start, end });
  }
  return { parts, error: undefined };
}

// mode: "every" (split every N pages), "custom" (comma-separated ranges),
// or "onePerPage" (one file per page).
// options.every = pages per part; options.ranges = custom ranges text.
export function planSplit(mode, pageCount, options = {}) {
  if (pageCount <= 0) return { parts: [], error: undefined };
  let parts;
  if (mode === "every") {
    const n = Number(options.every);
    if (!Number.isFinite(n) || n < 1 || n % 1 !== 0) {
      return { parts: null, error: "Enter a whole number of pages of 1 or more." };
    }
    parts = [];
    for (let start = 1; start <= pageCount; start += n) {
      parts.push({ start, end: Math.min(start + n - 1, pageCount) });
    }
  } else if (mode === "onePerPage") {
    parts = [];
    for (let i = 1; i <= pageCount; i++) {
      parts.push({ start: i, end: i });
    }
  } else {
    const parsed = parseCustomRanges(options.ranges, pageCount);
    if (parsed.error) return { parts: null, error: parsed.error };
    parts = parsed.parts;
  }
  if (parts.length > MAX_PARTS) {
    return { parts: null, error: `That would create ${parts.length} parts — more than the ${MAX_PARTS} limit.` };
  }
  return { parts, error: undefined };
}

// Format a part for the ZIP entry name.
// Zero-padded to the width of the part count, at least 2 digits.
// Single pages: "page-N", ranges: "pages-A-B".
export function formatPartName(docName, partIndex, partCount, part) {
  const pad = String(partCount).length;
  const num = String(partIndex).padStart(Math.max(2, pad), "0");
  const suffix = part.start === part.end
    ? `page-${part.start}`
    : `pages-${part.start}-${part.end}`;
  return `${docName}-part-${num}-${suffix}.pdf`;
}

// Format the ZIP file name.
export function formatZipName(docName) {
  return `${docName}-split.zip`;
}