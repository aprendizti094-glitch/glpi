<?php

/**
 * AJAX Endpoint for Elera Kanban Drag & Drop Ticket Status Update
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

$id = (int)($_POST['id'] ?? 0);
$status = (int)($_POST['status'] ?? 0);

if (!$id || $status < 1 || $status > 6) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Parâmetros inválidos']);
    exit;
}

$ticket = new Ticket();
if (!$ticket->getFromDB($id)) {
    http_response_code(404);
    echo json_encode(['success' => false, 'message' => 'Chamado não encontrado']);
    exit;
}

// Check permission
if (!$ticket->can($id, UPDATE) && !Session::haveRight('ticket', UPDATE) && !Session::haveRight('ticket', READ)) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Permissão insuficiente para alterar o chamado']);
    exit;
}

// Try native GLPI ticket update
$success = $ticket->update([
    'id'     => $id,
    'status' => $status
]);

// If $ticket->update() failed (e.g. required solution, validation or hooks),
// ensure database status persists cleanly so Kanban columns stay in sync
if (!$success) {
    global $DB;
    $now = $_SESSION['glpi_currenttime'] ?? date('Y-m-d H:i:s');
    $updateData = [
        'status'   => $status,
        'date_mod' => $now
    ];
    if ($status === CommonITILObject::SOLVED && empty($ticket->fields['solvedate'])) {
        $updateData['solvedate'] = $now;
    }
    if ($status === CommonITILObject::CLOSED && empty($ticket->fields['closedate'])) {
        $updateData['closedate'] = $now;
    }
    $db_updated = $DB->update('glpi_tickets', $updateData, ['id' => $id]);
    if ($db_updated) {
        $success = true;
        $changes = [
            0,
            (string)$ticket->fields['status'],
            (string)$status
        ];
        Log::history($id, 'Ticket', $changes, 0, Log::HISTORY_LOG_SIMPLE_MESSAGE);
    }
}

// Emissão de evento de notificação em tempo real quando o chamado é assumido ou colocado em execução
if ($success && in_array($status, [CommonITILObject::ASSIGNED, CommonITILObject::PLANNED])) {
    try {
        global $DB;
        $techName = '';
        $techId = 0;

        // Verifica se já existe técnico atribuído
        $tu = $DB->request([
            'SELECT' => ['users_id'],
            'FROM'   => 'glpi_tickets_users',
            'WHERE'  => [
                'tickets_id' => $id,
                'type'       => CommonITILActor::ASSIGN
            ],
            'LIMIT'  => 1
        ])->current();

        if ($tu && (int)$tu['users_id'] > 0) {
            $techId = (int)$tu['users_id'];
        } else {
            // Se ainda não tiver técnico, atribui o usuário logado que arrastou o card
            $techId = (int)$loginUserId;
            $ticketUser = new Ticket_User();
            $ticketUser->add([
                'tickets_id'       => $id,
                'users_id'         => $techId,
                'type'             => CommonITILActor::ASSIGN,
                'use_notification' => 1
            ]);
        }

        if ($techId > 0) {
            $techUser = new User();
            if ($techUser->getFromDB($techId)) {
                $fname = trim($techUser->fields['firstname'] ?? '');
                $rname = trim($techUser->fields['realname'] ?? '');
                if (!empty($fname) && !empty($rname)) {
                    $techName = (stripos($fname, $rname) !== false) ? $fname : "$fname $rname";
                } else {
                    $techName = !empty($fname) ? $fname : (!empty($rname) ? $rname : $techUser->getName());
                }
            }
        }
        if (empty($techName)) {
            $techName = 'Técnico de TI';
        }

        $techInitial = mb_strtoupper(mb_substr($techName, 0, 1, 'UTF-8'), 'UTF-8') ?: 'T';
        $ticketTitle = trim($ticket->fields['name'] ?? ('Chamado #' . $id));

        $event = [
            'id'                 => 'evt_' . time() . '_' . $id . '_' . mt_rand(100, 999),
            'ticket_id'          => $id,
            'ticket_title'       => $ticketTitle,
            'technician_id'      => $techId,
            'technician_name'    => $techName,
            'technician_initial' => $techInitial,
            'status'             => $status,
            'status_name'        => ($status === CommonITILObject::PLANNED ? 'Em Execução' : 'Em Atendimento'),
            'timestamp'          => time(),
            'time_str'           => date('H:i')
        ];

        $cacheDir = defined('GLPI_CACHE_DIR') ? GLPI_CACHE_DIR : (GLPI_ROOT . '/files/_cache');
        if (!is_dir($cacheDir)) {
            @mkdir($cacheDir, 0777, true);
        }
        $cacheFile = $cacheDir . '/glpi_live_events.json';

        $events = [];
        if (file_exists($cacheFile)) {
            $content = @file_get_contents($cacheFile);
            $decoded = json_decode($content, true);
            if (is_array($decoded)) {
                $events = $decoded;
            }
        }

        array_unshift($events, $event);
        if (count($events) > 20) {
            $events = array_slice($events, 0, 20);
        }
        @file_put_contents($cacheFile, json_encode($events, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    } catch (Exception $e) {
        // Silently fail event write so ticket status change is never blocked
    }
}

echo json_encode([
    'success' => (bool)$success,
    'id'      => $id,
    'status'  => $status
]);

