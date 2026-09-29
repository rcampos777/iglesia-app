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
