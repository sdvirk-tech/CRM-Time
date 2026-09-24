export function csvCell(value: string | number | null | undefined) {
  const s = value == null ? "" : String(value);
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function csvBody(header: string[], rows: (string | number | null | undefined)[][]) {
  const lines = [header.map(csvCell).join(",")];
  for (const row of rows) lines.push(row.map(csvCell).join(","));
  return `\uFEFF${lines.join("\n")}`;
}

function splitCsvLine(line: string, delim: string) {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else q = false;
      } else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

export function parseCsv(text: string): { header: string[]; rows: string[][] } {
  const raw = String(text || "").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = raw.split("\n").filter((l) => l.trim() !== "");
  if (!lines.length) return { header: [], rows: [] };
  const delim = (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ";" : ",";
  const header = splitCsvLine(lines[0], delim).map((h) => h.trim());
  const rows = lines.slice(1).map((l) => splitCsvLine(l, delim).map((c) => c.trim()));
  return { header, rows };
}

export function csvHeaderKey(name: string) {
  const n = name.trim().toLowerCase().replace(/^"|"$/g, "");
  if (n === "name" || n === "имя" || n === "фио") return "name";
  if (n === "phone" || n === "телефон" || n === "тел") return "phone";
  if (n === "telegram" || n === "телеграм" || n === "tg") return "telegram";
  if (n === "max" || n === "макс") return "max";
  return n;
}
