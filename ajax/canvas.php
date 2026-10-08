<?php

/**
 * GLPI - Gestionnaire Libre de Parc Informatique
 * Obsidian Canvas Integration for Knowledge Base
 */

require_once __DIR__ . '/../inc/includes.php';

header('Content-Type: application/json; charset=UTF-8');
Html::header_nocache();
Session::checkLoginUser();

$canvasDir = GLPI_ROOT . '/files/_canvas';
$imagesDir = $canvasDir . '/images';

if (!is_dir($canvasDir)) {
    @mkdir($canvasDir, 0777, true);
}
if (!is_dir($imagesDir)) {
    @mkdir($imagesDir, 0777, true);
}

$action = $_REQUEST['action'] ?? 'load';
$rawId = $_REQUEST['id'] ?? 'default';
$kbId = preg_replace('/[^a-zA-Z0-9_\-]/', '', $rawId);
if (empty($kbId)) {
    $kbId = 'default';
}

if ($action === 'load') {
    $filePath = $canvasDir . "/canvas_{$kbId}.json";
    if (file_exists($filePath)) {
        $content = file_get_contents($filePath);
        $decoded = json_decode($content, true);
        if ($decoded !== null) {
            echo json_encode(['success' => true, 'isNew' => false, 'data' => $decoded]);
            exit;
        }
    }

    // Return empty / default state
    echo json_encode(['success' => true, 'isNew' => true, 'data' => null]);
    exit;
}

if ($action === 'save') {
    $raw = file_get_contents('php://input');
    if (empty($raw) && isset($_POST['data'])) {
        $raw = $_POST['data'];
    }

    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        echo json_encode(['success' => false, 'error' => 'Invalid JSON payload']);
        exit;
    }

    $filePath = $canvasDir . "/canvas_{$kbId}.json";
    $saved = file_put_contents($filePath, json_encode($decoded, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

    if ($saved !== false) {
        echo json_encode(['success' => true, 'bytes' => $saved]);
    } else {
        echo json_encode(['success' => false, 'error' => 'Could not write file to ' . $filePath]);
    }
    exit;
}

if ($action === 'upload') {
    // Handle pasted / uploaded image
    global $CFG_GLPI;
    $rootDoc = $CFG_GLPI['root_doc'] ?? '/glpi';

    if (isset($_FILES['image']) && $_FILES['image']['error'] === UPLOAD_ERR_OK) {
        $ext = strtolower(pathinfo($_FILES['image']['name'], PATHINFO_EXTENSION));
        if (!in_array($ext, ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'])) {
            $ext = 'png';
        }
        $filename = 'img_' . date('YmdHis') . '_' . substr(md5(uniqid()), 0, 6) . '.' . $ext;
        $dest = $imagesDir . '/' . $filename;
        if (move_uploaded_file($_FILES['image']['tmp_name'], $dest)) {
            $url = $rootDoc . '/front/document.send.php?canvas_img=' . urlencode($filename);
            echo json_encode([
                'success' => true,
                'url' => $url,
                'filename' => $_FILES['image']['name'] ?? $filename
            ]);
            exit;
        }
    }

    // Base64 upload
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    if (!empty($data['base64'])) {
        $base64 = $data['base64'];
        if (preg_match('/^data:image\/(\w+);base64,/', $base64, $type)) {
            $base64 = substr($base64, strpos($base64, ',') + 1);
            $ext = strtolower($type[1]);
            $base64 = base64_decode($base64);
            if ($base64 !== false) {
                $filename = 'pasted_' . date('YmdHis') . '_' . substr(md5(uniqid()), 0, 6) . '.' . $ext;
                file_put_contents($imagesDir . '/' . $filename, $base64);
                $url = $rootDoc . '/ajax/canvas.php?action=view_img&name=' . urlencode($filename);
                echo json_encode([
                    'success' => true,
                    'url' => $url,
                    'filename' => 'Pasted image ' . date('YmdHis') . '.' . $ext
                ]);
                exit;
            }
        }
    }

    echo json_encode(['success' => false, 'error' => 'No image received']);
    exit;
}

if ($action === 'view_img') {
    $filename = basename($_GET['name'] ?? '');
    $dest = $imagesDir . '/' . $filename;
    if (!empty($filename) && file_exists($dest)) {
        $mime = mime_content_type($dest) ?: 'image/png';
        header('Content-Type: ' . $mime);
        readfile($dest);
        exit;
    }
    http_response_code(404);
    echo "Image not found";
    exit;
}

echo json_encode(['success' => false, 'error' => 'Unknown action']);
