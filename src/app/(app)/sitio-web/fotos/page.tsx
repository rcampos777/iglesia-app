import { requireSiteEditor } from "@/lib/site/guard";
import { editorMedia } from "@/lib/data/site";
import { PhotoLibrary } from "./photo-library";

export default async function SitePhotosPage() {
  await requireSiteEditor();
  const media = await editorMedia(500);
  return <PhotoLibrary media={media} />;
}
