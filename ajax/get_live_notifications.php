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

date_default_timezone_set('America/Sao_Paulo');

// Auto-trigger da coleta de e-mails do Zoho a cada 10 segundos
$lastMailCheckFile = $cacheDir . '/last_mailgate_check.txt';
$now = time();
$lastMailCheck = file_exists($lastMailCheckFile) ? (int)@file_get_contents($lastMailCheckFile) : 0;
if (($now - $lastMailCheck) >= 10) {
    @file_put_contents($lastMailCheckFile, (string)$now);
    try {
        // Executa mailgate via CronTask do GLPI para atualizar a "Última execução" no banco e rodar a coleta
        CronTask::launch(-CronTask::MODE_INTERNAL, 1, 'mailgate');
    } catch (\Throwable $e) {
        try {
            global $DB;
            $collectors = $DB->request('glpi_mailcollectors', ['is_active' => 1]);
            if (count($collectors) > 0) {
                $mc = new MailCollector();
                foreach ($collectors as $c) {
                    if ($mc->getFromDB($c['id'])) {
                        $mc->collect($c['id']);
                    }
                }
            }
        } catch (\Throwable $e2) {}
    }
    try {
        // Executa queuednotification para envio IMEDIATO de e-mails da fila
        CronTask::launch(-CronTask::MODE_INTERNAL, 1, 'queuednotification');
    } catch (\Throwable $e3) {}
}

$allEvents = [];
$activeTickets = [];
if (file_exists($cacheFile)) {
    $raw = @file_get_contents($cacheFile);
    $decoded = json_decode($raw, true);
    if (is_array($decoded)) {
        if (isset($decoded['events'])) {
            $allEvents = $decoded['events'];
            $activeTickets = $decoded['tickets'] ?? [];
        } else {
            $allEvents = $decoded;
        }
    }
}

// Filter events newer than $sinceTimestamp (buffer of 1 second prevents timestamp drop on concurrent requests)
$newEvents = [];
$cutoff = time() - 3600; // Ignore events older than 1 hour

foreach ($allEvents as $evt) {
    if ($evt['timestamp'] >= ($sinceTimestamp - 1) && $evt['timestamp'] >= $cutoff) {
        $newEvents[] = $evt;
    }
}

// Only query DB for active incidents on initial load ($sinceTimestamp == 0) or explicit request
// This allows 3-second live polling with ZERO database connection overhead on Hostinger!
$activeIncidents = [];
if ($sinceTimestamp === 0 || !empty($_GET['with_incidents'])) {
    global $DB;
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
    } catch (\Throwable $e) {
        // Graceful fallback if query fails
    }
}

$latestTicketId = 0;
try {
    $latestRow = $DB->request([
        'SELECT' => ['id'],
        'FROM'   => 'glpi_tickets',
        'WHERE'  => ['is_deleted' => 0],
        'ORDER'  => 'id DESC',
        'LIMIT'  => 1
    ])->current();
    if ($latestRow) {
        $latestTicketId = (int)$latestRow['id'];
    }
} catch (\Throwable $e) {}

echo json_encode([
    'success'          => true,
    'server_time'      => time(),
    'latest_ticket_id' => $latestTicketId,
    'new_events'       => $newEvents,
    'active_tickets'   => $activeTickets,
    'active_incidents' => $activeIncidents
]);

