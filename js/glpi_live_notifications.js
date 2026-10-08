/**
 * GLPI Live Broadcast Notifications & Anti-Duplication Feed
 * Design: Apple HIG & Fintech Modern
 */
(function() {
    'use strict';

    var STORAGE_KEY = 'glpi_seen_live_events';
    var lastCheck = Math.floor(Date.now() / 1000) - 30; // Começa olhando os últimos 30 segundos
    var isPolling = false;

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
        var container = ensureToastContainer();
        var toast = document.createElement('div');
        toast.className = 'glpi-live-toast glpi-toast-enter';
        toast.id = 'toast-' + evt.id;

        var avatarColors = ['#8B5CF6', '#3B82F6', '#10B981', '#EC4899', '#F59E0B', '#06B6D4'];
        var bg = avatarColors[Math.abs((evt.technician_name || '').split('').reduce(function(a,b){return ((a<<5)-a)+b.charCodeAt(0);},0)) % avatarColors.length];

        toast.innerHTML = 
            '<div class="glpi-toast-header">' +
                '<span class="glpi-toast-badge">' +
                    '<span class="glpi-toast-pulsing-dot"></span>' +
                    'Chamado em Execução' +
                '</span>' +
                '<span class="glpi-toast-time">' + (evt.time_str || 'Agora') + '</span>' +
                '<button type="button" class="glpi-toast-close" title="Fechar">&times;</button>' +
            '</div>' +
            '<div class="glpi-toast-body">' +
                '<div class="glpi-toast-avatar" style="background:' + bg + ';">' + (evt.technician_initial || 'T') + '</div>' +
                '<div class="glpi-toast-content">' +
                    '<div class="glpi-toast-tech">' +
                        '<strong>' + escapeHtml(evt.technician_name) + '</strong> assumiu o chamado ' +
                        '<a href="/glpi/front/ticket.form.php?id=' + evt.ticket_id + '" class="glpi-toast-id">#' + evt.ticket_id + '</a>' +
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

    // Polling de novos eventos
    function checkLiveNotifications() {
        if (isPolling) return;
        isPolling = true;

        var url = '/glpi/ajax/get_live_notifications.php?since=' + lastCheck + '&t=' + Date.now();
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

                        // Processa novos eventos para Toast
                        if (data.new_events && data.new_events.length > 0) {
                            var seen = getSeenEvents();
                            data.new_events.forEach(function(evt) {
                                if (seen.indexOf(evt.id) === -1) {
                                    markEventSeen(evt.id);
                                    showLiveToast(evt);
                                }
                            });
                        }

                        // Atualiza banner de chamados em andamento (se presente)
                        if (data.active_incidents) {
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
        // Primeira verificação após 1.5s
        setTimeout(checkLiveNotifications, 1500);
        // Polling contínuo a cada 10s
        setInterval(checkLiveNotifications, 10000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
