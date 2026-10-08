/**
 * zap-custom.js — GLPI WhatsApp Zap View Enhancements
 * - Injects collapsible right-panel toggle button
 * - Persists collapse state in localStorage
 */
(function () {
    'use strict';

    const STORAGE_KEY = 'glpi_zap_panel_collapsed';
    const BODY_CLASS = 'zap-panel-collapsed';

    function isTicketPage() {
        return document.body.classList.contains('glpi-ticket-zap-view') ||
               document.querySelector('#itil-object-container.is-ticket-page') !== null;
    }

    function injectToggleButton() {
        if (!isTicketPage()) return;
        if (document.getElementById('zap-panel-toggle')) return;

        const rightSide = document.querySelector('.itil-right-side');
        if (!rightSide) return;

        // Make the right-side container relative for absolute button positioning
        rightSide.style.position = 'relative';

        const btn = document.createElement('button');
        btn.id = 'zap-panel-toggle';
        btn.setAttribute('title', 'Recolher painel');
        btn.setAttribute('aria-label', 'Recolher/expandir painel de propriedades');
        btn.type = 'button';

        rightSide.appendChild(btn);

        // Restore saved state
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

    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectToggleButton);
    } else {
        injectToggleButton();
    }

    // Also run after GLPI's dynamic content loads (it uses jQuery AJAX)
    if (typeof window.jQuery !== 'undefined') {
        jQuery(document).ajaxComplete(function () {
            setTimeout(injectToggleButton, 200);
        });
    }
})();
