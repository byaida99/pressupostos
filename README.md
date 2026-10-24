# Presupuestos (v4)

App para hacer presupuestos de mobiliario a medida. Funciona abriendo `index.html` con **Chrome o Edge** desde la carpeta compartida del NAS. No necesita servidor ni instalación.

## Carpetas en el NAS

```
CARPETA COMPARTIDA/
  0_PROGRAMA/          ← esta app (index.html, catalogo.xlsx, LOGO.JPG…)
  1_PRESSUPOSTOS/
    1234/              ← un cliente con código (vale también «1234 - Nombre»)
      2026-001 - Nombre.json
      2026-001 - Nombre.pdf
    1000/              ← clientes sin código
      Nombre - 600123456/
        2026-002 - Nombre.json
        2026-002 - Nombre.pdf
```

## Archivos

| Archivo | Para qué sirve |
| --- | --- |
| `index.html` | La app. Se abre con doble clic. |
| `catalogo.xlsx` | Precios: tableros, cantos, acabados, extras, recargo y parámetros. **Se edita con Excel.** |
| `plantilla_presupuesto.xlsx` | Plantilla para preparar un presupuesto en Excel e importarlo. |
| `LOGO.JPG` | Logo que sale en el PDF del cliente (el nombre se cambia en el catálogo, pestaña Parámetros). |
| `js/`, `lib/`, `styles.css` | Código de la app. No hace falta tocarlos. `lib/` lleva SheetJS, html2canvas y jsPDF para funcionar sin internet. |

## Uso

1. La primera vez en cada ordenador, la app pide elegir la carpeta del NAS que contiene `0_PROGRAMA` y `1_PRESSUPOSTOS`. Después solo hay que pulsar «Conectar» al abrirla.
2. **Guardar** (o Ctrl+S) asigna el número siguiente (`2026-001`, `2026-002`…) y guarda el `.json` en la carpeta del cliente según su **código**. Si la carpeta no existe, se crea. Sin código (o con 1000) va a `1000/Nombre - Teléfono`. Si luego se cambia el código o el nombre, el presupuesto y su PDF se mueven solos.
3. **Abrir** muestra todos los presupuestos con un buscador (número, código, cliente o referencia). **Duplicar** crea uno nuevo a partir del abierto.
4. **PDF cliente** genera el PDF y lo guarda junto al `.json`, con el mismo nombre. **PDF completo** (interno) abre el diálogo de impresión.
5. En la tabla de piezas, **Intro** baja a la fila siguiente o crea una nueva.
6. Cada presupuesto se divide en **muebles** (apartados): cada uno con su nombre, sus materiales, piezas y extras. El PDF del cliente muestra el precio de cada mueble.
7. La casilla **Incluir** de cada mueble lo quita del presupuesto (no suma ni sale en el PDF) sin borrarlo.
8. El PDF del cliente termina con el resumen (base imponible, IVA y total) y las condiciones de pago: el porcentaje inicial y el número de cuenta se cambian en `catalogo.xlsx`, pestaña Parámetros.

## Plantilla Excel

`plantilla_presupuesto.xlsx` permite preparar un presupuesto en Excel: una fila por pieza, con la columna «Mueble» para separar apartados, y una pestaña de extras. Se importa con **⋯ → Importar plantilla Excel**. Desde **⋯ → Descargar plantilla Excel** se obtiene una plantilla nueva con los materiales del catálogo actual.

## Cambiar precios o añadir productos

Abrir `catalogo.xlsx`, cambiar o añadir filas, guardar y pulsar **⋯ → Recargar catálogo** en la app. La pestaña «Instrucciones» del Excel explica cada columna.

Los presupuestos guardados conservan los precios con los que se hicieron. Para pasarlos a precios nuevos: abrirlos y pulsar «Actualizar a precios actuales».

## Cálculo

- El tablero se cobra por tableros enteros o por m² de pieza más la merma.
- El corte y el CNC se cobran por el perímetro de las piezas, y el canteado por los cantos marcados (o por todo el perímetro si la familia es «Pulido»).
- El porcentaje del recargo por escala se decide con el importe total del proyecto, incluido el acabado superficial, y se aplica a todo. Se puede desactivar con la casilla «Aplicar recargo por escala» del resumen. El acabado superficial (lacado, barnizado) se presenta como opcional.
- El descuento de carpintero se aplica sobre el tablero y el material de canto.
- El porcentaje de recargo se decide con el total del presupuesto y se aplica igual a cada mueble, así la suma de los precios de los muebles es el total.
