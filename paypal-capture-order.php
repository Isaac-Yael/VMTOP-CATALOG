<?php
/**
 * VMTOP – Capturar orden PayPal aprobada
 * Subir a: https://vmtop.mx/paypal-capture-order.php
 *
 * Recibe: { "orderID": "PAYPAL_ORDER_ID" }
 * Devuelve: { "success": true, "captureId": "..." }
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

/* ─── CREDENCIALES PAYPAL LIVE ──────────────────────────────────── */
/*  ⚠️  Mismas credenciales que paypal-create-order.php            */
define('PP_CLIENT_ID', 'BAAbBL15yk9Eur-y5AW9O48tpwryAGS6TvPahyOXo3L9t20IXyluYPHO5CWTSjPw70GL3LOQbQfAkJBO2U');
define('PP_SECRET',    'EHpkYwceNovt07gHxqeIZTq4PNyu6QcA1e1RI0l2ln3gTle5sgazQrMQ6WOoTyCTmJrrdpAw8F55S0OK');
define('PP_BASE',      'https://api-m.paypal.com');

/* ─── Validar input ─────────────────────────────────────────────── */
$input   = json_decode(file_get_contents('php://input'), true);
$orderID = trim($input['orderID'] ?? '');

if (!$orderID) {
    http_response_code(400);
    echo json_encode(['error' => 'orderID requerido']);
    exit;
}

/* ─── Obtener access token ──────────────────────────────────────── */
$ch = curl_init(PP_BASE . '/v1/oauth2/token');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => 'grant_type=client_credentials',
    CURLOPT_USERPWD        => PP_CLIENT_ID . ':' . PP_SECRET,
    CURLOPT_HTTPHEADER     => ['Accept: application/json'],
]);
$tokenData = json_decode(curl_exec($ch), true);
curl_close($ch);

$token = $tokenData['access_token'] ?? null;
if (!$token) {
    http_response_code(500);
    echo json_encode(['error' => 'No se pudo autenticar con PayPal']);
    exit;
}

/* ─── Capturar pago ─────────────────────────────────────────────── */
$ch = curl_init(PP_BASE . '/v2/checkout/orders/' . $orderID . '/capture');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => '{}',
    CURLOPT_HTTPHEADER     => [
        'Content-Type: application/json',
        'Authorization: Bearer ' . $token,
    ],
]);
$capture = json_decode(curl_exec($ch), true);
curl_close($ch);

$status    = $capture['status'] ?? '';
$captureId = $capture['purchase_units'][0]['payments']['captures'][0]['id'] ?? '';

if ($status !== 'COMPLETED') {
    http_response_code(500);
    echo json_encode([
        'error'   => 'Pago no completado',
        'status'  => $status,
        'details' => $capture,
    ]);
    exit;
}

echo json_encode(['success' => true, 'captureId' => $captureId]);
