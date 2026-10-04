import { test } from "node:test";
import assert from "node:assert/strict";
import {
  eventDateText,
  eventSubtitle,
  eventTimeText,
  partsToRange,
  rangeToParts,
  type EventRange,
} from "../../src/lib/site/event-time";

const parts = (startDate: string, startTime = "", endDate = "", endTime = "") => ({
  startDate,
  startTime,
  endDate,
  endTime,
});

function range(p: ReturnType<typeof parts>): EventRange {
  const r = partsToRange(p);
  assert.equal(typeof r, "object", String(r));
  return r as EventRange;
}

test("solo fecha: todo el día, sin hora", () => {
  const r = range(parts("2026-10-30"));
  assert.equal(r.startsAt, "2026-10-30T04:00:00.000Z"); // 00:00 PR
  assert.equal(r.endsAt, "2026-10-31T03:59:00.000Z"); // 23:59 PR
  assert.equal(r.startHasTime, false);
  assert.equal(r.endHasTime, false);
  assert.equal(eventTimeText(r), null);
  assert.equal(eventSubtitle(r), "Viernes");
  assert.deepEqual(rangeToParts(r), parts("2026-10-30"));
});

test("fecha y hora de inicio, sin fin", () => {
  const r = range(parts("2026-10-30", "18:00"));
  assert.equal(r.startsAt, "2026-10-30T22:00:00.000Z");
  assert.equal(r.endsAt, null);
  assert.match(eventSubtitle(r), /^Viernes · 6:00/);
  assert.deepEqual(rangeToParts(r), parts("2026-10-30", "18:00"));
});

test("varios días sin horas (retiro)", () => {
  const r = range(parts("2026-10-30", "", "2026-11-01"));
  assert.equal(r.endsAt, "2026-11-02T03:59:00.000Z");
  assert.equal(eventTimeText(r), null);
  assert.match(eventSubtitle(r), /^30 oct.* – 1 nov/);
  assert.match(eventDateText(r), /^Del viernes 30 de octubre al domingo 1 de noviembre$/);
  assert.deepEqual(rangeToParts(r), parts("2026-10-30", "", "2026-11-01"));
});

test("varios días con horas", () => {
  const r = range(parts("2026-10-30", "18:00", "2026-11-01", "12:00"));
  assert.match(eventTimeText(r)!, /^Empieza 6:00.*termina 12:00/);
  assert.deepEqual(rangeToParts(r), parts("2026-10-30", "18:00", "2026-11-01", "12:00"));
});

test("mismo día con inicio y fin", () => {
  const r = range(parts("2026-10-30", "18:00", "", "21:00"));
  assert.match(eventTimeText(r)!, /^6:00.* – 9:00/);
  assert.deepEqual(rangeToParts(r), parts("2026-10-30", "18:00", "", "21:00"));
});

test("errores claros", () => {
  assert.equal(partsToRange(parts("")), "Un evento necesita fecha de inicio.");
  assert.equal(
    partsToRange(parts("2026-10-30", "18:00", "2026-10-29")),
    "El fin no puede ser antes del inicio.",
  );
  assert.equal(partsToRange(parts("2026-10-30", "6pm")), "Hora de inicio inválida.");
  // El caso del retiro: 9:00 a 8:00 sin fecha de fin.
  assert.match(String(partsToRange(parts("2026-10-30", "09:00", "", "08:00"))), /fecha de fin/);
  assert.equal(typeof partsToRange(parts("2026-10-30", "09:00", "2026-11-01", "08:00")), "object");
});
