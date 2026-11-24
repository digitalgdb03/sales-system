# Sistema de Ventas — Demo

Demo web (HTML + JavaScript, sin servidor) de las funciones del sistema de ventas para la cafetería.
Los datos de ejemplo se guardan en el navegador; cada pestaña puede ser una caja distinta y todas se sincronizan.

## Probar en local

Los módulos JS no abren con doble clic (`file://`); hace falta un servidor estático:

```bash
npx serve .
# o
python -m http.server 8080
```

## Publicar en Vercel

```bash
npm i -g vercel
vercel          # primera vez: crea el proyecto
vercel --prod   # publica
```

O subir la carpeta a un repositorio y hacer "Import Project" en vercel.com. No necesita build: es un sitio estático.

## Configuración (solo en código)

Todo está en [`js/config.js`](js/config.js):

| Opción | Qué hace |
|---|---|
| `MODO_COMANDAS` | `true`: mesas + comandas a Cocina/Barra + venta rápida. `false`: solo venta en mostrador. |
| `MODULO_FIADO` | `true`: pantalla Fiado, método de pago "Fiado", límite de crédito por cliente y abonos. `false`: todo eso oculto. |
| `CONFIRMAR_PAGOS` | `true`: Pago Móvil / Transferencia / Zelle quedan "por confirmar" (pestaña en Ventas). `false`: se dan por buenos al cobrar. |
| `MODO_FISCAL` | `true`: factura con N° de control, IVA, IGTF en pagos en divisas, impresora fiscal. `false`: nota de entrega. |
| `IMPRESION.modo` | `navegador`, `servidor-usb`, `red-ip` o `por-caja` (cada caja con su impresora). Comandas por área en `IMPRESION.comandas`. |
| `TASA` | Intervalo de consulta automática al BCV, fuentes y días para avisar que la tasa está vieja. |
| `METODOS_PAGO`, `CAJAS`, `MESAS`, `NEGOCIO` | Catálogos básicos. |

Al cambiar `MODO_COMANDAS`, `MODULO_FIADO`, `CONFIRMAR_PAGOS` o `MODO_FISCAL`, los datos de ejemplo se regeneran solos al recargar la página.

## Estructura

```
index.html
css/app.css
js/config.js      configuración
js/services.js    lógica de negocio (ventas, pagos, caja, fiado, comandas) — pasa tal cual al servidor en la versión real
js/tasa.js        tasa BCV automática + manual
js/printing.js    tickets, comandas, cierres y comandos ESC/POS
js/db.js          almacenamiento de la demo (localStorage compartido entre pestañas)
js/seed.js        datos de ejemplo
js/views/*.js     pantallas
```
