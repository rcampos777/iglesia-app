import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui-brand/status-badge";
import { requireSiteEditor } from "@/lib/site/guard";
import { editorMedia, editorPosts } from "@/lib/data/site";
import { formatChurchShortDate, formatChurchTime } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import { PostForm } from "./post-form";

export default async function SitePostsPage({
  searchParams,
}: {
  searchParams: Promise<{ editar?: string; nuevo?: string }>;
}) {
  await requireSiteEditor();
  const sp = await searchParams;
  const [posts, media] = await Promise.all([editorPosts(), editorMedia(500)]);
  const editing = sp.editar ? posts.find((p) => p.id === sp.editar) : undefined;
  const showForm = Boolean(editing) || sp.nuevo !== undefined;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
      <section className="bg-card ring-foreground/10 h-fit rounded-xl p-4 shadow-xs ring-1 sm:p-5 lg:col-span-2">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Eventos y anuncios</h2>
          <Button asChild size="sm">
            <Link href="/sitio-web/publicaciones?nuevo">
              <Plus className="size-4" aria-hidden />
              Nuevo
            </Link>
          </Button>
        </div>
        {posts.length === 0 ? (
          <p className="text-muted-foreground text-sm">Todavía no hay eventos ni anuncios.</p>
        ) : (
          <ul className="divide-y">
            {posts.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/sitio-web/publicaciones?editar=${p.id}`}
                  className={cn(
                    "hover:bg-muted/50 -mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-2.5",
                    editing?.id === p.id && "bg-muted",
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{p.title}</span>
                    <span className="text-muted-foreground block text-sm">
                      {p.kind === "evento" && p.starts_at
                        ? `Evento · ${formatChurchShortDate(p.starts_at)} ${formatChurchTime(p.starts_at)}`
                        : "Anuncio"}
                    </span>
                  </span>
                  <StatusBadge tone={p.published ? "active" : "idle"}>
                    {p.published ? "Publicado" : "Borrador"}
                  </StatusBadge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="bg-card ring-foreground/10 h-fit rounded-xl p-4 shadow-xs ring-1 sm:p-5 lg:col-span-3">
        {showForm ? (
          <>
            <h2 className="mb-3 text-base font-semibold">
              {editing ? "Editar" : "Nuevo evento o anuncio"}
            </h2>
            <PostForm key={editing?.id ?? "nuevo"} post={editing} media={media} />
          </>
        ) : (
          <p className="text-muted-foreground text-sm">Elige uno de la lista o toca «Nuevo».</p>
        )}
      </section>
    </div>
  );
}
