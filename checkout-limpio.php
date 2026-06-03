<?php
/**
 * VMTOP – Checkout limpio (sin header/footer del tema Hello)
 *
 * CÓMO INSTALARLO (elige UNA opción):
 *
 * OPCIÓN A – Plugin "Code Snippets" (recomendado, sin tocar archivos):
 *   1. Instala el plugin gratuito "Code Snippets" en WordPress
 *   2. Ve a Snippets → Añadir nuevo
 *   3. Pega TODO el código de abajo (sin las etiquetas <?php y ?>)
 *   4. Actívalo y guarda
 *
 * OPCIÓN B – functions.php del tema hijo:
 *   1. Crea un tema hijo de Hello (si no tienes uno)
 *   2. Pega el código en functions.php del tema hijo
 */

// ── 1. Quitar header y footer de Hello en checkout y order-pay ──────────────
add_action('get_header', function() {
    if (is_checkout() || is_wc_endpoint_url('order-pay')) {
        remove_action('hello_elementor_header', 'hello_elementor_header_markup');
        remove_action('hello_elementor_page_header', 'hello_elementor_page_header_markup');
    }
});

add_action('get_footer', function() {
    if (is_checkout() || is_wc_endpoint_url('order-pay')) {
        remove_action('hello_elementor_footer', 'hello_elementor_footer_markup');
    }
});

// ── 2. Agregar logo VMTOP y botón "volver al catálogo" en el checkout ───────
add_action('woocommerce_before_checkout_form', function() { ?>
<div style="text-align:center; padding: 20px 0 10px;">
    <a href="https://tienda-mayoreo.vmtop.mx" style="display:inline-block; margin-bottom:12px;">
        <img src="<?php echo get_template_directory_uri(); ?>/assets/images/logo.png"
             alt="VMTOP"
             style="height:44px; width:auto;"
             onerror="this.style.display='none'" />
    </a>
    <br>
    <a href="https://tienda-mayoreo.vmtop.mx"
       style="font-size:13px; color:#3b82f6; text-decoration:none;">
        ← Volver al catálogo
    </a>
</div>
<?php }, 5);

// ── 3. CSS mínimo para que el checkout se vea limpio sin el tema ─────────────
add_action('wp_head', function() {
    if (!is_checkout() && !is_wc_endpoint_url('order-pay')) return; ?>
<style>
  body { background: #f3f4f6 !important; }
  .site-header, .site-footer,
  header.site-header, footer.site-footer,
  .elementor-location-header, .elementor-location-footer { display: none !important; }
  .woocommerce { max-width: 860px; margin: 0 auto; padding: 20px; }
</style>
<?php });

// ── 4. Redirigir /shop y páginas de producto al catálogo ────────────────────
add_action('template_redirect', function() {
    if (is_shop() || is_product() || is_product_category() || is_product_tag() || is_cart()) {
        wp_redirect('https://tienda-mayoreo.vmtop.mx', 301);
        exit;
    }
});
