<?php
/**
 * GLPI - Redirecionamento seguro para o diretório público
 * Necessário a partir do GLPI 10/11 para servidores web compartilhados
 */
$uri = $_SERVER['REQUEST_URI'] ?? '';
if (strpos($uri, '/public') === false) {
    $redirect = rtrim($uri, '/') . '/public/';
    header("Location: " . $redirect);
    exit();
}
require_once __DIR__ . '/public/index.php';
