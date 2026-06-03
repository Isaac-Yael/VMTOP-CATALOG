# Guía: WooCommerce solo para cobrar — VMTOP

## Qué hace esta configuración

- `vmtop.mx` redirige automáticamente a `tienda-mayoreo.vmtop.mx`
- Las páginas `/shop`, `/producto/...` y `/carrito` de WooCommerce desaparecen
- Solo funcionan: `/checkout`, `/order-pay/...`, `/mi-cuenta`, `/wp-admin`
- El checkout se ve limpio, sin el header/footer del tema Hello

---

## PASO 1 — Redirigir vmtop.mx al catálogo (.htaccess)

**Dónde:** Hostinger → Administrador de archivos → raíz de `vmtop.mx` → `.htaccess`

Abre el archivo `.htaccess` y pega el siguiente bloque **ANTES** de la línea `# BEGIN WordPress`:

```apache
<IfModule mod_rewrite.c>
RewriteEngine On

RewriteCond %{REQUEST_FILENAME} -f [OR]
RewriteCond %{REQUEST_FILENAME} -d
RewriteRule ^ - [L]

RewriteCond %{REQUEST_URI} ^/wp-admin [OR]
RewriteCond %{REQUEST_URI} ^/wp-login\.php [OR]
RewriteCond %{REQUEST_URI} ^/wp-cron\.php [OR]
RewriteCond %{REQUEST_URI} ^/wp-json [OR]
RewriteCond %{REQUEST_URI} ^/wp-content [OR]
RewriteCond %{REQUEST_URI} ^/wp-includes [OR]
RewriteCond %{REQUEST_URI} ^/checkout [OR]
RewriteCond %{REQUEST_URI} ^/order-pay [OR]
RewriteCond %{REQUEST_URI} ^/mi-cuenta [OR]
RewriteCond %{REQUEST_URI} ^/finalizar-compra [OR]
RewriteCond %{REQUEST_URI} ^/gracias [OR]
RewriteCond %{QUERY_STRING} wc-ajax= [OR]
RewriteCond %{QUERY_STRING} ^pay_for_order
RewriteRule ^ - [L]

RewriteRule ^ https://tienda-mayoreo.vmtop.mx/ [R=301,L]

</IfModule>
```

> ⚠️ Si WordPress usa `/finalizar-compra` en lugar de `/checkout`, ya está cubierto.
> Verifica el slug en WooCommerce → Ajustes → Avanzado → URLs de la página.

---

## PASO 2 — Instalar el snippet PHP

### Opción A: Plugin Code Snippets (recomendado)

1. En WordPress ve a **Plugins → Añadir nuevo** → busca **"Code Snippets"** → Instalar y activar
2. Ve a **Snippets → Añadir nuevo**
3. Ponle nombre: `VMTOP Checkout Limpio`
4. Abre el archivo `checkout-limpio.php` que está en tu carpeta de outputs
5. Copia todo el contenido **excepto** la primera línea `<?php` y la última `?>`
6. Pégalo en el editor del snippet
7. Selecciona **"Solo ejecutar en el frontend"**
8. Clic en **Guardar y activar**

### Opción B: functions.php (si prefieres sin plugin)

1. En WordPress ve a **Apariencia → Editor de temas**
2. Selecciona el tema hijo de Hello
3. Abre `functions.php`
4. Pega el contenido al final del archivo

---

## PASO 3 — Verificar slugs de checkout en WooCommerce

En WordPress ve a **WooCommerce → Ajustes → Avanzado**

Confirma que los slugs sean:
- Página de finalizar compra: `checkout` o `finalizar-compra`
- Página Mi cuenta: `mi-cuenta`

Si usan slugs diferentes, actualiza las líneas correspondientes en el `.htaccess`.

---

## PASO 4 — Prueba final

Después de aplicar los cambios, prueba esto en orden:

1. Entra a `vmtop.mx` → debe redirigir a `tienda-mayoreo.vmtop.mx` ✓
2. Entra a `vmtop.mx/shop` → debe redirigir al catálogo ✓
3. Agrega productos al carrito en el catálogo y haz clic en "Pagar en línea" → debe abrir el checkout de WooCommerce sin header/footer ✓
4. Entra a `vmtop.mx/wp-admin` → debe cargar el panel de WordPress normalmente ✓

---

## Notas importantes

- El catálogo (`tienda-mayoreo.vmtop.mx`) sigue leyendo de `productos.json` — no cambia nada
- WooCommerce solo ve el pedido en el momento del pago, no antes
- Los correos de confirmación de WooCommerce siguen funcionando igual
- Si en el futuro cambias el dominio del catálogo, solo actualiza las URLs en el `.htaccess` y en el snippet PHP
