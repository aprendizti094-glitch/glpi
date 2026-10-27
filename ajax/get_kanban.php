<?php

/**
 * AJAX Endpoint for Real-time Kanban Re-rendering without page reload
 */
require_once __DIR__ . '/../inc/includes.php';

Session::checkLoginUser();
header("Content-Type: text/html; charset=UTF-8");

echo TemplateRenderer::getInstance()->render('components/kanban/elera_kanban.html.twig', [
    'search_data' => $_SESSION['glpisearch']['Ticket'] ?? null
]);
