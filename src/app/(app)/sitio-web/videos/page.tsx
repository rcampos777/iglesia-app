import { requireSiteEditor } from "@/lib/site/guard";
import { editorVideos } from "@/lib/data/site";
import { VideoEditor } from "./video-editor";

export default async function SiteVideosPage() {
  await requireSiteEditor();
  return <VideoEditor videos={await editorVideos()} />;
}
