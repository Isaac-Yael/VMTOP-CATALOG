<?php
/**
 * VMTOP – Crear orden PayPal
 * Subir a: https://vmtop.mx/paypal-create-order.php
 *
 * Recibe: { "amount": "1350.00" }
 * Devuelve: { "id": "PAYPAL_ORDER_ID" }
 */

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
/*  ⚠️  Rellena tus credenciales LIVE de PayPal aquí               */
define('PP_CLIENT_ID', 'BAAbBL15yk9Eur-y5AW9O48tpwryAGS6TvPahyOXo3L9t20IXyluYPHO5CWTSjPw70GL3LOQbQfAkJBO2U');
define('PP_SECRET',    'EHpkYwceNovt07gHxqeIZTq4PNyu6QcA1e1RI0l2ln3gTle5sgazQrMQ6WOoTyCTmJrrdpAw8F55S0OK');
define('PP_BASE',      'https://api-m.paypal.com'); // producción

/* ─── Validar monto ─────────────────────────────────────────────── */
$input  = json_decode(file_get_contents('php://input'), true);
$amount = $input['amount'] ?? null;

if (!$amount || !is_numeric($amount) || (float)$amount <= 0) {
    http_response_code(400);
    echo json_encode(['error' => 'Monto inválido']);
    exit;
}
$amount = number_format((float)$amount, 2, '.', '');

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

/* ─── Crear orden PayPal ────────────────────────────────────────── */
$orderBody = json_encode([
    'intent' => 'CAPTURE',
    'purchase_units' => [[
        'amount' => [
            'currency_code' => 'MXN',
            'value'         => $amount,
        ],
        'description' => 'Pedido VMTOP Mayoreo',
    ]],
    'application_context' => [
        'brand_name'          => 'VMTOP',
        'locale'              => 'es-MX',
        'user_action'         => 'PAY_NOW',
        'shipping_preference' => 'NO_SHIPPING',
    ],
]);

$ch = curl_init(PP_BASE . '/v2/checkout/orders');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => $orderBody,
    CURLOPT_HTTPHEADER     => [
        'Content-Type: application/json',
        'Authorization: Bearer ' . $token,
        'PayPal-Request-Id: vmtop-' . uniqid(),
    ],
]);
$order = json_decode(curl_exec($ch), true);
curl_close($ch);

if (!isset($order['id'])) {
    http_response_code(500);
    echo json_encode(['error' => 'Error creando orden en PayPal', 'details' => $order]);
    exit;
}

echo json_encode(['id' => $order['id']]);
