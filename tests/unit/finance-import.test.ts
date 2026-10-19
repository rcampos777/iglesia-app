/**
 * Lector de .xlsx e intérprete de archivos de donaciones. Datos sintéticos.
 *   npm run test:unit
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import { readXlsx } from "../../src/lib/xlsx";
import {
  amountToCents,
  interpretDonationTable,
  mapDonationType,
  mapPaymentMethod,
  parseDateCell,
  type TableRow,
} from "../../src/lib/finance/import-parse";

/** ZIP mínimo (deflate) para armar un .xlsx de prueba. */
function zip(files: Record<string, string>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const raw = Buffer.from(content, "utf8");
    const data = deflateRawSync(raw);
    const nameBuf = Buffer.from(name, "utf8");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, data);
    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

function sampleXlsx(): Buffer {
  const strings = [
    "Fecha",
    "Nombre del miembro",
    "Categoría (Diezmo/Ofrenda/Primicia)",
    "Monto",
    "Forma de pago",
    "Persona Ficticia & Cía",
    "Diezmo",
    "ATH ",
  ];
  const sst = `<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${strings
    .map((s) => `<si><t>${s.replace(/&/g, "&amp;")}</t></si>`)
    .join("")}</sst>`;
  const sheet = (rows: string) =>
    `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`;
  return zip({
    "[Content_Types].xml": "<Types/>",
    "xl/workbook.xml": `<workbook xmlns:r="r"><workbookPr/><sheets><sheet name="Resumen" sheetId="1" r:id="rId1"/><sheet name="Transacciones" sheetId="2" r:id="rId2"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="/xl/worksheets/sheet2.xml"/></Relationships>`,
    "xl/sharedStrings.xml": sst,
    "xl/worksheets/sheet1.xml": sheet(
      `<row r="1"><c r="A1" t="inlineStr"><is><t>Resumen</t></is></c></row>`,
    ),
    "xl/worksheets/sheet2.xml": sheet(
      `<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c><c r="E1" t="s"><v>4</v></c></row>` +
        `<row r="2"><c r="A2" s="1"><v>46033</v></c><c r="B2" t="s"><v>5</v></c><c r="C2" t="s"><v>6</v></c><c r="D2"><v>33.333333333333336</v></c><c r="E2" t="s"><v>7</v></c></row>` +
        `<row r="3"><c r="F3"><f>A3</f><v></v></c></row>`,
    ),
  });
}

describe("lector .xlsx", () => {
  test("lee hojas, textos compartidos, entidades y números exactos", () => {
    const { sheets, date1904 } = readXlsx(sampleXlsx());
    assert.equal(date1904, false);
    assert.deepEqual(
      sheets.map((s) => s.name),
      ["Resumen", "Transacciones"],
    );
    const t = sheets[1]!;
    assert.equal(t.rows[1]!.rowNumber, 2);
    assert.deepEqual(t.rows[1]!.cells, [
      "46033",
      "Persona Ficticia & Cía",
      "Diezmo",
      "33.333333333333336",
      "ATH ",
    ]);
  });

  test("rechaza lo que no es un Excel", () => {
    assert.throws(() => readXlsx(Buffer.from("no es un zip")), /no es un Excel/);
  });

  test("interpreta la hoja de transacciones de punta a punta", () => {
    const sheet = readXlsx(sampleXlsx()).sheets[1]!;
    const res = interpretDonationTable(sheet.rows, { today: "2026-10-11" });
    assert.ok(res.ok);
    assert.equal(res.rows.length, 1); // la fila de solo fórmulas vacías se ignora
    const r = res.rows[0]!;
    assert.equal(r.row_number, 2);
    assert.equal(r.donation_date, "2026-01-11");
    assert.equal(r.amount_cents, 3333);
    assert.equal(r.donation_type, "diezmo");
    assert.equal(r.payment_method, "ath");
    assert.deepEqual(r.errors, []);
  });
});

describe("intérprete de donaciones", () => {
  test("montos sin punto flotante y redondeo al centavo", () => {
    assert.equal(amountToCents("20"), 2000);
    assert.equal(amountToCents("$1,234.5"), 123450);
    assert.equal(amountToCents("24.999999999999996"), 2500);
    assert.equal(amountToCents("0.005"), 1);
    assert.equal(amountToCents("0"), null);
    assert.equal(amountToCents("-5"), null);
    assert.equal(amountToCents("abc"), null);
    assert.equal(amountToCents("1e3"), 100000);
  });

  test("fechas: serie de Excel, ISO y mes/día con pista de mes", () => {
    assert.equal(parseDateCell("46033"), "2026-01-11");
    assert.equal(parseDateCell("2026-02-29"), null);
    assert.equal(parseDateCell("2026-03-05"), "2026-03-05");
    assert.equal(parseDateCell("3/5/2026"), "2026-03-05");
    assert.equal(parseDateCell("3/5/2026", { monthHint: 5 }), "2026-05-03");
    assert.equal(parseDateCell("25/12/2025"), "2025-12-25");
    assert.equal(parseDateCell("hola"), null);
  });

  test("categorías y formas de pago del registro de la iglesia", () => {
    assert.equal(mapDonationType("Primicia"), "primicias");
    assert.equal(mapDonationType("Pactos"), "pacto");
    assert.equal(mapDonationType(" diezmo "), "diezmo");
    assert.equal(mapDonationType("Construcción"), null);
    assert.equal(mapPaymentMethod("ATH Movil"), "ath_movil");
    assert.equal(mapPaymentMethod("Ath"), "ath");
    assert.equal(mapPaymentMethod("Mastercard"), "credito");
    assert.equal(mapPaymentMethod("Visa"), "credito");
    assert.equal(mapPaymentMethod("Efectivo"), "efectivo");
    assert.equal(mapPaymentMethod("Débito"), null);
  });

  test("errores por fila, columnas faltantes y años poco comunes", () => {
    const header: TableRow = {
      rowNumber: 1,
      cells: ["Fecha", "Mes # (auto)", "Nombre", "Categoría", "Monto", "Forma de pago"],
    };
    const rows: TableRow[] = [header];
    for (let i = 0; i < 30; i++) {
      rows.push({
        rowNumber: i + 2,
        cells: ["2026-03-01", "3", "Ana Prueba", "Diezmo", "10", "ATH"],
      });
    }
    rows.push({ rowNumber: 40, cells: ["2016-03-01", "3", "Ana Prueba", "Diezmo", "10", "ATH"] });
    rows.push({ rowNumber: 41, cells: ["2027-03-01", "3", "Ana Prueba", "Diezmo", "10", "ATH"] });
    rows.push({ rowNumber: 42, cells: ["2026-03-01", "3", "Ana Prueba", "Diezmo", "", "ATH"] });
    const res = interpretDonationTable(rows, { today: "2026-10-11" });
    assert.ok(res.ok);
    const byRow = new Map(res.rows.map((r) => [r.row_number, r.errors]));
    assert.match(byRow.get(40)![0]!, /Año 2016 poco común/);
    assert.deepEqual(byRow.get(41), ["La fecha no puede ser futura."]);
    assert.deepEqual(byRow.get(42), ["Falta el monto."]);
    assert.deepEqual(byRow.get(2), []);

    const bad = interpretDonationTable([{ rowNumber: 1, cells: ["Fecha", "Monto"] }], {
      today: "2026-10-11",
    });
    assert.deepEqual(bad, {
      ok: false,
      error: "Faltan columnas: Nombre, Categoría, Forma de pago.",
    });
  });
});
