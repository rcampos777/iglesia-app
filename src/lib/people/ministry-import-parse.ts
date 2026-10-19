/**
 * Lista de integrantes (CSV) → filas para el staging del ministerio. Pura
 * (sin red ni DOM) para probarla aparte. Reconoce encabezados en español o
 * inglés; si solo hay una columna de nombre, la divide en nombre y
 * apellidos. No descarta filas: las inválidas llevan su error y se ven en
 * la vista previa.
 */

export type ParsedImportRow = {
  row_number: number;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  birth_date: string;
  errors: string[];
};

type Field = "first_name" | "last_name" | "full_name" | "email" | "phone" | "birth_date";

const ALIASES: Record<Field, string[]> = {
  first_name: ["nombre", "nombres", "first name", "firstname", "first_name", "primer nombre"],
  last_name: ["apellido", "apellidos", "last name", "lastname", "last_name", "surname"],
  full_name: ["nombre completo", "name", "full name", "fullname", "persona"],
  email: ["correo", "correo electronico", "email", "e-mail", "mail", "correo-e"],
  phone: ["telefono", "tel", "celular", "movil", "phone", "telephone", "mobile", "cell"],
  birth_date: [
    "fecha de nacimiento",
    "nacimiento",
    "fecha nacimiento",
    "birth date",
    "birthdate",
    "date of birth",
    "dob",
    "cumpleanos",
  ],
};

export function normalizeHeader(h: string): string {
  return h
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[_.:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function mapColumns(headers: string[]): Partial<Record<Field, number>> {
  const out: Partial<Record<Field, number>> = {};
  headers.forEach((h, i) => {
    const n = normalizeHeader(h);
    for (const [field, aliases] of Object.entries(ALIASES) as [Field, string[]][]) {
      if (out[field] === undefined && aliases.includes(n)) out[field] = i;
    }
  });
  return out;
}

/** "Juan Pérez Rivera" → (Juan, Pérez Rivera); 4+ palabras → dos nombres. */
export function splitFullName(full: string): { first: string; last: string } {
  const t = full.trim().split(/\s+/).filter(Boolean);
  if (t.length <= 3) return { first: t[0] ?? "", last: t.slice(1).join(" ") };
  return { first: t.slice(0, 2).join(" "), last: t.slice(2).join(" ") };
}

/** AAAA-MM-DD o M/D/AAAA (formato de EE. UU. y PR). "" si está vacío. */
export function parseBirthDate(raw: string): { value: string; error?: string } {
  const v = raw.trim();
  if (!v) return { value: "" };
  let y: number, m: number, d: number;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v);
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v);
  if (iso) {
    [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else if (us) {
    [m, d, y] = [Number(us[1]), Number(us[2]), Number(us[3])];
  } else {
    return { value: "", error: "Fecha de nacimiento inválida (usa AAAA-MM-DD o M/D/AAAA)." };
  }
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return { value: "", error: "Fecha de nacimiento inválida." };
  }
  const iso8601 = date.toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  if (iso8601 > today || y < 1900) return { value: "", error: "Fecha de nacimiento inválida." };
  return { value: iso8601 };
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export type ParseResult =
  { ok: true; rows: ParsedImportRow[]; recognized: Field[] } | { ok: false; error: string };

/** `table`: primera fila = encabezados. Fila 1 del archivo = encabezado. */
export function parseMemberTable(table: string[][]): ParseResult {
  const [headers, ...body] = table;
  if (!headers) return { ok: false, error: "El archivo está vacío." };
  const cols = mapColumns(headers);
  if (cols.first_name === undefined && cols.full_name === undefined) {
    return {
      ok: false,
      error:
        'No encontramos la columna de nombre. Usa encabezados como "Nombre", "Apellidos" y "Correo".',
    };
  }
  const cell = (r: string[], f: Field) => {
    const i = cols[f];
    return i === undefined ? "" : (r[i] ?? "").trim();
  };

  const rows: ParsedImportRow[] = [];
  body.forEach((r, idx) => {
    if (r.every((c) => !c || !c.trim())) return;
    let first = cell(r, "first_name");
    let last = cell(r, "last_name");
    if (cols.last_name === undefined) {
      const split = splitFullName(first || cell(r, "full_name"));
      first = split.first;
      last = split.last;
    } else if (!first && cols.full_name !== undefined) {
      first = cell(r, "full_name");
    }
    const errors: string[] = [];
    if (!first) errors.push("Falta el nombre.");
    const email = cell(r, "email");
    if (email && !EMAIL.test(email)) errors.push("Correo inválido.");
    const birth = parseBirthDate(cell(r, "birth_date"));
    if (birth.error) errors.push(birth.error);
    rows.push({
      row_number: idx + 2,
      first_name: first.slice(0, 100),
      last_name: last.slice(0, 100),
      email: email.slice(0, 254),
      phone: cell(r, "phone").slice(0, 30),
      birth_date: birth.value,
      errors,
    });
  });

  if (rows.length === 0) return { ok: false, error: "El archivo no tiene filas con datos." };
  if (rows.length > 1000) return { ok: false, error: "Máximo 1,000 filas por archivo." };
  return {
    ok: true,
    rows,
    recognized: (Object.keys(cols) as Field[]).filter((f) => cols[f] !== undefined),
  };
}
