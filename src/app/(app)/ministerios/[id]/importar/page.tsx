import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui-brand/page-header";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { listMinistryImports } from "@/lib/data/person-registry";
import { UploadList } from "./upload-list";

export default async function MinistryImportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const [{ data: ministry }, { data: canManage }] = await Promise.all([
    supabase.from("ministries").select("id, name").eq("id", id).maybeSingle(),
    supabase.rpc("can_manage_ministry_members", { p_ministry_id: id }),
  ]);
  if (!ministry) notFound();
  if (!canManage) redirect(`/ministerios/${id}`);

  const imports = await listMinistryImports(id);

  return (
    <div className="max-w-3xl space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href={`/ministerios/${id}`}>
          <ArrowLeft className="size-4" aria-hidden />
          {ministry.name}
        </Link>
      </Button>
      <PageHeader
        title="Importar lista de integrantes"
        description="Verás cada fila antes de aplicar: quién ya está registrado, quién es nuevo y qué hay que revisar. No se crean cuentas ni se envían emails."
      />
      <Card>
        <CardContent>
          <UploadList ministryId={id} />
        </CardContent>
      </Card>
      {imports.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Importaciones recientes</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {imports.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-2 py-2">
                  <Link
                    href={`/ministerios/${id}/importar/${b.id}`}
                    className="min-w-0 truncate font-medium hover:underline"
                  >
                    {b.file_name}
                  </Link>
                  <span className="text-muted-foreground shrink-0">
                    {b.row_count} filas · {b.last_applied_at ? "aplicada" : "en revisión"}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
