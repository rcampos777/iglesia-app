"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { PersonResolver } from "@/components/people/person-resolver";
import { toMatchItem } from "@/components/people/match-list";
import { actionOk } from "@/lib/action-result";
import { addMinistryPersonAction } from "../actions";

/**
 * Registrar a alguien que todavía no tiene cuenta (o elegir su registro si
 * ya existe) y asignarlo al ministerio. No crea credenciales: cuando la
 * persona se registre y verifique su identidad, conserva este ministerio.
 */
export function RegisterMember({ ministryId }: { ministryId: string }) {
  const router = useRouter();
  const [done, setDone] = useState<string | null>(null);

  function finish(r: { membership: "agregada" | "ya_integrante"; personCreated: boolean }) {
    setDone(
      r.membership === "ya_integrante"
        ? "Esa persona ya estaba en el ministerio. No se duplicó."
        : r.personCreated
          ? "Persona registrada (sin cuenta) y agregada al ministerio."
          : "Persona agregada al ministerio.",
    );
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        Nombre y correo bastan. Antes de crear revisamos si ya está registrada para no duplicarla.
        Agregarla aquí no le crea una cuenta ni le da permisos.
      </p>
      {done ? (
        <p className="text-state-active flex items-center gap-2 text-sm" role="status">
          <CheckCircle2 className="size-4" aria-hidden />
          {done}
        </p>
      ) : null}
      <PersonResolver
        createLabel="Registrar y agregar"
        existingLabel="Agregar esta persona"
        disableExisting={(m) => (m.inMinistry ? "Ya está en el ministerio" : null)}
        submitNew={async (input, acknowledged, requestKey) => {
          setDone(null);
          const res = await addMinistryPersonAction(ministryId, {
            input,
            acknowledged,
            requestKey,
          });
          if (!res.ok) return res;
          if (res.data.status === "matches") {
            return actionOk({
              status: "matches" as const,
              matches: res.data.matches.map(toMatchItem),
            });
          }
          finish(res.data);
          return actionOk({ status: "done" as const });
        }}
        chooseExisting={async (m) => {
          setDone(null);
          const res = await addMinistryPersonAction(ministryId, { personId: m.id });
          if (res.ok && res.data.status === "done") finish(res.data);
          return res;
        }}
      />
    </div>
  );
}
