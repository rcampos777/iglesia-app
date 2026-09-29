import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { LetterSnapshot } from "./letter";

/**
 * Carta en PDF (tamaño carta) a partir de una instantánea. Plantilla
 * PROVISIONAL: mientras la configuración no esté "aprobada" cada página
 * lleva el aviso de borrador. No afirma deducibilidad ni cumplimiento
 * contributivo; no incluye peticiones de oración ni formas de pago.
 */

const W = 612;
const H = 792;
const M = 64; // margen
const INK = rgb(0.12, 0.12, 0.12);
const MUTED = rgb(0.4, 0.4, 0.4);
const ACCENT = rgb(0.55, 0.16, 0.16);
const RULE = rgb(0.82, 0.82, 0.82);

type Ctx = {
  doc: PDFDocument;
  page: PDFPage;
  y: number;
  font: PDFFont;
  bold: PDFFont;
  pages: PDFPage[];
};

/** Las fuentes estándar usan WinAnsi: lo que no se pueda codificar se reemplaza. */
function safe(font: PDFFont, text: string): string {
  let out = "";
  for (const ch of text.replace(/[‘’]/g, "'").replace(/[“”]/g, '"')) {
    try {
      font.encodeText(ch);
      out += ch;
    } catch {
      out += "?";
    }
  }
  return out;
}

function wrap(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of safe(font, text).split("\n")) {
    const words = para.split(/\s+/).filter(Boolean);
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      // Palabra más ancha que la línea: se corta por caracteres.
      let chunk = "";
      for (const ch of word) {
        if (font.widthOfTextAtSize(chunk + ch, size) > maxWidth) {
          lines.push(chunk);
          chunk = ch;
        } else chunk += ch;
      }
      line = chunk;
    }
    lines.push(line);
  }
  return lines;
}

function newPage(ctx: Ctx, snapshot: LetterSnapshot) {
  ctx.page = ctx.doc.addPage([W, H]);
  ctx.pages.push(ctx.page);
  ctx.y = H - M;
  if (snapshot.draft) {
    const text =
      "BORRADOR - Plantilla provisional pendiente de revisión. No usar como documento oficial.";
    ctx.page.drawRectangle({
      x: M,
      y: H - 40,
      width: W - 2 * M,
      height: 20,
      color: rgb(0.99, 0.93, 0.93),
    });
    ctx.page.drawText(safe(ctx.bold, text), {
      x: M + 8,
      y: H - 34,
      size: 8.5,
      font: ctx.bold,
      color: ACCENT,
    });
    ctx.y = H - M - 8;
  }
}

/** Asegura `needed` puntos de alto; si no caben, página nueva. */
function ensure(ctx: Ctx, needed: number, snapshot: LetterSnapshot, onNewPage?: () => void) {
  if (ctx.y - needed < M + 36) {
    newPage(ctx, snapshot);
    onNewPage?.();
  }
}

function text(
  ctx: Ctx,
  s: string,
  opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; x?: number } = {},
) {
  const font = opts.bold ? ctx.bold : ctx.font;
  const size = opts.size ?? 11;
  ctx.page.drawText(safe(font, s), {
    x: opts.x ?? M,
    y: ctx.y,
    size,
    font,
    color: opts.color ?? INK,
  });
}

function paragraph(ctx: Ctx, s: string, snapshot: LetterSnapshot, size = 11, lineGap = 5) {
  for (const line of wrap(ctx.font, s, size, W - 2 * M)) {
    ensure(ctx, size + lineGap, snapshot);
    text(ctx, line, { size });
    ctx.y -= size + lineGap;
  }
}

export async function renderLetterPdf(
  snapshot: LetterSnapshot,
  opts: { preview?: boolean } = {},
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const issued = new Date(snapshot.issued_at);
  doc.setTitle(`Certificación de aportaciones ${snapshot.document_code}`);
  doc.setAuthor(snapshot.church.name);
  doc.setCreator("Iglesia App");
  doc.setProducer("Iglesia App");
  doc.setCreationDate(issued);
  doc.setModificationDate(issued);

  const ctx: Ctx = {
    doc,
    page: undefined as unknown as PDFPage,
    y: 0,
    font: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    pages: [],
  };
  newPage(ctx, snapshot);

  // Membrete
  const logoBytes = await fs.readFile(path.join(process.cwd(), "public/brand/logo-full.png"));
  const logo = await doc.embedPng(logoBytes);
  const logoW = 170;
  const logoH = (logo.height / logo.width) * logoW;
  ctx.page.drawImage(logo, { x: M, y: ctx.y - logoH, width: logoW, height: logoH });
  const contact = [snapshot.church.address, snapshot.church.phone, snapshot.church.email]
    .filter(Boolean)
    .join("  ·  ");
  let hy = ctx.y - 14;
  const right = (s: string, size: number, bold = false, color = INK) => {
    const font = bold ? ctx.bold : ctx.font;
    const clean = safe(font, s);
    for (const line of wrap(font, clean, size, W - 2 * M - logoW - 20)) {
      ctx.page.drawText(line, {
        x: W - M - font.widthOfTextAtSize(line, size),
        y: hy,
        size,
        font,
        color,
      });
      hy -= size + 4;
    }
  };
  right(snapshot.church.name, 13, true);
  if (contact) right(contact, 9, false, MUTED);
  if (snapshot.church.tax_id)
    right(`Núm. de identificación: ${snapshot.church.tax_id}`, 9, false, MUTED);
  ctx.y = Math.min(ctx.y - logoH, hy) - 16;
  ctx.page.drawLine({
    start: { x: M, y: ctx.y },
    end: { x: W - M, y: ctx.y },
    thickness: 0.8,
    color: RULE,
  });
  ctx.y -= 28;

  // Fecha y destinatario
  text(ctx, `Fecha de emisión: ${snapshot.issue_date_text}`, { size: 10, color: MUTED });
  ctx.y -= 26;
  text(ctx, snapshot.recipient, { bold: true });
  ctx.y -= 30;

  text(ctx, "Certificación de aportaciones", { size: 15, bold: true });
  ctx.y -= 24;
  paragraph(ctx, snapshot.body, snapshot);
  ctx.y -= 10;

  // Resumen
  const rows: [string, string][] = [
    ["Donante", snapshot.person_name],
    ["Período certificado", snapshot.period_text],
    ["Total registrado", snapshot.total_text],
    ["Aportaciones incluidas", String(snapshot.donation_count)],
  ];
  ensure(ctx, rows.length * 20 + 16, snapshot);
  const boxTop = ctx.y + 12;
  for (const [label, value] of rows) {
    const lines = wrap(ctx.font, value, 11, W - 2 * M - 170);
    text(ctx, label, { size: 10, color: MUTED, x: M + 12 });
    lines.forEach((l, i) => {
      text(ctx, l, { size: 11, bold: label === "Total registrado", x: M + 160 });
      if (i < lines.length - 1) ctx.y -= 15;
    });
    ctx.y -= 20;
  }
  ctx.page.drawRectangle({
    x: M,
    y: ctx.y + 8,
    width: W - 2 * M,
    height: boxTop - ctx.y - 8,
    borderColor: RULE,
    borderWidth: 0.8,
  });
  ctx.y -= 24;

  // Cierre y firma
  ensure(ctx, 120, snapshot);
  text(ctx, snapshot.closing);
  ctx.y -= 56;
  ctx.page.drawLine({
    start: { x: M, y: ctx.y },
    end: { x: M + 220, y: ctx.y },
    thickness: 0.8,
    color: INK,
  });
  ctx.y -= 15;
  text(ctx, snapshot.signer_name ?? "Nombre del firmante (pendiente)", {
    bold: Boolean(snapshot.signer_name),
    color: snapshot.signer_name ? INK : MUTED,
    size: 10.5,
  });
  ctx.y -= 14;
  text(ctx, snapshot.signer_title ?? "Cargo (pendiente)", { color: MUTED, size: 10 });
  ctx.y -= 30;

  // Anexo: detalle (fecha, tipo, cantidad). Encabezado repetido en cada página.
  const cols = [M, M + 250, W - M];
  const header = () => {
    text(ctx, "Fecha", { size: 9.5, bold: true, color: MUTED });
    text(ctx, "Tipo", { size: 9.5, bold: true, color: MUTED, x: cols[1] });
    const h = "Cantidad";
    text(ctx, h, {
      size: 9.5,
      bold: true,
      color: MUTED,
      x: cols[2]! - ctx.bold.widthOfTextAtSize(h, 9.5),
    });
    ctx.y -= 6;
    ctx.page.drawLine({
      start: { x: M, y: ctx.y },
      end: { x: W - M, y: ctx.y },
      thickness: 0.6,
      color: RULE,
    });
    ctx.y -= 14;
  };
  ensure(ctx, 70, snapshot);
  text(ctx, "Detalle de aportaciones incluidas", { size: 12, bold: true });
  ctx.y -= 20;
  header();
  if (snapshot.donations.length === 0) {
    text(ctx, "No hay aportaciones registradas en este período.", { size: 10, color: MUTED });
    ctx.y -= 16;
  }
  for (const d of snapshot.donations) {
    ensure(ctx, 16, snapshot, header);
    text(ctx, d.date_text, { size: 10 });
    text(ctx, d.type_text, { size: 10, x: cols[1] });
    text(ctx, d.amount_text, {
      size: 10,
      x: cols[2]! - ctx.font.widthOfTextAtSize(d.amount_text, 10),
    });
    ctx.y -= 15;
  }
  ensure(ctx, 24, snapshot, header);
  ctx.page.drawLine({
    start: { x: M, y: ctx.y + 9 },
    end: { x: W - M, y: ctx.y + 9 },
    thickness: 0.6,
    color: RULE,
  });
  ctx.y -= 6;
  text(ctx, "Total registrado", { size: 10.5, bold: true });
  text(ctx, snapshot.total_text, {
    size: 10.5,
    bold: true,
    x: cols[2]! - ctx.bold.widthOfTextAtSize(snapshot.total_text, 10.5),
  });

  // Pie en cada página
  const n = ctx.pages.length;
  ctx.pages.forEach((p, i) => {
    const footer = `Documento ${snapshot.document_code} · Versión ${snapshot.version} · Página ${i + 1} de ${n}`;
    p.drawLine({ start: { x: M, y: 44 }, end: { x: W - M, y: 44 }, thickness: 0.5, color: RULE });
    p.drawText(safe(ctx.font, footer), { x: M, y: 30, size: 8.5, font: ctx.font, color: MUTED });
    if (opts.preview) {
      const mark = "VISTA PREVIA - NO EMITIDA";
      p.drawText(mark, {
        x: W - M - ctx.bold.widthOfTextAtSize(mark, 8.5),
        y: 30,
        size: 8.5,
        font: ctx.bold,
        color: ACCENT,
      });
    }
  });

  return doc.save({ useObjectStreams: false });
}
