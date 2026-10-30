<?php

/**
 * Brago Distribuidora · Portal de Acompanhamento de Chamado em Tempo Real (Apple HIG Live Tracking)
 * URL: /front/acompanhar.php?id={ID}&token={TOKEN}
 */

define('GLPI_USE_CSRF_CHECK', false);
$SECURITY_STRATEGY = 'no_check';

require_once __DIR__ . '/../inc/includes.php';

header('Content-Type: text/html; charset=UTF-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

date_default_timezone_set('America/Sao_Paulo');

$ticketId    = (int)($_GET['id'] ?? 0);
$token       = trim((string)($_GET['token'] ?? ''));
$isDemo      = !empty($_GET['demo']);
$loginUserId = (int)(Session::getLoginUserID() ?: ($_SESSION['glpiID'] ?? 0));

if (session_status() === PHP_SESSION_ACTIVE) {
    session_write_close();
}

$rootDoc = rtrim((string)($CFG_GLPI['root_doc'] ?? ''), '/');
$initialData = null;
$useMock     = false;

if ($ticketId > 0) {
    $validToken = Ticket::verifyTrackingToken($ticketId, $token);
    if (!$validToken && $loginUserId > 0) {
        // Usuário logado no GLPI abrindo o acompanhamento direto: gera o token oficial automaticamente
        $token      = Ticket::getTrackingToken($ticketId);
        $validToken = ($token !== '');
    }
    if ($validToken) {
        $initialData = Ticket::buildTrackingPayload($ticketId);
    }
} elseif ($isDemo) {
    $useMock = true;
}

$pageTitle = $initialData && !empty($initialData['ticket']['title'])
    ? sprintf('Chamado #%06d · %s — Brago TI', $ticketId, $initialData['ticket']['title'])
    : ($ticketId > 0 ? sprintf('Acompanhamento #%06d — Brago TI', $ticketId) : 'Acompanhamento de Chamado — Brago TI');

$cssVer = (@filemtime(__DIR__ . '/../css/acompanhar.css') ?: time()) . '.' . time();
$jsVer  = (@filemtime(__DIR__ . '/../js/acompanhar.js') ?: time()) . '.' . time();
$logoWhiteVer = @filemtime(__DIR__ . '/../pics/brago_logo_white.png') ?: time();
$logoColorVer = @filemtime(__DIR__ . '/../pics/brago_logo.png') ?: time();

$acpConfig = [
    'rootDoc'      => $rootDoc,
    'apiUrl'       => $rootDoc . '/ajax/acompanhar_api.php',
    'logoWhiteUrl' => $rootDoc . '/pics/brago_logo_white.png?v=' . $logoWhiteVer,
    'logoColorUrl' => $rootDoc . '/pics/brago_logo.png?v=' . $logoColorVer,
    'ticketId'     => $ticketId > 0 ? $ticketId : null,
    'token'        => $token,
    'pollInterval' => 2500,
    'initialData'  => $initialData,
    'mock'         => $useMock,
    'demo'         => $isDemo
];
?>
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <meta name="theme-color" content="#0B1EE0">
    <meta name="robots" content="noindex, nofollow">
    <title><?php echo htmlspecialchars($pageTitle, ENT_QUOTES, 'UTF-8'); ?></title>
    <link rel="shortcut icon" type="images/x-icon" href="<?php echo htmlspecialchars($rootDoc . '/pics/favicon.ico', ENT_QUOTES, 'UTF-8'); ?>">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="<?php echo htmlspecialchars($rootDoc . '/css/acompanhar.css?v=' . $cssVer, ENT_QUOTES, 'UTF-8'); ?>">
</head>
<body class="acp-body">
    <div id="acp-app"></div>
    <script>
        window.ACP_CONFIG = <?php echo json_encode($acpConfig, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); ?>;
    </script>
    <script src="<?php echo htmlspecialchars($rootDoc . '/js/acompanhar.js?v=' . $jsVer, ENT_QUOTES, 'UTF-8'); ?>"></script>
</body>
</html>
