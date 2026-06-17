<?php
/**
 * VMTOP – Copia EXACTA de crear-pedido.php, solo para prueba diagnóstica.
 * Nombre nuevo, nunca usado antes. Se borra después de la prueba.
 */

/* ─── Capturar errores PHP y devolverlos como JSON ──────────────── */
set_error_handler(function($errno, $errstr, $errfile, $errline) {
    http_response_code(500);
    echo json_encode(['error' => "PHP Error [$errno]: $errstr en $errfile línea $errline"]);
    exit;
});
set_exception_handler(function($e) {
    http_response_code(500);
    echo json_encode(['error' => 'Excepción: ' . $e->getMessage() . ' en ' . $e->getFile() . ':' . $e->getLine()]);
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

/* ─── Credenciales WooCommerce REST API ────────────────────────── */
$wc_key    = 'ck_32b86ba7358decaa6f1c43b57e12afe771b69e42';
$wc_secret = 'cs_fe1a8f15ce409867f4d752800436cf0351f11a11';
/* Se usa 127.0.0.1 (loopback) en vez de vmtop.mx para evitar que el
   servidor tenga que hacer una petición pública hacia sí mismo.
   El header Host se fija manualmente para que el servidor sepa a
   qué sitio (vmtop.mx) debe enrutar la petición. */
$wc_url    = 'https://127.0.0.1/wp-json/wc/v3/orders';

/* ─── Validar datos ─────────────────────────────────────────────── */
$input = json_decode(file_get_contents('php://input'), true);

if (!$input || empty($input['line_items'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Datos inválidos']);
    exit;
}

/* ─── Crear pedido en WooCommerce ──────────────────────────────── */
$ch = curl_init($wc_url);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => json_encode($input),
    CURLOPT_HTTPHEADER     => ['Content-Type: application/json', 'Host: vmtop.mx'],
    CURLOPT_USERPWD        => "$wc_key:$wc_secret",
    /* El certificado SSL es de vmtop.mx, no de 127.0.0.1, así que no se
       puede validar contra ese nombre — pero seguimos dentro del mismo
       servidor (loopback), no es una conexión insegura real. */
    CURLOPT_SSL_VERIFYPEER => false,
    CURLOPT_SSL_VERIFYHOST => false,
    CURLOPT_CONNECTTIMEOUT => 5,
    CURLOPT_TIMEOUT        => 15,
]);
$response = curl_exec($ch);
$status   = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlErr  = curl_error($ch);
curl_close($ch);

if ($response === false) {
    http_response_code(500);
    echo json_encode(['error' => 'Error de conexión con WooCommerce', 'details' => $curlErr]);
    exit;
}

http_response_code($status);
echo $response;
