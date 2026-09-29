import { PageHeader } from "@/components/ui-brand/page-header";
import { StatusBadge } from "@/components/ui-brand/status-badge";
import { requireFinancePage } from "@/lib/finance/guard";
import { listFinanceRoleHolders } from "@/lib/data/finance";
import { AccountSearch, RoleToggle } from "./access-manager";

/** Solo SuperAdmin: quién tiene acceso financiero, conceder y revocar. */
export default async function FinanceAccessPage() {
  const me = await requireFinancePage({ apostolOnly: true });
  const holders = await listFinanceRoleHolders();
  const apostoles = holders.filter((h) => h.role === "apostol").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="SuperAdmin y Finanzas"
        description="Solo un SuperAdmin concede o revoca SuperAdmin y Finanzas. Un administrador no puede hacerlo ni asignárselo. Cada cambio queda auditado."
      />
      <section className="bg-card ring-foreground/10 rounded-xl p-4 shadow-xs ring-1 sm:p-5">
        <h2 className="mb-3 text-base font-semibold">Con acceso ahora</h2>
        <ul className="divide-y">
          {holders.map((h) => (
            <li
              key={`${h.user_id}-${h.role}`}
              className="flex flex-wrap items-center justify-between gap-2 py-2.5"
            >
              <div className="min-w-0">
                <p className="font-medium">
                  {h.display_name}{" "}
                  <StatusBadge tone={h.role === "apostol" ? "tracking" : "active"}>
                    {h.role === "apostol" ? "SuperAdmin" : "Finanzas"}
                  </StatusBadge>
                </p>
                <p className="text-muted-foreground text-sm">
                  {h.email} · desde{" "}
                  {new Date(h.granted_at).toLocaleDateString("es-PR", {
                    timeZone: "America/Puerto_Rico",
                  })}
                  {h.granted_by_name ? ` · por ${h.granted_by_name}` : ""}
                </p>
              </div>
              {h.role === "apostol" && (apostoles <= 1 || h.user_id === me.userId) ? (
                <span className="text-muted-foreground text-xs">
                  {apostoles <= 1 ? "Único SuperAdmin: no se puede quitar." : "Tu propio acceso"}
                </span>
              ) : (
                <RoleToggle
                  userId={h.user_id}
                  role={h.role as "apostol" | "finanzas"}
                  has
                  label={h.role === "apostol" ? "SuperAdmin" : "Finanzas"}
                />
              )}
            </li>
          ))}
        </ul>
      </section>
      <section className="bg-card ring-foreground/10 rounded-xl p-4 shadow-xs ring-1 sm:p-5">
        <h2 className="mb-3 text-base font-semibold">Dar SuperAdmin o Finanzas</h2>
        <p className="text-muted-foreground mb-3 text-sm">
          SuperAdmin tiene todos los permisos de la app, incluidas oración y finanzas. Dalo solo a
          los pastores generales.
        </p>
        <AccountSearch />
      </section>
    </div>
  );
}
