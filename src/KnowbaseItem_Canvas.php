<?php

/**
 * ---------------------------------------------------------------------
 * GLPI - Gestionnaire Libre de Parc Informatique
 * Obsidian Canvas Integration for Knowledge Base
 * ---------------------------------------------------------------------
 */

class KnowbaseItem_Canvas extends CommonDBTM
{
    public static function getTypeName($nb = 0)
    {
        return 'Canvas';
    }

    public static function getIcon()
    {
        return 'ti ti-layout-board';
    }

    public static function canView(): bool
    {
        return Session::haveRightsOr('knowbase', [READ, KnowbaseItem::READFAQ]);
    }

    public static function canCreate(): bool
    {
        return Session::haveRightsOr('knowbase', [UPDATE, CREATE]);
    }

    public function getTabNameForItem(CommonGLPI $item, $withtemplate = 0)
    {
        return self::createTabEntry('Canvas', 0, $item::getType(), 'ti ti-layout-board');
    }

    public static function displayTabContentForItem(CommonGLPI $item, $tabnum = 1, $withtemplate = 0)
    {
        if ($item instanceof CommonDBTM) {
            self::showCanvas($item);
        }
        return true;
    }

    public static function showCanvas(CommonDBTM $item): bool
    {
        global $CFG_GLPI;

        $id = (int)$item->getID();
        $isTicket = $item instanceof Ticket;
        $contextId = $isTicket ? 'ticket_' . $id : 'kb_' . $id;
        $title = $item->fields['name'] ?? __('Canvas');
        if ($isTicket) {
            $title = sprintf(__('Chamado #%d - %s'), $id, $title);
        }
        $rootDoc = $CFG_GLPI['root_doc'] ?? '/glpi';
        $v = time(); // cache buster for development

        echo "<!-- Obsidian Canvas Stylesheet -->\n";
        echo "<link rel='stylesheet' href='{$rootDoc}/css/obsidian_canvas.css?v={$v}'>\n";

        ?>
        <div id="obsidian-canvas-root" class="obsidian-canvas-root" data-kb-id="<?= $contextId ?>" data-kb-title="<?= htmlspecialchars($title, ENT_QUOTES, 'UTF-8') ?>">
            <!-- Obsidian Top Header Bar -->
            <div class="obs-topbar">
                <div class="obs-tabs-container">
                    <div class="obs-tab active">
                        <i class="ti ti-layout-grid obs-tab-icon"></i>
                        <span class="obs-tab-title"><?= htmlspecialchars($title, ENT_QUOTES, 'UTF-8') ?></span>
                        <button type="button" class="obs-tab-close" title="Fechar aba">
                            <i class="ti ti-x"></i>
                        </button>
                    </div>
                    <button type="button" class="obs-tab-add" id="obs-btn-new-tab" title="Nova aba de Canvas">
                        <i class="ti ti-plus"></i>
                    </button>
                </div>

                <div class="obs-topbar-center">
                    <button type="button" class="obs-nav-btn" id="obs-btn-prev" title="Voltar"><i class="ti ti-arrow-left"></i></button>
                    <button type="button" class="obs-nav-btn" id="obs-btn-next" title="Avançar"><i class="ti ti-arrow-right"></i></button>
                    <span class="obs-title-display" id="obs-canvas-title" title="Clique para editar título"><?= htmlspecialchars($title, ENT_QUOTES, 'UTF-8') ?></span>
                </div>

                <div class="obs-topbar-actions">
                    <button type="button" class="obs-action-btn" id="obs-btn-preview" title="Modo Leitura"><i class="ti ti-book"></i></button>
                    <button type="button" class="obs-action-btn" id="obs-btn-split" title="Dividir Painel"><i class="ti ti-layout-columns"></i></button>
                    <button type="button" class="obs-action-btn" id="obs-btn-fullscreen" title="Tela Cheia"><i class="ti ti-maximize"></i></button>
                    <button type="button" class="obs-action-btn" id="obs-btn-menu" title="Mais opções"><i class="ti ti-dots"></i></button>
                </div>
            </div>

            <!-- Canvas Viewport -->
            <div id="obsidian-viewport" class="obs-viewport">
                <!-- SVG Connections Layer -->
                <svg id="obs-svg-layer" class="obs-svg-layer">
                    <defs>
                        <!-- Standard Arrowhead Markers -->
                        <marker id="obs-arrow-default" markerWidth="10" markerHeight="10" refX="8" refY="4" orient="auto">
                            <polygon points="0 0, 8 4, 0 8, 2 4" fill="#94a3b8" />
                        </marker>
                        <marker id="obs-arrow-green" markerWidth="10" markerHeight="10" refX="8" refY="4" orient="auto">
                            <polygon points="0 0, 8 4, 0 8, 2 4" fill="#22c55e" />
                        </marker>
                        <marker id="obs-arrow-blue" markerWidth="10" markerHeight="10" refX="8" refY="4" orient="auto">
                            <polygon points="0 0, 8 4, 0 8, 2 4" fill="#3b82f6" />
                        </marker>
                        <marker id="obs-arrow-red" markerWidth="10" markerHeight="10" refX="8" refY="4" orient="auto">
                            <polygon points="0 0, 8 4, 0 8, 2 4" fill="#ef4444" />
                        </marker>
                        <marker id="obs-arrow-yellow" markerWidth="10" markerHeight="10" refX="8" refY="4" orient="auto">
                            <polygon points="0 0, 8 4, 0 8, 2 4" fill="#eab308" />
                        </marker>
                        <marker id="obs-arrow-purple" markerWidth="10" markerHeight="10" refX="8" refY="4" orient="auto">
                            <polygon points="0 0, 8 4, 0 8, 2 4" fill="#a855f7" />
                        </marker>
                    </defs>
                    <g id="obs-svg-edges"></g>
                    <!-- Temporary connection line while dragging -->
                    <path id="obs-temp-edge" class="obs-temp-edge" d="" marker-end="url(#obs-arrow-blue)" style="display:none;" />
                </svg>

                <!-- Cards / Nodes Container -->
                <div id="obs-nodes-container" class="obs-nodes-container"></div>

                <!-- Selection Marquee Box -->
                <div id="obs-selection-box" class="obs-selection-box" style="display:none;"></div>
            </div>

            <!-- Floating Bottom Pill Toolbar (Obsidian Canvas Tools) -->
            <div class="obs-bottom-toolbar">
                <button type="button" class="obs-toolbar-item" id="obs-tool-card" title="Adicionar Card de Nota (Ctrl+N)">
                    <i class="ti ti-file-text"></i>
                </button>
                <button type="button" class="obs-toolbar-item" id="obs-tool-markdown" title="Adicionar Bloco de Texto (Ctrl+T)">
                    <i class="ti ti-pencil"></i>
                </button>
                <button type="button" class="obs-toolbar-item" id="obs-tool-image" title="Adicionar Card de Imagem (Ctrl+V ou upload)">
                    <i class="ti ti-photo"></i>
                </button>
            </div>

            <!-- Floating Right Navigation & Zoom Toolbar -->
            <div class="obs-right-toolbar">
                <button type="button" class="obs-right-item" id="obs-tool-settings" title="Configurações e Opções">
                    <i class="ti ti-settings"></i>
                </button>
                <div class="obs-right-sep"></div>
                <button type="button" class="obs-right-item" id="obs-zoom-in" title="Aumentar zoom (+)">
                    <i class="ti ti-plus"></i>
                </button>
                <button type="button" class="obs-right-item" id="obs-zoom-reset" title="Ajustar / 100% (0)">
                    <i class="ti ti-refresh"></i>
                </button>
                <button type="button" class="obs-right-item" id="obs-zoom-fit" title="Enquadrar todos os cards (Shift+1)">
                    <i class="ti ti-scan"></i>
                </button>
                <button type="button" class="obs-right-item" id="obs-zoom-out" title="Diminuir zoom (-)">
                    <i class="ti ti-minus"></i>
                </button>
                <div class="obs-right-sep"></div>
                <button type="button" class="obs-right-item" id="obs-tool-help" title="Atalhos e Ajuda (?)">
                    <i class="ti ti-help"></i>
                </button>
            </div>

            <!-- Floating Bottom-Right Status Bar -->
            <div class="obs-bottom-status">
                <span id="obs-link-count">0 link inverso</span>
                <i class="ti ti-unlink obs-status-icon"></i>
            </div>

            <!-- Connection Mode Banner -->
            <div id="obs-connect-banner" class="obs-connect-banner" style="display:none;">
                <i class="ti ti-link"></i>
                <span id="obs-connect-banner-text">Modo de Conexão: clique no card de destino para conectar</span>
                <button type="button" class="obs-banner-close" id="obs-connect-cancel" title="Cancelar conexão (Esc)">
                    <i class="ti ti-x"></i>
                </button>
            </div>

            <!-- Floating Node Context Menu (Color picker, delete, etc.) -->
            <div id="obs-node-context-bar" class="obs-node-context-bar" style="display:none;">
                <button type="button" class="obs-ctx-btn obs-ctx-connect-btn" id="obs-ctx-connect" title="Conectar a outro card">
                    <i class="ti ti-link"></i>
                    <span>Conectar</span>
                </button>
                <div class="obs-ctx-sep"></div>
                <div class="obs-color-dots">
                    <span class="obs-color-dot color-default active" data-color="default" title="Padrão"></span>
                    <span class="obs-color-dot color-green" data-color="green" title="Verde"></span>
                    <span class="obs-color-dot color-blue" data-color="blue" title="Azul"></span>
                    <span class="obs-color-dot color-red" data-color="red" title="Vermelho"></span>
                    <span class="obs-color-dot color-yellow" data-color="yellow" title="Amarelo"></span>
                    <span class="obs-color-dot color-purple" data-color="purple" title="Roxo"></span>
                </div>
                <div class="obs-ctx-sep"></div>
                <button type="button" class="obs-ctx-btn" id="obs-ctx-duplicate" title="Duplicar"><i class="ti ti-copy"></i></button>
                <button type="button" class="obs-ctx-btn" id="obs-ctx-delete" title="Excluir"><i class="ti ti-trash"></i></button>
            </div>

            <!-- Floating Edge / Link Context Menu (Mini pop-up on right click) -->
            <div id="obs-edge-context-bar" class="obs-edge-context-menu" style="display:none;">
                <div class="obs-edge-menu-header">
                    <i class="ti ti-link"></i>
                    <span>Conexão</span>
                </div>
                <div class="obs-edge-menu-items">
                    <button type="button" class="obs-edge-menu-btn obs-edge-btn-delete" id="obs-edge-btn-delete" title="Desconectar link">
                        <i class="ti ti-unlink"></i>
                        <span>Desconectar link</span>
                    </button>
                    <button type="button" class="obs-edge-menu-btn obs-edge-btn-flip" id="obs-edge-btn-flip" title="Inverter sentido da seta">
                        <i class="ti ti-arrows-left-right"></i>
                        <span>Inverter sentido</span>
                    </button>
                </div>
            </div>

            <!-- Help Modal -->
            <div id="obs-help-modal" class="obs-modal" style="display:none;">
                <div class="obs-modal-content">
                    <div class="obs-modal-header">
                        <h5><i class="ti ti-help me-2"></i>Atalhos do Obsidian Canvas</h5>
                        <button type="button" class="obs-modal-close" id="obs-help-close"><i class="ti ti-x"></i></button>
                    </div>
                    <div class="obs-modal-body">
                        <table class="table table-sm">
                            <tr><td><strong>Arrastar fundo</strong></td><td>Mover pelo canvas (Pan)</td></tr>
                            <tr><td><strong>Rolar mouse</strong></td><td>Zoom in / Zoom out</td></tr>
                            <tr><td><strong>Espaço + Arrastar</strong></td><td>Mover pelo canvas (Pan)</td></tr>
                            <tr><td><strong>Duplo clique no fundo</strong></td><td>Criar novo card de nota</td></tr>
                            <tr><td><strong>Arrastar flecha para o vazio</strong></td><td>Cria um novo card conectado automaticamente</td></tr>
                            <tr><td><strong>Clique no link</strong></td><td>Opção de Desconectar e Inverter</td></tr>
                            <tr><td><strong>Delete / Backspace</strong></td><td>Remover card ou link selecionado</td></tr>
                            <tr><td><strong>Clique no card</strong></td><td>Editar texto ou selecionar cor / duplicar</td></tr>
                            <tr><td><strong>Ctrl + V</strong></td><td>Colar imagem ou texto diretamente no Canvas</td></tr>
                        </table>
                    </div>
                </div>
            </div>

            <!-- Hidden File Input for Image Upload -->
            <input type="file" id="obs-file-input" accept="image/*" style="display:none;">
        </div>

        <!-- Canvas JavaScript Engine -->
        <script>
            (function() {
                var config = {
                    rootDoc: '<?= $rootDoc ?>',
                    kbId: '<?= $contextId ?>',
                    kbTitle: <?= json_encode($title) ?>
                };

                function startCanvas() {
                    if (window.ObsidianCanvasApp && typeof window.ObsidianCanvasApp.init === 'function') {
                        window.ObsidianCanvasApp.init(config);
                    }
                }

                if (window.ObsidianCanvasApp) {
                    startCanvas();
                } else {
                    var script = document.createElement('script');
                    script.type = 'text/javascript';
                    script.src = '<?= $rootDoc ?>/js/obsidian_canvas.js?v=<?= $v ?>';
                    script.onload = startCanvas;
                    document.head.appendChild(script);

                    var attempts = 0;
                    var interval = setInterval(function() {
                        attempts++;
                        if (window.ObsidianCanvasApp) {
                            clearInterval(interval);
                            startCanvas();
                        } else if (attempts > 60) {
                            clearInterval(interval);
                        }
                    }, 50);
                }
            })();
        </script>
        <?php
        return true;
    }
}

