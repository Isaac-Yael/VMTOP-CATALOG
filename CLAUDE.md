# VMTOP — Memoria del Proyecto para Claude

> Leer este archivo al inicio de cada sesión nueva para retomar el contexto sin repetir explicaciones.

---

## Qué es este proyecto

Catálogo mayorista de VMTOP (Ciudad de México). Es una **Single Page App estática** publicada en **GitHub Pages** bajo el dominio `vmtop.com.mx`. El pago se procesa mediante dos flujos: WhatsApp (para coordinación manual) y PayPal (tarjeta/PayPal directo).

El backend de órdenes vive en un WordPress+WooCommerce separado en `vmtop.mx`.

---

## Dominios y URLs clave

| Recurso | URL |
|---|---|
| Catálogo (producción) | https://vmtop.com.mx |
| WordPress / WooCommerce | https://vmtop.mx |
| Proxy crear pedido WC | https://vmtop.mx/crear-pedido.php |
| PayPal crear orden | https://vmtop.mx/paypal-create-order.php |
| PayPal capturar pago | https://vmtop.mx/paypal-capture-order.php |
| Repositorio GitHub | https://github.com/Isaac-Yael/VMTOP-CATALOG |

---

## Arquitectura del catálogo

```
VMTOP-CATALOG/
├── index.html              ← SPA principal
├── css/styles.css          ← Estilos únicos (no hay frameworks)
├── js/app.js               ← Toda la lógica JS (catálogo, carrito, checkout, PayPal)
├── productos.json          ← Base de datos de productos (JSON estático)
├── img/                    ← Imágenes de productos (WebP) + vmtop_icon.png (favicon)
├── data/                   ← Archivos auxiliares de datos
├── paypal-create-order.php ← Se sube a vmtop.mx (no GitHub Pages)
├── paypal-capture-order.php← Se sube a vmtop.mx (no GitHub Pages)
├── crear-pedido.php        ← Proxy WooCommerce, también en vmtop.mx
├── CNAME                   ← Contiene: vmtop.com.mx
└── CLAUDE.md               ← Este archivo
```

> **IMPORTANTE:** Los archivos `.php` NO se sirven desde GitHub Pages. Deben subirse manualmente a `vmtop.mx` vía Hostinger File Manager → `public_html/`.

---

## Constantes en app.js (líneas ~987-991)

```js
const WC_PROXY     = 'https://vmtop.mx/crear-pedido.php';
const PP_CREATE    = 'https://vmtop.mx/paypal-create-order.php';
const PP_CAPTURE   = 'https://vmtop.mx/paypal-capture-order.php';
const PP_CLIENT_ID = 'BAAbBL15yk9Eur-y5AW9O48tpwryAGS6TvPahyOXo3L9t20IXyluYPHO5CWTSjPw70GL3LOQbQfAkJBO2U';
const WA_NUMBER    = '525568850885';  // Botón flotante WhatsApp + pedidos por WhatsApp
```

---

## Flujo de pago PayPal

1. Usuario llena formulario de checkout → clic "Proceder al pago"
2. JS carga SDK de PayPal dinámicamente (con `PP_CLIENT_ID`)
3. Usuario aprueba pago en ventana PayPal
4. `onApprove` → llama `paypal-capture-order.php` → captura el pago
5. Si captura exitosa → llama `crear-pedido.php` → crea orden en WooCommerce
6. Muestra mensaje de éxito con número de orden WC

### Flag crítico
`paypalButtonsRendered` (booleano, `let`, inicia en `false`). Debe resetearse a `false` y limpiar `innerHTML` del contenedor al cerrar/resetear el popup para evitar totales desactualizados. Esto lo hace `resetToFormStep()`.

---

## Flujo de pedido WhatsApp

- Botón "Enviar pedido por WhatsApp" en el carrito
- Genera mensaje con los productos y lo abre en `wa.me/525568850885`
- No hay pago en línea en este flujo

---

## PayPal — Credenciales LIVE (solo referencia — nunca compartir)

Las credenciales están hardcodeadas en los dos PHP (`paypal-create-order.php` y `paypal-capture-order.php`). El Client ID también está en `app.js` (esto es correcto por diseño de PayPal — el Client ID es público).

---

## CORS en los PHP

Los PHP en `vmtop.mx` tienen esta lista de orígenes permitidos:
```php
$allowed = ['https://vmtop.com.mx', 'https://www.vmtop.com.mx', 'https://tienda-mayoreo.vmtop.mx', 'https://mayoreo.vmtop.mx'];
```
Si se agrega un nuevo dominio al catálogo, hay que actualizar esta lista en **ambos** PHP y volver a subirlos.

---

## Cache busting

Los archivos CSS y JS se cargan con query string de versión en `index.html`:
```html
<link rel="stylesheet" href="css/styles.css?v=20260613a" />
<script src="js/app.js?v=20260613a"></script>
```
Cada vez que se haga un cambio importante, incrementar la versión (ej: `20260614a`) para forzar recarga en browsers.

---

## WooCommerce — Line items

Los productos deben enviarse al proxy con estos campos para que aparezcan correctamente en el admin de WC:
```js
{
  name:     item.name || item.sku.toUpperCase(),
  sku:      item.sku.toUpperCase(),
  quantity: item.qty,
  subtotal: (item.unitPrice * item.qty).toFixed(2),
  total:    (item.unitPrice * item.qty).toFixed(2),
  price:    item.unitPrice.toFixed(2),
}
```

---

## Decisiones de diseño ya tomadas (no revertir sin autorización)

- No se usa ningún framework CSS ni JS (todo vanilla)
- PayPal es el único método de pago en línea (no Stripe, no MercadoPago)
- El total del carrito se calcula en el cliente (aceptable para el modelo mayorista de revisión manual)
- El SDK de PayPal se carga dinámicamente en JS, no con `<script>` hardcodeado en HTML
- WooCommerce recibe el pedido **después** de que PayPal confirma el pago, no antes

---

## Cómo hacer deploy

1. Editar archivos en `/Users/isaac/Documents/VMTOP-CATALOG/`
2. Desde terminal: `git add . && git commit -m "descripción" && git push origin main`
3. GitHub Pages publica automáticamente en 1-2 minutos
4. Si se modificaron PHP: subirlos manualmente a Hostinger → File Manager → `public_html/`

---

## Contacto / Empresa

- Empresa: VMTOP Mayoreo, Ciudad de México
- WhatsApp de ventas: +52 55 6885 0885
- Email Isaac: sigan1998@gmail.com
- Canales: TikTok, Facebook, Instagram, WhatsApp
