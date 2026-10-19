import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui-brand/page-header";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPendingIdentityReview } from "@/lib/data/person-registry";
import { ClaimFlow } from "./claim-flow";

export default async function LinkRecordPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.personId) redirect("/dashboard");
  const reviewPending = await hasPendingIdentityReview();

  return (
    <div className="max-w-2xl space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/portal">
          <ArrowLeft className="size-4" aria-hidden />
          Mi portal
        </Link>
      </Button>
      <PageHeader
        title="¿Ya estabas registrado?"
        description="Si visitaste la iglesia, sirves en un ministerio o un líder te registró antes de crear tu cuenta, vincula ese registro para ver tu historial en un solo lugar."
      />
      <Card>
        <CardContent>
          <ClaimFlow reviewPending={reviewPending} />
        </CardContent>
      </Card>
    </div>
  );
}
