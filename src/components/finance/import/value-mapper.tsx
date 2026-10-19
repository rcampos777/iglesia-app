"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { donationTypeLabels, paymentMethodLabels } from "@/lib/labels";
import { mapValueAction } from "@/app/(app)/finanzas/importar/actions";

/** Valores del archivo que no se reconocieron: se asignan una sola vez para todas sus filas. */
export function ValueMapper({
  batchId,
  values,
}: {
  batchId: string;
  values: { field: "tipo" | "forma"; raw_value: string; row_count: number }[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function assign(field: "tipo" | "forma", raw: string, value: string) {
    setPending(`${field}:${raw}`);
    setError(null);
    try {
      const res = await mapValueAction({ batchId, field, raw, value });
      if (!res.ok) setError(res.error);
      else router.refresh();
    } catch {
      setError("No se pudo guardar. Revisa la conexión.");
    } finally {
      setPending(null);
    }
  }

  return (
    <section className="bg-card ring-state-warning/40 space-y-3 rounded-xl p-4 shadow-xs ring-1 sm:p-5">
      <div>
        <h2 className="text-base font-semibold">1. Valores sin reconocer</h2>
        <p className="text-muted-foreground text-sm">
          Indica a qué corresponde cada valor. Se aplica a todas sus filas.
        </p>
      </div>
      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
      <ul className="divide-y">
        {values.map((v) => {
          const key = `${v.field}:${v.raw_value}`;
          const options = v.field === "tipo" ? donationTypeLabels : paymentMethodLabels;
          const id = `map-${v.field}-${encodeURIComponent(v.raw_value)}`;
          return (
            <li
              key={key}
              className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between"
            >
              <label htmlFor={id} className="text-sm">
                <span className="text-muted-foreground">
                  {v.field === "tipo" ? "Categoría" : "Forma de pago"}:{" "}
                </span>
                <span className="font-medium">{v.raw_value ? `“${v.raw_value}”` : "(vacío)"}</span>
                <span className="text-muted-foreground">
                  {" "}
                  · {v.row_count} {Number(v.row_count) === 1 ? "fila" : "filas"}
                </span>
              </label>
              <Select
                disabled={pending !== null}
                onValueChange={(value) => assign(v.field, v.raw_value, value)}
              >
                <SelectTrigger id={id} className="w-full sm:w-56">
                  <SelectValue placeholder={pending === key ? "Guardando…" : "Elegir…"} />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(options).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
