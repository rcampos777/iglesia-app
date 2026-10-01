import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { AuthError, requireRole } from "@/lib/auth/require-role";
import { FINANCE_ROLES } from "@/lib/auth/finance";
import { CERTIFICATION_BUCKET } from "@/lib/certifications";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Abre el documento de una certificación: registra la apertura en la
 * bitácora (certification_log_file_view) y redirige a una URL firmada de
 * 60 s del bucket privado. Es un enlace normal (no window.open tras un
 * await) para que Safari no lo bloquee como ventana emergente.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole(FINANCE_ROLES);
  } catch (err) {
    if (err instanceof AuthError) return new NextResponse("No autorizado.", { status: 403 });
    throw err;
  }
  const { id } = await params;
  if (!UUID_RE.test(id)) return new NextResponse("No encontrado.", { status: 404 });

  const supabase = await createClient();
  const { data: path, error } = await supabase.rpc("certification_log_file_view", {
    p_certification_id: id,
  });
  if (error || !path) return new NextResponse("No se pudo abrir el archivo.", { status: 404 });
  const { data: signed } = await supabase.storage
    .from(CERTIFICATION_BUCKET)
    .createSignedUrl(path, 60);
  if (!signed) return new NextResponse("No se pudo abrir el archivo.", { status: 500 });
  return NextResponse.redirect(signed.signedUrl, {
    headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}
