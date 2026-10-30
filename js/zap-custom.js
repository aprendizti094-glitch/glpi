/**
 * zap-custom.js — GLPI WhatsApp Zap View & Mobile Chat Enhancements
 * - Mobile (< 768px): Focus 100% on WhatsApp-style chat timeline
 * - Header back button to /front/ticket.php
 * - Modal/sheet toggle for ticket details ("ℹ️ Detalhes")
 * - Auto-scroll to bottom of conversation
 * - Desktop: Collapsible properties right-panel
 */
(function () {
    'use strict';

    const STORAGE_KEY = 'glpi_zap_panel_collapsed';
    const BODY_CLASS = 'zap-panel-collapsed';

    function isTicketPage() {
        if (document.querySelector('.new-itil-object') || 
            document.querySelector('#itil-object-container.is-new-ticket-page') ||
            (window.location.pathname.indexOf('ticket.form.php') !== -1 && !/[?&]id=[1-9]\d*/.test(window.location.search))) {
            return false;
        }
        return (window.location.pathname.indexOf('ticket.form.php') !== -1 && /[?&]id=[1-9]\d*/.test(window.location.search)) ||
               (window.location.search.indexOf('itemtype=Ticket') !== -1 && /[?&]id=[1-9]\d*/.test(window.location.search)) ||
               (document.body && document.body.classList.contains('glpi-ticket-zap-view')) ||
               document.querySelector('#itil-object-container.is-ticket-page') !== null;
    }

    /* =========================================================================
     * 1. DESKTOP: BOTÃO DE RECOLHER / EXPANDIR PAINEL DIREITO
     * ====================================================================== */
    function setupDesktopPanel() {
        if (!isTicketPage()) return;
        if (window.innerWidth <= 767.98) return;
        if (document.getElementById('zap-panel-toggle')) return;

        const rightSide = document.querySelector('.itil-right-side');
        if (!rightSide) return;

        rightSide.style.position = 'relative';

        const btn = document.createElement('button');
        btn.id = 'zap-panel-toggle';
        btn.setAttribute('title', 'Recolher painel');
        btn.setAttribute('aria-label', 'Recolher/expandir painel de propriedades');
        btn.type = 'button';

        rightSide.appendChild(btn);

        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved === '1') {
            document.body.classList.add(BODY_CLASS);
            btn.setAttribute('title', 'Expandir painel');
        }

        btn.addEventListener('click', function () {
            const isCollapsed = document.body.classList.toggle(BODY_CLASS);
            localStorage.setItem(STORAGE_KEY, isCollapsed ? '1' : '0');
            btn.setAttribute('title', isCollapsed ? 'Expandir painel' : 'Recolher painel');
        });
    }

    /* =========================================================================
     * 2. MOBILE: FOCO TOTAL NO CHAT (WHATSAPP APP STYLE)
     * ====================================================================== */
    function setupMobileChatView() {
        if (!isTicketPage()) return;

        // Garante classe no body
        if (document.body && !document.body.classList.contains('glpi-ticket-zap-view')) {
            document.body.classList.add('glpi-ticket-zap-view');
        }

        if (window.innerWidth > 767.98) return;

        // 2.1 Ajuste do cabeçalho (.navigationheader)
        const navHeader = document.querySelector('.navigationheader');
        if (navHeader) {
            // A) Botão Voltar (←)
            let backBtn = navHeader.querySelector('.ss-chat-back-btn');
            if (!backBtn) {
                // Tenta reaproveitar o link existente de lista
                const listLink = navHeader.querySelector('a[href*="ticket.php"], a[title*="List"], a[title*="Lista"], a .fa-list-alt');
                if (listLink) {
                    const anchor = listLink.closest('a') || listLink;
                    anchor.classList.add('ss-chat-back-btn');
                    anchor.innerHTML = '<i class="ti ti-arrow-left"></i>';
                    anchor.setAttribute('title', 'Voltar para chamados');
                    backBtn = anchor;
                } else {
                    // Cria novo botão voltar
                    backBtn = document.createElement('a');
                    backBtn.className = 'ss-chat-back-btn';
                    backBtn.href = window.location.pathname.indexOf('ticket.form.php') !== -1
                        ? window.location.pathname.replace('ticket.form.php', 'ticket.php')
                        : ((window.CFG_GLPI && window.CFG_GLPI.root_doc ? window.CFG_GLPI.root_doc : '') + '/front/ticket.php');
                    backBtn.innerHTML = '<i class="ti ti-arrow-left"></i>';
                    backBtn.setAttribute('title', 'Voltar para chamados');
                    navHeader.prepend(backBtn);
                }
            }

            // B) Botão ℹ️ Detalhes do Chamado no canto direito
            if (!document.getElementById('zap-mobile-info-toggle')) {
                const infoBtn = document.createElement('button');
                infoBtn.type = 'button';
                infoBtn.id = 'zap-mobile-info-toggle';
                infoBtn.setAttribute('title', 'Ver detalhes do chamado');
                infoBtn.setAttribute('aria-label', 'Detalhes do chamado');
                infoBtn.innerHTML = '<i class="ti ti-info-circle"></i>';

                infoBtn.addEventListener('click', function(e) {
                    e.preventDefault();
                    document.body.classList.toggle('show-mobile-ticket-details');
                });

                navHeader.appendChild(infoBtn);
            }
        }

        // 2.2 Cabeçalho de fechamento do Modal/Sheet de detalhes (.itil-right-side)
        const rightSide = document.querySelector('.itil-right-side');
        if (rightSide && !document.getElementById('zap-mobile-details-header')) {
            const detailsHeader = document.createElement('div');
            detailsHeader.id = 'zap-mobile-details-header';
            detailsHeader.className = 'd-flex align-items-center justify-content-between py-3 px-2 border-bottom mb-3';
            detailsHeader.innerHTML = `
                <div class="d-flex align-items-center gap-2">
                    <span class="badge bg-primary-subtle text-primary p-2 rounded-circle">
                        <i class="ti ti-info-circle fs-2"></i>
                    </span>
                    <div>
                        <h4 class="m-0 fw-bold text-dark">Detalhes do Chamado</h4>
                        <span class="small text-muted">Propriedades e status</span>
                    </div>
                </div>
                <button type="button" class="btn btn-sm btn-light rounded-pill px-3 py-1 fw-bold text-dark border" id="zap-close-mobile-details">
                    <i class="ti ti-x me-1"></i> Fechar
                </button>
            `;

            rightSide.prepend(detailsHeader);

            const closeBtn = detailsHeader.querySelector('#zap-close-mobile-details');
            if (closeBtn) {
                closeBtn.addEventListener('click', function() {
                    document.body.classList.remove('show-mobile-ticket-details');
                });
            }
        }

        // 2.3 Rolar automaticamente até a mensagem mais recente (base do chat)
        setTimeout(function() {
            const timeline = document.querySelector('.itil-timeline');
            if (timeline) {
                timeline.scrollTop = timeline.scrollHeight;
            }
            const inputForm = document.getElementById('new-itilobject-form');
            if (inputForm) {
                inputForm.scrollIntoView({ behavior: 'auto', block: 'end' });
            }
        }, 350);
    }

    function init() {
        if (!isTicketPage()) {
            if (document.body) {
                document.body.classList.remove('glpi-ticket-zap-view');
                document.body.classList.remove('zap-panel-collapsed');
            }
            if (document.documentElement) {
                document.documentElement.classList.remove('glpi-ticket-zap-view');
            }
            const container = document.getElementById('itil-object-container');
            if (container) {
                container.classList.remove('right-collapsed');
                container.classList.remove('is-ticket-page');
            }
            return;
        }
        setupDesktopPanel();
        setupMobileChatView();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Suporte a recarregamento dinâmico via AJAX do GLPI
    if (typeof window.jQuery !== 'undefined') {
        jQuery(document).ajaxComplete(function () {
            setTimeout(init, 200);
        });
    }

    // Suporte a redimensionamento ou mudança de orientação de tela
    window.addEventListener('resize', function() {
        init();
    });
})();
