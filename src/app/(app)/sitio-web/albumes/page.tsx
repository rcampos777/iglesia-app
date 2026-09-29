import Link from "next/link";
import { StatusBadge } from "@/components/ui-brand/status-badge";
import { requireSiteEditor } from "@/lib/site/guard";
import { editorAlbums } from "@/lib/data/site";
import { AlbumForm } from "./album-form";

export default async function SiteAlbumsPage() {
  await requireSiteEditor();
  const albums = await editorAlbums();
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <section className="bg-card ring-foreground/10 rounded-xl p-4 shadow-xs ring-1 sm:p-5">
        <h2 className="mb-3 text-base font-semibold">Álbumes</h2>
        {albums.length === 0 ? (
          <p className="text-muted-foreground text-sm">Todavía no hay álbumes.</p>
        ) : (
          <ul className="divide-y">
            {albums.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                <Link
                  href={`/sitio-web/albumes/${a.id}`}
                  className="min-w-0 font-medium hover:underline"
                >
                  <span className="block truncate">{a.title}</span>
                  <span className="text-muted-foreground block text-sm font-normal">
                    {a.photoCount} {a.photoCount === 1 ? "foto" : "fotos"}
                  </span>
                </Link>
                <StatusBadge tone={a.published ? "active" : "idle"}>
                  {a.published ? "Publicado" : "Borrador"}
                </StatusBadge>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="bg-card ring-foreground/10 h-fit rounded-xl p-4 shadow-xs ring-1 sm:p-5">
        <h2 className="mb-3 text-base font-semibold">Nuevo álbum</h2>
        <AlbumForm />
      </section>
    </div>
  );
}
