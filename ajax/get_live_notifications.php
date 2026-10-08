<?php

/**
 * AJAX Endpoint for GLPI Live Broadcast Notifications & Anti-Duplication Feed
 */
require_once __DIR__ . '/../inc/includes.php';
header("Content-Type: application/json; charset=UTF-8");

// Session verification
$loginUserId = Session::getLoginUserID();
if (!$loginUserId && !empty($_SESSION['glpiID'])) {
    $loginUserId = (int)$_SESSION['glpiID'];
}

if (!$loginUserId) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Sessão expirada']);
    exit;
}

$sinceTimestamp = (int)($_GET['since'] ?? 0);
$cacheDir = defined('GLPI_CACHE_DIR') ? GLPI_CACHE_DIR : (GLPI_ROOT . '/files/_cache');
$cacheFile = $cacheDir . '/glpi_live_events.json';

$allEvents = [];
if (file_exists($cacheFile)) {
    $raw = @file_get_contents($cacheFile);
    $decoded = json_decode($raw, true);
    if (is_array($decoded)) {
        $allEvents = $decoded;
    }
}

// Filter events newer than $sinceTimestamp
$newEvents = [];
$cutoff = time() - 3600; // Ignore events older than 1 hour

foreach ($allEvents as $evt) {
    if ($evt['timestamp'] > $sinceTimestamp && $evt['timestamp'] >= $cutoff) {
        $newEvents[] = $evt;
    }
}

// Also get active in-progress tickets for the anti-duplication banner
global $DB;
$activeIncidents = [];
try {
    $iterator = $DB->request([
        'SELECT' => [
            'glpi_tickets.id',
            'glpi_tickets.name',
            'glpi_tickets.date_mod',
            'glpi_tickets.status'
        ],
        'FROM' => 'glpi_tickets',
        'WHERE' => [
            'glpi_tickets.is_deleted' => 0,
            'glpi_tickets.status'     => CommonITILObject::PLANNED // 3 - Em Execução
        ],
        'ORDER' => 'glpi_tickets.date_mod DESC',
        'LIMIT' => 5
    ]);

    foreach ($iterator as $row) {
        // Resolve technician name
        $techName = 'Equipe de TI';
        $tu = $DB->request([
            'SELECT' => ['users_id'],
            'FROM'   => 'glpi_tickets_users',
            'WHERE'  => [
                'tickets_id' => $row['id'],
                'type'       => CommonITILActor::ASSIGN
            ],
            'LIMIT'  => 1
        ])->current();

        if ($tu && (int)$tu['users_id'] > 0) {
            $user = new User();
            if ($user->getFromDB((int)$tu['users_id'])) {
                $techName = $user->getFriendlyName();
            }
        }

        $activeIncidents[] = [
            'id'          => (int)$row['id'],
            'title'       => $row['name'],
            'technician'  => $techName,
            'time_ago'    => max(1, round((time() - strtotime($row['date_mod'])) / 60)) . 'm'
        ];
    }
} catch (Exception $e) {
    // Graceful fallback if query fails
}

echo json_encode([
    'success'          => true,
    'server_time'      => time(),
    'new_events'       => $newEvents,
    'active_incidents' => $activeIncidents
]);
