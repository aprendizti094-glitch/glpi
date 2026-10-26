const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

// Porta do Painel Guardião (5050 para manter a porta 4040 livre para a API interna do Ngrok)
const PORT = 5050;

// Localização dinâmica da raiz do GLPI e do XAMPP
const GLPI_DIR = path.resolve(__dirname, '..');

function findXamppDir() {
    const candidates = ['C:\\xampp', 'D:\\xampp', 'E:\\xampp'];
    for (const d of candidates) {
        if (fs.existsSync(path.join(d, 'apache', 'bin', 'httpd.exe'))) return d;
    }
    return 'C:\\xampp';
}
const XAMPP_DIR = findXamppDir();

let logs = [];
let autoRecover = true; // Auto-recuperação ativa por padrão para restaurar serviços se caírem
let isStarting = false;
let lastPublicUrl = null;
let cooldownUntil = 0;

let consecutiveFails = {
    apache: 0,
    mysql: 0,
    ngrok: 0
};

function addLog(msg, type = 'info') {
    const time = new Date().toLocaleTimeString('pt-BR');
    const entry = { time, msg, type };
    logs.push(entry);
    if (logs.length > 200) logs.shift();
    console.log(`[${time}] [${type.toUpperCase()}] ${msg}`);
}

addLog('Painel Guardião GLPI pronto (Auto-Recuperação LIGADA & Ngrok obrigatório).', 'info');

// Detecta a porta real configurada no httpd.conf do Apache
function getApacheConfiguredPort() {
    const confPath = path.join(XAMPP_DIR, 'apache', 'conf', 'httpd.conf');
    if (fs.existsSync(confPath)) {
        try {
            const conf = fs.readFileSync(confPath, 'utf8');
            const match = conf.match(/^Listen\s+(\d+)/m);
            if (match) return parseInt(match[1], 10);
        } catch (e) {}
    }
    return 80;
}

// Localizar o executável do Ngrok
function findNgrokExe() {
    const candidatePaths = [
        path.join(GLPI_DIR, 'ngrok.exe'),
        path.join(XAMPP_DIR, 'ngrok.exe'),
        'C:\\xampp\\ngrok.exe',
        'C:\\ngrok\\ngrok.exe',
        path.join(process.env.LOCALAPPDATA || '', 'Programs', 'ngrok', 'ngrok.exe'),
        'ngrok.exe'
    ];
    for (const p of candidatePaths) {
        if (fs.existsSync(p)) return p;
    }
    return path.join(GLPI_DIR, 'ngrok.exe');
}

// Tarefas ativas e PIDs usando tasklist nativo ultra-rápido
function getRunningProcesses() {
    return new Promise((resolve) => {
        exec('tasklist /FO CSV /NH', { timeout: 4000 }, (err, stdout) => {
            if (err || !stdout) return resolve([]);
            const lines = stdout.split(/\r?\n/);
            const procs = [];
            for (const line of lines) {
                if (!line.trim()) continue;
                const matches = line.match(/^"([^"]+)","?(\d+)/);
                if (matches) {
                    const name = matches[1].toLowerCase();
                    const pid = parseInt(matches[2], 10);
                    if (name.includes('httpd') || name.includes('mysqld') || name.includes('ngrok')) {
                        procs.push({ name, pid });
                    }
                }
            }
            resolve(procs);
        });
    });
}

// Verifica portas ativas e captura os PIDs reais via netstat
function getListeningPorts(apachePort) {
    return new Promise((resolve) => {
        exec('netstat -ano', { timeout: 4000 }, (err, stdout) => {
            const ports = { apache: null, mysql: null, ngrok: null };
            if (err || !stdout) return resolve(ports);
            const lines = stdout.split(/\r?\n/);
            for (const line of lines) {
                if (line.includes('LISTENING')) {
                    if (new RegExp(`:${apachePort}\\b`).test(line)) {
                        const m = line.trim().match(/\s+(\d+)$/);
                        if (m) ports.apache = parseInt(m[1], 10);
                    }
                    if (/:3306\b/.test(line)) {
                        const m = line.trim().match(/\s+(\d+)$/);
                        if (m) ports.mysql = parseInt(m[1], 10);
                    }
                    if (/:4040\b/.test(line)) {
                        const m = line.trim().match(/\s+(\d+)$/);
                        if (m) ports.ngrok = parseInt(m[1], 10);
                    }
                }
            }
            resolve(ports);
        });
    });
}

// Consulta a API interna do Ngrok (porta 4040) ou testa a URL pública
function fetchNgrokPublicUrl() {
    return new Promise((resolve) => {
        // 1. Tenta API local do Ngrok na porta 4040 (127.0.0.1)
        const req = http.get('http://127.0.0.1:4040/api/tunnels', { timeout: 2000 }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const data = JSON.parse(body);
                    if (data.tunnels && data.tunnels.length > 0) {
                        const httpsTunnel = data.tunnels.find(t => t.public_url && t.public_url.startsWith('https://'));
                        const url = (httpsTunnel ? httpsTunnel.public_url : data.tunnels[0].public_url) + '/glpi/';
                        lastPublicUrl = url;
                        return resolve(url);
                    }
                } catch (e) {}
                checkKnownPublicEndpoint(resolve);
            });
        });
        req.on('error', () => checkKnownPublicEndpoint(resolve));
        req.on('timeout', () => {
            req.destroy();
            checkKnownPublicEndpoint(resolve);
        });
    });
}

// Fallback: se a API 4040 não responder imediatamente (ex: delay de inicialização),
// testa se o último link público conhecido está respondendo
function checkKnownPublicEndpoint(resolve) {
    if (!lastPublicUrl) {
        return resolve(null);
    }
    const candidateUrl = lastPublicUrl;
    try {
        const u = new URL(candidateUrl);
        const client = u.protocol === 'https:' ? https : http;
        const testReq = client.get(candidateUrl, { timeout: 3000 }, (res) => {
            if (res.statusCode >= 200 && res.statusCode < 400) {
                return resolve(candidateUrl);
            }
            resolve(lastPublicUrl);
        });
        testReq.on('error', () => resolve(lastPublicUrl));
        testReq.on('timeout', () => {
            testReq.destroy();
            resolve(lastPublicUrl);
        });
    } catch (e) {
        resolve(lastPublicUrl);
    }
}

async function getSystemStatus() {
    const apachePort = getApacheConfiguredPort();
    const [procs, ports, publicUrl] = await Promise.all([
        getRunningProcesses(),
        getListeningPorts(apachePort),
        fetchNgrokPublicUrl()
    ]);

    const apacheProcs = procs.filter(p => p.name.includes('httpd'));
    const mysqlProcs = procs.filter(p => p.name.includes('mysqld'));
    const ngrokProcs = procs.filter(p => p.name.includes('ngrok'));

    // PIDs consolidados combinando tasklist e portas ativas do netstat
    const apachePids = Array.from(new Set([...apacheProcs.map(p => p.pid), ports.apache].filter(Boolean)));
    const mysqlPids = Array.from(new Set([...mysqlProcs.map(p => p.pid), ports.mysql].filter(Boolean)));
    const ngrokPids = Array.from(new Set([...ngrokProcs.map(p => p.pid), ports.ngrok].filter(Boolean)));

    const isApacheRunning = apachePids.length > 0 || ports.apache !== null;
    const isMysqlRunning = mysqlPids.length > 0 || ports.mysql !== null;
    const isNgrokRunning = ngrokPids.length > 0 || ports.ngrok !== null || Boolean(publicUrl);

    const effectivePublicUrl = publicUrl || lastPublicUrl;
    if (isNgrokRunning && effectivePublicUrl) {
        lastPublicUrl = effectivePublicUrl;
    }

    const ngrokExePath = findNgrokExe();
    const prereqs = {
        xampp: fs.existsSync(XAMPP_DIR),
        apacheExe: fs.existsSync(path.join(XAMPP_DIR, 'apache', 'bin', 'httpd.exe')),
        mysqlExe: fs.existsSync(path.join(XAMPP_DIR, 'mysql', 'bin', 'mysqld.exe')),
        glpiDir: fs.existsSync(GLPI_DIR),
        ngrokExe: fs.existsSync(ngrokExePath)
    };

    return {
        prereqs,
        services: {
            apache: {
                running: isApacheRunning,
                pids: apachePids,
                port: apachePort,
                statusText: isApacheRunning ? `Rodando (PID: ${apachePids.join(', ') || 'Ativo'})` : 'Parado'
            },
            mysql: {
                running: isMysqlRunning,
                pids: mysqlPids,
                port: 3306,
                statusText: isMysqlRunning ? `Rodando (PID: ${mysqlPids.join(', ') || 'Ativo'})` : 'Parado'
            },
            ngrok: {
                running: isNgrokRunning,
                pids: ngrokPids,
                url: effectivePublicUrl,
                statusText: isNgrokRunning ? (ngrokPids.length > 0 ? `Rodando (PID: ${ngrokPids.join(', ')})` : 'Rodando (Túnel Ativo)') : 'Parado'
            }
        },
        autoRecover,
        publicUrl: effectivePublicUrl,
        glpiOnline: isApacheRunning && isMysqlRunning
    };
}

// Restaura somente o túnel Ngrok (sem mexer em Apache ou MySQL)
async function restartNgrokOnly() {
    addLog('Restaurando apenas o túnel Ngrok (mantendo Apache e MySQL intactos)...', 'warning');
    exec('taskkill /F /IM ngrok.exe', () => {
        setTimeout(async () => {
            const url = await fetchNgrokPublicUrl();
            if (url) {
                addLog(`Túnel Ngrok já ativo e respondendo: ${url}`, 'success');
                return;
            }
            const ngrokExe = findNgrokExe();
            const apachePort = getApacheConfiguredPort();
            const ngrokDomain = 'skillet-hypnotic-create.ngrok-free.dev';
            if (fs.existsSync(ngrokExe)) {
                exec(`powershell -NoProfile -Command "Start-Process -FilePath '${ngrokExe}' -ArgumentList 'http', '127.0.0.1:${apachePort}', '--url=${ngrokDomain}' -WindowStyle Hidden"`, { cwd: GLPI_DIR }, (err) => {
                    if (err) addLog(`[AVISO] Erro ao iniciar ngrok: ${err.message}`, 'warning');
                    else addLog(`Túnel Ngrok relançado com domínio fixo (${ngrokDomain}).`, 'success');
                });
            }
        }, 1500);
    });
}

// Inicia os serviços disparando o iniciar_glpi_ngrok.ps1 sem abrir abas
async function startSystem() {
    if (isStarting) return;
    isStarting = true;
    cooldownUntil = Date.now() + 45000; // 45s de carência para a auditoria

    addLog('Iniciando serviços do GLPI com Ngrok...', 'info');

    // Mata qualquer vestígio antigo do Cloudflare
    exec('taskkill /F /IM cloudflared.exe', () => {});

    const ps1Path = path.join(GLPI_DIR, 'iniciar_glpi_ngrok.ps1');
    if (fs.existsSync(ps1Path)) {
        addLog('Executando iniciar_glpi_ngrok.ps1 em segundo plano...', 'action');
        exec(`powershell -NoProfile -ExecutionPolicy Bypass -File "${ps1Path}"`, { cwd: GLPI_DIR }, (err) => {
            if (err) addLog(`[AVISO] Inicializador retornou aviso: ${err.message}`, 'warning');
            else addLog('Inicializador executado com sucesso.', 'success');
        });
    } else {
        addLog(`[ERRO] Arquivo não encontrado: ${ps1Path}`, 'error');
    }

    // Monitora a confirmação do túnel
    let attempts = 0;
    const interval = setInterval(async () => {
        attempts++;
        const url = await fetchNgrokPublicUrl();
        if (url) {
            clearInterval(interval);
            addLog(`Túnel Ngrok confirmado ativo: ${url}`, 'success');
        } else if (attempts >= 10) {
            clearInterval(interval);
        }
    }, 2000);

    setTimeout(() => {
        isStarting = false;
    }, 4000);
}

async function stopSystem() {
    addLog('Encerrando processos httpd, mysqld, ngrok e cloudflared...', 'warning');
    cooldownUntil = Date.now() + 25000; // Bloqueia auditoria durante parada intencional
    consecutiveFails = { apache: 0, mysql: 0, ngrok: 0 };
    exec('taskkill /F /IM httpd.exe /IM mysqld.exe /IM ngrok.exe /IM cloudflared.exe', () => {
        addLog('Processos finalizados com sucesso.', 'warning');
    });
}

// Auditoria automática de queda a cada 15 segundos com proteção contra loops
setInterval(async () => {
    if (!autoRecover || isStarting || Date.now() < cooldownUntil) return;

    try {
        const st = await getSystemStatus();

        // 1. Se Apache e MySQL estão rodando saudáveis, NUNCA reinicie o GLPI!
        if (st.services.apache.running && st.services.mysql.running) {
            consecutiveFails.apache = 0;
            consecutiveFails.mysql = 0;

            // Se apenas o Ngrok estiver fora
            if (!st.services.ngrok.running) {
                consecutiveFails.ngrok++;
                if (consecutiveFails.ngrok >= 4) { // Requer 4 falhas seguidas (60s)
                    consecutiveFails.ngrok = 0;
                    cooldownUntil = Date.now() + 60000;
                    addLog('[AUDITORIA] Ngrok fora do ar. Restaurando apenas o túnel...', 'warning');
                    await restartNgrokOnly();
                }
            } else {
                consecutiveFails.ngrok = 0;
            }
            return;
        }

        // 2. Se Apache OU MySQL caíram de verdade:
        let webCrashed = false;
        if (!st.services.apache.running) {
            consecutiveFails.apache++;
            if (consecutiveFails.apache >= 3) {
                addLog('[AUDITORIA] Apache Web (GLPI) caiu! Restaurando serviço...', 'error');
                webCrashed = true;
            }
        } else {
            consecutiveFails.apache = 0;
        }

        if (!st.services.mysql.running) {
            consecutiveFails.mysql++;
            if (consecutiveFails.mysql >= 3) {
                addLog('[AUDITORIA] Banco MySQL caiu! Restaurando serviço...', 'error');
                webCrashed = true;
            }
        } else {
            consecutiveFails.mysql = 0;
        }

        if (webCrashed) {
            consecutiveFails.apache = 0;
            consecutiveFails.mysql = 0;
            cooldownUntil = Date.now() + 60000;
            await startSystem();
        }
    } catch (err) {
        console.error('Erro na auditoria:', err);
    }
}, 15000);

// Anti-inatividade (Keep-Alive Reposit via WScript a cada 45s)
setInterval(() => {
    exec('cscript //nologo -e:vbscript -', (err) => {}).stdin.end('Set WshShell = WScript.CreateObject("WScript.Shell") : WshShell.SendKeys("{F15}")');
}, 45000);

// Servidor Web HTTP na porta 5050
const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST');

    if (req.url === '/api/status' && req.method === 'GET') {
        const data = await getSystemStatus();
        data.logs = logs;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(data));
    }

    if (req.url === '/api/start' && req.method === 'POST') {
        await startSystem();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true }));
    }

    if (req.url === '/api/stop' && req.method === 'POST') {
        await stopSystem();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true }));
    }

    if (req.url === '/api/restart' && req.method === 'POST') {
        addLog('Reiniciando sistema completo com Ngrok...', 'warning');
        await stopSystem();
        setTimeout(async () => {
            await startSystem();
        }, 2000);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true }));
    }

    if (req.url === '/api/toggle-autorecover' && req.method === 'POST') {
        autoRecover = !autoRecover;
        addLog(`Auto-recuperação ${autoRecover ? 'LIGADA' : 'PAUSADA'}`, autoRecover ? 'success' : 'warning');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ autoRecover }));
    }

    if (req.url === '/api/clear-logs' && req.method === 'POST') {
        logs = [];
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true }));
    }

    if (req.url === '/' || req.url === '/index.html') {
        const htmlPath = path.join(__dirname, 'index.html');
        if (fs.existsSync(htmlPath)) {
            const html = fs.readFileSync(htmlPath, 'utf8');
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            return res.end(html);
        }
    }

    res.writeHead(404);
    res.end('Not Found');
});

server.listen(PORT, () => {
    addLog(`Painel Guardião GLPI disponível na porta ${PORT} (Ngrok obrigatório)`, 'success');
});
