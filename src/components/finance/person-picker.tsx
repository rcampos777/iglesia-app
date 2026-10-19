"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Search, UserPlus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { createDonorAction, searchFinancePeopleAction } from "@/app/(app)/finanzas/actions";

export type PickedPerson = { id: string; name: string };

/**
 * Búsqueda de persona para Finanzas: en el servidor, mínimo 2 letras,
 * nombre + pista para distinguir homónimos. Se identifica por ID, nunca
 * por nombre.
 */
export function PersonPicker({
  id,
  value,
  onChange,
  disabled,
  placeholder = "Busca por nombre (mínimo 2 letras)",
  allowCreateDonor = false,
}: {
  id: string;
  value: PickedPerson | null;
  onChange: (p: PickedPerson | null) => void;
  disabled?: boolean;
  placeholder?: string;
  /** Muestra "Crear donante nuevo" (solo Finanzas; queda oculto del directorio). */
  allowCreateDonor?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<
    { person_id: string; display_name: string; hint: string | null }[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const seq = useRef(0);

  function change(v: string) {
    setQuery(v);
    if (v.trim().length < 2) {
      seq.current++;
      setResults([]);
      setLoading(false);
      setError(null);
    } else setLoading(true);
  }

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const mine = ++seq.current;
    const t = window.setTimeout(async () => {
      try {
        const res = await searchFinancePeopleAction(q);
        if (mine !== seq.current) return;
        if (res.ok) {
          setResults(res.data);
          setError(null);
        } else setError(res.error);
      } catch {
        if (mine === seq.current) setError("No se pudo buscar. Revisa la conexión.");
      } finally {
        if (mine === seq.current) setLoading(false);
      }
    }, 250);
    return () => window.clearTimeout(t);
  }, [query]);

  if (value) {
    return (
      <div className="bg-muted/50 flex items-center justify-between gap-2 rounded-md border px-3 py-2">
        <span className="min-w-0 truncate text-[15px] font-medium">{value.name}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onChange(null)}
          disabled={disabled}
          aria-label="Cambiar persona"
        >
          <X className="size-4" aria-hidden />
          Cambiar
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
          aria-hidden
        />
        <Input
          id={id}
          type="search"
          autoComplete="off"
          value={query}
          onChange={(e) => change(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className="pl-8"
        />
        {loading ? (
          <Loader2
            className="text-muted-foreground absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin"
            aria-label="Buscando"
          />
        ) : null}
      </div>
      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
      {results.length > 0 ? (
        <ul
          className="max-h-64 divide-y overflow-y-auto rounded-md border"
          aria-label="Personas encontradas"
        >
          {results.map((r) => (
            <li key={r.person_id}>
              <button
                type="button"
                className="hover:bg-muted/60 focus-visible:bg-muted/60 w-full px-3 py-2 text-left"
                onClick={() => {
                  onChange({ id: r.person_id, name: r.display_name });
                  change("");
                }}
              >
                <span className="block text-[15px] font-medium">{r.display_name}</span>
                {r.hint ? (
                  <span className="text-muted-foreground block text-sm">{r.hint}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : query.trim().length >= 2 && !loading && !error && !allowCreateDonor ? (
        <p className="text-muted-foreground text-sm">
          No se encontró. Si la persona no está registrada, pide a Seguimiento o a un administrador
          que la registre (se revisan duplicados) y luego búscala aquí.
        </p>
      ) : null}
      {allowCreateDonor && query.trim().length >= 2 && !loading ? (
        creating ? (
          <DonorCreator
            initialName={query}
            disabled={disabled}
            onCancel={() => setCreating(false)}
            onCreated={(p) => {
              setCreating(false);
              onChange(p);
              change("");
            }}
          />
        ) : (
          <div className="space-y-1">
            {results.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No se encontró a nadie con ese nombre.
              </p>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setCreating(true)}
              disabled={disabled}
            >
              <UserPlus className="size-4" aria-hidden />
              Crear donante nuevo
            </Button>
          </div>
        )
      ) : null}
    </div>
  );
}

function splitName(full: string): { first: string; last: string } {
  const t = full.trim().split(/\s+/).filter(Boolean);
  if (t.length <= 3) return { first: t[0] ?? "", last: t.slice(1).join(" ") };
  return { first: t.slice(0, 2).join(" "), last: t.slice(2).join(" ") };
}

/**
 * Alta de un donante solo de Finanzas: no aparece en el directorio ni en
 * reportes. Si ya existe alguien con el mismo nombre, se pide confirmar.
 */
function DonorCreator({
  initialName,
  disabled,
  onCancel,
  onCreated,
}: {
  initialName: string;
  disabled?: boolean;
  onCancel: () => void;
  onCreated: (p: PickedPerson) => void;
}) {
  const start = splitName(initialName);
  const [first, setFirst] = useState(start.first);
  const [last, setLast] = useState(start.last);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sameName, setSameName] = useState<string | null>(null);

  async function create(confirmSameName: boolean) {
    setPending(true);
    setError(null);
    try {
      const res = await createDonorAction({ firstName: first, lastName: last, confirmSameName });
      if (!res.ok) setError(res.error);
      else if ("sameName" in res.data) setSameName(res.data.message);
      else onCreated(res.data);
    } catch {
      setError("No se pudo crear. Revisa la conexión.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="bg-muted/40 space-y-3 rounded-md border p-3">
      <p className="text-sm font-medium">Donante nuevo</p>
      <p className="text-muted-foreground text-sm">
        Solo lo ve Finanzas: no aparece en el directorio ni en los reportes. Si luego se registra en
        la app, lo vinculas desde Finanzas → Vincular.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="donor-first">Nombre</Label>
          <Input
            id="donor-first"
            value={first}
            onChange={(e) => {
              setFirst(e.target.value);
              setSameName(null);
            }}
            maxLength={100}
            disabled={pending || disabled}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="donor-last">Apellidos</Label>
          <Input
            id="donor-last"
            value={last}
            onChange={(e) => {
              setLast(e.target.value);
              setSameName(null);
            }}
            maxLength={100}
            disabled={pending || disabled}
          />
        </div>
      </div>
      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
      {sameName ? (
        <p className="text-state-warning text-sm" role="alert">
          {sameName}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {sameName ? (
          <Button type="button" size="sm" onClick={() => create(true)} disabled={pending}>
            Sí, es otra persona: crear
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            onClick={() => create(false)}
            disabled={pending || !first.trim()}
          >
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Crear donante
          </Button>
        )}
        <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={pending}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
