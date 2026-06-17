<?php
/**
 * VMTOP – Prueba diagnóstica: igual que wc-relay-v2, pero las credenciales
 * viven en un archivo separado (wc-secrets.php) en vez de estar escritas
 * directamente aquí. Sirve para saber si el bloqueo detecta el TEXTO de las
 * credenciales en este archivo, o el COMPORTAMIENTO (la llamada cURL).
 */

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

/* Credenciales vienen de archivo separado, no están escritas en este archivo */
require __DIR__ . '/wc-secrets.php';

$wc_url = 'https://127.0.0.1/wp-json/wc/v3/orders';

$input = json_decode(file_get_contents('php://input'), true);

if (!$input || empty($input['line_items'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Datos inválidos']);
    exit;
}

$ch = curl_init($wc_url);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => json_encode($input),
    CURLOPT_HTTPHEADER     => ['Content-Type: application/json', 'Host: vmtop.mx'],
    CURLOPT_USERPWD        => "$wc_key:$wc_secret",
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
