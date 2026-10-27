/**
 * GLPI Live Broadcast Notifications & Anti-Duplication Feed
 * Design: Apple HIG & Modern Glassmorphism
 */
(function() {
    'use strict';

    var STORAGE_KEY = 'glpi_seen_live_events';
    var lastCheck = Math.floor(Date.now() / 1000) - 30; // Começa olhando os últimos 30 segundos
    var isPolling = false;

    function getRootDoc() {
        if (window.location.pathname.startsWith('/glpi/') || window.location.pathname === '/glpi') {
            return '/glpi';
        }
        if (window.CFG_GLPI && typeof window.CFG_GLPI.root_doc !== 'undefined') {
            var rd = window.CFG_GLPI.root_doc;
            if (rd === '/glpi' && !window.location.pathname.startsWith('/glpi')) {
                return '';
            }
            return rd ? rd.replace(/\/+$/, '') : '';
        }
        return '';
    }

    // Injeta estilos CSS para garantir que a notificação pop-up renderize perfeitamente em qualquer tela
    function injectStyles() {
        if (document.getElementById('glpi-live-toast-styles')) return;
        var style = document.createElement('style');
        style.id = 'glpi-live-toast-styles';
        style.textContent = 
            '.glpi-live-toast-container {' +
                'position: fixed;' +
                'top: 24px;' +
                'right: 24px;' +
                'z-index: 9999999;' +
                'display: flex;' +
                'flex-direction: column;' +
                'gap: 12px;' +
                'pointer-events: none;' +
                'max-width: 420px;' +
                'width: calc(100vw - 48px);' +
            '}' +
            '.glpi-live-toast {' +
                'pointer-events: auto;' +
                'background: rgba(255, 255, 255, 0.96);' +
                'backdrop-filter: blur(20px) saturate(180%);' +
                '-webkit-backdrop-filter: blur(20px) saturate(180%);' +
                'border: 1px solid rgba(0, 113, 227, 0.22);' +
                'box-shadow: 0 14px 40px rgba(0, 0, 0, 0.14), 0 4px 14px rgba(0, 113, 227, 0.10);' +
                'border-radius: 16px;' +
                'overflow: hidden;' +
                'transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);' +
                'transform-origin: top right;' +
            '}' +
            '.glpi-toast-enter {' +
                'animation: glpiToastIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;' +
            '}' +
            '.glpi-toast-leave {' +
                'animation: glpiToastOut 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;' +
            '}' +
            '@keyframes glpiToastIn {' +
                'from { opacity: 0; transform: translateY(-16px) scale(0.95); }' +
                'to { opacity: 1; transform: translateY(0) scale(1); }' +
            '}' +
            '@keyframes glpiToastOut {' +
                'from { opacity: 1; transform: translateY(0) scale(1); }' +
                'to { opacity: 0; transform: translateY(-12px) scale(0.95); }' +
            '}' +
            '.glpi-toast-header {' +
                'display: flex;' +
                'align-items: center;' +
                'justify-content: space-between;' +
                'padding: 10px 14px 6px 14px;' +
                'background: rgba(0, 113, 227, 0.04);' +
                'border-bottom: 1px solid rgba(0, 0, 0, 0.04);' +
            '}' +
            '.glpi-toast-badge {' +
                'display: inline-flex;' +
                'align-items: center;' +
                'gap: 6px;' +
                'font-size: 0.72rem;' +
                'font-weight: 700;' +
                'text-transform: uppercase;' +
                'letter-spacing: 0.04em;' +
                'color: #0071E3;' +
            '}' +
            '.glpi-toast-pulsing-dot {' +
                'width: 8px;' +
                'height: 8px;' +
                'border-radius: 50%;' +
                'background: #34C759;' +
                'box-shadow: 0 0 0 rgba(52, 199, 89, 0.4);' +
                'animation: glpiPulse 1.8s infinite;' +
            '}' +
            '@keyframes glpiPulse {' +
                '0% { box-shadow: 0 0 0 0 rgba(52, 199, 89, 0.7); }' +
                '70% { box-shadow: 0 0 0 6px rgba(52, 199, 89, 0); }' +
                '100% { box-shadow: 0 0 0 0 rgba(52, 199, 89, 0); }' +
            '}' +
            '.glpi-toast-time {' +
                'font-size: 0.72rem;' +
                'color: #86868B;' +
                'margin-left: auto;' +
                'margin-right: 8px;' +
            '}' +
            '.glpi-toast-close {' +
                'background: transparent;' +
                'border: none;' +
                'font-size: 1.25rem;' +
                'line-height: 1;' +
                'color: #86868B;' +
                'cursor: pointer;' +
                'padding: 2px 6px;' +
                'border-radius: 6px;' +
                'transition: all 0.15s ease;' +
            '}' +
            '.glpi-toast-close:hover {' +
                'color: #1D1D1F;' +
                'background: rgba(0, 0, 0, 0.06);' +
            '}' +
            '.glpi-toast-body {' +
                'display: flex;' +
                'align-items: flex-start;' +
                'gap: 12px;' +
                'padding: 12px 14px;' +
            '}' +
            '.glpi-toast-avatar {' +
                'width: 38px;' +
                'height: 38px;' +
                'min-width: 38px;' +
                'border-radius: 50%;' +
                'display: flex;' +
                'align-items: center;' +
                'justify-content: center;' +
                'color: #FFFFFF;' +
                'font-weight: 700;' +
                'font-size: 0.90rem;' +
                'box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);' +
            '}' +
            '.glpi-toast-content {' +
                'flex: 1;' +
                'min-width: 0;' +
            '}' +
            '.glpi-toast-tech {' +
                'font-size: 0.86rem;' +
                'color: #1D1D1F;' +
                'line-height: 1.35;' +
            '}' +
            '.glpi-toast-tech strong {' +
                'color: #0071E3;' +
                'font-weight: 700;' +
            '}' +
            '.glpi-toast-id {' +
                'display: inline-block;' +
                'padding: 1px 6px;' +
                'background: #EBF3FF;' +
                'color: #0071E3;' +
                'border-radius: 6px;' +
                'font-weight: 700;' +
                'text-decoration: none !important;' +
                'font-size: 0.78rem;' +
                'margin-left: 2px;' +
            '}' +
            '.glpi-toast-id:hover {' +
                'background: #0071E3;' +
                'color: #FFFFFF;' +
            '}' +
            '.glpi-toast-title {' +
                'font-size: 0.78rem;' +
                'color: #6E6E73;' +
                'margin-top: 4px;' +
                'white-space: nowrap;' +
                'overflow: hidden;' +
                'text-overflow: ellipsis;' +
                'line-height: 1.3;' +
            '}' +
            '.glpi-toast-progress {' +
                'height: 3px;' +
                'width: 100%;' +
                'background: rgba(0, 0, 0, 0.05);' +
            '}' +
            '.glpi-toast-progress-bar {' +
                'height: 100%;' +
                'background: #0071E3;' +
                'width: 100%;' +
                'animation: glpiToastProgress 8s linear forwards;' +
            '}' +
            '@keyframes glpiToastProgress {' +
                'from { width: 100%; }' +
                'to { width: 0%; }' +
            '}';
        document.head.appendChild(style);
    }

    // Recupera lista de eventos já exibidos
    function getSeenEvents() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            return [];
        }
    }

    function markEventSeen(id) {
        try {
            var seen = getSeenEvents();
            if (seen.indexOf(id) === -1) {
                seen.push(id);
                if (seen.length > 50) seen = seen.slice(-50);
                localStorage.setItem(STORAGE_KEY, JSON.stringify(seen));
            }
        } catch (e) {}
    }

    // Síntese de som sutil e agradável (Apple-style Chime) via Web Audio API
    function playChimeSound() {
        try {
            var AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;
            var ctx = new AudioContext();
            
            var now = ctx.currentTime;
            var osc = ctx.createOscillator();
            var gain = ctx.createGain();

            osc.type = 'sine';
            // Dois tons suaves rápidos (D5 -> A5)
            osc.frequency.setValueAtTime(587.33, now); // D5
            osc.frequency.exponentialRampToValueAtTime(880.00, now + 0.08); // A5

            gain.gain.setValueAtTime(0.001, now);
            gain.gain.linearRampToValueAtTime(0.08, now + 0.04);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.start(now);
            osc.stop(now + 0.36);
        } catch (e) {
            // Audio context pode estar bloqueado antes da 1a interação do usuário
        }
    }

    // Garante container flutuante na tela
    function ensureToastContainer() {
        injectStyles();
        var container = document.getElementById('glpi-live-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'glpi-live-toast-container';
            container.className = 'glpi-live-toast-container';
            document.body.appendChild(container);
        }
        return container;
    }

    // Exibe Toast Apple HIG
    function showLiveToast(evt) {
        if (!evt || !evt.ticket_id) return;
        var container = ensureToastContainer();
        var toast = document.createElement('div');
        toast.className = 'glpi-live-toast glpi-toast-enter';
        toast.id = 'toast-' + (evt.id || ('local_' + Date.now()));

        var avatarColors = ['#8B5CF6', '#3B82F6', '#10B981', '#EC4899', '#F59E0B', '#06B6D4'];
        var bg = avatarColors[Math.abs((evt.technician_name || '').split('').reduce(function(a,b){return ((a<<5)-a)+b.charCodeAt(0);},0)) % avatarColors.length];

        var badgeLabel = evt.status_name ? escapeHtml(evt.status_name) : 'Chamado Assumido';

        var actionText = 'assumiu o chamado ';
        if (evt.status === 1) {
            actionText = 'chegou como novo chamado ';
        } else if (evt.status === 3) {
            actionText = 'colocou em execução o chamado ';
        } else if (evt.status === 4) {
            actionText = 'colocou em aguardo o chamado ';
        } else if (evt.status === 5) {
            actionText = 'concluiu o chamado ';
        }

        toast.innerHTML = 
            '<div class="glpi-toast-header">' +
                '<span class="glpi-toast-badge">' +
                    '<span class="glpi-toast-pulsing-dot"></span>' +
                    badgeLabel +
                '</span>' +
                '<span class="glpi-toast-time">' + (evt.time_str || 'Agora') + '</span>' +
                '<button type="button" class="glpi-toast-close" title="Fechar">&times;</button>' +
            '</div>' +
            '<div class="glpi-toast-body">' +
                '<div class="glpi-toast-avatar" style="background:' + bg + ';">' + (evt.technician_initial || 'T') + '</div>' +
                '<div class="glpi-toast-content">' +
                    '<div class="glpi-toast-tech">' +
                        '<strong>' + escapeHtml(evt.technician_name) + '</strong> ' + actionText +
                        '<a href="' + getRootDoc() + '/front/ticket.form.php?id=' + evt.ticket_id + '" class="glpi-toast-id">#' + evt.ticket_id + '</a>' +
                    '</div>' +
                    '<div class="glpi-toast-title" title="' + escapeHtml(evt.ticket_title) + '">' +
                        escapeHtml(evt.ticket_title) +
                    '</div>' +
                '</div>' +
            '</div>' +
            '<div class="glpi-toast-progress"><div class="glpi-toast-progress-bar"></div></div>';

        container.appendChild(toast);
        playChimeSound();

        // Botão Fechar
        var closeBtn = toast.querySelector('.glpi-toast-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', function() {
                dismissToast(toast);
            });
        }

        // Auto dismiss em 8 segundos
        var timer = setTimeout(function() {
            dismissToast(toast);
        }, 8000);

        // Pausa dismiss se passar mouse por cima
        toast.addEventListener('mouseenter', function() {
            clearTimeout(timer);
            var bar = toast.querySelector('.glpi-toast-progress-bar');
            if (bar) bar.style.animationPlayState = 'paused';
        });

        toast.addEventListener('mouseleave', function() {
            var bar = toast.querySelector('.glpi-toast-progress-bar');
            if (bar) bar.style.animationPlayState = 'running';
            timer = setTimeout(function() {
                dismissToast(toast);
            }, 3000);
        });
    }

    // Expõe globalmente para disparo direto
    window.showLiveToast = showLiveToast;

    function dismissToast(toast) {
        if (!toast || toast.classList.contains('glpi-toast-leave')) return;
        toast.classList.remove('glpi-toast-enter');
        toast.classList.add('glpi-toast-leave');
        setTimeout(function() {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }

    // Renderiza banner anti-duplicação se o container estiver presente na página
    function renderActiveIncidentsFeed(incidents) {
        var container = document.getElementById('glpiActiveIncidentsFeed');
        if (!container) return;

        if (!incidents || incidents.length === 0) {
            container.style.display = 'none';
            container.innerHTML = '';
            return;
        }

        var html = 
            '<div class="apple-incidents-banner mb-3">' +
                '<div class="incidents-banner-top">' +
                    '<div class="incidents-badge">' +
                        '<span class="incidents-pulse"></span>' +
                        '<i class="fas fa-tools me-1"></i> Em Atendimento pela TI Agora' +
                    '</div>' +
                    '<span class="incidents-sub">Verifique se o seu problema já está sendo resolvido:</span>' +
                '</div>' +
                '<div class="incidents-chips-grid">';

        incidents.forEach(function(inc) {
            html += 
                '<div class="incident-chip" title="Chamado #' + inc.id + ' com ' + escapeHtml(inc.technician) + '">' +
                    '<span class="incident-chip-status"></span>' +
                    '<span class="incident-chip-title">#' + inc.id + ' ' + escapeHtml(inc.title) + '</span>' +
                    '<span class="incident-chip-tech"><i class="fas fa-user-check me-1"></i>' + escapeHtml(inc.technician) + '</span>' +
                '</div>';
        });

        html += 
                '</div>' +
                '<div class="incidents-banner-footer">' +
                    '<i class="fas fa-info-circle me-1"></i> Se sua dúvida ou erro for um dos listados acima, nossa equipe já está trabalhando nele. Não é necessário abrir outro chamado!' +
                '</div>' +
            '</div>';

        container.innerHTML = html;
        container.style.display = 'block';
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // Reconciliação e sincronização automática e contínua dos cards do Kanban
    function defaultKanbanSync(ticketsMap) {
        if (!ticketsMap || typeof ticketsMap !== 'object') return;
        if (window.isDraggingKanban) return;

        var changed = false;
        Object.keys(ticketsMap).forEach(function(tid) {
            var t = ticketsMap[tid];
            if (!t || !t.id || !t.status) return;

            var card = document.getElementById('kanban-ticket-' + t.id);
            if (!card) return;

            // 1. Atualiza dados do técnico
            if (t.technician_name && t.technician_name !== 'Técnico de TI') {
                var techSpan = card.querySelector('.tech-name');
                if (techSpan && techSpan.textContent.trim() !== t.technician_name) {
                    techSpan.textContent = t.technician_name;
                }
                var techPill = card.querySelector('.card-tech-pill');
                if (techPill) {
                    if (t.technician_name === 'Não atribuído' || !t.technician_id) {
                        techPill.classList.add('tech-unassigned');
                        techPill.title = 'Chamado aguardando atribuição';
                        var icon = techPill.querySelector('i');
                        if (icon) icon.className = 'ti ti-user-exclamation';
                    } else {
                        techPill.classList.remove('tech-unassigned');
                        techPill.title = 'Atribuído para: ' + t.technician_name;
                        var icon = techPill.querySelector('i');
                        if (icon) icon.className = 'ti ti-user-check';
                    }
                }
            }

            // 2. Move o card para a coluna correta se o status mudou
            var targetCol = document.querySelector('.elera-kanban-col[data-status="' + t.status + '"]');
            if (targetCol) {
                var container = targetCol.querySelector('.elera-cards-container');
                if (container && card.parentElement !== container) {
                    container.prepend(card);
                    card.setAttribute('data-status', t.status);
                    changed = true;

                    // Pulso e destaque suave Apple
                    card.style.transition = 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)';
                    card.style.boxShadow = '0 0 0 3px rgba(0, 113, 227, 0.55), 0 10px 28px rgba(0, 113, 227, 0.22)';
                    card.style.transform = 'translateY(-2px) scale(1.01)';
                    setTimeout(function() {
                        card.style.boxShadow = '';
                        card.style.transform = '';
                    }, 2500);
                }
            }
        });

        if (changed) {
            // Recalcula contadores das colunas
            document.querySelectorAll('.elera-kanban-col').forEach(function(c) {
                var count = c.querySelectorAll('.elera-ticket-card').length;
                var badge = c.querySelector('.col-count-pill');
                if (badge) badge.textContent = count;
            });
            var solvedCount = document.querySelectorAll('.elera-kanban-col.col-solved .elera-ticket-card').length;
            var solvedStat = document.querySelector('.elera-today-summary-card .stat-value');
            if (solvedStat) solvedStat.textContent = solvedCount;
        }
    }

    window.syncKanbanTickets = defaultKanbanSync;

    // Polling rápido e adaptativo de novos eventos
    function checkLiveNotifications() {
        if (isPolling) return;
        isPolling = true;

        var url = getRootDoc() + '/ajax/get_live_notifications.php?since=' + lastCheck + '&t=' + Date.now();
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');

        xhr.onload = function() {
            isPolling = false;
            if (xhr.status === 200) {
                try {
                    var data = JSON.parse(xhr.responseText);
                    if (data && data.success) {
                        if (data.server_time) {
                            lastCheck = data.server_time;
                        }

                        // Verifica se surgiu um novo chamado no sistema para recarregar o quadro/lista sem F5
                        if (data.latest_ticket_id) {
                            if (!window.glpiLastMaxTicketId) {
                                window.glpiLastMaxTicketId = data.latest_ticket_id;
                            } else if (data.latest_ticket_id > window.glpiLastMaxTicketId) {
                                window.glpiLastMaxTicketId = data.latest_ticket_id;
                                try {
                                    window.dispatchEvent(new CustomEvent('glpi:reload_kanban', { 
                                        detail: { latest_id: data.latest_ticket_id } 
                                    }));
                                } catch (e) {}
                            }
                        }

                        // Processa novos eventos para Toast e propagação na página
                        if (data.new_events && data.new_events.length > 0) {
                            var seen = getSeenEvents();
                            data.new_events.forEach(function(evt) {
                                if (seen.indexOf(evt.id) === -1) {
                                    markEventSeen(evt.id);
                                    showLiveToast(evt);
                                }
                                // Se o card não existe no Kanban atual, dispara atualização do quadro
                                if (evt.ticket_id && !document.getElementById('kanban-ticket-' + evt.ticket_id)) {
                                    try {
                                        window.dispatchEvent(new CustomEvent('glpi:reload_kanban', { detail: evt }));
                                    } catch (e) {}
                                }
                                // Propaga evento DOM para sincronização instantânea em tela (Kanban, painéis)
                                try {
                                    window.dispatchEvent(new CustomEvent('glpi:live_ticket_update', { detail: evt }));
                                } catch (e) {}
                            });
                        }

                        // Reconciliação imediata de todos os cards no Kanban do usuário
                        if (data.active_tickets) {
                            try {
                                if (typeof window.syncKanbanTickets === 'function') {
                                    window.syncKanbanTickets(data.active_tickets);
                                }
                            } catch (errSync) {
                                console.warn('[GLPI Live Kanban Sync] Error:', errSync);
                            }
                        }

                        // Atualiza banner de chamados em andamento (se presente)
                        if (data.active_incidents && data.active_incidents.length > 0) {
                            renderActiveIncidentsFeed(data.active_incidents);
                        }
                    }
                } catch (e) {
                    console.warn('[GLPI Live Notif] Parse error:', e);
                }
            }
        };

        xhr.onerror = function() {
            isPolling = false;
        };

        xhr.send();
    }

    // Inicia verificação quando o DOM carregar
    function init() {
        injectStyles();
        // Primeira verificação após 800ms
        setTimeout(checkLiveNotifications, 800);
        // Polling contínuo rápido a cada 2.5 segundos para propagação simultânea imediata
        setInterval(checkLiveNotifications, 2500);

        // Auto-trigger silencioso para o cron do GLPI processar novos e-mails continuamente a cada 10 segundos
        setInterval(function() {
            var img = new Image();
            img.src = getRootDoc() + '/front/cron.php?task=mailgate&t=' + Date.now();
        }, 10000);

        // Dispara verificação imediata ao alternar de volta para a aba
        document.addEventListener('visibilitychange', function() {
            if (!document.hidden) {
                checkLiveNotifications();
                var img = new Image();
                img.src = getRootDoc() + '/front/cron.php?task=mailgate&t=' + Date.now();
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
