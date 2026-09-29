"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Download, FileCheck2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PersonPicker, type PickedPerson } from "@/components/finance/person-picker";
import { issueLetterAction } from "../actions";

export function LetterPersonSelect({
  initial,
  from,
  to,
}: {
  initial: PickedPerson | null;
  from: string;
  to: string;
}) {
  const router = useRouter();
  const [person, setPerson] = useState(initial);
  return (
    <PersonPicker
      id="carta-persona"
      value={person}
      onChange={(p) => {
        setPerson(p);
        router.push(
          p ? `/finanzas/cartas?persona=${p.id}&desde=${from}&hasta=${to}` : "/finanzas/cartas",
        );
      }}
    />
  );
}

/**
 * Emite la carta. El id se genera una vez al mostrar la vista previa: un
 * doble clic o un reintento devuelven la misma carta.
 */
export function IssueLetterButton(props: {
  personId: string;
  from: string;
  to: string;
  expectedTotalCents: number;
  expectedCount: number;
  expectedVersion: number;
}) {
  const router = useRouter();
  const [letterId] = useState(() => crypto.randomUUID());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<string | null>(null);

  async function issue() {
    setPending(true);
    setError(null);
    try {
      const res = await issueLetterAction({ ...props, letterId });
      if (res.ok) {
        setIssued(res.data.id);
        router.refresh();
      } else setError(res.error);
    } catch {
      setError("No hubo respuesta del servidor. Vuelve a intentar: no se emitirá dos veces.");
    } finally {
      setPending(false);
    }
  }

  if (issued) {
    return (
      <div
        role="status"
        className="border-state-active/40 bg-state-active/10 space-y-2 rounded-md border p-3 text-sm"
      >
        <p className="font-medium">Carta emitida (versión {props.expectedVersion}).</p>
        <Button asChild size="sm">
          <a href={`/finanzas/cartas/${issued}/pdf`}>
            <Download className="size-4" aria-hidden />
            Descargar PDF
          </a>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Button onClick={issue} disabled={pending}>
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <FileCheck2 className="size-4" aria-hidden />
        )}
        Emitir versión {props.expectedVersion}
      </Button>
      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
