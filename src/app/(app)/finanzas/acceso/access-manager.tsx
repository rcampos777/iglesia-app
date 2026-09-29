"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui-brand/status-badge";
import type { AppRole } from "@/types/database";
import { searchAccountsAction, setFinancialRoleAction } from "../actions";

type Account = { user_id: string; display_name: string; email: string | null; roles: AppRole[] };

export function RoleToggle({
  userId,
  role,
  has,
  label,
}: {
  userId: string;
  role: "apostol" | "finanzas";
  has: boolean;
  label: string;
}) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function apply() {
    setPending(true);
    setError(null);
    try {
      const res = await setFinancialRoleAction(userId, role, !has, reason);
      if (res.ok) {
        setConfirm(false);
        setReason("");
        router.refresh();
      } else setError(res.error);
    } catch {
      setError("No hubo respuesta del servidor.");
    } finally {
      setPending(false);
    }
  }

  if (!confirm) {
    return (
      <Button size="sm" variant={has ? "outline" : "default"} onClick={() => setConfirm(true)}>
        {has ? `Quitar ${label}` : `Dar ${label}`}
      </Button>
    );
  }
  return (
    <div className="w-full space-y-2 rounded-md border p-2 sm:w-72">
      <Label htmlFor={`r-${userId}-${role}`} className="text-xs">
        Motivo (queda en la auditoría)
      </Label>
      <Input
        id={`r-${userId}-${role}`}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        maxLength={300}
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={apply}
          disabled={pending}
          variant={has ? "destructive" : "default"}
        >
          {pending ? "Aplicando…" : has ? `Confirmar: quitar ${label}` : `Confirmar: dar ${label}`}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setConfirm(false)} disabled={pending}>
          Cancelar
        </Button>
      </div>
      {error ? (
        <p className="text-destructive text-xs" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function AccountSearch() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Account[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  function change(v: string) {
    setQ(v);
    if (v.trim().length < 2) {
      seq.current++;
      setRows([]);
      setLoading(false);
    } else setLoading(true);
  }

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const mine = ++seq.current;
    const t = window.setTimeout(async () => {
      try {
        const res = await searchAccountsAction(term);
        if (mine !== seq.current) return;
        if (res.ok) {
          setRows(res.data);
          setError(null);
        } else setError(res.error);
      } catch {
        if (mine === seq.current) setError("No se pudo buscar.");
      } finally {
        if (mine === seq.current) setLoading(false);
      }
    }, 250);
    return () => window.clearTimeout(t);
  }, [q]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
          aria-hidden
        />
        <Input
          aria-label="Buscar cuenta"
          value={q}
          onChange={(e) => change(e.target.value)}
          placeholder="Nombre o email de la cuenta"
          className="pl-8"
        />
        {loading ? (
          <Loader2
            className="text-muted-foreground absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin"
            aria-label="Buscando"
          />
        ) : null}
      </div>
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      <ul className="divide-y">
        {rows.map((a) => (
          <li key={a.user_id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
            <div className="min-w-0">
              <p className="font-medium">{a.display_name}</p>
              <p className="text-muted-foreground text-sm">{a.email}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {a.roles.includes("apostol") ? (
                <StatusBadge tone="tracking">Apóstol</StatusBadge>
              ) : null}
              <RoleToggle
                userId={a.user_id}
                role="finanzas"
                has={a.roles.includes("finanzas")}
                label="Finanzas"
              />
            </div>
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground text-xs">
        Solo aparecen personas con cuenta de acceso. Si falta la cuenta, un administrador debe
        invitarla primero desde su ficha.
      </p>
    </div>
  );
}
