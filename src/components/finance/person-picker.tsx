"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { searchFinancePeopleAction } from "@/app/(app)/finanzas/actions";

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
}: {
  id: string;
  value: PickedPerson | null;
  onChange: (p: PickedPerson | null) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<
    { person_id: string; display_name: string; hint: string | null }[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      ) : query.trim().length >= 2 && !loading && !error ? (
        <p className="text-muted-foreground text-sm">
          No se encontró. Si la persona no está registrada, pide a Seguimiento o a un administrador
          que la registre (se revisan duplicados) y luego búscala aquí.
        </p>
      ) : null}
    </div>
  );
}
