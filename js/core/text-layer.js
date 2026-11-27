// Text layer: per-character text boxes extracted from a pdf.js page, in
// UNROTATED page space (PDF points, origin bottom-left, y up) — the same
// space annotations live in. The page's /Rotate and any zoom/viewport
// transform are deliberately NOT applied here; the geometry module maps
// between page space and screen at every rotation.
//
// A text layer is extracted once per page (keyed by sourceId + page index)
// and cached. Extraction is lazy: it is prefetched when a page enters the
// render window and never blocks pointer handling — if the layer is not
// ready when the pointer goes down, the drag falls back to a free rectangle.

// Characters treated as narrow when splitting a TextItem's width across its
// glyphs. pdf.js reports one width per item; we apportion it across the
// item's characters with these weights so the per-character widths always
// sum to the item width.
const NARROW_CHARS = new Set([
  "i", "l", "j", "t", "f", "r", "I", ".", ",", ";", ":", "'", "|", "!", " ",
]);
const WIDE_CHARS = new Set(["m", "w", "M", "W", "@", "%"]);

function charWeight(ch) {
  if (NARROW_CHARS.has(ch)) return 0.5;
  if (WIDE_CHARS.has(ch)) return 1.5;
  return 1;
}

// Line box around the baseline: from 0.22 * h below it to 0.88 * h above it.
export const TEXT_BOX_BELOW = 0.22;
export const TEXT_BOX_ABOVE = 0.88;

// Two text items belong to the same line when their baselines are within
// this fraction of the font height.
export const LINE_BASELINE_TOLERANCE_RATIO = 0.3;

// Padding (PDF points) around each selection rectangle.
export const TEXT_PADDING = 0.5;

// Pointer snap tolerance (PDF points): a pointer down within this distance
// of a character snaps to that character.
export const TEXT_HIT_TOLERANCE = 4;

// Char: { ch, from, to } — along-baseline extent in page points.
// Line: { dir, from, to, baseline, descent, ascent, chars: Char[] }
//   dir: 0 | 90 | 180 | 270 (angle of the baseline, snapped to right angles)
//   from/to: extent along the baseline direction
//   descent/ascent: perpendicular extent of the line box
// Layer: { lines: Line[] } — lines in reading order (line index = reading order)

function splitWidth(str, totalWidth, start) {
  const chars = str.length ? [...str] : [];
  const weights = chars.map(charWeight);
  const totalWeight = weights.reduce((sum, w) => sum + w, 0) || 1;
  const result = [];
  let pos = start;
  for (let i = 0; i < chars.length; i++) {
    const chWidth = (totalWidth * weights[i]) / totalWeight;
    const end = pos + chWidth;
    result.push({ ch: chars[i], from: pos, to: end });
    pos = end;
  }
  // Guard against float drift: the last character ends exactly at the item end
  // so character widths always sum to the item width.
  if (result.length) result[result.length - 1].to = start + totalWidth;
  return result;
}

function segmentBox(dir, e, f, width, fontHeight) {
  // Text origin (e, f) is the start of the baseline. For dir 180/270 the run
  // extends backward from the origin; for dir 90/270 the baseline is the y axis.
  let start, end, baseline;
  if (dir === 0) { start = e; end = e + width; baseline = f; }
  else if (dir === 180) { start = e - width; end = e; baseline = f; }
  else if (dir === 90) { start = f; end = f + width; baseline = e; }
  else { start = f - width; end = f; baseline = e; } // 270
  return {
    dir,
    start,
    end,
    baseline,
    descent: baseline - TEXT_BOX_BELOW * fontHeight,
    ascent: baseline + TEXT_BOX_ABOVE * fontHeight,
  };
}

function buildLines(segments) {
  // Group by direction
  const groups = { 0: [], 90: [], 180: [], 270: [] };
  for (const seg of segments) groups[seg.dir].push(seg);

  const lines = [];
  for (const dir of [0, 90, 180, 270]) {
    const segs = groups[dir].sort((a, b) => a.baseline - b.baseline);
    let i = 0;
    while (i < segs.length) {
      // Start a new line cluster
      const base = segs[i];
      const cluster = [base];
      let clusterH = base.ascent - base.descent;
      let j = i + 1;
      while (j < segs.length) {
        const seg = segs[j];
        const segH = seg.ascent - seg.descent;
        if (Math.abs(seg.baseline - base.baseline) <= LINE_BASELINE_TOLERANCE_RATIO * Math.max(clusterH, segH)) {
          cluster.push(seg);
          j++;
        } else {
          break;
        }
      }
      i = j;

      // Sort cluster along the baseline and merge touching/overlapping items
      cluster.sort((a, b) => a.start - b.start);
      let line = null;
      for (const seg of cluster) {
        if (!line || seg.start > line.end + 0.01) {
          line = {
            dir: seg.dir,
            from: seg.start,
            to: seg.end,
            baseline: seg.baseline,
            descent: seg.descent,
            ascent: seg.ascent,
            chars: [...seg.chars],
          };
          lines.push(line);
        } else {
          line.to = Math.max(line.to, seg.end);
          line.ascent = Math.max(line.ascent, seg.ascent);
          line.descent = Math.min(line.descent, seg.descent);
          line.chars.push(...seg.chars);
        }
      }
    }
  }

  // Reading order: top-to-bottom lines first, then along the baseline.
  // Within a line, characters stay in the order they were merged.
  lines.sort((a, b) => {
    if (a.dir === 0 || a.dir === 180) {
      // Horizontal lines: higher baseline first (top to bottom)
      if (Math.abs(b.baseline - a.baseline) > 1e-6) return b.baseline - a.baseline;
      return a.dir === 0 ? a.from - b.from : b.from - a.from;
    }
    // Vertical lines: dir 90 reads right-to-left columns, bottom-to-top;
    // dir 270 reads left-to-right columns, top-to-bottom.
    if (a.dir === 90 && b.dir === 90) {
      if (Math.abs(b.baseline - a.baseline) > 1e-6) return b.baseline - a.baseline;
      return a.start - b.start;
    }
    if (a.dir === 270 && b.dir === 270) {
      if (Math.abs(a.baseline - b.baseline) > 1e-6) return a.baseline - b.baseline;
      return a.start - b.start;
    }
    // Different vertical directions rarely share a page; keep a stable order.
    return a.dir - b.dir;
  });

  return lines;
}

export async function extractPageText(pdfjsPage) {
  const content = await pdfjsPage.getTextContent();
  const items = content.items || [];
  const segments = [];

  for (const item of items) {
    const [a, b, c, d, e, f] = item.transform;
    // Direction of the text run from the transform, snapped to right angles.
    // Non-axis-aligned text (curves, arbitrary rotation) is ignored.
    const angle = Math.atan2(b, a) * 180 / Math.PI;
    const snapped = ((Math.round(angle / 90) * 90) % 360 + 360) % 360;
    if (Math.abs(angle - snapped) > 1) continue;

    const width = Number(item.width) || 0;
    if (!width) continue;

    const str = String(item.str || "");
    if (!str) continue;

    // Font height: |d| for horizontal text; for vertical text d is 0 so fall
    // back to the item's reported height.
    const fontHeight = Math.abs(d) || Number(item.height) || 0;
    if (!fontHeight) continue;

    const box = segmentBox(snapped, e, f, width, fontHeight);
    box.chars = splitWidth(str, width, box.start);
    segments.push(box);
  }

  return { lines: buildLines(segments) };
}

export function hitTestText(layer, pagePoint, tolerance = TEXT_HIT_TOLERANCE) {
  if (!layer) return null;
  const { x: px, y: py } = pagePoint;
  let best = null;
  for (let li = 0; li < layer.lines.length; li++) {
    const line = layer.lines[li];
    let inside, along;
    if (line.dir === 0 || line.dir === 180) {
      inside =
        px >= line.from - tolerance && px <= line.to + tolerance &&
        py >= line.descent - tolerance && py <= line.ascent + tolerance;
      along = px;
    } else {
      inside =
        py >= line.from - tolerance && py <= line.to + tolerance &&
        px >= line.descent - tolerance && px <= line.ascent + tolerance;
      along = py;
    }
    if (!inside) continue;

    // Nearest character by along-axis midpoint
    let bestChar = 0;
    let bestDist = Infinity;
    for (let ci = 0; ci < line.chars.length; ci++) {
      const ch = line.chars[ci];
      const mid = (ch.from + ch.to) / 2;
      const dist = Math.abs(along - mid);
      if (dist < bestDist) {
        bestDist = dist;
        bestChar = ci;
      }
    }
    const ch = line.chars[bestChar];
    const mid = (ch.from + ch.to) / 2;
    const candidate = {
      lineIndex: li,
      charIndex: bestChar,
      side: along < mid ? "before" : "after",
      dist: bestDist,
    };
    if (!best || candidate.dist < best.dist) best = candidate;
  }
  return best;
}

function positionCoord(line, pos) {
  const chars = line.chars;
  if (!chars.length) return line.from;
  if (pos.charIndex >= chars.length) return line.to;
  const ch = chars[pos.charIndex];
  return pos.side === "before" ? ch.from : ch.to;
}

function textLineRect(line, a, b) {
  const pad = TEXT_PADDING;
  const x1 = Math.min(a, b) - pad;
  const x2 = Math.max(a, b) + pad;
  const y1 = line.descent - pad;
  const y2 = line.ascent + pad;
  if (line.dir === 0 || line.dir === 180) {
    return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
  }
  // Vertical text: the baseline runs along the y axis, so the box axes swap.
  return { x: y1, y: x1, width: y2 - y1, height: x2 - x1 };
}

// Select the page-space rectangles covered by the selection from startPos to
// endPos (positions are { lineIndex, charIndex, side }). Full-width rects for
// the lines strictly between start and end; partial rects on the end lines.
// Empty (start === end) yields no rect on that line. Rects are returned in
// reading order (line index order).
export function selectionRects(layer, startPos, endPos) {
  if (!layer || !startPos || !endPos) return [];
  let start = startPos;
  let end = endPos;
  // Reading order first: the earlier line anchors the selection.
  if (end.lineIndex < start.lineIndex) [start, end] = [end, start];

  const rects = [];
  for (let li = start.lineIndex; li <= end.lineIndex; li++) {
    const line = layer.lines[li];
    let segStart, segEnd;
    if (li === start.lineIndex && li === end.lineIndex) {
      segStart = positionCoord(line, start);
      segEnd = positionCoord(line, end);
    } else if (li === start.lineIndex) {
      segStart = positionCoord(line, start);
      segEnd = line.to;
    } else if (li === end.lineIndex) {
      segStart = line.from;
      segEnd = positionCoord(line, end);
    } else {
      segStart = line.from;
      segEnd = line.to;
    }
    if (segEnd === segStart) continue; // empty on this line (start and end at the same point)
    if (segEnd < segStart) [segStart, segEnd] = [segEnd, segStart]; // drag direction is irrelevant to the covered range
    rects.push(textLineRect(line, segStart, segEnd));
  }
  return rects;
}

export function createTextLayerCache() {
  const layers = new Map(); // key -> layer (resolved)
  const pending = new Map(); // key -> in-flight promise
  return {
    has(key) {
      return layers.has(key);
    },
    getSync(key) {
      return layers.get(key) || null;
    },
    async get(key, pdfjsPage) {
      if (layers.has(key)) return layers.get(key);
      if (pending.has(key)) return pending.get(key);
      const promise = extractPageText(pdfjsPage).then(
        (layer) => {
          pending.delete(key);
          layers.set(key, layer);
          return layer;
        },
        (err) => {
          pending.delete(key);
          throw err;
        },
      );
      pending.set(key, promise);
      return promise;
    },
    // Test injection: seed a layer without parsing a pdf.js page.
    set(key, layer) {
      layers.set(key, layer);
      return layer;
    },
    clear() {
      layers.clear();
      pending.clear();
    },
    size() {
      return layers.size;
    },
  };
}

export const textLayerCache = createTextLayerCache();
export default textLayerCache;
