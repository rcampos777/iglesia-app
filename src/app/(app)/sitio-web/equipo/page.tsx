import { CardEditor } from "@/components/site/card-editor";
import { requireSiteEditor } from "@/lib/site/guard";
import { editorMedia, editorTeam } from "@/lib/data/site";

export default async function SiteTeamPage() {
  await requireSiteEditor();
  const [items, media] = await Promise.all([editorTeam(), editorMedia(500)]);
  return (
    <CardEditor
      table="site_team"
      media={media}
      labels={{
        noun: "persona",
        subtitle: "Cargo (ej. Pastor general)",
        description: "Frase o biografía corta (se muestra como cita)",
      }}
      items={items.map((t) => ({ ...t, subtitle: t.role_title, description: t.bio }))}
    />
  );
}
