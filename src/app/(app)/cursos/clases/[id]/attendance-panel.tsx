"use client";

import { useActionState, useState } from "react";
import { recordAttendanceAction } from "../../actions";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ActionResult } from "@/lib/action-result";
import type { AttendanceRecordRow, AttendanceStatus, ClassSessionRow } from "@/types/database";
import type { EnrollmentWithPerson } from "@/lib/data/courses";

const initialState: ActionResult = { ok: true, data: undefined };

const statusLabels: Record<AttendanceStatus, string> = {
  presente: "Presente",
  ausente: "Ausente",
  excusado: "Excusado",
  tarde: "Tarde",
};

export function AttendancePanel({
  offeringId,
  sessions,
  enrollments,
  attendance,
  canTeach,
}: {
  offeringId: string;
  sessions: ClassSessionRow[];
  enrollments: EnrollmentWithPerson[];
  attendance: AttendanceRecordRow[];
  canTeach: boolean;
}) {
  const sortedSessions = [...sessions].sort((a, b) => b.session_date.localeCompare(a.session_date));
  const [sessionId, setSessionId] = useState(sortedSessions[0]?.id ?? "");

  const boundAction = (formData: FormData) =>
    recordAttendanceAction(offeringId, sessionId, formData);

  const [state, formAction, isPending] = useActionState(
    async (_prev: ActionResult, formData: FormData) => boundAction(formData),
    initialState,
  );

  const attendanceForSession = new Map(
    attendance.filter((a) => a.class_session_id === sessionId).map((a) => [a.person_id, a.status]),
  );

  return (
    <div className="space-y-4">
      <Select value={sessionId} onValueChange={setSessionId}>
        <SelectTrigger className="w-full sm:w-64">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {sortedSessions.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {new Date(s.session_date + "T00:00:00").toLocaleDateString("es")}
              {s.topic ? ` — ${s.topic}` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {!state.ok && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      {enrollments.length === 0 ? (
        <p className="text-muted-foreground">No hay estudiantes matriculados.</p>
      ) : (
        <form action={formAction} className="space-y-3">
          <div className="space-y-2">
            {enrollments.map((e) => (
              <div
                key={e.id}
                className="flex items-center justify-between gap-3 rounded-md border p-2"
              >
                <span className="text-sm">
                  {e.personFirstName} {e.personLastName}
                </span>
                <select
                  name={`status:${e.person_id}`}
                  defaultValue={attendanceForSession.get(e.person_id) ?? "presente"}
                  disabled={!canTeach}
                  className="bg-background rounded-md border px-2 py-1 text-sm disabled:opacity-50"
                >
                  {Object.entries(statusLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          {canTeach && (
            <Button type="submit" disabled={isPending}>
              {isPending ? "Guardando..." : "Guardar asistencia"}
            </Button>
          )}
        </form>
      )}
    </div>
  );
}
