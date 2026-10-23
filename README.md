# Presupuestos (v4)

App para hacer presupuestos de mobiliario a medida. Funciona abriendo `index.html` con **Chrome o Edge** desde la carpeta compartida del NAS. No necesita servidor ni instalación.

## Archivos

| Archivo | Para qué sirve |
| --- | --- |
| `index.html` | La app. Se abre con doble clic. |
| `catalogo.xlsx` | Precios: tableros, cantos, acabados, extras, recargo y parámetros. **Se edita con Excel.** |
| `LOGO.JPG` | Logo que sale en el PDF del cliente (el nombre se cambia en el catálogo, pestaña Parámetros). |
| `Presupuestos/AAAA/AAAA-NNN - Cliente/presupuesto.json` | Cada presupuesto guardado. Los crea la app. |
| `js/`, `lib/`, `styles.css` | Código de la app. No hace falta tocarlos. |

## Uso

1. La primera vez en cada ordenador, la app pide elegir la carpeta del NAS donde están `index.html` y `catalogo.xlsx`. Después solo hay que pulsar «Conectar» al abrirla.
2. **Guardar** (o Ctrl+S) asigna el número siguiente (`2026-001`, `2026-002`…) y crea la carpeta del presupuesto.
3. **Abrir** muestra todos los presupuestos con un buscador. **Duplicar** crea uno nuevo a partir del abierto.
4. **PDF cliente** y **PDF completo** abren el diálogo de impresión: elegir «Guardar como PDF».
5. En la tabla de piezas, **Intro** baja a la fila siguiente o crea una nueva.

## Cambiar precios o añadir productos

Abrir `catalogo.xlsx`, cambiar o añadir filas, guardar y pulsar **⋯ → Recargar catálogo** en la app. La pestaña «Instrucciones» del Excel explica cada columna.

Los presupuestos guardados conservan los precios con los que se hicieron. Para pasarlos a precios nuevos: abrirlos y pulsar «Actualizar a precios actuales».

## Cálculo

- El tablero se cobra por tableros enteros o por m² de pieza más la merma.
- El corte y el CNC se cobran por el perímetro de las piezas, y el canteado por los cantos marcados (o por todo el perímetro si la familia es «Pulido»).
- El recargo por escala se aplica a materiales, mecanizado y extras. El acabado superficial (lacado, barnizado) se presenta como opcional y lleva su propio recargo, igual que en el PDF del cliente de la v3.
- El descuento de carpintero se aplica sobre el tablero y el material de canto.
