import { createClient } from "@/lib/supabase/server";
import { PRIVATE_HEADERS, financeRouteAllowed, notFoundResponse } from "@/lib/finance/route-guard";
import { buildLetterSnapshot } from "@/lib/finance/letter";
import { renderLetterPdf } from "@/lib/finance/letter-pdf";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Vista previa en PDF: NO se guarda ni se emite; va marcada "VISTA PREVIA". */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const personId = url.searchParams.get("persona") ?? "";
  const from = url.searchParams.get("desde") ?? "";
  const to = url.searchParams.get("hasta") ?? "";
  if (!UUID_RE.test(personId) || !DATE_RE.test(from) || !DATE_RE.test(to) || from > to) {
    return notFoundResponse();
  }
  if (!(await financeRouteAllowed())) return notFoundResponse();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("finance_letter_data", {
    p_person_id: personId,
    p_from: from,
    p_to: to,
  });
  if (error || !data) return notFoundResponse();

  const snapshot = buildLetterSnapshot({
    data,
    personId,
    from,
    to,
    documentCode: "VISTA-PREVIA",
    issuedAt: new Date(),
  });
  const pdf = await renderLetterPdf(snapshot, { preview: true });
  return new Response(Buffer.from(pdf), {
    headers: {
      ...PRIVATE_HEADERS,
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="vista-previa.pdf"',
    },
  });
}
