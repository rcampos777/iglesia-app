import { test } from "node:test";
import assert from "node:assert/strict";
import {
  publicRegistrationSchema,
  registrationSettingsSchema,
} from "../../src/lib/validations/registrations";
import { personalizeLetter } from "../../src/lib/registrations/letter";

const valid = {
  firstName: "Nombre",
  lastName: "Apellido Prueba",
  address: "Calle Sintética 1, Ponce",
  age: "40",
  phone: "787-555-0100",
  email: "Prueba@Example.test",
  emergencyName: "Familiar Prueba",
  emergencyPhone: "787-555-0199",
  attendsChurch: "si",
  churchName: "Iglesia Prueba",
  hasMedicalCondition: "no",
  medicalDetails: "",
  acceptTerms: "si",
};

test("la forma pública acepta datos completos y normaliza el email", () => {
  const r = publicRegistrationSchema.safeParse(valid);
  assert.ok(r.success);
  assert.equal(r.data.email, "prueba@example.test");
  assert.equal(r.data.age, 40);
});

test("la forma pública rechaza menores, términos sin aceptar e iglesia vacía", () => {
  const errs = (over: Record<string, string>) => {
    const r = publicRegistrationSchema.safeParse({ ...valid, ...over });
    return r.success ? {} : r.error.flatten().fieldErrors;
  };
  assert.ok(errs({ age: "16" }).age);
  assert.ok(errs({ acceptTerms: "" }).acceptTerms);
  assert.ok(errs({ churchName: "" }).churchName);
  assert.deepEqual(errs({ attendsChurch: "no", churchName: "" }), {});
  assert.ok(errs({ phone: "12" }).phone);
  assert.ok(errs({ email: "no-es-email" }).email);
});

test("la configuración valida dirección, depósito y correos de aviso", () => {
  const base = { registrationSlug: "retiro-hombres-2026", price: "150", deposit: "50" };
  assert.ok(registrationSettingsSchema.safeParse(base).success);
  const bad = (over: Record<string, string>) =>
    !registrationSettingsSchema.safeParse({ ...base, ...over }).success;
  assert.ok(bad({ deposit: "200" }));
  assert.ok(bad({ registrationSlug: "Retiro Hombres" }));
  assert.ok(bad({ registrationOpen: "on", registrationSlug: "" }));
  assert.ok(bad({ notifyEmails: "a@example.test, malo" }));
  const ok = registrationSettingsSchema.safeParse({
    ...base,
    notifyEmails: "A@example.test; b@example.test",
  });
  assert.ok(ok.success);
  assert.deepEqual(ok.data.notifyEmails, ["a@example.test", "b@example.test"]);
});

test("la carta pone el nombre donde dice {{Nombre}}", () => {
  assert.equal(
    personalizeLetter("Estimado hermano {{Nombre}},\n¡Gracias, {{ nombre }}!", " Juan "),
    "Estimado hermano Juan,\n¡Gracias, Juan!",
  );
  assert.equal(personalizeLetter("Sin nombre", "Juan"), "Sin nombre");
});
