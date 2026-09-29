/**
 * Sitio web público (0037–0038) contra Postgres aislado. Datos sintéticos.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { PGlite } from "@electric-sql/pglite";
import { asUser, createTestDb, createUser } from "./harness";

let db: PGlite;
let editor: string;
let admin: string;
let miembro: string;
let pastor: string;

async function rejects(fn: () => Promise<unknown>, match: RegExp) {
  await assert.rejects(fn, (err: Error) => {
    assert.match(err.message, match);
    return true;
  });
}

/** Como visitante anónimo (sin sesión), igual que el sitio público. */
async function asAnon<T>(fn: () => Promise<T>): Promise<T> {
  await db.exec(`select set_config('request.jwt.claim.sub', '', false); set role anon;`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role;`);
  }
}

before(async () => {
  db = await createTestDb();
  editor = await createUser(db, "editor-sitio", ["sitio_web"]);
  admin = await createUser(db, "admin-sitio", ["administrador"]);
  miembro = await createUser(db, "miembro-sitio");
  pastor = await createUser(db, "pastor-sitio", ["pastor"]);
});

after(async () => {
  await db?.close();
});

describe("sitio público", () => {
  test("el público solo ve lo publicado", async () => {
    await asUser(db, editor, async () => {
      await db.query(
        `insert into site_posts (kind, title, starts_at, published) values
          ('evento', 'Congreso publicado', now() + interval '10 days', true),
          ('evento', 'Borrador de evento', now() + interval '12 days', false),
          ('anuncio', 'Anuncio publicado', null, true)`,
      );
      await db.query(
        `insert into site_albums (slug, title, published) values ('publicado', 'Publicado', true), ('borrador', 'Borrador', false)`,
      );
      await db.query(
        `insert into site_videos (title, youtube_id, published) values ('Video', 'dQw4w9WgXcQ', true), ('Oculto', 'abcdefghijk', false)`,
      );
    });
    await asAnon(async () => {
      const posts = await db.query<{ title: string }>(
        `select title from site_posts order by title`,
      );
      assert.deepEqual(
        posts.rows.map((r) => r.title),
        ["Anuncio publicado", "Congreso publicado"],
      );
      assert.equal((await db.query(`select * from site_albums`)).rows.length, 1);
      assert.equal((await db.query(`select * from site_videos`)).rows.length, 1);
      assert.equal((await db.query(`select * from site_settings`)).rows.length, 1);
    });
    const draftsForEditor = await asUser(db, editor, () => db.query(`select * from site_posts`));
    assert.equal(draftsForEditor.rows.length, 3);
  });

  test("las fotos de un álbum sin publicar no se ven", async () => {
    await asUser(db, editor, async () => {
      await db.query(
        `insert into site_media (storage_path, thumb_path, alt_text) values ('a.jpg', 'a-t.jpg', 'Foto')`,
      );
      await db.query(
        `insert into site_album_photos (album_id, media_id)
         select a.id, m.id from site_albums a, site_media m where m.storage_path = 'a.jpg'`,
      );
    });
    await asAnon(async () => {
      const rows = await db.query(`select * from site_album_photos`);
      assert.equal(rows.rows.length, 1, "solo la del álbum publicado");
    });
  });

  test("solo editores (sitio_web, administrador, SuperAdmin) escriben", async () => {
    for (const u of [miembro, pastor]) {
      await asUser(db, u, async () => {
        await rejects(
          () =>
            db.query(
              `insert into site_posts (kind, title, published) values ('anuncio', 'X', true)`,
            ),
          /row-level security/,
        );
        const upd = await db.query(`update site_settings set hero_title = 'Hackeado'`);
        assert.equal(upd.affectedRows, 0);
      });
    }
    await asAnon(async () => {
      await rejects(
        () => db.query(`insert into site_videos (title, youtube_id) values ('X', 'abcdefghijk')`),
        /row-level security/,
      );
    });
    await asUser(db, admin, () =>
      db.query(`update site_settings set hero_subtitle = 'Editado por admin'`),
    );
    const s = await db.query<{ hero_subtitle: string }>(`select hero_subtitle from site_settings`);
    assert.equal(s.rows[0]!.hero_subtitle, "Editado por admin");
  });

  test("el editor del sitio no es staff ni ve datos internos", async () => {
    await asUser(db, editor, async () => {
      const r = await db.query<{ s: boolean; a: boolean; f: boolean }>(
        `select is_staff() s, is_admin() a, has_finance_access() f`,
      );
      assert.deepEqual(r.rows[0], { s: false, a: false, f: false });
      assert.equal(
        (await db.query(`select id from people`)).rows.length,
        1,
        "solo su propia persona",
      );
    });
  });

  test("validaciones: YouTube, slug y enlaces", async () => {
    await asUser(db, editor, async () => {
      await rejects(
        () => db.query(`insert into site_videos (title, youtube_id) values ('X', 'no-valido')`),
        /check constraint/,
      );
      await rejects(
        () => db.query(`insert into site_albums (slug, title) values ('Con Espacios', 'X')`),
        /check constraint/,
      );
      await rejects(
        () =>
          db.query(
            `insert into site_posts (kind, title, link_url) values ('anuncio', 'X', 'javascript:alert(1)')`,
          ),
        /check constraint/,
      );
      await rejects(
        () => db.query(`insert into site_posts (kind, title) values ('evento', 'Sin fecha')`),
        /check constraint/,
      );
    });
  });

  test("los horarios salen de la programación de Asistencia", async () => {
    const rows = await asAnon(() =>
      db.query<{ weekday: number; local_time: string; name: string }>(
        `select * from public_service_schedule()`,
      ),
    );
    assert.deepEqual(
      rows.rows.map((r) => [r.weekday, r.local_time.slice(0, 5), r.name]),
      [
        [0, "09:30", "Culto dominical"],
        [3, "19:30", "Culto de miércoles"],
        [5, "19:30", "Culto de jóvenes"],
      ],
    );
    await asAnon(async () => {
      assert.equal(
        (await db.query(`select * from services`)).rows.length,
        0,
        "anon no ve cultos ni asistencia",
      );
    });
  });
});
