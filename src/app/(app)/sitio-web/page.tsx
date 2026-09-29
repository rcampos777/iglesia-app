import { requireSiteEditor } from "@/lib/site/guard";
import { editorMedia, editorSettings } from "@/lib/data/site";
import { SiteSettingsForm } from "./settings-form";

export default async function SiteGeneralPage() {
  await requireSiteEditor();
  const [settings, media] = await Promise.all([editorSettings(), editorMedia()]);
  if (!settings)
    return (
      <p className="text-muted-foreground text-sm">No se encontró la configuración del sitio.</p>
    );
  return <SiteSettingsForm settings={settings} media={media} />;
}
