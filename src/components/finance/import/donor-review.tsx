"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Check, Link2, Loader2, Search, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge, type StatusTone } from "@/components/ui-brand/status-badge";
import { PersonPicker, type PickedPerson } from "@/components/finance/person-picker";
import { formatCents } from "@/lib/money";
import { normalizeText } from "@/lib/finance/import-parse";
import type { DonationImportDonorListItem, DonationImportSummary } from "@/types/database";
import { bulkDecideAction, decideDonorAction } from "@/app/(app)/finanzas/importar/actions";

type Filter = "pendientes" | "parecidos" | "decididos" | "todos";
const PAGE = 40;

function splitName(full: string): { first: string; last: string } {
  const t = full.trim().split(/\s+/).filter(Boolean);
  if (t.length <= 3) return { first: t[0] ?? "", last: t.slice(1).join(" ") };
  return { first: t.slice(0, 2).join(" "), last: t.slice(2).join(" ") };
}

function decisionBadge(d: DonationImportDonorListItem): { tone: StatusTone; label: string } {
  switch (d.decision) {
    case "enlazar":
      return { tone: "active", label: `Es ${d.person_name ?? "persona existente"}` };
    case "crear":
      return {
        tone: "tracking",
        label: `Donante nuevo: ${[d.new_first_name, d.new_last_name].filter(Boolean).join(" ")}`,
      };
    case "unir":
      return { tone: "active", label: `Misma persona que ${d.same_as_name ?? "otro nombre"}` };
    case "anonima":
      return { tone: "neutral", label: "Anónimas" };
    case "omitir":
      return { tone: "neutral", label: "No importar" };
    default:
      return { tone: "warning", label: "Por decidir" };
  }
}

export function DonorReview({
  batchId,
  editable,
  donors,
  summary,
}: {
  batchId: string;
  editable: boolean;
  donors: DonationImportDonorListItem[];
  summary: DonationImportSummary;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>(summary.donors_pending > 0 ? "pendientes" : "todos");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [bulkPending, setBulkPending] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const counts = useMemo(
    () => ({
      pendientes: donors.filter((d) => d.decision === "pendiente").length,
      parecidos: donors.filter(
        (d) => d.decision === "pendiente" && (d.candidates.length > 0 || d.similar.length > 0),
      ).length,
      decididos: donors.filter((d) => d.decision !== "pendiente").length,
      todos: donors.length,
    }),
    [donors],
  );

  const visible = useMemo(() => {
    const q = normalizeText(query);
    return donors.filter((d) => {
      if (filter === "pendientes" && d.decision !== "pendiente") return false;
      if (
        filter === "parecidos" &&
        !(d.decision === "pendiente" && (d.candidates.length > 0 || d.similar.length > 0))
      )
        return false;
      if (filter === "decididos" && d.decision === "pendiente") return false;
      return !q || normalizeText(`${d.display_name} ${d.family ?? ""}`).includes(q);
    });
  }, [donors, filter, query]);

  async function bulk(action: "sugerencias" | "crear_sin_coincidencia") {
    setBulkPending(true);
    setMessage(null);
    try {
      const res = await bulkDecideAction(batchId, action);
      if (!res.ok) setMessage({ ok: false, text: res.error });
      else {
        setMessage({
          ok: true,
          text:
            action === "sugerencias"
              ? `${res.data} donantes enlazados según la sugerencia.`
              : `${res.data} donantes nuevos marcados para crear.`,
        });
        router.refresh();
      }
    } catch {
      setMessage({ ok: false, text: "No se pudo guardar. Revisa la conexión." });
    } finally {
      setBulkPending(false);
    }
  }

  const tabs: { key: Filter; label: string }[] = [
    { key: "pendientes", label: "Por decidir" },
    { key: "parecidos", label: "Con parecidos" },
    { key: "decididos", label: "Decididos" },
    { key: "todos", label: "Todos" },
  ];

  return (
    <section className="bg-card ring-foreground/10 space-y-4 rounded-xl p-4 shadow-xs ring-1 sm:p-5">
      <div>
        <h2 className="text-base font-semibold">2. ¿Quién es cada donante?</h2>
        <p className="text-muted-foreground text-sm">
          Cada nombre del archivo aparece una sola vez. Enlázalo a la persona que ya existe para no
          duplicarla, o créalo como donante de Finanzas (no se ve en el directorio ni en reportes).
        </p>
      </div>

      {editable && (summary.donors_suggested > 0 || summary.donors_no_match > 0) ? (
        <div className="bg-muted/40 space-y-2 rounded-lg border p-3">
          <p className="text-sm font-medium">Atajos</p>
          <div className="flex flex-wrap gap-2">
            {summary.donors_suggested > 0 ? (
              <Button
                type="button"
                size="sm"
                onClick={() => bulk("sugerencias")}
                disabled={bulkPending}
              >
                <Check className="size-4" aria-hidden />
                Aceptar {summary.donors_suggested} coincidencias exactas
              </Button>
            ) : null}
            {summary.donors_no_match > 0 ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => bulk("crear_sin_coincidencia")}
                disabled={bulkPending}
              >
                <UserPlus className="size-4" aria-hidden />
                Crear {summary.donors_no_match} que no se parecen a nadie
              </Button>
            ) : null}
          </div>
          <p className="text-muted-foreground text-xs">
            Coincidencia exacta = mismo nombre completo o el mismo enlace usado en un archivo
            anterior. Los nombres parecidos siempre se deciden uno por uno.
          </p>
        </div>
      ) : null}
      {message ? (
        <p
          className={message.ok ? "text-state-active text-sm" : "text-destructive text-sm"}
          role={message.ok ? "status" : "alert"}
        >
          {message.text}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          role="tablist"
          aria-label="Filtrar donantes"
          className="bg-muted inline-flex flex-wrap gap-1 rounded-lg p-1"
        >
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={filter === t.key}
              onClick={() => {
                setFilter(t.key);
                setLimit(PAGE);
              }}
              className={
                filter === t.key
                  ? "bg-background rounded-md px-3 py-1.5 text-sm font-medium shadow-sm"
                  : "text-muted-foreground hover:text-foreground rounded-md px-3 py-1.5 text-sm font-medium"
              }
            >
              {t.label} ({counts[t.key]})
            </button>
          ))}
        </div>
        <div className="relative sm:w-64">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            type="search"
            aria-label="Buscar donante"
            placeholder="Buscar nombre"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(PAGE);
            }}
            className="pl-8"
          />
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {filter === "pendientes" ? "No queda nadie por decidir." : "No hay donantes aquí."}
        </p>
      ) : (
        <ul className="space-y-3">
          {visible.slice(0, limit).map((d) => (
            <DonorCard key={d.id} batchId={batchId} donor={d} editable={editable} />
          ))}
        </ul>
      )}
      {visible.length > limit ? (
        <Button type="button" variant="outline" onClick={() => setLimit((l) => l + PAGE)}>
          Mostrar más ({visible.length - limit})
        </Button>
      ) : null}
    </section>
  );
}

function DonorCard({
  batchId,
  donor: d,
  editable,
}: {
  batchId: string;
  donor: DonationImportDonorListItem;
  editable: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"none" | "buscar" | "crear">("none");
  const [picked, setPicked] = useState<PickedPerson | null>(null);
  const start = splitName(d.display_name);
  const [first, setFirst] = useState(d.new_first_name ?? start.first);
  const [last, setLast] = useState(d.new_last_name ?? start.last);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locked = !editable || d.imported_count > 0;
  const badge = decisionBadge(d);

  async function decide(
    decision: DonationImportDonorListItem["decision"],
    extra: {
      personId?: string;
      firstName?: string;
      lastName?: string;
      sameAsDonorId?: string;
    } = {},
  ) {
    setPending(true);
    setError(null);
    try {
      const res = await decideDonorAction({ batchId, donorId: d.id, decision, ...extra });
      if (!res.ok) setError(res.error);
      else {
        setMode("none");
        router.refresh();
      }
    } catch {
      setError("No se pudo guardar. Revisa la conexión.");
    } finally {
      setPending(false);
    }
  }

  return (
    <li className="space-y-3 rounded-lg border p-3 sm:p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="font-medium break-words">{d.display_name}</p>
          <p className="text-muted-foreground text-sm">
            {d.family ? `${d.family} · ` : ""}
            {d.row_count} {d.row_count === 1 ? "fila" : "filas"} · {formatCents(d.total_cents)}
            {d.imported_count > 0 ? ` · ${d.imported_count} importadas` : ""}
          </p>
        </div>
        <StatusBadge tone={badge.tone} className="max-w-full truncate">
          {badge.label}
        </StatusBadge>
      </div>

      {!locked && d.decision === "pendiente" ? (
        <div className="space-y-2">
          {d.suggest_anonymous ? <p className="text-sm">Parece una ofrenda sin nombre.</p> : null}
          {d.candidates.length > 0 ? (
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Ya existe en la app:</p>
              <ul className="space-y-1.5">
                {d.candidates.map((c) => (
                  <li
                    key={c.id}
                    className="bg-muted/40 flex flex-col gap-2 rounded-md px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span className="min-w-0 text-sm">
                      <span className="font-medium">{c.name}</span>
                      {c.id === d.suggested_person_id ? (
                        <span className="text-state-active"> · mismo nombre</span>
                      ) : null}
                      <span className="text-muted-foreground block text-xs">
                        {[
                          c.finance_only ? "Donante (solo Finanzas)" : "Directorio",
                          c.has_account ? "tiene cuenta" : null,
                          c.hint,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => decide("enlazar", { personId: c.id })}
                      disabled={pending}
                    >
                      <Link2 className="size-4" aria-hidden />
                      Es esta persona
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {d.similar.length > 0 ? (
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Parecido en este mismo archivo:</p>
              <ul className="space-y-1.5">
                {d.similar.map((s) => (
                  <li
                    key={s.id}
                    className="bg-muted/40 flex flex-col gap-2 rounded-md px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span className="text-sm font-medium">{s.name}</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => decide("unir", { sameAsDonorId: s.id })}
                      disabled={pending || s.decision === "unir"}
                    >
                      <Users className="size-4" aria-hidden />
                      Es la misma persona
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {mode === "buscar" ? (
            <div className="space-y-2">
              <PersonPicker
                id={`buscar-${d.id}`}
                value={picked}
                onChange={setPicked}
                disabled={pending}
                placeholder="Buscar en la app (mínimo 2 letras)"
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => picked && decide("enlazar", { personId: picked.id })}
                  disabled={!picked || pending}
                >
                  Enlazar
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setMode("none")}>
                  Cancelar
                </Button>
              </div>
            </div>
          ) : null}

          {mode === "crear" ? (
            <div className="space-y-2">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor={`first-${d.id}`}>Nombre</Label>
                  <Input
                    id={`first-${d.id}`}
                    value={first}
                    maxLength={100}
                    onChange={(e) => setFirst(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`last-${d.id}`}>Apellidos</Label>
                  <Input
                    id={`last-${d.id}`}
                    value={last}
                    maxLength={100}
                    onChange={(e) => setLast(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => decide("crear", { firstName: first, lastName: last })}
                  disabled={!first.trim() || pending}
                >
                  Crear donante
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setMode("none")}>
                  Cancelar
                </Button>
              </div>
            </div>
          ) : null}

          {mode === "none" ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setMode("buscar")}
                disabled={pending}
              >
                <Search className="size-4" aria-hidden />
                Buscar otra persona
              </Button>
              {d.display_name !== "Sin nombre" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setMode("crear")}
                  disabled={pending}
                >
                  <UserPlus className="size-4" aria-hidden />
                  Crear donante nuevo
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant={d.suggest_anonymous ? "default" : "ghost"}
                onClick={() => decide("anonima")}
                disabled={pending}
              >
                Anónimas
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => decide("omitir")}
                disabled={pending}
              >
                No importar
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {!locked && d.decision !== "pendiente" ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="-ml-2"
          onClick={() => decide("pendiente")}
          disabled={pending}
        >
          Cambiar decisión
        </Button>
      ) : null}
      {pending ? (
        <Loader2 className="text-muted-foreground size-4 animate-spin" aria-label="Guardando" />
      ) : null}
      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
    </li>
  );
}
