<?php
/**
 * VMTOP – Archivo de prueba temporal (sin cURL, sin credenciales)
 * Solo repite lo que recibe. Se borra después de la prueba.
 */
$allowed = ['https://vmtop.com.mx', 'https://www.vmtop.com.mx', 'https://tienda-mayoreo.vmtop.mx', 'https://mayoreo.vmtop.mx'];
$origin  = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $allowed)) {
    header("Access-Control-Allow-Origin: $origin");
}
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { exit; }

echo json_encode([
    'ok'       => true,
    'method'   => $_SERVER['REQUEST_METHOD'],
    'received' => json_decode(file_get_contents('php://input')),
]);
