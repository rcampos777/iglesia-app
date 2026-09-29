# Identidad visual — Ciudad de Avivamiento | Ponce

Aplicada el 2026-09-02. Los tokens viven en `src/app/globals.css`; nada
de esto está codificado suelto en componentes.

## 1. Paleta y su papel

| Color           | Hex       | Dónde aparece                                                     |
| --------------- | --------- | ----------------------------------------------------------------- |
| Rojo principal  | `#9E3030` | Botón primario, enlaces, elemento activo del menú, anillo de foco |
| Carbón          | `#252A2B` | Menú lateral, barra móvil, todo el texto                          |
| Verde grisáceo  | `#708B89` | Iconos y elementos secundarios, series de gráficos                |
| Azul gris claro | `#AEBDBC` | Bordes de tarjetas e inputs, texto del menú lateral               |
| Blanco cálido   | `#F5F4F0` | Fondo de la aplicación; texto sobre rojo o carbón                 |

Las tarjetas van en **blanco puro** (`#FFFFFF`) para separarse del fondo
cálido sin necesidad de sombra.

## 2. Contraste verificado (WCAG 2.1)

Calculado sobre los hex reales, no estimado.

| Combinación                         | Ratio      | Veredicto                     |
| ----------------------------------- | ---------- | ----------------------------- |
| Carbón sobre blanco cálido          | 13.21:1    | AA / AAA — todo el texto      |
| Blanco cálido sobre carbón          | 13.21:1    | AA / AAA — menú lateral       |
| Rojo sobre blanco cálido            | 6.54:1     | AA — enlaces y acentos        |
| Blanco cálido sobre rojo            | 6.54:1     | AA — botón primario, activo   |
| Verde grisáceo sobre blanco cálido  | 3.32:1     | Solo texto grande / bordes    |
| Azul gris claro sobre blanco cálido | 1.77:1     | **Nunca texto** — solo bordes |
| **Rojo sobre carbón**               | **2.02:1** | **No cumple** — ver abajo     |

### El conflicto rojo/carbón y cómo se resolvió

El requisito pedía rojo en enlaces activos y carbón en el menú lateral.
Esas dos cosas chocan: el rojo sobre carbón da 2.02:1. Aclarar el rojo
hasta que cumpliera (`#D57676`) lo convertía en un rosa lavado que
debilita la marca.

**Solución aplicada**: en el menú lateral el elemento activo lleva el
rojo como **fondo** con texto blanco cálido encima (6.54:1). El rojo como
_texto_ se usa solo en el área de contenido, sobre blanco cálido. Está en
los tokens `--sidebar-primary` / `--sidebar-primary-foreground`.

El texto inactivo del menú usa azul gris claro sobre carbón: 7.48:1.

## 3. Colores semánticos

Deliberadamente **fuera** de la paleta de marca: si "activo" fuera el
verde grisáceo y "error" el rojo de marca, un mensaje de error se vería
igual que un botón primario.

| Estado            | Hex       | Contraste sobre fondo |
| ----------------- | --------- | --------------------- |
| Activo/completado | `#2F6B4F` | 5.72:1 AA             |
| Advertencia       | `#8A5A00` | 5.39:1 AA             |
| Seguimiento       | `#2F5D7C` | 6.41:1 AA             |
| Error             | `#B5400C` | 5.15:1 AA             |
| Inactivo          | `#5F6866` | 5.22:1 AA             |

El error `#B5400C` se separa del rojo de marca en tono (18° vs 0°) y
saturación (88% vs 53%). Aun así **el color nunca comunica solo**: cada
insignia lleva su texto (WCAG 1.4.1).

Se usan vía `StatusBadge` (`src/components/ui-brand/status-badge.tsx`) y
el mapeo central `src/lib/status-tones.ts`. Están fuera de
`components/ui/` porque el core de shadcn no se edita a mano
(CLAUDE.md §9).

## 4. Logo oficial

Entregado por el usuario el 2026-09-28 (PNG 1600×882, fondo
transparente). Archivos derivados:

- `public/brand/logo-full.png` — logo completo (símbolo + nombre +
  lema), usado en las pantallas de acceso (`LogoFull`).
- `public/brand/logo-mark.png` — solo el símbolo (llama + edificios),
  cuadrado, usado en el menú (`LogoMark`). Va sobre una baldosa
  `--brand-warm-white` porque el edificio carbón se perdería sobre el
  menú carbón.
- `src/app/icon.png`, `apple-icon.png`, `favicon.ico` — el símbolo sobre
  fondo claro.

Si llega un SVG oficial, reemplazar estos PNG manteniendo los nombres.

## 5. Accesibilidad del logo

Las imágenes llevan `alt` descriptivo. En las pantallas de acceso el
nombre de la iglesia queda como `<h1 className="sr-only">` porque el
logo completo ya lo muestra visualmente.

## 6. Tema oscuro

Los tokens de `.dark` están definidos. Sobre fondo oscuro el rojo de
marca se aclara a `#D57676` (5.6:1) porque `#9E3030` sobre `#1B1F20` solo
llegaría a 2.4:1. El menú lateral se oscurece a `#14181A` para seguir
separándose del contenido, y el activo mantiene el rojo de marca.

## 7. Tipografía y escala (rediseño 2026-09-28)

- **Geist** (`next/font/google`, variable `--font-geist-sans`) es la
  fuente de toda la app. En `globals.css` el `@theme` decía
  `--font-sans: var(--font-sans)` — una referencia circular que dejaba
  la fuente sin resolver y el navegador caía en su serif por defecto.
  Ahora `--font-sans` y `--font-heading` apuntan a
  `--font-geist-sans` con respaldo `system-ui`.
- Título de página: 24 px en móvil, 28 px desde `md`
  (`text-2xl … md:text-[1.75rem]`, semibold). Todas las páginas usan la
  misma clase; las nuevas usan `PageHeader`.
- Texto principal 16 px; menú 15 px; tablas y controles 14–16 px; texto
  pequeño (13–14 px) solo para información complementaria.
- Pesos: regular, medium (etiquetas, enlaces activos) y semibold
  (títulos, cifras). Sin negritas sueltas.

## 8. Controles y superficies

- Botones y campos a 36 px de alto (40 px `lg`, 32 px `sm`). Se define
  en `globals.css` sobre los atributos `data-slot` / `data-size` de
  shadcn, fuera de `@layer` para imponerse a sus utilidades sin editar
  el núcleo. Ninguna página sobrescribe esas alturas por clase.
- Tarjetas: blanco puro, borde fino (`ring-foreground/10`), radio
  `rounded-xl` y una sombra muy discreta (desactivada en oscuro).
- Formularios de creación van dentro de una tarjeta con ancho de
  lectura (`max-w-lg` / `max-w-2xl`).
- Se eliminó el relleno vertical doble (`CardContent py-4` dentro de
  `Card`, que ya trae su propio espaciado).

## 9. Componentes propios (`src/components/ui-brand/`)

| Componente    | Uso                                                        |
| ------------- | ---------------------------------------------------------- |
| `PageHeader`  | Título, descripción, antetítulo opcional y acciones.       |
| `TableCard`   | Contenedor de tablas; el scroll horizontal queda adentro.  |
| `EmptyState`  | Estado vacío con icono + texto (no depende del color).     |
| `StatusBadge` | Estados semánticos (ya existía); ahora también clases,     |
|               | matrícula y oración (`classTone`, `enrollmentTone`, etc.). |

Las etiquetas de estado viven en `src/lib/labels.ts`
(`classStatusLabels`, `enrollmentStatusLabels`, `prayerStatusLabels`):
el detalle de una clase mostraba el valor crudo (`en_progreso`).

## 10. Navegación

- Iconos de Lucide y grupos (General · Congregación · Formación y
  eventos · Cuidado pastoral · Gestión). La agrupación es solo
  presentación en `app-nav.tsx`: **qué enlaces ve cada usuario sigue
  decidiéndolo `visibleNavItems`** en el servidor. Un grupo sin enlaces
  no se muestra; una ruta nueva sin grupo cae en "Otros".
- Activo: fondo rojo + texto blanco cálido (6.54:1) y
  `aria-current="page"`.
- Foco en el menú: anillo en el tono claro del menú (7.48:1 sobre
  carbón). El rojo sobre carbón (2.02:1) no sirve como indicador.
- El área de enlaces se desplaza sola; el cierre de sesión queda fijo
  abajo aunque la pantalla sea baja (verificado a 1440×560 y 375×600).
- Menú lateral fijo desde `lg` (1024 px). En móvil y tablet: barra
  superior + menú deslizable con la misma estructura.

## 11. Panel y portal

- **Panel**: fecha de hoy, métricas compactas (solo conteos reales de
  `getDashboardCounts`; sin tendencias ni gráficos inventados) y
  accesos rápidos. Cada métrica enlaza a su módulo solo si ese módulo
  está en el menú del usuario. Cada acceso rápido replica exactamente
  el guard de su página de destino (el guard y RLS siguen siendo la
  barrera real).
- **Portal del miembro**: asistencia (confirmar + código QR) arriba,
  actividades y cursos lado a lado, luego ministerios. Peticiones de
  oración en la columna lateral; los datos de contacto quedan plegados
  (`<details>`) para no dominar la página. El texto de privacidad dice
  "el equipo de intercesión y la administración" (antes decía
  "pastores", que ya no tienen acceso por rol — decisión 2026-09-02).
