const http = require('http');
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
let autoRecover = true;
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

addLog('Iniciando Painel Guardião GLPI com Túnel Ngrok (Obrigatório)...', 'info');

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
                    if (line.includes(`:${apachePort} `) || line.includes(`:${apachePort}\t`)) {
                        const m = line.trim().match(/\s+(\d+)$/);
                        if (m) ports.apache = parseInt(m[1], 10);
                    }
                    if (line.includes(':3306 ') || line.includes(':3306\t')) {
                        const m = line.trim().match(/\s+(\d+)$/);
                        if (m) ports.mysql = parseInt(m[1], 10);
                    }
                    if (line.includes(':4040 ') || line.includes(':4040\t')) {
                        const m = line.trim().match(/\s+(\d+)$/);
                        if (m) ports.ngrok = parseInt(m[1], 10);
                    }
                }
            }
            resolve(ports);
        });
    });
}

// Consulta a API interna do Ngrok (porta 4040) para obter a URL pública ativa
function fetchNgrokPublicUrl() {
    return new Promise((resolve) => {
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
                resolve(lastPublicUrl);
            });
        });
        req.on('error', () => resolve(null));
        req.on('timeout', () => {
            req.destroy();
            resolve(null);
        });
    });
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
                statusText: isNgrokRunning ? `Rodando (PID: ${ngrokPids.join(', ') || 'Ativo'})` : 'Parado'
            }
        },
        autoRecover,
        publicUrl: effectivePublicUrl,
        glpiOnline: isApacheRunning && isMysqlRunning
    };
}

// Inicia os serviços disparando diretamente o iniciar_glpi_ngrok.bat validado
async function startSystem() {
    if (isStarting) return;
    isStarting = true;
    cooldownUntil = Date.now() + 30000; // 30s de carência para a auditoria

    addLog('Disparando iniciar_glpi_ngrok.bat oficial validado...', 'info');

    // Mata qualquer vestígio antigo do Cloudflare
    exec('taskkill /F /IM cloudflared.exe', () => {});

    const batPath = path.join(GLPI_DIR, 'iniciar_glpi_ngrok.bat');
    if (fs.existsSync(batPath)) {
        addLog(`Iniciando ${batPath}...`, 'action');
        exec(`start "GLPI-Ngrok-Runner" cmd.exe /c "${batPath}"`, { cwd: GLPI_DIR, shell: 'cmd.exe' }, (err) => {
            if (err) addLog(`[AVISO] Erro ao disparar bat: ${err.message}`, 'warning');
        });
    } else {
        addLog(`[ERRO] Arquivo não encontrado: ${batPath}`, 'error');
    }

    // Monitora a geração do link público do Ngrok
    let attempts = 0;
    const interval = setInterval(async () => {
        attempts++;
        const url = await fetchNgrokPublicUrl();
        if (url) {
            clearInterval(interval);
            addLog(`Túnel Ngrok detectado: ${url}`, 'success');
        } else if (attempts >= 15) {
            clearInterval(interval);
        }
    }, 2000);

    setTimeout(() => {
        isStarting = false;
    }, 4000);
}

async function stopSystem() {
    addLog('Encerrando processos httpd, mysqld, ngrok e cloudflared...', 'warning');
    cooldownUntil = Date.now() + 20000; // Bloqueia auditoria durante parada intencional
    consecutiveFails = { apache: 0, mysql: 0, ngrok: 0 };
    exec('taskkill /F /IM httpd.exe /IM mysqld.exe /IM ngrok.exe /IM cloudflared.exe', () => {
        addLog('Processos finalizados com sucesso.', 'warning');
    });
}

// Auditoria automática de queda a cada 10 segundos com debounce (evita falso-positivos)
setInterval(async () => {
    if (!autoRecover || isStarting || Date.now() < cooldownUntil) return;

    try {
        const st = await getSystemStatus();
        let triggerRecovery = false;

        // Auditoria Apache
        if (!st.services.apache.running) {
            consecutiveFails.apache++;
            if (consecutiveFails.apache >= 2) {
                addLog('[AUDITORIA] Apache fora do ar detectado. Restaurando...', 'error');
                triggerRecovery = true;
            }
        } else {
            consecutiveFails.apache = 0;
        }

        // Auditoria MySQL
        if (!st.services.mysql.running) {
            consecutiveFails.mysql++;
            if (consecutiveFails.mysql >= 2) {
                addLog('[AUDITORIA] MySQL fora do ar detectado. Restaurando...', 'error');
                triggerRecovery = true;
            }
        } else {
            consecutiveFails.mysql = 0;
        }

        // Auditoria Ngrok
        if (!st.services.ngrok.running) {
            consecutiveFails.ngrok++;
            if (consecutiveFails.ngrok >= 2) {
                addLog('[AUDITORIA] Ngrok fora do ar detectado. Restaurando...', 'error');
                triggerRecovery = true;
            }
        } else {
            consecutiveFails.ngrok = 0;
        }

        if (triggerRecovery) {
            await startSystem();
        }
    } catch (err) {
        console.error('Erro na auditoria:', err);
    }
}, 10000);

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
        addLog(`Auto-recuperação ${autoRecover ? 'LIGADA' : 'DESLIGADA'}`, autoRecover ? 'success' : 'warning');
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
