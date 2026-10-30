<?php

/**
 * AJAX Endpoint for Real-time Kanban Re-rendering without page reload
 */
require_once __DIR__ . '/../inc/includes.php';

use Glpi\Application\View\TemplateRenderer;

$loginUserId = Session::getLoginUserID();
if (!$loginUserId && !empty($_SESSION['glpiID'])) {
    $loginUserId = (int)$_SESSION['glpiID'];
}

if (!$loginUserId) {
    http_response_code(401);
    exit;
}

$searchData = !empty($_GET['criteria'])
    ? ['criteria' => $_GET['criteria']]
    : ($_SESSION['glpisearch']['Ticket'] ?? null);

if (session_status() === PHP_SESSION_ACTIVE) {
    session_write_close();
}

header("Content-Type: text/html; charset=UTF-8");
header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Pragma: no-cache");

echo TemplateRenderer::getInstance()->render('components/kanban/elera_kanban.html.twig', [
    'search_data' => $searchData
]);
