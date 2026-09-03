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

## 4. Logo — PROVISIONAL, hay que sustituirlo

⚠️ **El logo actual NO es la marca oficial de la iglesia.** Es un
monograma tipográfico "CA" construido en código
(`src/components/brand/logo.tsx` y `src/app/icon.svg`), usado mientras
llega el archivo real. Al ser vectorial no se ve borroso ni deformado en
ningún tamaño.

**Para sustituirlo** hace falta del cliente:

- SVG del logo, o PNG de al menos 1000 px de ancho con fondo transparente.
- Una versión clara, para el menú lateral en carbón.
- Un icono cuadrado para el favicon.

Pasos: colocar el archivo en `public/`, reemplazar el `<svg>` de
`LogoMark` por un `<Image>` de `next/image` con `alt` descriptivo, y
regenerar `src/app/icon.svg`.

No se descargó la imagen de Facebook: bajar archivos de terceros se
consulta con el usuario antes de hacerlo.

## 5. Accesibilidad del logo

`LogoMark` es un `<svg role="img">` con `aria-label="Ciudad de
Avivamiento"`. Donde va acompañado del nombre en texto (`Logo`), el
`aria-label` sigue describiendo la marca y el texto es legible por sí
mismo, así que no hay duplicación confusa para lectores de pantalla.

## 6. Tema oscuro

Los tokens de `.dark` están definidos. Sobre fondo oscuro el rojo de
marca se aclara a `#D57676` (5.6:1) porque `#9E3030` sobre `#1B1F20` solo
llegaría a 2.4:1. El menú lateral se oscurece a `#14181A` para seguir
separándose del contenido, y el activo mantiene el rojo de marca.
