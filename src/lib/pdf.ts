import { readFileSync, existsSync } from "node:fs";

const FONT_CANDIDATES = [
  "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  "/usr/share/fonts/truetype/croscore/Arimo-Regular.ttf",
  "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf",
];

function pickFont() {
  for (const p of FONT_CANDIDATES) {
    if (existsSync(p)) return p;
  }
  return null;
}

function readU16(buf: Buffer, off: number) {
  return buf.readUInt16BE(off);
}
function readI16(buf: Buffer, off: number) {
  return buf.readInt16BE(off);
}
function readU32(buf: Buffer, off: number) {
  return buf.readUInt32BE(off);
}

function tablesOf(buf: Buffer) {
  const n = readU16(buf, 4);
  const tables: Record<string, { off: number; len: number }> = {};
  for (let i = 0; i < n; i++) {
    const base = 12 + i * 16;
    const tag = buf.toString("ascii", base, base + 4);
    tables[tag] = { off: readU32(buf, base + 8), len: readU32(buf, base + 12) };
  }
  return tables;
}

function parseCmap(buf: Buffer, cmapOff: number) {
  const map = new Map<number, number>();
  const num = readU16(buf, cmapOff + 2);
  type Rec = { plat: number; enc: number; off: number; format: number };
  const recs: Rec[] = [];
  for (let i = 0; i < num; i++) {
    const plat = readU16(buf, cmapOff + 4 + i * 8);
    const enc = readU16(buf, cmapOff + 6 + i * 8);
    const off = cmapOff + readU32(buf, cmapOff + 8 + i * 8);
    recs.push({ plat, enc, off, format: readU16(buf, off) });
  }
  const preferred =
    recs.find((r) => r.format === 12 && (r.plat === 3 || r.plat === 0)) ||
    recs.find((r) => r.format === 4 && (r.plat === 3 || r.plat === 0)) ||
    recs[0];
  if (!preferred) return map;
  if (preferred.format === 12) {
    const nGroups = readU32(buf, preferred.off + 12);
    let p = preferred.off + 16;
    for (let g = 0; g < nGroups; g++) {
      const start = readU32(buf, p);
      const end = readU32(buf, p + 4);
      let gid = readU32(buf, p + 8);
      p += 12;
      for (let c = start; c <= end && c - start < 200000; c++) map.set(c, gid++);
    }
    return map;
  }
  if (preferred.format === 4) {
    const sub = preferred.off;
    const segCount = readU16(buf, sub + 6) / 2;
    const endCountOff = sub + 14;
    const startCountOff = endCountOff + 2 + segCount * 2;
    const idDeltaOff = startCountOff + segCount * 2;
    const idRangeOff = idDeltaOff + segCount * 2;
    for (let i = 0; i < segCount; i++) {
      const end = readU16(buf, endCountOff + i * 2);
      const start = readU16(buf, startCountOff + i * 2);
      const delta = readI16(buf, idDeltaOff + i * 2);
      const range = readU16(buf, idRangeOff + i * 2);
      for (let c = start; c <= end; c++) {
        let gid: number;
        if (range === 0) gid = (c + delta) & 0xffff;
        else {
          const addr = idRangeOff + i * 2 + range + (c - start) * 2;
          const g = readU16(buf, addr);
          gid = g === 0 ? 0 : (g + delta) & 0xffff;
        }
        if (gid) map.set(c, gid);
      }
    }
  }
  return map;
}

function parseHmtx(buf: Buffer, tables: ReturnType<typeof tablesOf>) {
  const hhea = tables["hhea"];
  const maxp = tables["maxp"];
  const hmtx = tables["hmtx"];
  const head = tables["head"];
  if (!hhea || !maxp || !hmtx || !head) return { units: 1000, widths: [500], ascent: 800, descent: -200 };
  const units = readU16(buf, head.off + 18);
  const numHMetrics = readU16(buf, hhea.off + 34);
  const numGlyphs = readU16(buf, maxp.off + 4);
  const ascent = readI16(buf, hhea.off + 4);
  const descent = readI16(buf, hhea.off + 6);
  const widths: number[] = [];
  let last = 500;
  for (let i = 0; i < numGlyphs; i++) {
    if (i < numHMetrics) last = readU16(buf, hmtx.off + i * 4);
    widths.push(last);
  }
  return { units, widths, ascent, descent };
}

function pdfEscapeName(s: string) {
  return s.replace(/[()\\]/g, "\\$&");
}

export function cargoCardPdf(opts: { title: string; rows: [string, string][] }) {
  const fontPath = pickFont();
  const lines = [[opts.title, ""] as [string, string], ...opts.rows.filter((r) => String(r[1] ?? "").trim())];
  const text = lines.map(([k, v]) => (v ? `${k}: ${v}` : k)).join("\n");

  if (!fontPath) {
    const ascii = text.replace(/[^\x20-\x7E\n]/g, "?");
    const stream = `BT /F1 12 Tf 50 780 Td 14 TL (${ascii.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)").replace(/\n/g, ") Tj T* (")}) Tj ET`;
    const body = Buffer.from(stream, "latin1");
    const objs = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>`,
      `<< /Length ${body.length} >>\nstream\n${stream}\nendstream`,
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ];
    return assemblePdf(objs);
  }

  const ttf = readFileSync(fontPath);
  const tables = tablesOf(ttf);
  const cmap = parseCmap(ttf, tables["cmap"].off);
  const metrics = parseHmtx(ttf, tables);
  const scale = 1000 / (metrics.units || 1000);
  const used = new Set<number>([0]);
  const glyphsFor = (s: string) => {
    const gids: number[] = [];
    for (const ch of s) {
      const cp = ch.codePointAt(0) || 32;
      const gid = cmap.get(cp) || cmap.get(32) || 0;
      gids.push(gid);
      used.add(gid);
    }
    return gids;
  };

  const content: string[] = ["BT /F1 12 Tf"];
  let y = 800;
  content.push(`50 ${y} Td`);
  for (const [k, v] of lines) {
    const line = v ? `${k}: ${v}` : k;
    const gids = glyphsFor(line.slice(0, 110));
    const hex = gids.map((g) => g.toString(16).padStart(4, "0")).join("");
    content.push(`0 0 Td`);
    content.push(`<${hex}> Tj`);
    y -= 16;
    content.push(`0 -16 Td`);
    if (y < 60) break;
  }
  content.push("ET");
  const stream = content.join("\n");
  const streamBuf = Buffer.from(stream, "latin1");

  const wPairs: string[] = [];
  const sorted = [...used].sort((a, b) => a - b);
  for (const gid of sorted) {
    const w = Math.round((metrics.widths[gid] || 500) * scale);
    wPairs.push(`${gid} [${w}]`);
  }

  let cmapBf = "";
  for (const [cp, gid] of cmap) {
    if (!used.has(gid) || cp < 32) continue;
    cmapBf += `<${gid.toString(16).padStart(4, "0")}> <${cp.toString(16).padStart(4, "0")}>\n`;
  }
  const bfChars = cmapBf.trim() ? cmapBf.trim().split("\n") : [];
  const bfBlock = bfChars.length ? `${bfChars.length} beginbfchar\n${bfChars.join("\n")}\nendbfchar\n` : "";
  const toUnicode = `/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def
/CMapName /Adobe-Identity-UCS def
/CMapType 2 def
1 begincodespacerange
<0000> <FFFF>
endcodespacerange
${bfBlock}endcmap
CMapName currentdict /CMap defineresource pop
end
end`;

  const fontFile = ttf;
  const objs: (string | { raw: Buffer })[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    { raw: Buffer.concat([Buffer.from(`<< /Length ${streamBuf.length} >>\nstream\n`), streamBuf, Buffer.from("\nendstream")]) },
    "<< /Type /Font /Subtype /Type0 /BaseFont /CardSans /Encoding /Identity-H /DescendantFonts [6 0 R] /ToUnicode 9 0 R >>",
    `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /CardSans /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor 7 0 R /DW 500 /W [${wPairs.join(" ")}] /CIDToGIDMap /Identity >>`,
    `<< /Type /FontDescriptor /FontName /CardSans /Flags 4 /FontBBox [-500 -300 1200 1000] /ItalicAngle 0 /Ascent ${Math.round(metrics.ascent * scale)} /Descent ${Math.round(metrics.descent * scale)} /CapHeight 700 /StemV 80 /FontFile2 8 0 R >>`,
    { raw: Buffer.concat([Buffer.from(`<< /Length ${fontFile.length} /Length1 ${fontFile.length} >>\nstream\n`), fontFile, Buffer.from("\nendstream")]) },
    `<< /Length ${Buffer.byteLength(toUnicode, "utf8")} >>\nstream\n${toUnicode}\nendstream`,
  ];
  void pdfEscapeName;
  return assemblePdf(objs);
}

function assemblePdf(objs: (string | { raw: Buffer })[]) {
  const chunks: Buffer[] = [Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n")];
  const offsets = [0];
  for (let i = 0; i < objs.length; i++) {
    offsets.push(chunks.reduce((s, c) => s + c.length, 0));
    const body = typeof objs[i] === "string" ? Buffer.from(objs[i] as string, "utf8") : (objs[i] as { raw: Buffer }).raw;
    chunks.push(Buffer.from(`${i + 1} 0 obj\n`), body, Buffer.from("\nendobj\n"));
  }
  const xrefAt = chunks.reduce((s, c) => s + c.length, 0);
  let xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objs.length; i++) {
    xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  chunks.push(Buffer.from(xref), Buffer.from(trailer));
  return Buffer.concat(chunks);
}
