/** Intérprete de la lista de integrantes (CSV). Datos sintéticos. */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  mapColumns,
  parseBirthDate,
  parseMemberTable,
  splitFullName,
} from "../../src/lib/people/ministry-import-parse";

describe("lista de integrantes", () => {
  test("reconoce encabezados en español e inglés", () => {
    assert.deepEqual(mapColumns(["Nombre", "Apellidos", "Correo electrónico", "Teléfono"]), {
      first_name: 0,
      last_name: 1,
      email: 2,
      phone: 3,
    });
    assert.deepEqual(mapColumns(["First Name", "Last_Name", "E-mail", "Date of birth"]), {
      first_name: 0,
      last_name: 1,
      email: 2,
      birth_date: 3,
    });
  });

  test("divide el nombre completo si no hay columna de apellidos", () => {
    assert.deepEqual(splitFullName("Ana  María Ortiz Vega"), {
      first: "Ana María",
      last: "Ortiz Vega",
    });
    const r = parseMemberTable([
      ["Nombre", "Email"],
      ["Juan Pérez Rivera", "juan@example.test"],
    ]);
    assert.ok(r.ok);
    assert.deepEqual(r.rows[0], {
      row_number: 2,
      first_name: "Juan",
      last_name: "Pérez Rivera",
      email: "juan@example.test",
      phone: "",
      birth_date: "",
      errors: [],
    });
  });

  test("fechas ISO y M/D/AAAA; marca las inválidas sin descartar la fila", () => {
    assert.equal(parseBirthDate("1990-07-04").value, "1990-07-04");
    assert.equal(parseBirthDate("7/4/1990").value, "1990-07-04");
    assert.ok(parseBirthDate("31/12/1990").error);
    assert.ok(parseBirthDate("2999-01-01").error);
    const r = parseMemberTable([
      ["Nombre", "Apellido", "Correo", "Fecha de nacimiento"],
      ["", "Sin nombre", "x@", "hoy"],
      ["", "", "", ""],
      ["Ana", "Ruiz", "", ""],
    ]);
    assert.ok(r.ok);
    assert.equal(r.rows.length, 2);
    assert.equal(r.rows[0]!.errors.length, 3);
    assert.equal(r.rows[1]!.row_number, 4);
  });

  test("sin columna de nombre no se importa", () => {
    const r = parseMemberTable([["Correo"], ["a@example.test"]]);
    assert.equal(r.ok, false);
  });
});
