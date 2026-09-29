import { NextResponse, type NextRequest } from "next/server";
import { sendDueReminders } from "@/lib/registrations/automations";

/**
 * Recordatorios de pago y de la actividad (docs/registrations.md). Lo
 * llama Vercel Cron una vez al día (vercel.json) con
 * `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
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
