import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { sendDueReminders } from "@/lib/registrations/automations";

/**
 * Recordatorios de pago y de la actividad (docs/registrations.md). Lo
 * llama Vercel Cron una vez al día (vercel.json) con
 * `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !sameSecret(request.headers.get("authorization") ?? "", `Bearer ${secret}`)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const result = await sendDueReminders();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cron recordatorios-inscripciones]", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

/** Comparación en tiempo constante (hash para igualar longitudes). */
function sameSecret(given: string, expected: string): boolean {
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
