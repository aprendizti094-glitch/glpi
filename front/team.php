<?php

/**
 * ---------------------------------------------------------------------
 * GLPI - Gestionnaire Libre de Parc Informatique
 * Copyright (C) 2015-2026 Teclib' and contributors.
 * ---------------------------------------------------------------------
 * LICENSE: GPL-3.0-or-later
 * ---------------------------------------------------------------------
 */

use Glpi\Application\View\TemplateRenderer;

include_once(__DIR__ . '/../inc/includes.php');

Session::checkCentralAccess();

$period = $_GET['period'] ?? 'all';
if (!in_array($period, ['all', 'month', '30days', '7days', 'today'], true)) {
    $period = 'all';
}

$technicians = Team::getTechniciansStats($period);
$globalStats = Team::getGlobalStats($technicians);

Html::header('Equipe', $_SERVER['PHP_SELF'], "management", "team");

echo TemplateRenderer::getInstance()->render(
    'pages/management/team.html.twig',
    [
        'technicians'    => $technicians,
        'global_stats'   => $globalStats,
        'current_period' => $period,
    ]
);

Html::footer();
