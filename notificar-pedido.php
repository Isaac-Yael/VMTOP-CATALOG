<?php
/**
 * VMTOP – Notificación temporal de pedido por correo
 * Subir a: https://vmtop.mx/notificar-pedido.php (Hostinger, NO se sube a GitHub Pages)
 *
 * SOLO TEMPORAL: mientras se resuelve el bug de crear-pedido.php (404 en POST),
 * este script envía un correo a Isaac con el detalle del pedido ya pagado por
 * PayPal, para que pueda surtirlo manualmente. No depende de WooCommerce.
 *
 * Recibe: { captureId, customer_note, billing: {...}, line_items: [...] }
 */

/* ─── Capturar errores PHP y devolverlos como JSON ──────────────── */
set_error_handler(function($errno, $errstr, $errfile, $errline) {
    http_response_code(500);
    echo json_encode(['error' => "PHP Error [$errno]: $errstr en $errfile línea $errline"]);
    exit;
});
set_exception_handler(function($e) {
    http_response_code(500);
    echo json_encode(['error' => 'Excepción: ' . $e->getMessage()]);
    exit;
});

/* ─── CORS ──────────────────────────────────────────────────────── */
$allowed = ['https://vmtop.com.mx', 'https://www.vmtop.com.mx', 'https://tienda-mayoreo.vmtop.mx', 'https://mayoreo.vmtop.mx'];
$origin  = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $allowed)) {
    header("Access-Control-Allow-Origin: $origin");
}
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Método no permitido']);
    exit;
}

/* ─── Leer datos ────────────────────────────────────────────────── */
$input = json_decode(file_get_contents('php://input'), true);
if (!$input) {
    http_response_code(400);
    echo json_encode(['error' => 'Datos inválidos']);
    exit;
}

$captureId = $input['captureId']     ?? '-';
$note      = $input['customer_note'] ?? '';
$billing   = $input['billing']       ?? [];
$items     = $input['line_items']    ?? [];

/* ─── Armar el correo ───────────────────────────────────────────── */
$to      = 'sigan1998@gmail.com';
$subject = '🛒 Nuevo pedido pagado por PayPal — VMTOP';

$body  = "NUEVO PEDIDO PAGADO POR PAYPAL\n";
$body .= "================================\n\n";
$body .= "ID de captura PayPal: $captureId\n\n";
$body .= "Cliente:\n";
$body .= "  Nombre:   " . trim(($billing['first_name'] ?? '') . ' ' . ($billing['last_name'] ?? '')) . "\n";
$body .= "  Email:    " . ($billing['email'] ?? '-') . "\n";
$body .= "  Teléfono: " . ($billing['phone'] ?? '-') . "\n";
$body .= "  Dirección:" . ($billing['address_1'] ?? '-') . ', ' . ($billing['city'] ?? '') . ' CP ' . ($billing['postcode'] ?? '') . "\n\n";
$body .= "Productos:\n";
foreach ($items as $it) {
    $qty   = $it['quantity'] ?? '?';
    $sku   = $it['sku']      ?? '?';
    $name  = $it['name']     ?? '';
    $total = $it['total']    ?? '?';
    $body .= "  - {$qty}x {$sku} — {$name} (\${$total})\n";
}
$body .= "\nNota: $note\n";
$body .= "\n— Generado automáticamente por notificar-pedido.php (respaldo temporal)\n";

$headers  = "From: pedidos@vmtop.mx\r\n";
$headers .= "Reply-To: pedidos@vmtop.mx\r\n";
$headers .= "Content-Type: text/plain; charset=UTF-8\r\n";

/* ─── Enviar ────────────────────────────────────────────────────── */
$sent = @mail($to, $subject, $body, $headers);

if (!$sent) {
    http_response_code(500);
    echo json_encode(['error' => 'No se pudo enviar el correo']);
    exit;
}

echo json_encode(['success' => true]);
