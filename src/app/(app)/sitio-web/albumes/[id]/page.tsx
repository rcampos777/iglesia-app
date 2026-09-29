import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireSiteEditor } from "@/lib/site/guard";
import { editorAlbum, editorMedia } from "@/lib/data/site";
import { AlbumForm } from "../album-form";
import { AlbumPhotos } from "../album-photos";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function SiteAlbumPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSiteEditor();
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const [data, media] = await Promise.all([editorAlbum(id), editorMedia(500)]);
  if (!data) notFound();
  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/sitio-web/albumes">
          <ArrowLeft className="size-4" aria-hidden />
          Álbumes
        </Link>
      </Button>
      <section className="bg-card ring-foreground/10 rounded-xl p-4 shadow-xs ring-1 sm:p-5">
        <AlbumForm album={data.album} />
      </section>
      <section className="bg-card ring-foreground/10 rounded-xl p-4 shadow-xs ring-1 sm:p-5">
        <AlbumPhotos
          key={`${data.photos.map((p) => p.media_id).join()}|${data.album.cover_media_id}`}
          album={data.album}
          photoIds={data.photos.map((p) => p.media_id)}
          media={media}
        />
      </section>
    </div>
  );
}
