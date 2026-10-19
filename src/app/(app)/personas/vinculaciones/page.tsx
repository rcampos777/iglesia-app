import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui-brand/page-header";
import { EmptyState, TableCard } from "@/components/ui-brand/table-card";
import { getCurrentUser, isAdmin } from "@/lib/auth/session";
import { listIdentityReviews } from "@/lib/data/person-registry";
import { ReviewItem } from "./review-item";

export default async function IdentityReviewsPage() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) redirect("/personas");
  const items = await listIdentityReviews();

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/personas/duplicados">
          <ArrowLeft className="size-4" aria-hidden />
          Posibles duplicados
        </Link>
      </Button>
      <PageHeader
        title="Solicitudes de vinculación"
        description="Personas que crearon su cuenta y no pudieron verificar su registro anterior con el código. Vincula solo después de confirmar su identidad (en persona o por el contacto que ya teníamos)."
      />
      <TableCard>
        {items.length === 0 ? (
          <EmptyState icon={UserCheck} title="No hay solicitudes pendientes" />
        ) : (
          <ul className="divide-y">
            {items.map((i) => (
              <li key={i.request_id}>
                <ReviewItem item={i} />
              </li>
            ))}
          </ul>
        )}
      </TableCard>
    </div>
  );
}
