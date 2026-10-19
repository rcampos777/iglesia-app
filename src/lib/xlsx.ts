import { inflateRawSync } from "node:zlib";

/**
 * Lector mínimo de .xlsx (solo valores de celdas) para importaciones. Sin
 * dependencias: un .xlsx es un ZIP con XML. Límites contra archivos
 * maliciosos (ZIP bomb): tamaño descomprimido por parte y total.
 */

export type XlsxCell = string | null;
export type XlsxSheet = { name: string; rows: { rowNumber: number; cells: XlsxCell[] }[] };

const MAX_PART_BYTES = 60 * 1024 * 1024;
const MAX_TOTAL_BYTES = 120 * 1024 * 1024;

export class XlsxError extends Error {}

function unzip(buf: Buffer): Map<string, Buffer> {
  // Fin del directorio central (firma 0x06054b50), buscando desde el final.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new XlsxError("El archivo no es un Excel (.xlsx) válido.");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = new Map<string, Buffer>();
  let total = 0;
  for (let n = 0; n < count; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) {
      throw new XlsxError("El archivo Excel está dañado.");
    }
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;

    if (
      !/^xl\/(workbook\.xml|sharedStrings\.xml|_rels\/workbook\.xml\.rels|worksheets\/[^/]+\.xml)$/.test(
        name,
      )
    ) {
      continue;
    }
    if (size > MAX_PART_BYTES || (total += size) > MAX_TOTAL_BYTES) {
      throw new XlsxError("El archivo Excel es demasiado grande.");
    }
    if (local + 30 > buf.length || buf.readUInt32LE(local) !== 0x04034b50) {
      throw new XlsxError("El archivo Excel está dañado.");
    }
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + compSize);
    if (method === 0) files.set(name, Buffer.from(data));
    else if (method === 8)
      files.set(name, inflateRawSync(data, { maxOutputLength: MAX_PART_BYTES }));
    else throw new XlsxError("Formato de compresión no soportado.");
  }
  return files;
}

function decode(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|apos|#x[0-9a-f]+|#\d+);/gi, (m, e: string) => {
    const k = e.toLowerCase();
    if (k === "amp") return "&";
    if (k === "lt") return "<";
    if (k === "gt") return ">";
    if (k === "quot") return '"';
    if (k === "apos") return "'";
    const code = k.startsWith("#x") ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
    return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : m;
  });
}

function texts(xml: string): string {
  let out = "";
  for (const m of xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) out += decode(m[1]!);
  return out;
}

function attr(attrs: string, name: string): string | null {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(attrs);
  return m ? decode(m[1]!) : null;
}

/** "AB12" → 27 (índice de columna base 0). */
function colIndex(ref: string): number {
  let n = 0;
  for (const ch of ref) {
    const c = ch.charCodeAt(0);
    if (c < 65 || c > 90) break;
    n = n * 26 + (c - 64);
  }
  return n - 1;
}

export function readXlsx(buf: Buffer): { sheets: XlsxSheet[]; date1904: boolean } {
  const files = unzip(buf);
  const workbook = files.get("xl/workbook.xml")?.toString("utf8");
  const rels = files.get("xl/_rels/workbook.xml.rels")?.toString("utf8");
  if (!workbook || !rels) throw new XlsxError("El archivo no es un Excel (.xlsx) válido.");

  const shared: string[] = [];
  const sst = files.get("xl/sharedStrings.xml")?.toString("utf8");
  if (sst) for (const m of sst.matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(texts(m[1]!));

  const targets = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const id = attr(m[1]!, "Id");
    const target = attr(m[1]!, "Target");
    if (id && target) {
      targets.set(id, target.startsWith("/") ? target.slice(1) : `xl/${target}`);
    }
  }

  const date1904 = /<workbookPr\b[^>]*\sdate1904="(1|true)"/.test(workbook);
  const sheets: XlsxSheet[] = [];
  for (const m of workbook.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const name = attr(m[1]!, "name") ?? "";
    const rid = attr(m[1]!, "r:id");
    const xml = rid ? files.get(targets.get(rid) ?? "")?.toString("utf8") : undefined;
    if (!xml) continue;
    const rows: XlsxSheet["rows"] = [];
    for (const r of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
      const rowNumber = Number(attr(r[1]!, "r") ?? rows.length + 1);
      const cells: XlsxCell[] = [];
      for (const c of r[2]!.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const a = c[1]!;
        const body = c[2] ?? "";
        const ref = attr(a, "r");
        const idx = ref ? colIndex(ref) : cells.length;
        if (idx < 0 || idx > 200) continue;
        const t = attr(a, "t");
        const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
        let value: XlsxCell = null;
        if (t === "s") value = v !== undefined ? (shared[Number(v)] ?? null) : null;
        else if (t === "inlineStr") value = texts(body);
        else if (t === "str" || t === "e") value = v !== undefined ? decode(v) : null;
        else if (t === "b") value = v === "1" ? "TRUE" : "FALSE";
        else if (v !== undefined && v !== "") value = Number.isFinite(Number(v)) ? v : decode(v);
        // Los números se dejan como texto exacto de Excel ("33.333333333333336")
        // para redondear centavos sin pasar por punto flotante.
        while (cells.length < idx) cells.push(null);
        cells[idx] = value;
      }
      rows.push({ rowNumber, cells });
    }
    sheets.push({ name, rows });
  }
  return { sheets, date1904 };
}
