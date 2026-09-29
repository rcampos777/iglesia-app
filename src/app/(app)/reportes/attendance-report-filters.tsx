import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { serviceTypeLabels } from "@/lib/labels";

/** Filtros por GET (sin JavaScript): la URL se puede guardar o compartir. */
export function AttendanceReportFilters({
  from,
  to,
  type,
}: {
  from: string;
  to: string;
  type: string;
}) {
  return (
    <form method="get" className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
      <div className="space-y-1.5">
        <Label htmlFor="desde">Desde</Label>
        <Input id="desde" name="desde" type="date" defaultValue={from} className="sm:w-40" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="hasta">Hasta</Label>
        <Input id="hasta" name="hasta" type="date" defaultValue={to} className="sm:w-40" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="tipo">Tipo de culto</Label>
        <select
          id="tipo"
          name="tipo"
          defaultValue={type}
          className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm sm:w-44"
        >
          <option value="todos">Todos</option>
          {Object.entries(serviceTypeLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex gap-2">
        <Button type="submit" variant="secondary">
          Consultar
        </Button>
        <Button asChild variant="ghost">
          <Link href="/reportes">Últimos 30 días</Link>
        </Button>
      </div>
    </form>
  );
}
