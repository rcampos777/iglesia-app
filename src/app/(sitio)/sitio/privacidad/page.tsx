import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SitePage } from "@/components/sitio/site-page";
import { publicSettings } from "@/lib/data/site";
import { FALLBACK_SETTINGS, safe } from "@/lib/site/load";
import { PRIVACY_VERSION } from "@/lib/privacy";

export const revalidate = 120;

export const metadata: Metadata = {
  title: "Aviso de privacidad",
  description: "Cómo la iglesia recoge, usa y protege tus datos personales.",
};

/**
 * Aviso de privacidad. Cada frase describe lo que el sistema hace hoy
 * (verificado contra el código y la RLS; ver docs/privacy.md). Si cambia
 * el contenido, cambia PRIVACY_VERSION en src/lib/privacy.ts.
 */

const effective = new Intl.DateTimeFormat("es-PR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
}).format(new Date(`${PRIVACY_VERSION}T00:00:00Z`));

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-[26px] leading-[32px] font-light tracking-[-0.8px]">{title}</h2>
      <div className="space-y-3 text-[17px] leading-[27px] text-[#444]">{children}</div>
    </section>
  );
}

export default async function PrivacyPage() {
  const s = (await safe("ajustes", publicSettings(), null)) ?? FALLBACK_SETTINGS;
  const church = s.hero_title;

  return (
    <SitePage eyebrow="Legal" title="Aviso de privacidad" lead={`Vigente desde el ${effective}.`}>
      <div className="bg-[#F5F0E8] text-[#1D191A]">
        <div className="mx-auto max-w-3xl space-y-10 px-[19px] py-12 md:px-8 md:py-16 [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1.5">
          <Section title="Quién es responsable">
            <p>
              <b>{church}</b> es responsable de los datos personales que se recogen en este sitio y
              en su aplicación de administración (el portal de miembros). La plataforma tecnológica,
              Nexo, procesa los datos por cuenta de la iglesia y no los usa para otros fines.
            </p>
          </Section>

          <Section title="Qué datos recogemos">
            <ul>
              <li>
                <b>Identificación y contacto:</b> nombre, email, teléfono, dirección, fecha de
                nacimiento y estado civil, si los das o los registra el personal de la iglesia.
              </li>
              <li>
                <b>Participación en la iglesia:</b> clases y cursos, asistencia a cultos y clases,
                ministerios donde sirves, actividades y seguimiento a visitantes.
              </li>
              <li>
                <b>Peticiones de oración</b> que envíes.
              </li>
              <li>
                <b>Donaciones</b> registradas por el equipo de Finanzas, para llevar la contabilidad
                y emitir cartas de donativos.
              </li>
              <li>
                <b>Inscripciones en línea a actividades:</b> además de tu contacto, edad, contacto
                de emergencia, si perseveras en una iglesia y, si decides indicarlo, una condición
                médica.
              </li>
              <li>
                <b>Certificaciones de quienes sirven</b> (por ejemplo, certificados de antecedentes
                penales o de la Ley 300) cuando la iglesia las requiere para trabajar con menores.
              </li>
              <li>
                <b>Datos técnicos:</b> los registros que generan nuestros proveedores al usar el
                sitio (por ejemplo, la dirección IP), y una cookie para mantener tu sesión abierta.
              </li>
            </ul>
          </Section>

          <Section title="Para qué los usamos">
            <p>
              Para administrar la vida de la congregación: comunicarnos contigo, organizar clases,
              ministerios y actividades, registrar la asistencia, orar por tus peticiones, llevar la
              contabilidad de las donaciones y cumplir los requisitos para trabajar con menores.
            </p>
            <p>
              <b>No vendemos tus datos</b> ni los usamos para publicidad. No usamos cookies de
              publicidad ni de analítica.
            </p>
          </Section>

          <Section title="Quién puede verlos">
            <p>
              Solo el personal de la iglesia, según su función, y con permisos que se aplican en la
              base de datos:
            </p>
            <ul>
              <li>Los pastores de ministerio y los maestros ven solo a las personas a su cargo.</li>
              <li>
                Las donaciones y las certificaciones solo las ven los pastores generales y el equipo
                de Finanzas.
              </li>
              <li>
                Las peticiones de oración solo las ven el equipo de intercesión y la administración,
                y cada lectura queda registrada.
              </li>
              <li>
                Los datos médicos y el contacto de emergencia de una inscripción solo los ven
                quienes organizan o administran las actividades, y no se envían por email.
              </li>
            </ul>
          </Section>

          <Section title="Con quién se comparten">
            <p>Usamos estos proveedores para que el sistema funcione:</p>
            <ul>
              <li>Supabase: base de datos, inicio de sesión y archivos.</li>
              <li>Vercel: alojamiento del sitio y la aplicación.</li>
              <li>Resend: envío de emails.</li>
              <li>Cloudflare Turnstile: verificación contra bots en los formularios.</li>
              <li>YouTube (Google): videos y sus miniaturas en este sitio.</li>
            </ul>
            <p>
              La base de datos está alojada en Estados Unidos. No compartimos tus datos con otras
              personas u organizaciones, salvo que la ley lo exija.
            </p>
          </Section>

          <Section title="Cuánto tiempo los guardamos">
            <p>
              Mientras formes parte de la vida de la iglesia o hasta que pidas borrarlos. Los
              registros de donaciones se conservan el tiempo que exigen las leyes contables y
              contributivas. Cuando se borran datos, pueden permanecer en las copias de seguridad de
              nuestros proveedores hasta que estas venzan.
            </p>
          </Section>

          <Section title="Tus derechos">
            <ul>
              <li>
                <b>Ver y corregir:</b> en Mi portal ves tus datos y corriges tu contacto. Para
                corregir otros datos, escribe a la iglesia.
              </li>
              <li>
                <b>Borrar:</b> en Mi portal, «Privacidad y mi cuenta» → «Borrar mi perfil». Si no
                tienes historial, se borra todo tu registro. Si lo tienes, se borran tu nombre,
                contacto, notas, peticiones de oración y respuestas de encuestas, y queda la
                estadística sin tu nombre. Las donaciones y certificaciones se conservan por
                obligaciones legales y contables, y un pastor general revisa la solicitud.
              </li>
              <li>
                Si no tienes cuenta en el portal, escribe a la iglesia para consultar, corregir o
                borrar tus datos.
              </li>
            </ul>
          </Section>

          <Section title="Menores de edad">
            <p>
              Las inscripciones en línea son solo para mayores de 18 años. Los datos de menores los
              registra el personal de la iglesia para la vida de la congregación.
            </p>
          </Section>

          <Section title="Seguridad">
            <p>
              Los accesos se controlan por funciones dentro de la base de datos, las conexiones van
              cifradas, los documentos sensibles se guardan en almacenamiento privado y los accesos
              a información delicada quedan registrados. Ningún sistema es infalible: si ocurriera
              un incidente que afecte tus datos, te avisaremos según lo exija la ley.
            </p>
          </Section>

          <Section title="Cambios a este aviso">
            <p>
              Si cambiamos este aviso, publicaremos aquí la nueva versión con su fecha de vigencia
              y, si tienes cuenta, te pediremos leerla la próxima vez que entres al portal.
            </p>
          </Section>

          <Section title="Contacto">
            <p>Para cualquier pregunta sobre tus datos, comunícate con la iglesia:</p>
            <ul>
              {s.email ? (
                <li>
                  Email:{" "}
                  <a href={`mailto:${s.email}`} className="underline underline-offset-4">
                    {s.email}
                  </a>
                </li>
              ) : null}
              {s.phone ? <li>Teléfono: {s.phone}</li> : null}
              {s.address ? <li>Dirección: {s.address}</li> : null}
            </ul>
          </Section>
        </div>
      </div>
    </SitePage>
  );
}
