import type { ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui-brand/page-header";
import { getCurrentUser, hasAnyRole } from "@/lib/auth/session";
import { SITE_EDIT_ROLES } from "@/lib/site/guard";
import { SiteTabs } from "./site-tabs";

// Cada página revalida el acceso (requireSiteEditor).
export default async function SiteEditorLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!hasAnyRole(user, [...SITE_EDIT_ROLES])) return children;
  return (
    <div className="space-y-6">
      <PageHeader
        title="Sitio web"
        description="Lo que publiques aquí aparece en la página pública de la iglesia. Los borradores no se ven."
        actions={
          <Button asChild variant="outline">
            <a href="/sitio" target="_blank" rel="noopener">
              <ExternalLink className="size-4" aria-hidden />
              Ver sitio
            </a>
          </Button>
        }
      />
      <SiteTabs />
      {children}
    </div>
  );
}
