import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { MinistryMembershipRow, MinistryRow } from "@/types/database";

export interface MinistryWithSummary extends MinistryRow {
  leaderName: string | null;
  activeMemberCount: number;
}

export async function listMinistries(
  filters: { includeInactive?: boolean; ledByPersonId?: string } = {},
): Promise<MinistryWithSummary[]> {
  const supabase = await createClient();

  let query = supabase.from("ministries").select("*").order("name");
  if (!filters.includeInactive) query = query.eq("is_active", true);

  const { data: allMinistries, error } = await query;
  if (error) throw new Error(`No se pudieron cargar los ministerios: ${error.message}`);
  if (!allMinistries || allMinistries.length === 0) return [];

  // Acotar a los ministerios que lidera esta persona: designado en
  // `leader_person_id` o con membresía activa lider/colider.
  let ministries = allMinistries;
  if (filters.ledByPersonId) {
    const personId = filters.ledByPersonId;
    const { data: led } = await supabase
      .from("ministry_memberships")
      .select("ministry_id")
      .eq("person_id", personId)
      .is("left_at", null)
      .in("role_in_ministry", ["lider", "colider"]);
    const ledIds = new Set((led ?? []).map((m) => m.ministry_id));
    ministries = allMinistries.filter((m) => m.leader_person_id === personId || ledIds.has(m.id));
    if (ministries.length === 0) return [];
  }

  const leaderIds = ministries
    .map((m) => m.leader_person_id)
    .filter((id): id is string => Boolean(id));

  // La membresía está restringida por RLS: un usuario sin rol de staff no
  // ve las filas de otros, así que el conteo que ve puede ser 0. Es
  // intencional — el catálogo es público, la lista de quién sirve no.
  const [leadersRes, membershipsRes] = await Promise.all([
    leaderIds.length
      ? supabase.from("people").select("id, first_name, last_name").in("id", leaderIds)
      : Promise.resolve({ data: [] as { id: string; first_name: string; last_name: string }[] }),
    supabase
      .from("ministry_memberships")
      .select("ministry_id")
      .is("left_at", null)
      .in(
        "ministry_id",
        ministries.map((m) => m.id),
      ),
  ]);

  const leaderById = new Map((leadersRes.data ?? []).map((p) => [p.id, p]));

  const countByMinistry = new Map<string, number>();
  for (const row of membershipsRes.data ?? []) {
    countByMinistry.set(row.ministry_id, (countByMinistry.get(row.ministry_id) ?? 0) + 1);
  }

  return ministries.map((m) => {
    const leader = m.leader_person_id ? leaderById.get(m.leader_person_id) : undefined;
    return {
      ...m,
      leaderName: leader ? `${leader.first_name} ${leader.last_name}` : null,
      activeMemberCount: countByMinistry.get(m.id) ?? 0,
    };
  });
}

export interface MinistryMemberWithPerson extends MinistryMembershipRow {
  personFirstName: string;
  personLastName: string;
  personPhone: string | null;
  personEmail: string | null;
}

export interface MinistryDetail {
  ministry: MinistryWithSummary;
  activeMembers: MinistryMemberWithPerson[];
  formerMembers: MinistryMemberWithPerson[];
}

export async function getMinistryDetail(id: string): Promise<MinistryDetail | null> {
  const supabase = await createClient();

  const { data: ministry, error } = await supabase
    .from("ministries")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`No se pudo cargar el ministerio: ${error.message}`);
  if (!ministry) return null;

  const { data: memberships, error: membershipsError } = await supabase
    .from("ministry_memberships")
    .select("*")
    .eq("ministry_id", id)
    .order("left_at", { nullsFirst: true })
    .order("joined_at", { ascending: false });
  if (membershipsError) {
    throw new Error(`No se pudo cargar la membresía: ${membershipsError.message}`);
  }

  const rows = memberships ?? [];
  const personIds = new Set(rows.map((m) => m.person_id));
  if (ministry.leader_person_id) personIds.add(ministry.leader_person_id);

  const { data: people } = personIds.size
    ? await supabase
        .from("people")
        .select("id, first_name, last_name, phone, email")
        .in("id", [...personIds])
    : { data: [] };

  const peopleById = new Map((people ?? []).map((p) => [p.id, p]));

  const withPerson = (m: MinistryMembershipRow): MinistryMemberWithPerson => {
    const p = peopleById.get(m.person_id);
    return {
      ...m,
      personFirstName: p?.first_name ?? "?",
      personLastName: p?.last_name ?? "?",
      personPhone: p?.phone ?? null,
      personEmail: p?.email ?? null,
    };
  };

  const leader = ministry.leader_person_id ? peopleById.get(ministry.leader_person_id) : undefined;

  return {
    ministry: {
      ...ministry,
      leaderName: leader ? `${leader.first_name} ${leader.last_name}` : null,
      activeMemberCount: rows.filter((m) => m.left_at === null).length,
    },
    activeMembers: rows.filter((m) => m.left_at === null).map(withPerson),
    formerMembers: rows.filter((m) => m.left_at !== null).map(withPerson),
  };
}

export interface PersonMinistry extends MinistryMembershipRow {
  ministryName: string;
}

/** Ministerios en los que sirve una persona (para su ficha y su portal). */
export async function listMinistriesForPerson(personId: string): Promise<PersonMinistry[]> {
  const supabase = await createClient();

  const { data: memberships, error } = await supabase
    .from("ministry_memberships")
    .select("*")
    .eq("person_id", personId)
    .is("left_at", null)
    .order("joined_at", { ascending: false });
  if (error) throw new Error(`No se pudieron cargar los ministerios: ${error.message}`);
  if (!memberships || memberships.length === 0) return [];

  const { data: ministries } = await supabase
    .from("ministries")
    .select("id, name")
    .in(
      "id",
      memberships.map((m) => m.ministry_id),
    );

  const nameById = new Map((ministries ?? []).map((m) => [m.id, m.name]));

  return memberships.map((m) => ({ ...m, ministryName: nameById.get(m.ministry_id) ?? "—" }));
}

/** Opción mínima para los selectores de persona del módulo. */
export interface PersonPickerOption {
  id: string;
  first_name: string;
  last_name: string;
}

/**
 * Personas elegibles para asignar a un ministerio. Va por RPC en vez de
 * leer `people` directamente porque un líder de ministerio sin rol de
 * staff no tiene acceso de lectura al directorio completo (RLS), pero sí
 * necesita poder elegir a quién agregar a su equipo. La función devuelve
 * solo id + nombre — ver 0019_ministry_leader_people_access.sql.
 */
export async function listPeopleForMinistryPicker(): Promise<PersonPickerOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_people_for_ministry_picker");
  if (error) throw new Error(`No se pudieron cargar las personas: ${error.message}`);
  return data ?? [];
}
