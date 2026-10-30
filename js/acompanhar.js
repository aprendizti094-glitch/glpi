/**
 * Brago · Página de Acompanhamento de Chamado (Apple HIG Live Tracking)
 * ----------------------------------------------------------------------------
 * Camada de APRESENTAÇÃO. Renderiza toda a UI dentro de <div id="acp-app">.
 * O backend (front/acompanhar.php + ajax/acompanhar_api.php) só precisa:
 *
 *   window.ACP_CONFIG = {
 *     apiUrl:       '/ajax/acompanhar_api.php', // GET (estado) e POST (mensagem)
 *     ticketId:     6,
 *     token:        'abc123...',
 *     pollInterval: 2500,                        // ms
 *     initialData:  { ...payload... },           // opcional (evita skeleton)
 *     mock:         false,                       // true = dados de exemplo
 *     demo:         false                        // true = botão "Próximo evento"
 *   };
 *
 * CONTRATO DO PAYLOAD (GET → JSON). Aceita { success, data: {...} } ou o objeto direto:
 * {
 *   success: true,
 *   ticket: {
 *     id: 6, title: 'Problema na impressora DP',
 *     category: 'Impressoras',
 *     urgency: { level: 3, label: 'Média' },        // 1..5
 *     status:  { code: 3 },                         // 1..6 (GLPI)
 *     opened_at: '2026-10-28 12:00:00',
 *     solved_at: null                               // ou datetime
 *   },
 *   technician: { name: 'David Gonçalves', role: 'Técnico N1' } | null,
 *   timeline: [
 *     { type: 'opened'|'assigned'|'progress'|'waiting'|'solved'|'closed'|'reopened',
 *       datetime: '2026-10-28 12:00:00', title: 'Aberto o chamado',
 *       subtitle: 'Recebido e classificado na Triagem' }
 *   ],
 *   messages: [
 *     { id: 'f-12',                                 // único e estável
 *       author: 'requester'|'technician',
 *       kind: 'description'|'followup'|'solution',
 *       name: 'David Gonçalves',
 *       datetime: '2026-10-28 12:05:00',
 *       content: 'Texto puro (sem HTML)' }
 *   ]
 * }
 *
 * POST (FormData: id, token, content) → { success: true, message: {...mesmo formato...} }
 * Erros de token: HTTP 403 ou { success:false, code:'invalid_token' } → tela de link inválido.
 */
(function () {
    'use strict';

    var CFG = Object.assign({
        apiUrl: null,
        ticketId: null,
        token: null,
        pollInterval: 2500,
        initialData: null,
        mock: false,
        demo: false
    }, window.ACP_CONFIG || {});

    var root = document.getElementById('acp-app');
    if (!root) return;

    /* ------------------------------------------------------------------ */
    /* Constantes                                                          */
    /* ------------------------------------------------------------------ */
    var STATUS = {
        1: { stage: 0, label: 'Triagem', tone: 'blue' },
        2: { stage: 0, label: 'Triagem', tone: 'blue' },
        3: { stage: 1, label: 'Em Execução', tone: 'orange' },
        4: { stage: 2, label: 'Em Aguardo', tone: 'amber' },
        5: { stage: 3, label: 'Concluído', tone: 'done' },
        6: { stage: 3, label: 'Concluído', tone: 'done' }
    };

    var STAGES = [
        { label: 'Aberto', sub: 'Triagem', icon: 'inbox', tone: 'blue' },
        { label: 'Em Execução', sub: 'Atendimento', icon: 'bolt', tone: 'orange' },
        { label: 'Em Aguardo', sub: 'Pendência', icon: 'pause', tone: 'amber' },
        { label: 'Concluído', sub: 'Finalizado', icon: 'check', tone: 'green' }
    ];

    var TL_TYPES = {
        opened: { icon: 'inbox', tone: 'blue' },
        assigned: { icon: 'personCheck', tone: 'indigo' },
        progress: { icon: 'bolt', tone: 'orange' },
        waiting: { icon: 'pause', tone: 'amber' },
        solved: { icon: 'check', tone: 'green' },
        closed: { icon: 'check', tone: 'green' },
        reopened: { icon: 'rotate', tone: 'purple' }
    };

    var URGENCY_TONE = { 1: 'gray', 2: 'green', 3: 'blue', 4: 'orange', 5: 'red' };
    var AVATAR_COLORS = ['#4F46E5', '#0120F8', '#0EA5E9', '#10B981', '#F97316', '#EC4899', '#8B5CF6', '#14B8A6'];
    var MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

    var ICONS = {
        inbox: '<path d="M4 13.5V18a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4.5"/><path d="M4 13.5 6.4 6.2A2 2 0 0 1 8.3 5h7.4a2 2 0 0 1 1.9 1.2L20 13.5"/><path d="M4 13.5h4.5l1.2 2h4.6l1.2-2H20"/>',
        personCheck: '<circle cx="10" cy="8" r="3.5"/><path d="M3.5 19.5c1.1-3.3 3.5-5 6.5-5 1.4 0 2.6.3 3.7 1"/><path d="m15.5 17.5 2 2 4-4"/>',
        person: '<circle cx="12" cy="8" r="3.5"/><path d="M5 19.5c1.2-3.4 3.8-5 7-5s5.8 1.6 7 5"/>',
        bolt: '<path d="M13 3 5.5 13.5H12L11 21l7.5-10.5H12L13 3z"/>',
        pause: '<path d="M9.5 7v10M14.5 7v10"/>',
        check: '<path d="m5 12.5 4.2 4.2L19 7"/>',
        checkCircle: '<circle cx="12" cy="12" r="8.5"/><path d="m8.3 12.3 2.6 2.6 5-5.2"/>',
        rotate: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 4.5v3.7h3.7"/>',
        send: '<path d="M12 19V5"/><path d="m6 11 6-6 6 6"/>',
        clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
        tag: '<path d="M3.5 12.2V5a1.5 1.5 0 0 1 1.5-1.5h7.2l8.3 8.3a1.5 1.5 0 0 1 0 2.1l-6.6 6.6a1.5 1.5 0 0 1-2.1 0L3.5 12.2z"/><circle cx="8" cy="8" r="1.3"/>',
        flag: '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>',
        chat: '<path d="M20 12a7.5 7.5 0 0 1-11.2 6.5L4 20l1.5-4.6A7.5 7.5 0 1 1 20 12z"/>',
        list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
        lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
        alert: '<path d="M12 4 2.8 19.5h18.4L12 4z"/><path d="M12 10v4.5M12 17.2v.1"/>',
        arrowDown: '<path d="M12 5v14"/><path d="m6 13 6 6 6-6"/>',
        paperclip: '<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
        externalLink: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>',
        close: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'
    };

    /* ------------------------------------------------------------------ */
    /* Estado                                                              */
    /* ------------------------------------------------------------------ */
    var state = {
        data: null,
        rendered: false,
        seenMsg: {},
        seenTl: {},
        lastStage: -1,
        lastStatus: null,
        panel: 'timeline',
        unread: 0,
        lastSync: 0,
        online: true,
        pollTimer: null,
        tmpSeq: 0,
        selectedImage: null
    };

    var el = {};

    /* ------------------------------------------------------------------ */
    /* Utilitários                                                         */
    /* ------------------------------------------------------------------ */
    function icon(name, cls) {
        return '<svg class="acp-ico ' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[name] || '') + '</svg>';
    }

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function textToHtml(s) {
        return esc(String(s == null ? '' : s).trim()).replace(/\n{3,}/g, '\n\n').replace(/\n/g, '<br>');
    }

    function formatBytes(bytes) {
        if (!bytes || bytes <= 0) return '';
        var kb = bytes / 1024;
        if (kb < 1024) return Math.round(kb) + ' KB';
        return (kb / 1024).toFixed(1) + ' MB';
    }

    function parseDate(v) {
        if (!v) return null;
        if (v instanceof Date) return v;
        var d = new Date(String(v).replace(' ', 'T'));
        return isNaN(d.getTime()) ? null : d;
    }

    function pad(n) { return (n < 10 ? '0' : '') + n; }

    function hhmm(d) { return d ? pad(d.getHours()) + ':' + pad(d.getMinutes()) : '--:--'; }

    function sameDay(a, b) {
        return a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    }

    function dayLabel(d) {
        if (!d) return '';
        var now = new Date();
        var y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        if (sameDay(d, now)) return 'Hoje';
        if (sameDay(d, y)) return 'Ontem';
        return d.getDate() + ' de ' + MONTHS[d.getMonth()] + (d.getFullYear() !== now.getFullYear() ? ' de ' + d.getFullYear() : '');
    }

    function initials(name) {
        var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
        if (!parts.length) return '?';
        var a = parts[0].charAt(0);
        var b = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
        return (a + b).toUpperCase();
    }

    function colorFor(name) {
        var h = 0, s = String(name || '');
        for (var i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
        return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
    }

    function avatar(name, size) {
        return '<span class="acp-avatar ' + (size ? 'acp-avatar--' + size : '') + '" style="background:' + colorFor(name) + '" aria-hidden="true">' + esc(initials(name)) + '</span>';
    }

    function protocol(id) {
        var s = String(id || 0);
        while (s.length < 6) s = '0' + s;
        return '#' + s;
    }

    function statusInfo(code) {
        return STATUS[code] || STATUS[1];
    }

    /* ------------------------------------------------------------------ */
    /* Shell                                                               */
    /* ------------------------------------------------------------------ */
    function buildShell() {
        root.className = 'acp-app';
        root.setAttribute('data-panel', state.panel);

        var stepsHtml = STAGES.map(function (s, i) {
            return '<li class="acp-step" data-step="' + i + '" data-tone="' + s.tone + '">' +
                '<span class="acp-step__node">' + icon(s.icon) + '</span>' +
                '<span class="acp-step__label">' + s.label + '<span class="acp-step__sub">' + s.sub + '</span></span>' +
                '</li>';
        }).join('');

        var logoWhiteUrl = CFG.logoWhiteUrl || (CFG.rootDoc ? CFG.rootDoc + '/pics/brago_logo_white.png' : '/pics/brago_logo_white.png');
        var logoColorUrl = CFG.logoColorUrl || (CFG.rootDoc ? CFG.rootDoc + '/pics/brago_logo.png' : '/pics/brago_logo.png');

        root.innerHTML =
            '<header class="acp-header">' +
                '<div class="acp-header__inner">' +
                    '<div class="acp-brand">' +
                        '<a href="#" class="acp-brand__logo-link" aria-label="Brago Distribuidora">' +
                            '<img src="' + esc(logoWhiteUrl) + '" alt="Brago Distribuidora" class="acp-brand__logo" height="28" ' +
                            'onerror="if(!this.dataset.fb){this.dataset.fb=1; this.src=\'' + esc(logoColorUrl) + '\'; this.classList.add(\'acp-brand__logo--pill\');}">' +
                        '</a>' +
                        '<span class="acp-brand__divider" aria-hidden="true"></span>' +
                        '<div class="acp-brand__text">' +
                            '<strong>Central de Atendimento TI</strong>' +
                            '<span>Brago Distribuidora</span>' +
                        '</div>' +
                    '</div>' +
                    '<div class="acp-header__meta">' +
                        '<span class="acp-live" data-ref="live" data-tone="blue" role="status" aria-live="polite">' +
                            '<span class="acp-live__dot"></span><span data-ref="liveLabel">Carregando</span>' +
                        '</span>' +
                    '</div>' +
                '</div>' +
            '</header>' +

            '<main class="acp-main">' +
                '<section class="acp-card acp-hero" data-ref="hero" aria-labelledby="acp-title">' +
                    '<div class="acp-hero__top">' +
                        '<div style="min-width:0">' +
                            '<p class="acp-eyebrow" data-ref="eyebrow">Acompanhamento do chamado</p>' +
                            '<h1 id="acp-title" data-ref="title"><span class="acp-skel" style="display:block;height:30px;width:70%"></span></h1>' +
                            '<div class="acp-hero__meta" data-ref="meta"></div>' +
                        '</div>' +
                        '<span class="acp-sync" data-ref="sync"><span class="acp-sync__dot"></span><span data-ref="syncLabel">Conectando…</span></span>' +
                    '</div>' +
                    '<ol class="acp-stepper" data-ref="stepper" aria-label="Progresso do chamado">' +
                        '<span class="acp-stepper__track" aria-hidden="true"><span class="acp-stepper__fill"></span></span>' +
                        stepsHtml +
                    '</ol>' +
                '</section>' +

                '<div class="acp-banner" data-ref="banner" hidden>' +
                    '<span class="acp-banner__icon">' + icon('check') + '</span>' +
                    '<div><strong>Seu chamado foi concluído</strong><span data-ref="bannerText"></span></div>' +
                '</div>' +

                '<div class="acp-segmented" role="tablist" aria-label="Seções">' +
                    '<button type="button" role="tab" data-tab="timeline" aria-selected="true">' + icon('list') + 'Linha do tempo</button>' +
                    '<button type="button" role="tab" data-tab="chat" aria-selected="false">' + icon('chat') + 'Conversa <span class="acp-badge" data-ref="unread" hidden>0</span></button>' +
                '</div>' +

                '<div class="acp-grid">' +
                    '<div class="acp-col" data-panel-id="timeline">' +
                        '<section class="acp-card acp-tech" data-ref="tech" aria-label="Técnico responsável"></section>' +
                        '<section class="acp-card acp-timeline-card" aria-labelledby="acp-tl-title">' +
                            '<div class="acp-card__title"><h2 id="acp-tl-title">Linha do tempo</h2><small data-ref="tlCount"></small></div>' +
                            '<ol class="acp-timeline" data-ref="timeline"></ol>' +
                        '</section>' +
                    '</div>' +

                    '<section class="acp-card acp-chat" data-panel-id="chat" aria-label="Conversa com o suporte">' +
                        '<div class="acp-chat__header" data-ref="chatHeader"></div>' +
                        '<div class="acp-chat__scroll" data-ref="scroll">' +
                            '<div class="acp-chat__list" data-ref="list" role="log" aria-live="polite" aria-relevant="additions"></div>' +
                            '<button type="button" class="acp-jump" data-ref="jump">' + icon('arrowDown') + 'Nova mensagem</button>' +
                        '</div>' +
                        '<form class="acp-composer" data-ref="composer" autocomplete="off">' +
                            '<label class="acp-sr-only" for="acp-input">Mensagem para o técnico</label>' +
                            '<div class="acp-composer__preview" data-ref="imgPreview" hidden>' +
                                '<div class="acp-composer__thumb-wrap">' +
                                    '<img data-ref="previewImg" src="" alt="Print selecionado" />' +
                                    '<button type="button" class="acp-composer__remove-img" data-ref="removeImg" title="Remover imagem" aria-label="Remover imagem">&times;</button>' +
                                '</div>' +
                                '<div class="acp-composer__preview-info">' +
                                    '<span class="acp-composer__filename" data-ref="previewName">Print anexado</span>' +
                                    '<span class="acp-composer__filesize" data-ref="previewSize"></span>' +
                                '</div>' +
                            '</div>' +
                            '<div class="acp-composer__box">' +
                                '<label class="acp-attach-btn" title="Anexar print ou imagem">' +
                                    '<input type="file" id="acp-file" data-ref="fileInput" accept="image/png,image/jpeg,image/webp,image/gif" class="acp-sr-only">' +
                                    '<span class="acp-attach-btn__icon">' + icon('paperclip') + '</span>' +
                                '</label>' +
                                '<textarea id="acp-input" rows="1" maxlength="2000" placeholder="Digite uma mensagem ou cole um print (Ctrl+V)…" data-ref="input"></textarea>' +
                                '<button type="submit" class="acp-send" data-ref="send" disabled aria-label="Enviar mensagem">' + icon('send') + '</button>' +
                            '</div>' +
                            '<div class="acp-composer__hint" data-ref="hint">' +
                                '<span data-ref="hintText">Sua mensagem chega direto ao técnico responsável.</span>' +
                                '<span class="acp-hint-keys">Enter envia · Cole prints com Ctrl+V</span>' +
                            '</div>' +
                        '</form>' +
                    '</section>' +
                '</div>' +

                '<footer class="acp-footer">' + icon('lock') + '<span>Link seguro e exclusivo deste chamado. Não compartilhe.</span></footer>' +
                '<div class="acp-lightbox" id="acp-lightbox" hidden role="dialog" aria-modal="true" aria-label="Visualização de imagem">' +
                    '<div class="acp-lightbox__backdrop" data-ref="lightboxBackdrop"></div>' +
                    '<div class="acp-lightbox__content">' +
                        '<div class="acp-lightbox__header">' +
                            '<span class="acp-lightbox__title" data-ref="lightboxTitle">Print anexado</span>' +
                            '<div class="acp-lightbox__actions">' +
                                '<a href="#" target="_blank" rel="noopener noreferrer" class="acp-lightbox__action" data-ref="lightboxExternal" title="Abrir imagem em tamanho real">' + icon('externalLink') + '</a>' +
                                '<button type="button" class="acp-lightbox__action acp-lightbox__close" data-ref="lightboxClose" title="Fechar (Esc)">' + icon('close') + '</button>' +
                            '</div>' +
                        '</div>' +
                        '<div class="acp-lightbox__body">' +
                            '<img src="" alt="" data-ref="lightboxImg" />' +
                        '</div>' +
                    '</div>' +
                '</div>' +
            '</main>';

        root.querySelectorAll('[data-ref]').forEach(function (n) { el[n.getAttribute('data-ref')] = n; });
        el.steps = root.querySelectorAll('.acp-step');

        renderTechSkeleton();
        renderTimelineSkeleton();
        bindEvents();
    }

    function renderTechSkeleton() {
        el.tech.innerHTML =
            '<div class="acp-tech__row"><span class="acp-skel" style="width:52px;height:52px;border-radius:50%"></span>' +
            '<div style="flex:1"><span class="acp-skel" style="display:block;height:12px;width:40%;margin-bottom:8px"></span>' +
            '<span class="acp-skel" style="display:block;height:16px;width:70%"></span></div></div>';
    }

    function renderTimelineSkeleton() {
        var s = '';
        for (var i = 0; i < 3; i++) {
            s += '<li class="acp-tl-item"><span class="acp-skel" style="height:16px;margin-top:8px"></span>' +
                '<span class="acp-skel" style="width:34px;height:34px;border-radius:50%"></span>' +
                '<span><span class="acp-skel" style="display:block;height:14px;width:60%;margin:6px 0 8px"></span>' +
                '<span class="acp-skel" style="display:block;height:12px;width:85%"></span></span></li>';
        }
        el.timeline.innerHTML = s;
    }

    /* ------------------------------------------------------------------ */
    /* Render                                                              */
    /* ------------------------------------------------------------------ */
    function render(data) {
        if (!data || !data.ticket) return;
        var prev = state.data;
        state.data = data;

        var t = data.ticket;
        var code = parseInt((t.status && t.status.code) || 1, 10);
        var info = statusInfo(code);
        var isDone = info.stage === 3;

        // Header
        if (el.protocol) el.protocol.textContent = protocol(t.id);
        el.live.setAttribute('data-tone', info.tone);
        el.liveLabel.textContent = info.label;
        document.title = protocol(t.id) + ' · ' + info.label + ' · Brago TI';

        // Hero
        if (el.eyebrow) {
            el.eyebrow.textContent = 'Chamado ' + protocol(t.id) + ' · Acompanhamento ao vivo';
        }
        el.title.textContent = t.title || 'Chamado';
        var opened = parseDate(t.opened_at);
        var urg = t.urgency || {};
        el.meta.innerHTML =
            '<span class="acp-chip acp-chip--plain">' + icon('clock') + 'Aberto ' + (opened ? dayLabel(opened).toLowerCase() + ' às ' + hhmm(opened) : '') + '</span>' +
            (t.category ? '<span class="acp-chip" data-tone="indigo">' + icon('tag') + esc(t.category) + '</span>' : '') +
            (urg.label ? '<span class="acp-chip" data-tone="' + (URGENCY_TONE[urg.level] || 'blue') + '">' + icon('flag') + 'Urgência ' + esc(urg.label) + '</span>' : '');

        renderStepper(info.stage, data.timeline || []);

        if (prev && state.lastStatus !== null && state.lastStatus !== code) {
            el.hero.classList.remove('is-flash');
            void el.hero.offsetWidth;
            el.hero.classList.add('is-flash');
        }
        state.lastStatus = code;

        // Banner
        if (isDone) {
            var solved = parseDate(t.solved_at) || lastTimelineDate(data.timeline, ['solved', 'closed']);
            el.bannerText.textContent = solved
                ? 'Finalizado ' + dayLabel(solved).toLowerCase() + ' às ' + hhmm(solved) + '. Obrigado por aguardar!'
                : 'Obrigado por aguardar!';
            el.banner.hidden = false;
        } else {
            el.banner.hidden = true;
        }

        renderTech(data.technician, t);
        renderTimeline(data.timeline || [], isDone);
        renderChatHeader(data.technician);
        renderMessages(data.messages || []);
        renderComposerState(isDone);

        state.rendered = true;
    }

    function lastTimelineDate(tl, types) {
        for (var i = (tl || []).length - 1; i >= 0; i--) {
            if (types.indexOf(tl[i].type) !== -1) return parseDate(tl[i].datetime);
        }
        return null;
    }

    function renderStepper(stage, timeline) {
        var passedWaiting = timeline.some(function (e) { return e.type === 'waiting'; });
        var isDone = stage === 3;

        el.steps.forEach(function (li, i) {
            li.classList.remove('is-done', 'is-current', 'is-skipped', 'is-final');
            li.removeAttribute('aria-current');
            if (i === 2 && stage > 2 && !passedWaiting) {
                li.classList.add('is-skipped');
            } else if (i < stage) {
                li.classList.add('is-done');
            } else if (i === stage) {
                li.classList.add('is-current');
                li.setAttribute('aria-current', 'step');
                if (isDone) li.classList.add('is-final');
            }
            var node = li.querySelector('.acp-step__node');
            var base = STAGES[i].icon;
            node.innerHTML = icon(li.classList.contains('is-done') ? 'check' : base);
        });

        el.stepper.style.setProperty('--progress', (stage / 3 * 100) + '%');
        el.stepper.classList.toggle('is-done', isDone);
    }

    function renderTech(tech, ticket) {
        var urg = ticket.urgency || {};
        var chips =
            '<div class="acp-tech__chips">' +
                (ticket.category ? '<span class="acp-chip" data-tone="indigo">' + icon('tag') + esc(ticket.category) + '</span>' : '') +
                (urg.label ? '<span class="acp-chip" data-tone="' + (URGENCY_TONE[urg.level] || 'blue') + '">' + icon('flag') + esc(urg.label) + '</span>' : '') +
            '</div>';

        if (tech && tech.name) {
            el.tech.innerHTML =
                '<div class="acp-tech__row">' + avatar(tech.name) +
                    '<div class="acp-tech__info">' +
                        '<div class="acp-tech__label">Técnico responsável</div>' +
                        '<div class="acp-tech__name">' + esc(tech.name) + '</div>' +
                        '<div class="acp-tech__role">' + esc(tech.role || 'Suporte TI · Brago') + '</div>' +
                    '</div>' +
                '</div>' + chips;
        } else {
            el.tech.innerHTML =
                '<div class="acp-tech__row"><span class="acp-avatar acp-avatar--empty">' + icon('person') + '</span>' +
                    '<div class="acp-tech__info">' +
                        '<div class="acp-tech__label">Técnico responsável</div>' +
                        '<div class="acp-tech__name">Aguardando atribuição</div>' +
                        '<div class="acp-tech__role">Um técnico vai assumir seu chamado em breve.</div>' +
                    '</div>' +
                '</div>' + chips;
        }
    }

    function tlKey(e) {
        return e.key || (e.type + '|' + (e.datetime || e.time || '') + '|' + (e.title || ''));
    }

    function renderTimeline(items, isDone) {
        var sorted = items.slice().sort(function (a, b) {
            var da = parseDate(a.datetime), db = parseDate(b.datetime);
            return (da ? da.getTime() : 0) - (db ? db.getTime() : 0);
        });

        var firstPaint = !state.rendered;
        var html = '';
        var lastDay = null;
        var multiDay = sorted.length > 1 && !sameDay(parseDate(sorted[0].datetime), parseDate(sorted[sorted.length - 1].datetime));

        sorted.forEach(function (e, i) {
            var d = parseDate(e.datetime);
            if (multiDay && d && (!lastDay || !sameDay(d, lastDay))) {
                html += '<li class="acp-tl-day" aria-hidden="true">' + esc(dayLabel(d)) + '</li>';
                lastDay = d;
            }
            var meta = TL_TYPES[e.type] || TL_TYPES.opened;
            var key = tlKey(e);
            var isNew = !firstPaint && !state.seenTl[key];
            var isLast = i === sorted.length - 1;
            var isFinal = isLast && isDone;
            var cls = 'acp-tl-item' + (isLast ? ' is-last is-current' : '') + (isFinal ? ' is-final' : '') + (isNew ? ' is-new' : '');

            html +=
                '<li class="' + cls + '" data-tone="' + meta.tone + '">' +
                    '<time class="acp-tl-time" datetime="' + esc(e.datetime || '') + '">' + esc(e.time || hhmm(d)) + '</time>' +
                    '<span class="acp-tl-rail"><span class="acp-tl-dot">' + icon(meta.icon) + '</span></span>' +
                    '<div class="acp-tl-body">' +
                        '<div class="acp-tl-title">' + esc(e.title) + (isLast && !isDone ? '<span class="acp-tl-now">Agora</span>' : '') + '</div>' +
                        (e.subtitle ? '<div class="acp-tl-sub">' + esc(e.subtitle) + '</div>' : '') +
                    '</div>' +
                '</li>';
            state.seenTl[key] = true;
        });

        el.timeline.innerHTML = html || '<li class="acp-tl-sub" style="padding:8px 0 18px">Nenhum evento registrado ainda.</li>';
        el.tlCount.textContent = sorted.length ? sorted.length + (sorted.length === 1 ? ' evento' : ' eventos') : '';
    }

    function renderChatHeader(tech) {
        var name = tech && tech.name ? tech.name : null;
        el.chatHeader.innerHTML =
            (name ? avatar(name, 'md') : '<span class="acp-avatar acp-avatar--md" style="background:var(--acp-blue)">' + icon('chat') + '</span>') +
            '<div style="min-width:0"><h2>' + (name ? esc(name) : 'Suporte TI Brago') + '</h2>' +
            '<p>Mensagens em tempo real</p></div>';
    }

    /* ---------- Mensagens ---------- */
    function isNearBottom() {
        var s = el.scroll;
        return s.scrollHeight - s.scrollTop - s.clientHeight < 90;
    }

    function scrollToBottom(smooth) {
        var s = el.scroll;
        if (!smooth) {
            var prev = s.style.scrollBehavior;
            s.style.scrollBehavior = 'auto';
            s.scrollTop = s.scrollHeight;
            s.style.scrollBehavior = prev;
        } else {
            s.scrollTop = s.scrollHeight;
        }
        el.jump.classList.remove('is-visible');
    }

    function sortMessages(list) {
        return list.slice().sort(function (a, b) {
            var da = parseDate(a.datetime), db = parseDate(b.datetime);
            return (da ? da.getTime() : 0) - (db ? db.getTime() : 0);
        });
    }

    function renderMessages(messages) {
        var sorted = sortMessages(messages);
        var firstPaint = !state.rendered;
        var wasNear = isNearBottom();
        var newFromTech = 0;
        var newFromMe = false;

        // Reconstrói a lista preservando bolhas pendentes locais
        var pendings = Array.prototype.slice.call(el.list.querySelectorAll('.acp-msg.is-pending, .acp-msg.is-failed'));
        var html = '';
        var prevMsg = null;
        var lastDay = null;

        if (!sorted.length && !pendings.length) {
            el.list.innerHTML =
                '<div class="acp-chat__empty">' + icon('chat') +
                'Nenhuma mensagem ainda.<br>Escreva abaixo se quiser complementar o chamado.</div>';
            return;
        }

        sorted.forEach(function (m, i) {
            var d = parseDate(m.datetime);
            if (d && (!lastDay || !sameDay(d, lastDay))) {
                html += '<div class="acp-day">' + esc(dayLabel(d)) + '</div>';
                lastDay = d;
                prevMsg = null;
            }
            var next = sorted[i + 1];
            var continued = canGroup(prevMsg, m);
            var continuedNext = next && canGroup(m, next) && sameDay(parseDate(next.datetime), d);
            var isNew = !firstPaint && !state.seenMsg[m.id];

            if (isNew) {
                if (m.author === 'technician') newFromTech++;
                else newFromMe = true;
            }
            html += messageHtml(m, { continued: continued, continuedNext: continuedNext, isNew: isNew });
            state.seenMsg[m.id] = true;
            prevMsg = m;
        });

        el.list.innerHTML = html;
        pendings.forEach(function (p) { el.list.appendChild(p); });

        if (firstPaint) {
            requestAnimationFrame(function () { scrollToBottom(false); });
        } else if (wasNear || newFromMe) {
            scrollToBottom(true);
        } else if (newFromTech) {
            el.jump.classList.add('is-visible');
        }

        if (newFromTech && (state.panel !== 'chat' && isMobile())) {
            state.unread += newFromTech;
            updateUnread();
        }
    }

    function canGroup(a, b) {
        if (!a || !b) return false;
        if (a.author !== b.author) return false;
        if (a.kind === 'solution' || b.kind === 'solution' || a.kind === 'description') return false;
        var da = parseDate(a.datetime), db = parseDate(b.datetime);
        if (!da || !db) return false;
        return Math.abs(db - da) < 5 * 60 * 1000;
    }

    function messageHtml(m, opt) {
        opt = opt || {};
        var mine = m.author !== 'technician';
        var d = parseDate(m.datetime);
        var cls = 'acp-msg ' + (mine ? 'acp-msg--me' : 'acp-msg--tech') +
            (m.kind === 'solution' ? ' acp-msg--solution' : '') +
            (opt.continued ? ' is-continued' : '') +
            (opt.continuedNext ? ' is-continued-next' : '') +
            (opt.isNew ? ' is-new' : '') +
            (opt.extraClass ? ' ' + opt.extraClass : '');

        var label = '';
        if (m.kind === 'description') label = '<span class="acp-bubble__label">Descrição do chamado</span>';
        if (m.kind === 'solution') label = '<span class="acp-bubble__label">' + icon('checkCircle') + 'Solução registrada</span>';

        var author = mine
            ? '<div class="acp-msg__author">Você (Solicitante)</div>'
            : '<div class="acp-msg__author">' + esc(m.name || 'Técnico') + '<span class="acp-role">Suporte TI</span></div>';

        var meta = opt.metaHtml || ('<time datetime="' + esc(m.datetime || '') + '">' + hhmm(d) + '</time>');

        var imagesHtml = '';
        if (m.images && m.images.length) {
            imagesHtml = '<div class="acp-bubble__images">' +
                m.images.map(function (img) {
                    var safeUrl = esc(img.url);
                    var safeName = esc(img.name || 'Print anexado');
                    return '<div class="acp-bubble__img-wrap" data-img-url="' + safeUrl + '" data-img-name="' + safeName + '" title="Clique para ampliar ' + safeName + '">' +
                        '<img src="' + safeUrl + '" alt="' + safeName + '" class="acp-bubble__img" loading="lazy" />' +
                        '<span class="acp-bubble__img-zoom" aria-hidden="true">' + icon('externalLink') + '</span>' +
                    '</div>';
                }).join('') +
            '</div>';
        }

        var contentHtml = m.content ? textToHtml(m.content) : '';
        var bodyHtml = '';
        if (imagesHtml && contentHtml) {
            bodyHtml = imagesHtml + '<div class="acp-bubble__text">' + contentHtml + '</div>';
        } else if (imagesHtml) {
            bodyHtml = imagesHtml;
        } else {
            bodyHtml = contentHtml;
        }

        return '<div class="' + cls + '" data-id="' + esc(m.id) + '">' +
            (mine ? '' : '<span class="acp-msg__avatar-slot">' + avatar(m.name || 'Técnico', 'sm') + '</span>') +
            '<div class="acp-msg__col">' + author +
                '<div class="acp-bubble">' + label + bodyHtml + '</div>' +
                '<span class="acp-msg__meta">' + meta + '</span>' +
            '</div>' +
        '</div>';
    }

    function renderComposerState(isDone) {
        el.hintText.textContent = isDone
            ? 'Chamado concluído. Se o problema voltar, envie uma mensagem para reabrir.'
            : 'Sua mensagem chega direto ao técnico responsável.';
        el.input.placeholder = isDone ? 'Precisa de algo mais? Escreva aqui…' : 'Digite uma mensagem para o técnico…';
    }

    /* ---------- Sync indicator ---------- */
    function updateSync() {
        if (!el.sync) return;
        el.sync.classList.toggle('is-offline', !state.online);
        if (!state.online) {
            el.syncLabel.textContent = 'Reconectando…';
            return;
        }
        if (!state.lastSync) return;
        var s = Math.round((Date.now() - state.lastSync) / 1000);
        el.syncLabel.textContent = s < 5 ? 'Ao vivo · atualizado agora' : 'Ao vivo · há ' + s + 's';
    }

    function updateUnread() {
        el.unread.textContent = state.unread > 9 ? '9+' : String(state.unread);
        el.unread.hidden = state.unread === 0;
    }

    function isMobile() {
        return window.matchMedia('(max-width: 959.98px)').matches;
    }

    /* ------------------------------------------------------------------ */
    /* Eventos                                                             */
    /* ------------------------------------------------------------------ */

    /* ---------- Anexo de imagens & Lightbox ---------- */
    function handleSelectedFile(file) {
        if (!file || !file.type.match(/^image\//)) {
            return;
        }
        if (file.size > 15 * 1024 * 1024) {
            alert('A imagem é muito grande. Escolha uma imagem de até 15MB.');
            return;
        }
        var reader = new FileReader();
        reader.onload = function (ev) {
            var dataUrl = ev.target.result;
            state.selectedImage = {
                file: file,
                dataUrl: dataUrl,
                name: file.name || 'print.png',
                size: file.size
            };
            if (el.previewImg) el.previewImg.src = dataUrl;
            if (el.previewName) el.previewName.textContent = file.name || 'Print capturado';
            if (el.previewSize) el.previewSize.textContent = formatBytes(file.size);
            if (el.imgPreview) el.imgPreview.hidden = false;
            if (el.send) el.send.disabled = false;
            if (el.input) el.input.focus();
        };
        reader.readAsDataURL(file);
    }

    function clearSelectedImage() {
        state.selectedImage = null;
        if (el.fileInput) el.fileInput.value = '';
        if (el.previewImg) el.previewImg.src = '';
        if (el.imgPreview) el.imgPreview.hidden = true;
        onInput();
    }

    function onPaste(e) {
        var items = (e.clipboardData || (e.originalEvent && e.originalEvent.clipboardData) || {}).items;
        if (!items) return;
        for (var i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                var blob = items[i].getAsFile();
                if (blob) {
                    e.preventDefault();
                    handleSelectedFile(blob);
                    break;
                }
            }
        }
    }

    function openLightbox(url, name) {
        var lb = document.getElementById('acp-lightbox');
        if (!lb) return;
        var img = el.lightboxImg || document.querySelector('[data-ref="lightboxImg"]');
        var title = el.lightboxTitle || document.querySelector('[data-ref="lightboxTitle"]');
        var ext = el.lightboxExternal || document.querySelector('[data-ref="lightboxExternal"]');
        if (img) img.src = url;
        if (title) title.textContent = name || 'Print anexado';
        if (ext) ext.href = url;
        lb.hidden = false;
        document.body.classList.add('acp-lightbox-open');
    }

    function closeLightbox() {
        var lb = document.getElementById('acp-lightbox');
        if (!lb) return;
        lb.hidden = true;
        var img = el.lightboxImg || document.querySelector('[data-ref="lightboxImg"]');
        if (img) img.src = '';
        document.body.classList.remove('acp-lightbox-open');
    }

    function bindEvents() {
        root.querySelectorAll('[data-tab]').forEach(function (btn) {
            btn.addEventListener('click', function () { setPanel(btn.getAttribute('data-tab')); });
        });

        el.jump.addEventListener('click', function () { scrollToBottom(true); });
        el.scroll.addEventListener('scroll', function () {
            if (isNearBottom()) el.jump.classList.remove('is-visible');
        });

        el.input.addEventListener('input', onInput);
        el.input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
                e.preventDefault();
                submitMessage();
            }
        });
        el.input.addEventListener('paste', onPaste);
        window.addEventListener('paste', function (e) {
            if (state.panel === 'chat' && document.activeElement !== el.input) {
                onPaste(e);
            }
        });

        if (el.fileInput) {
            el.fileInput.addEventListener('change', function (e) {
                if (e.target.files && e.target.files[0]) {
                    handleSelectedFile(e.target.files[0]);
                }
            });
        }
        if (el.removeImg) {
            el.removeImg.addEventListener('click', clearSelectedImage);
        }

        el.composer.addEventListener('submit', function (e) {
            e.preventDefault();
            submitMessage();
        });

        el.list.addEventListener('click', function (e) {
            var wrap = e.target.closest('.acp-bubble__img-wrap');
            if (wrap) {
                e.preventDefault();
                openLightbox(wrap.getAttribute('data-img-url'), wrap.getAttribute('data-img-name'));
                return;
            }
            var btn = e.target.closest('.acp-msg__retry');
            if (!btn) return;
            var bubble = btn.closest('.acp-msg');
            var content = bubble.getAttribute('data-content') || '';
            bubble.remove();
            sendMessage(content, null);
        });

        if (el.lightboxBackdrop) el.lightboxBackdrop.addEventListener('click', closeLightbox);
        if (el.lightboxClose) el.lightboxClose.addEventListener('click', closeLightbox);
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') closeLightbox();
        });

        document.addEventListener('visibilitychange', function () {
            if (!document.hidden) poll();
        });

        setInterval(updateSync, 1000);
    }

    function setPanel(p) {
        state.panel = p;
        root.setAttribute('data-panel', p);
        root.querySelectorAll('[data-tab]').forEach(function (b) {
            b.setAttribute('aria-selected', b.getAttribute('data-tab') === p ? 'true' : 'false');
        });
        if (p === 'chat') {
            state.unread = 0;
            updateUnread();
            requestAnimationFrame(function () { scrollToBottom(false); });
        }
    }

    function onInput() {
        var ta = el.input;
        ta.style.height = 'auto';
        ta.style.height = Math.min(ta.scrollHeight, 140) + 'px';
        var len = ta.value.trim().length;
        el.send.disabled = len === 0 && !state.selectedImage;
        var remaining = 2000 - ta.value.length;
        el.hint.classList.toggle('is-warning', remaining < 150);
        if (remaining < 150) {
            el.hintText.textContent = remaining + ' caracteres restantes';
        } else if (state.data) {
            renderComposerState(statusInfo(parseInt(state.data.ticket.status.code, 10)).stage === 3);
        }
    }

    /* ------------------------------------------------------------------ */
    /* Envio de mensagem                                                   */
    /* ------------------------------------------------------------------ */
    function submitMessage() {
        var content = el.input.value.trim();
        var img = state.selectedImage;
        if (!content && !img) return;

        el.input.value = '';
        clearSelectedImage();
        sendMessage(content, img);
    }

    function sendMessage(content, img) {
        var tmpId = 'tmp-' + (++state.tmpSeq);
        var now = new Date();
        var tmpImages = [];
        if (img && img.dataUrl) {
            tmpImages.push({
                id: 'tmp-img-' + Date.now(),
                name: img.name,
                url: img.dataUrl
            });
        }
        var tmp = {
            id: tmpId,
            author: 'requester',
            kind: 'followup',
            datetime: now.toISOString(),
            content: content,
            images: tmpImages
        };

        var empty = el.list.querySelector('.acp-chat__empty');
        if (empty) empty.remove();

        var wrap = document.createElement('div');
        wrap.innerHTML = messageHtml(tmp, { isNew: true, extraClass: 'is-pending', metaHtml: 'Enviando…' });
        var bubble = wrap.firstChild;
        bubble.setAttribute('data-content', content);
        el.list.appendChild(bubble);
        scrollToBottom(true);

        var done = function (msg) {
            if (msg && msg.id) state.seenMsg[msg.id] = true;
            bubble.classList.remove('is-pending');
            bubble.querySelector('.acp-msg__meta').innerHTML = hhmm(now) + ' · Enviado ' + icon('check');
            if (msg && msg.id) bubble.setAttribute('data-id', msg.id);
            // a próxima sincronização substitui a bolha temporária pela oficial
            if (state.data && msg) {
                state.data.messages = (state.data.messages || []).concat([msg]);
                bubble.remove();
                renderMessages(state.data.messages);
            }
        };
        var fail = function () {
            bubble.classList.remove('is-pending');
            bubble.classList.add('is-failed');
            bubble.querySelector('.acp-msg__meta').innerHTML = 'Não enviada · <button type="button" class="acp-msg__retry">Tentar novamente</button>';
        };

        if (CFG.mock || !CFG.apiUrl) {
            setTimeout(function () {
                done({ id: 'm-' + Date.now(), author: 'requester', kind: 'followup', datetime: toLocalIso(now), content: content });
            }, 650);
            return;
        }

        var fd = new FormData();
        fd.append('id', CFG.ticketId);
        fd.append('token', CFG.token);
        fd.append('content', content);
        if (img && img.dataUrl) {
            fd.append('image_data', img.dataUrl);
            if (img.name) fd.append('image_name', img.name);
        }

        fetch(CFG.apiUrl, {
            method: 'POST',
            body: fd,
            credentials: 'same-origin',
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        })
            .then(function (r) { return r.json(); })
            .then(function (json) {
                if (json && json.success) done(json.message || null);
                else fail();
            })
            .catch(fail);
    }

    function toLocalIso(d) {
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + hhmm(d) + ':' + pad(d.getSeconds());
    }

    /* ------------------------------------------------------------------ */
    /* Polling                                                             */
    /* ------------------------------------------------------------------ */
    function poll() {
        if (CFG.mock || !CFG.apiUrl) return;
        var url = CFG.apiUrl + (CFG.apiUrl.indexOf('?') === -1 ? '?' : '&') +
            'id=' + encodeURIComponent(CFG.ticketId) + '&token=' + encodeURIComponent(CFG.token) + '&t=' + Date.now();

        fetch(url, { credentials: 'same-origin', cache: 'no-store', headers: { 'X-Requested-With': 'XMLHttpRequest' } })
            .then(function (r) {
                if (r.status === 403 || r.status === 404) throw { fatal: true };
                return r.json();
            })
            .then(function (json) {
                if (json && json.success === false && (json.code === 'invalid_token' || json.code === 'not_found')) throw { fatal: true };
                var data = json && json.data ? json.data : json;
                state.online = true;
                state.lastSync = Date.now();
                render(data);
                updateSync();
            })
            .catch(function (err) {
                if (err && err.fatal) {
                    stopPolling();
                    renderError();
                    return;
                }
                state.online = false;
                updateSync();
            });
    }

    function startPolling() {
        stopPolling();
        state.pollTimer = setInterval(function () {
            if (!document.hidden) poll();
        }, Math.max(1500, CFG.pollInterval));
    }

    function stopPolling() {
        if (state.pollTimer) clearInterval(state.pollTimer);
        state.pollTimer = null;
    }

    function renderError() {
        root.className = 'acp-app';
        root.innerHTML =
            '<div class="acp-main"><section class="acp-card acp-error">' +
                '<div class="acp-error__icon">' + icon('lock') + '</div>' +
                '<h1>Link inválido ou expirado</h1>' +
                '<p>Não conseguimos abrir este chamado. Use o link mais recente enviado por e-mail ou fale com a equipe de TI da Brago.</p>' +
            '</section></div>';
    }

    /* ------------------------------------------------------------------ */
    /* Dados de exemplo (somente pré-visualização)                         */
    /* ------------------------------------------------------------------ */
    function ago(min) {
        return toLocalIso(new Date(Date.now() - min * 60000));
    }

    function mockData() {
        return {
            success: true,
            ticket: {
                id: 6,
                title: 'Problema na impressora do DP',
                category: 'Impressoras',
                urgency: { level: 3, label: 'Média' },
                status: { code: 2 },
                opened_at: ago(62),
                solved_at: null
            },
            technician: { name: 'David Gonçalves', role: 'Técnico de Suporte · N1' },
            timeline: [
                { type: 'opened', datetime: ago(62), title: 'Aberto o chamado', subtitle: 'Recebido e classificado na Triagem' },
                { type: 'assigned', datetime: ago(55), title: 'Técnico atribuído', subtitle: 'Assumido por David Gonçalves' }
            ],
            messages: [
                { id: 'd-6', author: 'requester', kind: 'description', name: 'Alves', datetime: ago(62), content: 'A impressora do Departamento Pessoal não está imprimindo. Aparece a mensagem "toner baixo" e depois trava a fila de impressão.' },
                { id: 'f-1', author: 'technician', kind: 'followup', name: 'David Gonçalves', datetime: ago(54), content: 'Olá, Alves! Já peguei seu chamado. Vou verificar a fila de impressão remotamente.' },
                { id: 'f-2', author: 'technician', kind: 'followup', name: 'David Gonçalves', datetime: ago(53), content: 'Pode me confirmar se a impressora é a HP do segundo andar?' },
                { id: 'f-3', author: 'requester', kind: 'followup', name: 'Alves', datetime: ago(50), content: 'Isso, é a HP ao lado da sala do RH.' }
            ]
        };
    }

    function demoSteps() {
        return [
            function (d) {
                d.ticket.status.code = 3;
                d.timeline.push({ type: 'progress', datetime: ago(0), title: 'Chamado em execução', subtitle: 'Equipe de TI iniciou o atendimento' });
            },
            function (d) {
                d.messages.push({ id: 'f-' + Date.now(), author: 'technician', kind: 'followup', name: 'David Gonçalves', datetime: ago(0), content: 'Limpei a fila de impressão. Vou levar um toner novo até aí.' });
            },
            function (d) {
                d.ticket.status.code = 4;
                d.timeline.push({ type: 'waiting', datetime: ago(0), title: 'Em aguardo', subtitle: 'Aguardando chegada do toner no almoxarifado' });
            },
            function (d) {
                d.ticket.status.code = 3;
                d.timeline.push({ type: 'progress', datetime: ago(0), title: 'Chamado em execução', subtitle: 'Atendimento retomado' });
            },
            function (d) {
                d.ticket.status.code = 5;
                d.ticket.solved_at = ago(0);
                d.timeline.push({ type: 'solved', datetime: ago(0), title: 'Chamado concluído', subtitle: 'Atendimento finalizado com sucesso' });
                d.messages.push({ id: 's-' + Date.now(), author: 'technician', kind: 'solution', name: 'David Gonçalves', datetime: ago(0), content: 'Toner substituído e fila de impressão reiniciada. Página de teste impressa com sucesso.' });
            }
        ];
    }

    function mountDemo() {
        var steps = demoSteps();
        var idx = 0;
        var bar = document.createElement('div');
        bar.className = 'acp-demo';
        bar.innerHTML = '<span>Modo demonstração</span>' +
            '<button type="button" data-a="reset">Reiniciar</button>' +
            '<button type="button" class="is-primary" data-a="next">Próximo evento →</button>';
        document.body.appendChild(bar);

        bar.addEventListener('click', function (e) {
            var a = e.target.getAttribute('data-a');
            if (a === 'next') {
                if (idx >= steps.length) return;
                var d = JSON.parse(JSON.stringify(state.data));
                steps[idx++](d);
                state.lastSync = Date.now();
                render(d);
                if (idx >= steps.length) e.target.disabled = true;
            } else if (a === 'reset') {
                idx = 0;
                bar.querySelector('[data-a="next"]').disabled = false;
                state.seenMsg = {};
                state.seenTl = {};
                state.rendered = false;
                state.lastStatus = null;
                render(mockData());
            }
        });
    }

    /* ------------------------------------------------------------------ */
    /* Boot                                                                */
    /* ------------------------------------------------------------------ */
    buildShell();

    if (CFG.mock) {
        setTimeout(function () {
            state.lastSync = Date.now();
            render(CFG.initialData || mockData());
            updateSync();
            if (CFG.demo) mountDemo();
        }, 450);
    } else {
        if (CFG.initialData) {
            state.lastSync = Date.now();
            render(CFG.initialData.data || CFG.initialData);
            updateSync();
        }
        poll();
        startPolling();
    }

    window.AcompanharUI = { render: render, setPanel: setPanel, poll: poll };
})();
