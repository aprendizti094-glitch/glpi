"""
Script to apply the Brago App System (DESIGN_SYSTEM.md) redesign across GLPI:
- css/palettes/apple_hig.scss
- css/palettes/_apple_hig.scss
- apple_hig_compiled.css
- templates/components/kanban/elera_kanban.html.twig
- css/selfservice_mobile.css
"""
import os
import re
import subprocess

BASE_DIR = r"c:\Users\Aprendiz Ti\Downloads\GLPI\glpi"

def update_apple_hig_scss():
    scss_path = os.path.join(BASE_DIR, "css", "palettes", "apple_hig.scss")
    with open(scss_path, "r", encoding="utf-8") as f:
        content = f.read()

    # 1. Typography and Global Tokens
    content = content.replace(
        '--tblr-font-sans-serif: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "SF Pro", "Helvetica Neue", Inter, Arial, sans-serif;',
        "--tblr-font-sans-serif: 'Inter', 'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;"
    )
    content = content.replace('--tblr-body-bg: #F2F4F8;', '--tblr-body-bg: #F3F4F6;')
    content = content.replace('--tblr-body-color: #1D1D1F;', '--tblr-body-color: #1F2937;')
    content = content.replace('--tblr-muted: #86868B;', '--tblr-muted: #6B7280;')
    content = content.replace('--tblr-muted-darken: #6E6E73;', '--tblr-muted-darken: #4B5563;')
    content = content.replace('--tblr-border-color: rgba(0, 0, 0, 0.06);', '--tblr-border-color: #E5E7EB;')
    content = content.replace('--tblr-border-color-translucent: rgba(0, 0, 0, 0.05);', '--tblr-border-color-translucent: rgba(0, 0, 0, 0.06);')

    # Border radii
    content = content.replace('--tblr-border-radius: 14px;', '--tblr-border-radius: 12px;')
    content = content.replace('--tblr-border-radius-sm: 8px;', '--tblr-border-radius-sm: 6px;')
    content = content.replace('--tblr-border-radius-md: 14px;', '--tblr-border-radius-md: 12px;')
    content = content.replace('--tblr-border-radius-lg: 20px;', '--tblr-border-radius-lg: 16px;')
    content = content.replace('--tblr-border-radius-xl: 28px;', '--tblr-border-radius-xl: 20px;')

    # Primary (Laranja Brago)
    content = content.replace('--tblr-primary: #1D1D1F;', '--tblr-primary: #F97316;')
    content = content.replace('--tblr-primary-rgb: 29, 29, 31;', '--tblr-primary-rgb: 249, 115, 22;')
    content = content.replace('--tblr-primary-darken: #000000;', '--tblr-primary-darken: #EA580C;')

    # Secondary & Royal Blue
    content = content.replace('--tblr-secondary: #86868B;', '--tblr-secondary: #0120F8;')
    content = content.replace('--tblr-link-color: #0071E3;', '--tblr-link-color: #0120F8;')
    content = content.replace('--tblr-link-color-rgb: 0, 113, 227;', '--tblr-link-color-rgb: 1, 32, 248;')
    content = content.replace('--tblr-link-hover-color: #0077ED;', '--tblr-link-hover-color: #2F00FF;')

    # Semantics
    content = content.replace('--tblr-success: #34C759;', '--tblr-success: #10B981;')
    content = content.replace('--tblr-success-rgb: 52, 199, 89;', '--tblr-success-rgb: 16, 185, 129;')
    content = content.replace('--tblr-warning: #FF9500;', '--tblr-warning: #F59E0B;')
    content = content.replace('--tblr-warning-rgb: 255, 149, 0;', '--tblr-warning-rgb: 245, 158, 11;')
    content = content.replace('--tblr-danger: #FF3B30;', '--tblr-danger: #EF4444;')
    content = content.replace('--tblr-danger-rgb: 255, 59, 48;', '--tblr-danger-rgb: 239, 68, 68;')
    content = content.replace('--tblr-info: #5856D6;', '--tblr-info: #3B82F6;')
    content = content.replace('--tblr-info-rgb: 88, 86, 214;', '--tblr-info-rgb: 59, 130, 246;')

    # Cards
    content = content.replace('--tblr-card-border-radius: 24px;', '--tblr-card-border-radius: 16px;')
    content = content.replace(
        '--tblr-card-box-shadow: 0 10px 30px -4px rgba(0, 0, 0, 0.04), 0 2px 8px -1px rgba(0, 0, 0, 0.02);',
        '--tblr-card-box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);'
    )

    # GLPI variables
    content = content.replace('--glpi-mainmenu-fg: #1D1D1F;', '--glpi-mainmenu-fg: #1F2937;')
    content = content.replace('--glpi-mainmenu-fg-muted: #86868B;', '--glpi-mainmenu-fg-muted: #6B7280;')
    content = content.replace('--glpi-mainmenu-active-bg: #1D1D1F;', '--glpi-mainmenu-active-bg: #F3F4F6;')
    content = content.replace('--glpi-mainmenu-active-fg: #FFFFFF;', '--glpi-mainmenu-active-fg: #2F00FF;')
    content = content.replace('--glpi-badge-bg: #E8F8EE;', '--glpi-badge-bg: #ECFDF5;')
    content = content.replace('--glpi-badge-fg: #1D6F24;', '--glpi-badge-fg: #059669;')
    content = content.replace('--glpi-hover-bg: rgba(0, 0, 0, 0.04);', '--glpi-hover-bg: #FFF7ED;')

    # Global body background (clean solid gray per Section 3.3)
    old_body_bg = """html[data-glpi-theme="apple_hig"],
html[data-glpi-theme="apple_hig"] body {
    font-family: var(--tblr-font-sans-serif) !important;
    background: radial-gradient(circle at 10% 15%, rgba(215, 226, 252, 0.45) 0%, transparent 40%),
                radial-gradient(circle at 90% 85%, rgba(235, 224, 255, 0.4) 0%, transparent 45%),
                #F2F4F8 !important;
    background-attachment: fixed !important;
    color: #1D1D1F !important;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
}"""
    new_body_bg = """html[data-glpi-theme="apple_hig"],
html[data-glpi-theme="apple_hig"] body {
    font-family: var(--tblr-font-sans-serif) !important;
    background: #F3F4F6 !important;
    color: #1F2937 !important;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
}"""
    if old_body_bg in content:
        content = content.replace(old_body_bg, new_body_bg)

    # Topbar Header Background: Hero Gradient (linear-gradient(135deg, #0B1EE0 0%, #0118C8 50%, #0D47A1 100%))
    content = content.replace(
        "    background: rgba(255, 255, 255, 0.85) !important;\n    backdrop-filter: blur(28px) saturate(190%) !important;\n    -webkit-backdrop-filter: blur(28px) saturate(190%) !important;\n    border: 1px solid rgba(255, 255, 255, 0.85) !important;\n    box-shadow: 0 10px 32px -4px rgba(0, 0, 0, 0.06), 0 2px 8px -1px rgba(0, 0, 0, 0.03), inset 0 1px 0 rgba(255, 255, 255, 0.9) !important;",
        "    background: linear-gradient(135deg, #0B1EE0 0%, #0118C8 50%, #0D47A1 100%) !important;\n    backdrop-filter: blur(28px) saturate(190%) !important;\n    -webkit-backdrop-filter: blur(28px) saturate(190%) !important;\n    border: 1px solid rgba(255, 255, 255, 0.25) !important;\n    box-shadow: 0 10px 25px -4px rgba(1, 32, 248, 0.35) !important;"
    )

    # Breadcrumb container on header
    content = content.replace(
        "    background: rgba(0, 0, 0, 0.035) !important;\n    border: 1px solid rgba(0, 0, 0, 0.03) !important;",
        "    background: rgba(255, 255, 255, 0.16) !important;\n    border: 1px solid rgba(255, 255, 255, 0.22) !important;"
    )
    content = content.replace("color: #6E6E73 !important;\n    display: inline-flex !important;", "color: rgba(255, 255, 255, 0.85) !important;\n    display: inline-flex !important;")
    content = content.replace('color: #A1A1A6 !important;', 'color: rgba(255, 255, 255, 0.6) !important;')
    content = content.replace('color: #0071E3 !important;', 'color: #0120F8 !important;')

    # Primary Action CTA Button (+ Add task / Add ticket)
    content = content.replace(
        "html[data-glpi-theme=\"apple_hig\"] .btn-primary {\n    background: #1D1D1F !important;\n    color: #FFFFFF !important;\n    border: 1px solid transparent !important;\n    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.15) !important;\n}",
        "html[data-glpi-theme=\"apple_hig\"] .btn-primary {\n    background: linear-gradient(135deg, #F97316 0%, #FB923C 100%) !important;\n    color: #FFFFFF !important;\n    border: 1px solid transparent !important;\n    box-shadow: 0 4px 14px rgba(249, 115, 22, 0.3) !important;\n}"
    )
    content = content.replace(
        "html[data-glpi-theme=\"apple_hig\"] .btn-primary:hover {\n    background: #000000 !important;\n    color: #FFFFFF !important;\n    transform: translateY(-1px);\n    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.22) !important;\n}",
        "html[data-glpi-theme=\"apple_hig\"] .btn-primary:hover {\n    background: linear-gradient(135deg, #EA580C 0%, #F97316 100%) !important;\n    color: #FFFFFF !important;\n    transform: translateY(-1px);\n    box-shadow: 0 6px 20px rgba(249, 115, 22, 0.4) !important;\n}"
    )

    # Active Tab in Segmented Controls (.nav-tabs .nav-link.active)
    content = content.replace(
        "html[data-glpi-theme=\"apple_hig\"] .nav-tabs .nav-link.active,\nhtml[data-glpi-theme=\"apple_hig\"] .glpi-tabs .nav-link.active {\n    background: #1D1D1F !important;\n    color: #FFFFFF !important;\n    font-weight: 600 !important;\n    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.16) !important;\n}",
        "html[data-glpi-theme=\"apple_hig\"] .nav-tabs .nav-link.active,\nhtml[data-glpi-theme=\"apple_hig\"] .glpi-tabs .nav-link.active {\n    background: #FFFFFF !important;\n    color: #F97316 !important;\n    font-weight: 700 !important;\n    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08) !important;\n    border-radius: 10px !important;\n}"
    )

    # Form Controls focus ring with Laranja Brago
    content = content.replace(
        "html[data-glpi-theme=\"apple_hig\"] .form-control:focus,\nhtml[data-glpi-theme=\"apple_hig\"] .form-select:focus {\n    background-color: #FFFFFF !important;\n    border-color: #0071E3 !important;\n    box-shadow: 0 0 0 4px rgba(0, 113, 227, 0.15) !important;\n}",
        "html[data-glpi-theme=\"apple_hig\"] .form-control:focus,\nhtml[data-glpi-theme=\"apple_hig\"] .form-select:focus {\n    background-color: #FFFFFF !important;\n    border-color: #F97316 !important;\n    box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.15) !important;\n    outline: none !important;\n}"
    )
    content = content.replace(
        "html[data-glpi-theme=\"apple_hig\"] .select2-results__option--highlighted {\n    background: #0071E3 !important;\n    color: #FFFFFF !important;\n}",
        "html[data-glpi-theme=\"apple_hig\"] .select2-results__option--highlighted {\n    background: #F97316 !important;\n    color: #FFFFFF !important;\n}"
    )

    # Badges colors
    content = content.replace('background: #E8F8EE !important;\n    color: #1D6F24 !important;', 'background: #ECFDF5 !important;\n    color: #059669 !important;')
    content = content.replace('border: 1px solid rgba(52, 199, 89, 0.25) !important;', 'border: 1px solid rgba(16, 185, 129, 0.25) !important;')

    content = content.replace('background: #EBF3FF !important;\n    color: #0055B3 !important;', 'background: #FFF7ED !important;\n    color: #EA580C !important;')
    content = content.replace('border: 1px solid rgba(0, 113, 227, 0.25) !important;', 'border: 1px solid rgba(249, 115, 22, 0.25) !important;')

    content = content.replace('background: #FFF4E5 !important;\n    color: #9E5B00 !important;', 'background: #FFFBEB !important;\n    color: #B45309 !important;')
    content = content.replace('border: 1px solid rgba(255, 149, 0, 0.25) !important;', 'border: 1px solid rgba(245, 158, 11, 0.25) !important;')

    content = content.replace('background: #FEECEB !important;\n    color: #C5221F !important;', 'background: #FEF2F2 !important;\n    color: #DC2626 !important;')
    content = content.replace('border: 1px solid rgba(255, 59, 48, 0.25) !important;', 'border: 1px solid rgba(239, 68, 68, 0.25) !important;')

    # Table hover row
    content = content.replace('background-color: #F8F9FD !important;', 'background-color: #FFF7ED !important;')

    # Login page
    content = content.replace(
        "html[data-glpi-theme=\"apple_hig\"] body.page-anonymous,\nhtml[data-glpi-theme=\"apple_hig\"] .page-card-notlogged {\n    background: radial-gradient(circle at 15% 20%, rgba(210, 225, 255, 0.55) 0%, transparent 45%),\n                radial-gradient(circle at 85% 80%, rgba(235, 220, 255, 0.5) 0%, transparent 50%),\n                #F2F4F8 !important;\n}",
        "html[data-glpi-theme=\"apple_hig\"] body.page-anonymous,\nhtml[data-glpi-theme=\"apple_hig\"] .page-card-notlogged {\n    background: linear-gradient(135deg, #0B1EE0 0%, #0118C8 50%, #0D47A1 100%) !important;\n}"
    )

    # Active Tab in Ticket View (#tabspanel.nav-tabs .nav-link.active)
    content = content.replace(
        "body.glpi-ticket-zap-view #tabspanel.nav-tabs .nav-link.active,\nbody:has(#itil-object-container.is-ticket-page) #tabspanel.nav-tabs .nav-link.active {\n    background: #1D1D1F !important;\n    color: #FFFFFF !important;\n    font-weight: 600 !important;\n    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.14) !important;\n}",
        "body.glpi-ticket-zap-view #tabspanel.nav-tabs .nav-link.active,\nbody:has(#itil-object-container.is-ticket-page) #tabspanel.nav-tabs .nav-link.active {\n    background: #FFF7ED !important;\n    color: #EA580C !important;\n    font-weight: 700 !important;\n    border-left: 3px solid #F97316 !important;\n    box-shadow: 0 2px 8px rgba(249, 115, 22, 0.15) !important;\n}"
    )

    # Save button in Ticket View (#right-actions button[name="update"])
    content = content.replace(
        "body.glpi-ticket-zap-view #right-actions button[name=\"update\"],\nbody:has(#itil-object-container.is-ticket-page) #right-actions button[name=\"update\"] {\n    background: #1D1D1F !important;\n    color: #FFFFFF !important;\n    border: none !important;\n    border-radius: 8px !important;\n    padding: 6px 14px !important;\n    font-weight: 600 !important;\n    font-size: 0.88rem !important;\n    display: inline-flex !important;\n    align-items: center !important;\n    gap: 6px !important;\n    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15) !important;\n    transition: all 0.15s ease !important;\n}",
        "body.glpi-ticket-zap-view #right-actions button[name=\"update\"],\nbody:has(#itil-object-container.is-ticket-page) #right-actions button[name=\"update\"] {\n    background: linear-gradient(135deg, #F97316 0%, #FB923C 100%) !important;\n    color: #FFFFFF !important;\n    border: none !important;\n    border-radius: 12px !important;\n    padding: 6px 16px !important;\n    font-weight: 700 !important;\n    font-size: 0.88rem !important;\n    display: inline-flex !important;\n    align-items: center !important;\n    gap: 6px !important;\n    box-shadow: 0 4px 12px rgba(249, 115, 22, 0.3) !important;\n    transition: all 0.15s ease !important;\n}"
    )

    # Right panel inspector inputs focus
    content = content.replace(
        "body.glpi-ticket-zap-view #itil-data .form-control:focus,\nbody.glpi-ticket-zap-view #itil-data .form-select:focus,\nbody:has(#itil-object-container.is-ticket-page) #itil-data .form-control:focus,\nbody:has(#itil-object-container.is-ticket-page) #itil-data .form-select:focus {\n    border-color: #0071E3 !important;\n    background: #FFFFFF !important;\n    box-shadow: 0 0 0 3px rgba(0, 113, 227, 0.15) !important;\n    outline: none !important;\n}",
        "body.glpi-ticket-zap-view #itil-data .form-control:focus,\nbody.glpi-ticket-zap-view #itil-data .form-select:focus,\nbody:has(#itil-object-container.is-ticket-page) #itil-data .form-control:focus,\nbody:has(#itil-object-container.is-ticket-page) #itil-data .form-select:focus {\n    border-color: #F97316 !important;\n    background: #FFFFFF !important;\n    box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.15) !important;\n    outline: none !important;\n}"
    )

    with open(scss_path, "w", encoding="utf-8") as f:
        f.write(content)
    print("Updated css/palettes/apple_hig.scss successfully.")

    # Also update _apple_hig.scss identically
    with open(os.path.join(BASE_DIR, "css", "palettes", "_apple_hig.scss"), "w", encoding="utf-8") as f:
        f.write(content)
    print("Updated css/palettes/_apple_hig.scss successfully.")

if __name__ == "__main__":
    update_apple_hig_scss()
