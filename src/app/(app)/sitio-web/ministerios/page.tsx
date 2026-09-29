import { CardEditor } from "@/components/site/card-editor";
import { requireSiteEditor } from "@/lib/site/guard";
import { editorMedia, editorMinistries } from "@/lib/data/site";

export default async function SiteMinistriesPage() {
  await requireSiteEditor();
  const [items, media] = await Promise.all([editorMinistries(), editorMedia(500)]);
  return (
    <CardEditor
      table="site_ministries"
      media={media}
      labels={{ noun: "ministerio", description: "Descripción" }}
      items={items.map((m) => ({ ...m, subtitle: null }))}
    />
  );
}
