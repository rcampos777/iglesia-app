import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { listImportBatches } from "@/lib/data/import";
import { getCurrentUser, hasAnyRole } from "@/lib/auth/session";
import { UploadForm } from "./upload-form";
import { ManualEntryForm } from "./manual-entry-form";

const IMPORT_ROLES = ["administrador", "pastor", "coordinador_ministerio", "seguimiento"] as const;

const statusLabels: Record<string, string> = {
  cargando: "Cargando",
  en_revision: "En revisión",
  aprobado_parcial: "Aprobado parcialmente",
  completado: "Completado",
  descartado: "Descartado",
};

export default async function ImportPage() {
  const user = await getCurrentUser();
  if (!hasAnyRole(user, [...IMPORT_ROLES])) redirect("/dashboard");

  const batches = await listImportBatches();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Importar datos</h1>
        <p className="text-muted-foreground">
          Excel/CSV/Access (exportado a CSV) o captura manual de registros en papel. Nada se guarda
          en el directorio final sin revisión humana.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Subir archivo CSV</CardTitle>
          </CardHeader>
          <CardContent>
            <UploadForm />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Captura manual (registro en papel)</CardTitle>
          </CardHeader>
          <CardContent>
            <ManualEntryForm />
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-medium">Lotes de importación</h2>
        {batches.length === 0 && (
          <p className="text-muted-foreground">Todavía no hay lotes de importación.</p>
        )}
        <div className="space-y-2">
          {batches.map((batch) => (
            <Link key={batch.id} href={`/importar/${batch.id}`}>
              <Card className="transition-shadow hover:shadow-md">
                <CardContent className="flex items-center justify-between py-4">
                  <div>
                    <p className="font-medium">{batch.file_name || "Sin nombre"}</p>
                    <p className="text-muted-foreground text-sm">
                      {batch.total_rows} filas ·{" "}
                      {new Date(batch.created_at).toLocaleDateString("es")}
                    </p>
                  </div>
                  <Badge variant="outline">{statusLabels[batch.status]}</Badge>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
