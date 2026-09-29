import { createClient } from "@/lib/supabase/server";
import { PRIVATE_HEADERS, financeRouteAllowed, notFoundResponse } from "@/lib/finance/route-guard";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** PDF emitido, byte por byte como se guardó (no se recalcula). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id) || !(await financeRouteAllowed())) return notFoundResponse();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_donation_letter_pdf", { p_letter_id: id });
  const row = data?.[0];
  if (error || !row) return notFoundResponse();

  const bytes = Buffer.from(row.pdf_base64, "base64");
  const filename = `${row.document_code.replace(/[^A-Za-z0-9-]/g, "")}.pdf`;
  return new Response(bytes, {
    headers: {
      ...PRIVATE_HEADERS,
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
