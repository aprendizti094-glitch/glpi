<?php

/**
 * AJAX Endpoint for GLPI Live Broadcast Notifications & Anti-Duplication Feed
 */
require_once __DIR__ . '/../inc/includes.php';
header("Content-Type: application/json; charset=UTF-8");
header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Pragma: no-cache");

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

$isTechnician = false;
$currentInterface = Session::getCurrentInterface();
$profileName = mb_strtolower((string)($_SESSION['glpiactiveprofile']['name'] ?? ''), 'UTF-8');
$profileId = (int)($_SESSION['glpiactiveprofile']['id'] ?? 0);

if ($currentInterface === 'central' && $profileId !== 1 && strpos($profileName, 'self') === false && strpos($profileName, 'post-only') === false) {
    if (Session::haveRight('ticket', UPDATE) || Session::haveRight('ticket', Ticket::OWN) || Session::haveRight('ticket', Ticket::READALL)) {
        $isTechnician = true;
    }
}

if (session_status() === PHP_SESSION_ACTIVE) {
    session_write_close();
}

$sinceTimestamp = (int)($_GET['since'] ?? 0);
$cacheDir = defined('GLPI_CACHE_DIR') ? GLPI_CACHE_DIR : (GLPI_ROOT . '/files/_cache');
$cacheFile = $cacheDir . '/glpi_live_events.json';

date_default_timezone_set('America/Sao_Paulo');

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

if ($isTechnician) {
    foreach ($allEvents as $evt) {
        if ($evt['timestamp'] >= ($sinceTimestamp - 1) && $evt['timestamp'] >= $cutoff) {
            $newEvents[] = $evt;
        }
    }
} else {
    // Pop-ups de notificação são estritamente exclusivos para técnicos
    $newEvents = [];
    $activeTickets = [];
}

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
$kanbanSignature = '';
$kpiCounts = [
    'total'    => 0,
    'new'      => 0,
    'assigned' => 0,
    'waiting'  => 0,
    'solved'   => 0,
];

try {
    global $DB;
    $sigParts = [];
    $whereTickets = ['is_deleted' => 0];
    if (!$isTechnician && $loginUserId > 0) {
        $whereTickets[] = "(
            glpi_tickets.id IN (
                SELECT tickets_id FROM glpi_tickets_users 
                WHERE users_id = {$loginUserId}
            )
            OR glpi_tickets.users_id_recipient = {$loginUserId}
        )";
    }
    $ticketRows = $DB->request([
        'SELECT' => ['id', 'status', 'date_mod', 'itilcategories_id', 'urgency'],
        'FROM'   => 'glpi_tickets',
        'WHERE'  => $whereTickets,
        'ORDER'  => 'id DESC',
        'LIMIT'  => 200
    ]);
    foreach ($ticketRows as $tRow) {
        $tid = (int)$tRow['id'];
        $tStatus = (int)$tRow['status'];
        if ($tid > $latestTicketId) {
            $latestTicketId = $tid;
        }
        $sigParts[] = $tid . ':' . $tStatus . ':' . ($tRow['date_mod'] ?? '') . ':' . (int)($tRow['itilcategories_id'] ?? 0) . ':' . (int)($tRow['urgency'] ?? 3);
        $kpiCounts['total']++;
        if ($tStatus === 1) {
            $kpiCounts['new']++;
        } elseif ($tStatus === 2 || $tStatus === 3) {
            $kpiCounts['assigned']++;
        } elseif ($tStatus === 4) {
            $kpiCounts['waiting']++;
        } elseif ($tStatus === 5 || $tStatus === 6) {
            $kpiCounts['solved']++;
        }
    }
    $kanbanSignature = md5(implode('|', $sigParts));
} catch (\Throwable $e) {}

$techStatus = class_exists('EleraKanban') ? EleraKanban::getTechniciansStatus() : ['is_busy' => false, 'status_label' => 'Técnicos Disponíveis', 'status_sub' => 'Fila livre'];

$responseJson = json_encode([
    'success'          => true,
    'server_time'      => time(),
    'is_technician'    => $isTechnician,
    'latest_ticket_id' => $latestTicketId,
    'kanban_signature' => $kanbanSignature,
    'kpi_counts'       => $kpiCounts,
    'new_events'       => $newEvents,
    'active_tickets'   => $activeTickets,
    'active_incidents' => $activeIncidents,
    'tech_status'      => $techStatus
]);

ignore_user_abort(true);
set_time_limit(120);
header("Content-Length: " . strlen($responseJson));
header("Connection: close");
echo $responseJson;
if (function_exists('litespeed_finish_request')) {
    litespeed_finish_request();
} elseif (function_exists('fastcgi_finish_request')) {
    fastcgi_finish_request();
} else {
    flush();
}

// Auto-trigger não-bloqueante da coleta de e-mails do Zoho a cada 4 segundos em background
$lastMailCheckFile = $cacheDir . '/last_mailgate_check.txt';
$now = time();
$lastMailCheck = file_exists($lastMailCheckFile) ? (int)@file_get_contents($lastMailCheckFile) : 0;
if (($now - $lastMailCheck) >= 4) {
    @file_put_contents($lastMailCheckFile, (string)$now);
    try {
        global $DB;
        $DB->update(
            'glpi_crontasks',
            ['state' => CronTask::STATE_WAITING],
            ['name' => ['mailgate', 'queuednotification'], 'state' => CronTask::STATE_RUNNING]
        );
        CronTask::launch(-CronTask::MODE_INTERNAL, 1, 'mailgate');
        CronTask::launch(-CronTask::MODE_INTERNAL, 1, 'queuednotification');
    } catch (\Throwable $e) {}
}
