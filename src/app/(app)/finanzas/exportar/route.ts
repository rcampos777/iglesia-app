import { createClient } from "@/lib/supabase/server";
import { PRIVATE_HEADERS, financeRouteAllowed, notFoundResponse } from "@/lib/finance/route-guard";
import { defaultPeriod, parseDonationFilters } from "@/lib/finance/filters";
import { centsToPlain } from "@/lib/money";
import { donationStatusLabels, donationTypeLabels, paymentMethodLabels } from "@/lib/labels";

const PAGE = 1000;
const MAX_ROWS = 50_000;

function csvCell(v: string): string {
  // Evita inyección de fórmulas al abrir en Excel/Sheets.
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/**
 * Exportación financiera (CSV). Nunca incluye peticiones de oración (ni
 * siquiera si existen). Se pagina en el servidor y queda auditada.
 */
export async function GET(req: Request) {
  if (!(await financeRouteAllowed())) return notFoundResponse();
  const url = new URL(req.url);
  const f = parseDonationFilters(Object.fromEntries(url.searchParams), defaultPeriod());
  const supabase = await createClient();

  const lines = [
    [
      "Fecha",
      "Donante",
      "Anónima",
      "Tipo",
      "Forma de pago",
      "Cantidad (USD)",
      "Referencia",
      "Estado",
      "ID",
    ].join(","),
  ];
  let offset = 0;
  let rows = 0;
  for (;;) {
    const { data, error } = await supabase.rpc("finance_list_donations", {
      p_from: f.from,
      p_to: f.to,
      p_person_id: f.personId,
      p_type: f.type,
      p_method: f.method,
      p_status: f.status,
      p_identity: f.identity,
      p_limit: PAGE,
      p_offset: offset,
    });
    if (error) return notFoundResponse();
    for (const d of data ?? []) {
      lines.push(
        [
          d.donation_date,
          d.is_anonymous ? "" : (d.donor_name ?? ""),
          d.is_anonymous ? "Sí" : "No",
          donationTypeLabels[d.donation_type],
          paymentMethodLabels[d.payment_method],
          centsToPlain(d.amount_cents),
          d.reference ?? "",
          donationStatusLabels[d.status],
          d.id,
        ]
          .map((c) => csvCell(String(c)))
          .join(","),
      );
    }
    rows += data?.length ?? 0;
    if (!data || data.length < PAGE || rows >= MAX_ROWS) break;
    offset += PAGE;
  }

  if (rows >= MAX_ROWS) {
    lines.push(
      csvCell(
        `Exportación limitada a ${MAX_ROWS} filas: usa un período menor para obtener el resto.`,
      ),
    );
  }

  await supabase.rpc("finance_record_export", {
    p_filters: { ...f },
    p_rows: rows,
  });

  const name = `donaciones_${f.from ?? "inicio"}_${f.to ?? "hoy"}.csv`;
  return new Response("﻿" + lines.join("\r\n") + "\r\n", {
    headers: {
      ...PRIVATE_HEADERS,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
    },
  });
}
