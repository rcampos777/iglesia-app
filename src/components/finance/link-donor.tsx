"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Link2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PersonPicker, type PickedPerson } from "./person-picker";
import type { FinanceLinkSuggestion } from "@/types/database";
import { dismissLinkSuggestionAction, linkDonorAction } from "@/app/(app)/finanzas/actions";

const DEFAULT_REASON = "Es la misma persona: ya está registrada en la app.";

function useLink() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function link(donorId: string, personId: string, reason: string, after?: () => void) {
    setPending(true);
    setError(null);
    try {
      const res = await linkDonorAction({ donorId, personId, reason });
      if (!res.ok) setError(res.error);
      else {
        after?.();
        router.refresh();
      }
    } catch {
      setError("No se pudo vincular. Revisa la conexión.");
    } finally {
      setPending(false);
    }
  }
  return { pending, error, setError, link, router, setPending };
}

export function LinkSuggestionCard({ suggestion: s }: { suggestion: FinanceLinkSuggestion }) {
  const { pending, error, setError, link, router, setPending } = useLink();
  const [reason, setReason] = useState(DEFAULT_REASON);

  async function dismiss() {
    setPending(true);
    setError(null);
    try {
      const res = await dismissLinkSuggestionAction(s.donor_id, s.person_id);
      if (!res.ok) setError(res.error);
      else router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <li className="bg-card ring-foreground/10 space-y-3 rounded-xl p-4 shadow-xs ring-1">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <p className="text-muted-foreground text-xs font-medium uppercase">Donante de Finanzas</p>
          <Link href={`/finanzas/donantes/${s.donor_id}`} className="font-medium hover:underline">
            {s.donor_name}
          </Link>
          <p className="text-muted-foreground text-sm">
            {s.donation_count} {Number(s.donation_count) === 1 ? "donación" : "donaciones"}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs font-medium uppercase">
            Persona registrada {s.exact ? "· mismo nombre" : "· nombre parecido"}
          </p>
          <p className="font-medium">{s.person_name}</p>
          <p className="text-muted-foreground text-sm">
            {[s.has_account ? "Tiene cuenta en la app" : "Sin cuenta", s.hint]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`reason-${s.donor_id}-${s.person_id}`}>Motivo</Label>
        <Textarea
          id={`reason-${s.donor_id}-${s.person_id}`}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={300}
          rows={2}
        />
      </div>
      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={() => link(s.donor_id, s.person_id, reason)}
          disabled={pending || reason.trim().length < 5}
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Link2 className="size-4" aria-hidden />
          )}
          Es la misma persona: vincular
        </Button>
        <Button type="button" variant="ghost" onClick={dismiss} disabled={pending}>
          No es la misma
        </Button>
      </div>
    </li>
  );
}

/** En la ficha de un donante de Finanzas: vincularlo con una persona del directorio. */
export function LinkDonorForm({ donorId }: { donorId: string }) {
  const { pending, error, link, router } = useLink();
  const [person, setPerson] = useState<PickedPerson | null>(null);
  const [reason, setReason] = useState(DEFAULT_REASON);

  return (
    <div className="space-y-3">
      <PersonPicker
        id="vincular-persona"
        value={person}
        onChange={setPerson}
        disabled={pending}
        placeholder="Busca a la persona registrada"
      />
      <div className="space-y-1.5">
        <Label htmlFor="vincular-motivo">Motivo</Label>
        <Textarea
          id="vincular-motivo"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={300}
          rows={2}
        />
      </div>
      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
      <Button
        type="button"
        onClick={() =>
          person &&
          link(donorId, person.id, reason, () => router.push(`/finanzas/donantes/${person.id}`))
        }
        disabled={!person || pending || reason.trim().length < 5}
      >
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        Vincular
      </Button>
    </div>
  );
}
