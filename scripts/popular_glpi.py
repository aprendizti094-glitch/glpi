#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
GLPI LAN AUTO-DISCOVERY & POPULATOR
=============================================================================
Descobre computadores, impressoras e dispositivos na rede local física
e envia o inventário automaticamente para uma instância do GLPI (local,
remota ou acessível via túnel Ngrok / Cloudflare).

Métodos suportados para envio ao GLPI:
  1. Inventário Nativo GLPI (/front/inventory.php) -> Zero-config (sem token)
  2. API REST do GLPI (/apirest.php)              -> Com token ou login/senha
  3. Relatório JSON local (dispositivos_descobertos.json) -> Modo auditoria / dry-run
=============================================================================
"""

import sys
import os
import re
import json
import time
import socket
import ssl
import gzip
import urllib.request
import urllib.error
import subprocess
from concurrent.futures import ThreadPoolExecutor, as_completed
import xml.etree.ElementTree as ET

# Forçar UTF-8 no stdout e stderr no Windows
try:
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    if hasattr(sys.stderr, 'reconfigure'):
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

# Configurações de SSL permissivas para dispositivos de rede legados
SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE

# Cores ANSI no terminal Windows
os.system('')  # habilita ANSI no cmd do Windows
C_RESET = '\033[0m'
C_CYAN  = '\033[36m'
C_GREEN = '\033[32m'
C_YELLOW= '\033[33m'
C_RED   = '\033[31m'
C_BOLD  = '\033[1m'
C_GRAY  = '\033[90m'
C_BLUE  = '\033[34m'
C_MAGENTA = '\033[35m'


def banner():
    print(f"""{C_CYAN}{C_BOLD}
+--------------------------------------------------------------------------+
|                GLPI - AUTO-DISCOVERY & INVENTARIO DE REDE                |
|              Deteccao Inteligente de Computadores e Impressoras          |
+--------------------------------------------------------------------------+{C_RESET}""")



def get_local_ip_and_subnet():
    """Detecta automaticamente o IP da placa de rede ativa e a máscara /24."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
        parts = local_ip.split('.')
        base_subnet = f"{parts[0]}.{parts[1]}.{parts[2]}"
        return local_ip, f"{base_subnet}.0/24", base_subnet
    except Exception:
        return "192.168.200.8", "192.168.200.0/24", "192.168.200"


def get_arp_table():
    """Lê a tabela ARP do Windows para capturar endereços MAC."""
    arp_map = {}
    try:
        out = subprocess.check_output("arp -a", shell=True).decode("cp850", errors="ignore")
        for line in out.splitlines():
            # Ex: 192.168.200.37   3c-2a-f4-86-3a-39   dinâmico
            m = re.search(r"(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\s+([0-9a-fA-F\-]{17})", line)
            if m:
                ip = m.group(1)
                mac = m.group(2).replace('-', ':').lower()
                if not ip.endswith('.255') and not ip.startswith('224.') and not ip.startswith('239.'):
                    arp_map[ip] = mac
    except Exception as e:
        print(f"{C_YELLOW}[!] Aviso ao ler tabela ARP: {e}{C_RESET}")
    return arp_map


def probe_single_ip(ip, timeout=0.25):
    """Testa portas chave para determinar se o host está ativo."""
    # Portas: 9100 (RAW JetDirect), 515 (LPD), 631 (IPP), 445 (SMB), 135 (RPC), 80 (HTTP), 443 (HTTPS), 3389 (RDP)
    test_ports = [9100, 515, 631, 445, 135, 80, 443, 3389]
    open_ports = []
    
    for port in test_ports:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(timeout)
        try:
            if s.connect_ex((ip, port)) == 0:
                open_ports.append(port)
        except Exception:
            pass
        finally:
            s.close()
            
    if open_ports:
        return ip, open_ports
    return ip, []


def resolve_hostname(ip):
    """Tenta obter o nome DNS/NetBIOS reverso do IP."""
    try:
        name = socket.gethostbyaddr(ip)[0]
        # Se veio com sufixo .local ou .lan, podemos limpar ou manter
        return name
    except Exception:
        return None


def fetch_http_data(url, timeout=2.0):
    """Executa requisição HTTP/HTTPS com suporte a GZIP e bypass de SSL."""
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) GLPI-Discovery/1.0",
            "Accept": "*/*",
            "Accept-Encoding": "gzip, deflate"
        }
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=SSL_CTX) as resp:
            data = resp.read()
            if resp.info().get("Content-Encoding") == "gzip" or data.startswith(b"\x1f\x8b"):
                try:
                    data = gzip.decompress(data)
                except Exception:
                    pass
            return data.decode("utf-8", errors="ignore")
    except Exception:
        return None


def inspect_printer_details(ip, open_ports, hostname):
    """Extrai informações ricas de impressoras (Brother, HP, Epson, Samsung, Kyocera, etc.)."""
    printer_info = {
        "manufacturer": "Genérica / Outra",
        "model": "Impressora de Rede",
        "serial": None,
        "uuid": None,
        "page_counter": None,
        "toner_percent": None,
        "drum_percent": None,
        "firmware": None,
        "details_source": "Port Probe"
    }

    # 1. Tentar Brother via /etc/mnt_info.csv (Presente em praticamente todas Brother modernas)
    csv_data = fetch_http_data(f"http://{ip}/etc/mnt_info.csv", timeout=2.0)
    if csv_data and "Model Name" in csv_data:
        try:
            lines = csv_data.splitlines()
            if len(lines) >= 2:
                row = lines[1].replace('"', '').split(',')
                # Índices típicos: 0: Node Name, 1: Model Name, 4: IP, 5: Serial, 9: Page Counter
                if len(row) > 1 and row[1]:
                    printer_info["manufacturer"] = "Brother"
                    printer_info["model"] = row[1].strip()
                if len(row) > 5 and row[5]:
                    printer_info["serial"] = row[5].strip()
                if len(row) > 9 and row[9].isdigit():
                    printer_info["page_counter"] = int(row[9])
                if len(row) > 20 and row[20].isdigit():
                    printer_info["toner_percent"] = int(row[20])
                if len(row) > 11 and row[11].isdigit():
                    printer_info["drum_percent"] = int(row[11])
                if len(row) > 6 and row[6]:
                    printer_info["firmware"] = row[6].strip()
                printer_info["details_source"] = "Brother mnt_info.csv"
                return printer_info
        except Exception:
            pass

    # 2. Tentar HP via /DevMgmt/ProductConfigDyn.xml (LEDM padrão HP LaserJet e PageWide)
    xml_data = fetch_http_data(f"http://{ip}/DevMgmt/ProductConfigDyn.xml", timeout=2.0)
    if not xml_data:
        xml_data = fetch_http_data(f"https://{ip}/DevMgmt/ProductConfigDyn.xml", timeout=2.0)

    if xml_data and ("ProductConfigDyn" in xml_data or "ProductInformation" in xml_data):
        try:
            # Regex robusto para lidar com namespaces arbitrários no XML
            m_model = re.search(r"<(?:[a-zA-Z0-9_\-]+:)?MakeAndModel>(.*?)</", xml_data)
            m_serial = re.search(r"<(?:[a-zA-Z0-9_\-]+:)?SerialNumber>(.*?)</", xml_data)
            m_uuid = re.search(r"<(?:[a-zA-Z0-9_\-]+:)?UUID>(.*?)</", xml_data)
            m_mfg = re.search(r"<(?:[a-zA-Z0-9_\-]+:)?Manufacturer>[\s\S]*?<(?:[a-zA-Z0-9_\-]+:)?Name>(.*?)</", xml_data)

            printer_info["manufacturer"] = "HP"
            if m_model:
                printer_info["model"] = m_model.group(1).strip()
            if m_serial:
                printer_info["serial"] = m_serial.group(1).strip()
            if m_uuid:
                printer_info["uuid"] = m_uuid.group(1).strip()
            if m_mfg:
                printer_info["manufacturer"] = m_mfg.group(1).strip()
            printer_info["details_source"] = "HP ProductConfigDyn.xml"
            return printer_info
        except Exception:
            pass

    # 3. Análise da página inicial HTTP / HTTPS
    for proto in ["http", "https"]:
        html = fetch_http_data(f"{proto}://{ip}/", timeout=1.5)
        if html:
            title_m = re.search(r"<title>(.*?)</title>", html, re.I)
            title = title_m.group(1).strip() if title_m else ""

            if "brother" in title.lower() or "brother" in html.lower():
                printer_info["manufacturer"] = "Brother"
                if title:
                    printer_info["model"] = title
                printer_info["details_source"] = f"{proto.upper()} Title"
                return printer_info
            elif "hp " in title.lower() or "laserjet" in title.lower() or "pagewide" in title.lower():
                printer_info["manufacturer"] = "HP"
                if title:
                    printer_info["model"] = title
                printer_info["details_source"] = f"{proto.upper()} Title"
                return printer_info
            elif "epson" in title.lower() or "epson" in html.lower():
                printer_info["manufacturer"] = "Epson"
                if title:
                    printer_info["model"] = title
                printer_info["details_source"] = f"{proto.upper()} Title"
                return printer_info
            elif "kyocera" in title.lower() or "ricoh" in title.lower() or "samsung" in title.lower():
                for brand in ["Kyocera", "Ricoh", "Samsung", "Xerox", "Lexmark"]:
                    if brand.lower() in title.lower() or brand.lower() in html.lower():
                        printer_info["manufacturer"] = brand
                        printer_info["model"] = title if title else f"Impressora {brand}"
                        break
                printer_info["details_source"] = f"{proto.upper()} Title"
                return printer_info
            elif title:
                printer_info["model"] = title
                printer_info["details_source"] = f"{proto.upper()} Title"
                break

    # 4. Inferência por Hostname se HTTP não respondeu
    if hostname:
        if hostname.upper().startswith("BRN"):
            printer_info["manufacturer"] = "Brother"
            printer_info["model"] = f"Brother ({hostname})"
        elif hostname.upper().startswith("HP"):
            printer_info["manufacturer"] = "HP"
            printer_info["model"] = f"HP ({hostname})"
        elif "IMP" in hostname.upper():
            printer_info["model"] = hostname

    return printer_info


def scan_network(base_subnet, max_workers=60):
    """Escaneia todo o range /24 e enriquece os dados dos dispositivos."""
    print(f"\n{C_CYAN}[+] Iniciando varredura rápida na sub-rede {base_subnet}.1 até .254...{C_RESET}")
    t0 = time.time()
    
    ips_to_scan = [f"{base_subnet}.{i}" for i in range(1, 255)]
    active_devices = {}
    
    # 1. Disparo concorrente
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(probe_single_ip, ip): ip for ip in ips_to_scan}
        for future in as_completed(futures):
            ip, ports = future.result()
            if ports:
                active_devices[ip] = ports

    t1 = time.time()
    print(f"{C_GREEN}[OK] Varredura concluída em {t1 - t0:.2f} segundos!{C_RESET}")
    print(f"{C_GREEN}[+] Hosts com portas ativas encontrados: {len(active_devices)}{C_RESET}")

    # 2. Atualizar tabela ARP para pegar MACs frescos
    arp_map = get_arp_table()

    # 3. Classificar e enriquecer cada dispositivo em paralelo
    print(f"\n{C_CYAN}[+] Identificando tipos, nomes de rede e modelos de equipamentos em paralelo...{C_RESET}")

    def process_device(ip):
        ports = active_devices[ip]
        hostname = resolve_hostname(ip)
        mac = arp_map.get(ip, None)

        # Infraestrutura de rede (Roteadores, Firewalls, Gateways, Switches)
        is_net_infra = (hostname and any(k in hostname.lower() for k in ['router', 'gateway', 'firewall', 'switch', 'dpc-router']))

        # Impressora: portas 9100, 515, 631 OU hostname com padrão de impressora
        is_printer = not is_net_infra and (9100 in ports or 515 in ports or 631 in ports or 
                      (hostname and any(k in hostname.lower() for k in ['impressora', 'brn3c', 'hpbfd', 'printer'])))

        # Computador: portas 445 (SMB), 135 (RPC), 3389 (RDP) OU hostname de estação/servidor
        is_computer = (not is_net_infra and not is_printer and (445 in ports or 135 in ports or 3389 in ports or
                       (hostname and any(k in hostname.upper() for k in ['DESKTOP-', 'PC-', 'LAPTOP-', 'DEPARTAMENTO', 'SERVIDOR', 'SERVER-']))))

        dev = {
            "ip": ip,
            "mac": mac,
            "hostname": hostname or f"device-{ip.replace('.', '-')}",
            "ports": ports,
            "category": "Unknown",
            "name": hostname or ip,
            "manufacturer": "",
            "model": "",
            "serial": None,
            "extra": {}
        }

        if is_printer:
            dev["category"] = "Printer"
            pinfo = inspect_printer_details(ip, ports, hostname)
            dev["manufacturer"] = pinfo["manufacturer"]
            dev["model"] = pinfo["model"]
            dev["name"] = pinfo["model"] if pinfo["model"] != "Impressora de Rede" else (hostname or f"Impressora-{ip}")
            dev["serial"] = pinfo["serial"] or f"LAN-PRN-{ip.replace('.', '')}"
            dev["extra"] = {
                "page_counter": pinfo["page_counter"],
                "toner_percent": pinfo["toner_percent"],
                "drum_percent": pinfo["drum_percent"],
                "firmware": pinfo["firmware"],
                "source": pinfo["details_source"]
            }
        elif is_computer:
            dev["category"] = "Computer"
            dev["manufacturer"] = "Generic PC"
            dev["model"] = "Workstation Desktop"
            dev["name"] = hostname or f"PC-{ip}"
            dev["serial"] = f"PC-LAN-{ip.replace('.', '')}"
            dev["extra"] = {
                "os": "Windows",
                "smb": 445 in ports,
                "rpc": 135 in ports
            }
        else:
            dev["category"] = "NetworkDevice"
            dev["name"] = hostname or f"NetDev-{ip}"
            dev["model"] = "Roteador / Switch / Firewall / AP"
            dev["serial"] = f"NET-{ip.replace('.', '')}"

        return dev

    with ThreadPoolExecutor(max_workers=25) as ex:
        sorted_ips = sorted(active_devices.keys(), key=lambda x: int(x.split('.')[-1]))
        classified = list(ex.map(process_device, sorted_ips))

    return classified


def print_device_table(devices):
    """Exibe uma tabela formatada no console."""
    print("\n" + "=" * 90)
    print(f"{'IP':16} | {'TIPO':13} | {'NOME / MODELO':35} | {'FABRICANTE':12} | {'SERIAL'}")
    print("=" * 90)
    for d in devices:
        color = C_CYAN if d['category'] == 'Printer' else (C_GREEN if d['category'] == 'Computer' else C_GRAY)
        cat_str = f"[{d['category']}]"
        print(f"{color}{d['ip']:16} | {cat_str:13} | {d['name'][:35]:35} | {d['manufacturer'][:12]:12} | {d['serial'] or '-'}{C_RESET}")
        if d['category'] == 'Printer' and d['extra'].get('page_counter'):
            cnt = d['extra']['page_counter']
            toner = d['extra'].get('toner_percent')
            print(f"  {C_YELLOW}|---> Paginas Impressas: {cnt:,} | Toner: {toner}% | Fonte: {d['extra'].get('source')}{C_RESET}")
    print("=" * 90)


# =============================================================================
# ENVIO 1: INVENTÁRIO NATIVO DO GLPI (/front/inventory.php)
# =============================================================================
def send_native_glpi_inventory(glpi_base_url, device):
    """
    Envia o dispositivo no formato JSON nativo do GLPI Agent para /front/inventory.php.
    Não requer tokens ou senhas pois aceita inventários anônimos de agentes.
    """
    inventory_url = glpi_base_url.rstrip('/') + '/front/inventory.php'
    
    ip = device['ip']
    mac = device['mac'] or "00:00:00:00:00:00"
    name = device['name']
    serial = device['serial'] or f"DEV-{ip.replace('.', '')}"
    
    # Monta payload compatível com Glpi\Inventory\Request
    if device['category'] == 'Printer':
        payload = {
            "action": "inventory",
            "deviceid": f"PRINTER-{ip.replace('.', '-')}",
            "itemtype": "Printer",
            "content": {
                "hardware": {
                    "name": name,
                    "uuid": device.get('extra', {}).get('uuid') or f"uuid-prn-{ip.replace('.', '-')}",
                    "chassis_type": "Other"
                },
                "bios": {
                    "ssn": serial
                },
                "networks": [
                    {
                        "description": "Ethernet",
                        "ipaddress": ip,
                        "mac": mac
                    }
                ],
                "versionclient": "GLPI-Discovery_v1.0"
            }
        }
    else:
        # Computer
        payload = {
            "action": "inventory",
            "deviceid": f"PC-{ip.replace('.', '-')}",
            "itemtype": "Computer",
            "content": {
                "hardware": {
                    "name": name,
                    "uuid": f"uuid-pc-{ip.replace('.', '-')}",
                    "chassis_type": "Desktop"
                },
                "bios": {
                    "ssn": serial
                },
                "operatingsystem": {
                    "name": device.get('extra', {}).get('os', 'Windows')
                },
                "networks": [
                    {
                        "description": "Ethernet",
                        "ipaddress": ip,
                        "mac": mac
                    }
                ],
                "versionclient": "GLPI-Discovery_v1.0"
            }
        }

    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(
        inventory_url,
        data=data,
        headers={
            "Content-Type": "application/json",
            "User-Agent": "GLPI-Discovery/1.0"
        }
    )

    try:
        with urllib.request.urlopen(req, timeout=10, context=SSL_CTX) as resp:
            body = resp.read().decode('utf-8', errors='ignore')
            return True, f"Status HTTP {resp.status}: {body[:80]}"
    except urllib.error.HTTPError as e:
        err_body = e.read().decode('utf-8', errors='ignore')
        return False, f"HTTP {e.code}: {err_body[:100]}"
    except Exception as e:
        return False, str(e)


# =============================================================================
# ENVIO 2: API REST DO GLPI (/apirest.php)
# =============================================================================
class GlpiRestClient:
    def __init__(self, glpi_base_url, app_token=None):
        self.api_url = glpi_base_url.rstrip('/') + '/apirest.php'
        self.app_token = app_token
        self.session_token = None

    def _headers(self):
        h = {
            "Content-Type": "application/json",
            "User-Agent": "GLPI-Discovery-REST/1.0"
        }
        if self.app_token:
            h["App-Token"] = self.app_token
        if self.session_token:
            h["Session-Token"] = self.session_token
        return h

    def login_with_credentials(self, username, password):
        """Inicia sessão usando Basic Auth (usuário e senha do GLPI)."""
        import base64
        init_url = f"{self.api_url}/initSession"
        auth_str = f"{username}:{password}"
        b64_auth = base64.b64encode(auth_str.encode('utf-8')).decode('utf-8')
        
        headers = self._headers()
        headers["Authorization"] = f"Basic {b64_auth}"
        
        req = urllib.request.Request(init_url, data=b"", headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=10, context=SSL_CTX) as resp:
                res = json.loads(resp.read().decode('utf-8'))
                self.session_token = res.get("session_token")
                return True, "Sessão REST iniciada com sucesso!"
        except Exception as e:
            return False, f"Falha ao autenticar na API REST: {e}"

    def login_with_user_token(self, user_token):
        """Inicia sessão usando User-Token."""
        init_url = f"{self.api_url}/initSession"
        headers = self._headers()
        headers["Authorization"] = f"user_token {user_token}"
        req = urllib.request.Request(init_url, data=b"", headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=10, context=SSL_CTX) as resp:
                res = json.loads(resp.read().decode('utf-8'))
                self.session_token = res.get("session_token")
                return True, "Sessão REST iniciada com sucesso!"
        except Exception as e:
            return False, f"Falha ao autenticar na API REST: {e}"

    def create_device(self, device):
        """Cria o Computador ou Impressora no GLPI via REST API."""
        if not self.session_token:
            return False, "Sessão não autenticada."

        endpoint = "Printer" if device['category'] == 'Printer' else "Computer"
        url = f"{self.api_url}/{endpoint}"
        
        comment = f"Auto-Discovery LAN em {time.strftime('%d/%m/%Y %H:%M')}"
        if device['category'] == 'Printer' and device['extra'].get('page_counter'):
            comment += f" | Contador: {device['extra']['page_counter']} págs"

        payload = {
            "input": {
                "name": device['name'],
                "serial": device['serial'] or "",
                "otherserial": device['ip'],
                "comment": comment
            }
        }
        if device['category'] == 'Printer':
            payload["input"]["have_ethernet"] = 1

        data = json.dumps(payload).encode('utf-8')
        req = urllib.request.Request(url, data=data, headers=self._headers())
        
        try:
            with urllib.request.urlopen(req, timeout=10, context=SSL_CTX) as resp:
                res = json.loads(resp.read().decode('utf-8'))
                item_id = res.get("id")
                
                # Se tiver MAC ou IP, vincular porta de rede
                if item_id and (device.get('mac') or device.get('ip')):
                    self._create_network_port(endpoint, item_id, device)

                return True, f"{endpoint} criado com ID: {item_id}"
        except Exception as e:
            return False, f"Erro ao criar {endpoint}: {e}"

    def _create_network_port(self, itemtype, item_id, device):
        """Cria porta de rede e associa o IP e MAC."""
        try:
            port_url = f"{self.api_url}/NetworkPort"
            port_payload = {
                "input": {
                    "items_id": item_id,
                    "itemtype": itemtype,
                    "name": "Ethernet",
                    "mac": device.get('mac', ''),
                    "instantiation_type": "NetworkPortEthernet"
                }
            }
            req = urllib.request.Request(port_url, data=json.dumps(port_payload).encode('utf-8'), headers=self._headers())
            with urllib.request.urlopen(req, timeout=5, context=SSL_CTX) as resp:
                port_res = json.loads(resp.read().decode('utf-8'))
                port_id = port_res.get("id")
                
                if port_id and device.get('ip'):
                    ip_url = f"{self.api_url}/IPAddress"
                    ip_payload = {
                        "input": {
                            "items_id": port_id,
                            "itemtype": "NetworkPort",
                            "name": device['ip']
                        }
                    }
                    req_ip = urllib.request.Request(ip_url, data=json.dumps(ip_payload).encode('utf-8'), headers=self._headers())
                    urllib.request.urlopen(req_ip, timeout=5, context=SSL_CTX)
        except Exception:
            pass


# =============================================================================
# FLUXO PRINCIPAL INTERATIVO / CLI
# =============================================================================
def main():
    banner()

    # 1. Obter rede local
    local_ip, detected_subnet, base_subnet = get_local_ip_and_subnet()
    print(f"{C_BOLD}Placa de rede ativa:{C_RESET} {local_ip}")
    print(f"{C_BOLD}Sub-rede detectada :{C_RESET} {detected_subnet}")

    import argparse
    parser = argparse.ArgumentParser(description="Descoberta e Importação Automática para o GLPI")
    parser.add_argument("--url", help="URL base do GLPI (ex: https://xxxx.ngrok-free.app/glpi)")
    parser.add_argument("--subnet", help=f"Sub-rede a escanear (padrão: {base_subnet})")
    parser.add_argument("--method", choices=["native", "rest", "dry-run"], default=None, help="Método de importação")
    parser.add_argument("--user", default="glpi", help="Usuário para API REST (padrão: glpi)")
    parser.add_argument("--password", default="glpi", help="Senha para API REST (padrão: glpi)")
    parser.add_argument("--token", help="App Token / User Token para API REST")
    parser.add_argument("--dry-run", action="store_true", help="Apenas escanear e salvar JSON local sem enviar ao GLPI")
    args = parser.parse_args()

    target_base = base_subnet
    if args.subnet:
        # Se usuário passou 192.168.200.0/24 ou 192.168.200
        target_base = re.sub(r"\.0/\d+$", "", args.subnet.strip())
        parts = target_base.split('.')
        if len(parts) >= 3:
            target_base = f"{parts[0]}.{parts[1]}.{parts[2]}"

    # Se executado sem argumentos, roda assistente amigável
    interactive = (args.method is None and not args.dry_run and not args.url)
    
    if interactive:
        ans_sub = input(f"\n{C_YELLOW}Deseja escanear a sub-rede {target_base}.0/24? [S/n]: {C_RESET}").strip().lower()
        if ans_sub.startswith('n'):
            custom_sub = input(f"Digite os 3 primeiros octetos da sub-rede (ex: 192.168.1): ").strip()
            if custom_sub:
                target_base = custom_sub

    # Executa o escaneamento
    devices = scan_network(target_base)
    
    # Exibe tabela resumo
    print_device_table(devices)

    # Salva relatório JSON local
    report_file = os.path.join(os.getcwd(), "dispositivos_descobertos.json")
    with open(report_file, "w", encoding="utf-8") as f:
        json.dump(devices, f, indent=2, ensure_ascii=False)
    print(f"\n{C_GREEN}[OK] Relatório completo exportado para: {report_file}{C_RESET}")

    # Filtrar apenas Computadores e Impressoras para enviar ao GLPI
    items_to_send = [d for d in devices if d['category'] in ['Printer', 'Computer']]
    print(f"\n{C_CYAN}[+] Dispositivos prontos para importação no GLPI: {len(items_to_send)}{C_RESET}")
    print(f"    - Impressoras  : {len([d for d in items_to_send if d['category'] == 'Printer'])}")
    print(f"    - Computadores : {len([d for d in items_to_send if d['category'] == 'Computer'])}")

    if args.dry_run or (args.method == "dry-run"):
        print(f"\n{C_YELLOW}[!] Modo Dry-Run finalizado. Nenhum dado enviado.{C_RESET}")
        return

    # Escolha do método de envio
    method = args.method
    glpi_url = args.url

    if interactive:
        print(f"\n{C_BOLD}Selecione a ação desejada:{C_RESET}")
        print(f"  {C_GREEN}[1] Enviar ao GLPI via Inventário Nativo (Recomendado - Zero Senhas/Tokens){C_RESET}")
        print(f"  {C_BLUE}[2] Enviar ao GLPI via API REST (Requer credenciais/token){C_RESET}")
        print(f"  {C_GRAY}[3] Encerrar apenas com o relatório local salvo{C_RESET}")
        
        choice = input(f"\n{C_YELLOW}Opção [1/2/3]: {C_RESET}").strip()
        if choice == '1':
            method = "native"
        elif choice == '2':
            method = "rest"
        else:
            print(f"{C_GREEN}[OK] Concluído! O relatório JSON está pronto para uso.{C_RESET}")
            return

        glpi_url = input(f"\n{C_YELLOW}Digite a URL do seu GLPI (ex: https://meu-glpi.ngrok-free.app/glpi ou http://localhost/glpi): {C_RESET}").strip()

    if not glpi_url:
        print(f"{C_RED}[X] URL do GLPI não informada. Concluído.{C_RESET}")
        return

    # Garantir que URL contenha protocolo
    if not glpi_url.startswith("http://") and not glpi_url.startswith("https://"):
        glpi_url = "https://" + glpi_url

    print(f"\n{C_CYAN}Conectando ao GLPI em: {glpi_url}...{C_RESET}")

    # =========================================================================
    # Processando Envio Nativo
    # =========================================================================
    if method == "native":
        print(f"{C_CYAN}[+] Enviando {len(items_to_send)} itens via Inventário Nativo (/front/inventory.php)...{C_RESET}")
        success = 0
        failed = 0
        
        for dev in items_to_send:
            ok, msg = send_native_glpi_inventory(glpi_url, dev)
            if ok:
                success += 1
                print(f"  {C_GREEN}[OK]{C_RESET} {dev['category']:8} | {dev['name'][:30]:30} -> {msg}")
            else:
                failed += 1
                print(f"  {C_RED}[FALHA]{C_RESET} {dev['category']:8} | {dev['name'][:30]:30} -> {msg}")

        print(f"\n{C_BOLD}Resumo do Envio Nativo:{C_RESET} {C_GREEN}{success} sucesso(s){C_RESET}, {C_RED}{failed} falha(s){C_RESET}")
        if failed > 0:
            print(f"{C_YELLOW}[Dica] Se o servidor respondeu 'Inventory is disabled' ou 403, ative em: Configurar -> Geral -> Inventário no GLPI, ou use a opção 2 (API REST).{C_RESET}")

    # =========================================================================
    # Processando Envio REST
    # =========================================================================
    elif method == "rest":
        client = GlpiRestClient(glpi_url, app_token=args.token)
        
        # Autenticação
        user = args.user
        pwd = args.password
        if interactive and not args.token:
            u_in = input(f"Usuário GLPI [padrão: {user}]: ").strip()
            if u_in: user = u_in
            p_in = input(f"Senha GLPI [padrão: {pwd}]: ").strip()
            if p_in: pwd = p_in

        print(f"{C_CYAN}[+] Autenticando na API REST do GLPI...{C_RESET}")
        if args.token:
            ok, msg = client.login_with_user_token(args.token)
        else:
            ok, msg = client.login_with_credentials(user, pwd)

        if not ok:
            print(f"{C_RED}[X] {msg}{C_RESET}")
            print(f"{C_YELLOW}[Dica] Verifique em Configurar -> Geral -> API se a API REST e o login por credenciais estão habilitados no GLPI.{C_RESET}")
            return

        print(f"{C_GREEN}[OK] {msg}{C_RESET}")
        print(f"{C_CYAN}[+] Enviando {len(items_to_send)} itens via REST API...{C_RESET}")

        success = 0
        failed = 0
        for dev in items_to_send:
            ok, msg = client.create_device(dev)
            if ok:
                success += 1
                print(f"  {C_GREEN}[OK]{C_RESET} {dev['category']:8} | {dev['name'][:30]:30} -> {msg}")
            else:
                failed += 1
                print(f"  {C_RED}[FALHA]{C_RESET} {dev['category']:8} | {dev['name'][:30]:30} -> {msg}")

        print(f"\n{C_BOLD}Resumo do Envio REST:{C_RESET} {C_GREEN}{success} sucesso(s){C_RESET}, {C_RED}{failed} falha(s){C_RESET}")

    print(f"\n{C_GREEN}{C_BOLD}Processo finalizado com sucesso! Abra seu GLPI em Ativos -> Impressoras e Computadores para visualizar.{C_RESET}\n")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print(f"\n{C_YELLOW}[!] Interrompido pelo usuário.{C_RESET}")
        sys.exit(0)
