<?php

/**
 * API em Tempo Real da Página de Acompanhamento de Chamado (Apple HIG Live Tracking)
 * Suporta:
 *   - GET  ?id={ID}&token={TOKEN}                   -> Retorna estado completo (status, técnico, timeline, mensagens com prints)
 *   - GET  ?action=document&id={ID}&token={TOKEN}&docid={DOCID} -> Transmite arquivo/print com segurança
 *   - POST (id, token, content, image/image_data)   -> Insere nova mensagem e anexa print no chat
 */

define('GLPI_USE_CSRF_CHECK', false);
$SECURITY_STRATEGY = 'no_check';
$AJAX_INCLUDE = 1;

require_once __DIR__ . '/../inc/includes.php';

date_default_timezone_set('America/Sao_Paulo');

$method   = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
$ticketId = (int)($_REQUEST['id'] ?? 0);
$token    = trim((string)($_REQUEST['token'] ?? ''));

$loginUserId = (int)(Session::getLoginUserID() ?: ($_SESSION['glpiID'] ?? 0));

if (session_status() === PHP_SESSION_ACTIVE) {
    session_write_close();
}

if ($ticketId <= 0) {
    header('Content-Type: application/json; charset=UTF-8');
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'code'    => 'invalid_id',
        'message' => 'Protocolo de chamado inválido.'
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$isTokenValid = Ticket::verifyTrackingToken($ticketId, $token);
if (!$isTokenValid && $loginUserId <= 0) {
    header('Content-Type: application/json; charset=UTF-8');
    http_response_code(403);
    echo json_encode([
        'success' => false,
        'code'    => 'invalid_token',
        'message' => 'Link de acompanhamento inválido ou expirado.'
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$action = trim((string)($_REQUEST['action'] ?? ''));

// Servir documentos / imagens do chamado para o portal de acompanhamento
if ($action === 'document') {
    global $DB;
    $docId = (int)($_GET['docid'] ?? 0);
    if ($docId <= 0) {
        http_response_code(400);
        exit('ID do documento inválido.');
    }

    $docRow = $DB->request([
        'SELECT' => ['d.filepath', 'd.mime', 'd.filename'],
        'FROM'   => 'glpi_documents AS d',
        'LEFT JOIN' => [
            'glpi_documents_items AS di' => [
                'ON' => ['d' => 'id', 'di' => 'documents_id']
            ]
        ],
        'WHERE'  => [
            'd.id' => $docId,
            'd.is_deleted' => 0,
            'OR' => [
                ['d.tickets_id' => $ticketId],
                [
                    'di.itemtype' => 'Ticket',
                    'di.items_id' => $ticketId
                ],
                [
                    'di.itemtype' => 'ITILFollowup',
                    'di.items_id' => new \QuerySubQuery([
                        'SELECT' => ['id'],
                        'FROM'   => 'glpi_itilfollowups',
                        'WHERE'  => ['items_id' => $ticketId, 'itemtype' => 'Ticket']
                    ])
                ],
                [
                    'di.itemtype' => 'ITILSolution',
                    'di.items_id' => new \QuerySubQuery([
                        'SELECT' => ['id'],
                        'FROM'   => 'glpi_itilsolutions',
                        'WHERE'  => ['items_id' => $ticketId, 'itemtype' => 'Ticket']
                    ])
                ]
            ]
        ],
        'LIMIT' => 1
    ])->current();

    if (!$docRow) {
        http_response_code(404);
        exit('Documento não encontrado para este chamado.');
    }

    $docDir = defined('GLPI_DOC_DIR') ? GLPI_DOC_DIR : (GLPI_ROOT . '/files');
    $filePath = $docDir . '/' . $docRow['filepath'];
    if (!file_exists($filePath)) {
        http_response_code(404);
        exit('Arquivo não localizado no armazenamento do servidor.');
    }

    $mime = $docRow['mime'] ?: 'image/png';
    header('Content-Type: ' . $mime);
    header('Content-Length: ' . filesize($filePath));
    header('Cache-Control: public, max-age=86400');
    header('Content-Disposition: inline; filename="' . rawurlencode($docRow['filename']) . '"');
    readfile($filePath);
    exit;
}

header('Content-Type: application/json; charset=UTF-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

if ($method === 'POST') {
    $rawContent   = isset($_UPOST['content']) ? (string)$_UPOST['content'] : (string)($_POST['content'] ?? '');
    $cleanContent = trim(strip_tags($rawContent));
    $rawImage     = $_POST['image_data'] ?? '';
    $hasUploadedFile = !empty($_FILES['image']['tmp_name']) && is_uploaded_file($_FILES['image']['tmp_name']);

    if ($cleanContent === '' && !$hasUploadedFile && empty($rawImage)) {
        http_response_code(422);
        echo json_encode([
            'success' => false,
            'code'    => 'empty_message',
            'message' => 'Digite uma mensagem ou anexe uma imagem antes de enviar.'
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if (mb_strlen($cleanContent, 'UTF-8') > 4000) {
        $cleanContent = mb_substr($cleanContent, 0, 4000, 'UTF-8');
    }

    $ticket = new Ticket();
    if (!$ticket->getFromDB($ticketId) || (int)($ticket->fields['is_deleted'] ?? 0) === 1) {
        http_response_code(404);
        echo json_encode([
            'success' => false,
            'code'    => 'not_found',
            'message' => 'Chamado não encontrado.'
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $statusCode = (int)($ticket->fields['status'] ?? 1);
    if ($statusCode === Ticket::SOLVED || $statusCode === Ticket::CLOSED) {
        http_response_code(409);
        echo json_encode([
            'success' => false,
            'code'    => 'ticket_closed',
            'message' => 'Este chamado já foi concluído.'
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    global $DB, $CFG_GLPI;
    $requesterId   = 0;
    $requesterName = 'Solicitante';

    $reqRow = $DB->request([
        'FROM'  => 'glpi_tickets_users',
        'WHERE' => [
            'tickets_id' => $ticketId,
            'type'       => CommonITILActor::REQUESTER
        ],
        'ORDER' => ['id ASC'],
        'LIMIT' => 1
    ])->current();

    if ($reqRow) {
        $requesterId   = (int)($reqRow['users_id'] ?? 0);
        $requesterName = Ticket::formatTrackingUserName($requesterId, (string)($reqRow['alternative_email'] ?? ''));
    } elseif ($loginUserId > 0) {
        $requesterId   = $loginUserId;
        $requesterName = Ticket::formatTrackingUserName($loginUserId);
    }

    $now = date('Y-m-d H:i:s');

    // Insere o acompanhamento público (ITILFollowup) vinculado ao chamado
    // sourceof_items_id = 777777 identifica que a mensagem partiu do Portal de Acompanhamento (Solicitante)
    $fup = new ITILFollowup();
    $fupId = $fup->add([
        'itemtype'                    => 'Ticket',
        'items_id'                    => $ticketId,
        'date'                        => $now,
        'users_id'                    => $requesterId,
        'content'                     => $cleanContent,
        'is_private'                  => 0,
        'requesttypes_id'             => 1,
        'timeline_position'           => CommonITILObject::TIMELINE_LEFT,
        'sourceof_items_id'           => 777777,
        '_disablenotif'               => true,
        '_do_not_compute_takeintoaccount' => true
    ]);

    if (!$fupId) {
        // Fallback direto no banco caso alguma regra de sessão bloqueie ITILFollowup::add sem usuário logado
        $DB->insert('glpi_itilfollowups', [
            'itemtype'          => 'Ticket',
            'items_id'          => $ticketId,
            'date'              => $now,
            'date_mod'          => $now,
            'date_creation'     => $now,
            'users_id'          => $requesterId,
            'content'           => $cleanContent,
            'is_private'        => 0,
            'requesttypes_id'   => 1,
            'timeline_position' => CommonITILObject::TIMELINE_LEFT,
            'sourceof_items_id' => 777777
        ]);
        $fupId = (int)$DB->insertId();
        $DB->update('glpi_tickets', ['date_mod' => $now], ['id' => $ticketId]);
    }

    // Salva anexo de imagem caso enviado
    $newImages = [];
    $docBytes  = null;
    $origName  = 'print_' . date('Ymd_His') . '.png';
    $mimeType  = 'image/png';

    if ($hasUploadedFile) {
        $docBytes = file_get_contents($_FILES['image']['tmp_name']);
        $origName = $_FILES['image']['name'] ?: $origName;
        $mimeType = $_FILES['image']['type'] ?: 'image/png';
    } elseif (!empty($rawImage) && preg_match('/^data:(image\/[a-zA-Z0-9\+\-\.]+);base64,(.+)$/', $rawImage, $mImg)) {
        $mimeType = $mImg[1];
        $docBytes = base64_decode($mImg[2]);
        $ext = str_replace('image/', '', $mimeType);
        if ($ext === 'jpeg') $ext = 'jpg';
        $origName = 'print_' . date('Ymd_His') . '.' . $ext;
    }

    if ($docBytes !== null && strlen($docBytes) > 0) {
        $ext = strtolower(pathinfo($origName, PATHINFO_EXTENSION)) ?: 'png';
        if (!in_array($ext, ['png', 'jpg', 'jpeg', 'gif', 'webp'], true)) {
            $ext = 'png';
        }
        $sha1 = sha1($docBytes);
        $dirPart = strtoupper($ext) . '/' . substr($sha1, 0, 2);
        $filenameOnDisk = substr($sha1, 2) . '.' . strtoupper($ext);
        $relPath = $dirPart . '/' . $filenameOnDisk;

        $docDir = defined('GLPI_DOC_DIR') ? GLPI_DOC_DIR : (GLPI_ROOT . '/files');
        $fullDir = $docDir . '/' . $dirPart;
        if (!is_dir($fullDir)) {
            @mkdir($fullDir, 0755, true);
        }
        $fullPath = $docDir . '/' . $relPath;
        file_put_contents($fullPath, $docBytes);

        $DB->insert('glpi_documents', [
            'name'          => 'Print enviado pelo Solicitante',
            'filename'      => $origName,
            'filepath'      => $relPath,
            'mime'          => $mimeType,
            'date_mod'      => $now,
            'date_creation' => $now,
            'users_id'      => $requesterId,
            'tickets_id'    => $ticketId,
            'sha1sum'       => $sha1,
            'tag'           => uniqid('acp_', true)
        ]);
        $newDocId = (int)$DB->insertId();

        $DB->insert('glpi_documents_items', [
            'documents_id'      => $newDocId,
            'items_id'          => $fupId,
            'itemtype'          => 'ITILFollowup',
            'entities_id'       => 1,
            'date_mod'          => $now,
            'date_creation'     => $now,
            'users_id'          => $requesterId,
            'timeline_position' => CommonITILObject::TIMELINE_LEFT
        ]);

        $rootDoc = rtrim((string)($CFG_GLPI['root_doc'] ?? ''), '/');
        $newImages[] = [
            'id'   => $newDocId,
            'name' => $origName,
            'mime' => $mimeType,
            'url'  => $rootDoc . '/ajax/acompanhar_api.php?action=document&id=' . $ticketId . '&token=' . $token . '&docid=' . $newDocId
        ];
    }

    // Emite alerta ao vivo para o técnico no painel GLPI
    Ticket::emitLiveBroadcastEvent(
        $ticketId,
        $requesterId,
        (int)($ticket->fields['status'] ?? Ticket::INCOMING),
        'Nova Mensagem no Chat'
    );

    $response = json_encode([
        'success' => true,
        'message' => [
            'id'       => 'f-' . (int)$fupId,
            'author'   => 'requester',
            'kind'     => 'followup',
            'name'     => $requesterName,
            'datetime' => $now,
            'content'  => $cleanContent,
            'images'   => $newImages
        ]
    ], JSON_UNESCAPED_UNICODE);

    echo $response;
    if (function_exists('litespeed_finish_request')) {
        @litespeed_finish_request();
    }
    exit;
}

// GET -> Retorna o payload completo do chamado
$payload = Ticket::buildTrackingPayload($ticketId);
if (!$payload) {
    http_response_code(404);
    echo json_encode([
        'success' => false,
        'code'    => 'not_found',
        'message' => 'Chamado não encontrado.'
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$response = json_encode($payload, JSON_UNESCAPED_UNICODE);
echo $response;
if (function_exists('litespeed_finish_request')) {
    @litespeed_finish_request();
}
exit;
