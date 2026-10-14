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
            const lines = stdout.split('\r\n');
            const procs = [];
            for (const line of lines) {
                if (!line.trim()) continue;
                const parts = line.split('","').map(s => s.replace(/"/g, ''));
                if (parts.length >= 2) {
                    const name = parts[0].toLowerCase();
                    const pid = parseInt(parts[1], 10);
                    if (name.includes('httpd') || name.includes('mysqld') || name.includes('ngrok')) {
                        procs.push({ name, pid });
                    }
                }
            }
            resolve(procs);
        });
    });
}

// Verifica portas ativas usando netstat nativo
function getListeningPorts(apachePort) {
    return new Promise((resolve) => {
        exec('netstat -ano', { timeout: 4000 }, (err, stdout) => {
            const ports = { apache: null, mysql: null };
            if (err || !stdout) return resolve(ports);
            const lines = stdout.split('\r\n');
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
        req.on('error', () => resolve(lastPublicUrl));
        req.on('timeout', () => {
            req.destroy();
            resolve(lastPublicUrl);
        });
    });
}

async function getSystemStatus() {
    const apachePort = getApacheConfiguredPort();
    const [procs, ports] = await Promise.all([getRunningProcesses(), getListeningPorts(apachePort)]);

    const apacheProcs = procs.filter(p => p.name.includes('httpd'));
    const mysqlProcs = procs.filter(p => p.name.includes('mysqld'));
    const ngrokProcs = procs.filter(p => p.name.includes('ngrok'));

    const isApacheRunning = apacheProcs.length > 0 || ports.apache !== null;
    const isMysqlRunning = mysqlProcs.length > 0 || ports.mysql !== null;
    const isNgrokRunning = ngrokProcs.length > 0;

    let publicUrl = lastPublicUrl;
    if (isNgrokRunning) {
        publicUrl = await fetchNgrokPublicUrl();
    } else {
        lastPublicUrl = null;
        publicUrl = null;
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
                pids: apacheProcs.map(p => p.pid),
                port: apachePort,
                statusText: isApacheRunning ? `Rodando (PID: ${apacheProcs.map(p => p.pid).join(', ') || ports.apache})` : 'Parado'
            },
            mysql: {
                running: isMysqlRunning,
                pids: mysqlProcs.map(p => p.pid),
                port: 3306,
                statusText: isMysqlRunning ? `Rodando (PID: ${mysqlProcs.map(p => p.pid).join(', ') || ports.mysql})` : 'Parado'
            },
            ngrok: {
                running: isNgrokRunning,
                pids: ngrokProcs.map(p => p.pid),
                url: publicUrl,
                statusText: isNgrokRunning ? `Rodando (PID: ${ngrokProcs.map(p => p.pid).join(', ')})` : 'Parado'
            }
        },
        autoRecover,
        publicUrl,
        glpiOnline: isApacheRunning && isMysqlRunning
    };
}

async function startApache(apachePort) {
    const httpdExe = path.join(XAMPP_DIR, 'apache', 'bin', 'httpd.exe');
    if (!fs.existsSync(httpdExe)) {
        addLog(`[ERRO] httpd.exe não encontrado em ${httpdExe}`, 'error');
        return;
    }

    addLog(`Iniciando Apache (httpd.exe) na porta ${apachePort}...`, 'action');

    // Remove httpd.pid antigo órfão se houver
    const pidFile = path.join(XAMPP_DIR, 'apache', 'logs', 'httpd.pid');
    try {
        if (fs.existsSync(pidFile)) fs.unlinkSync(pidFile);
    } catch (e) {}

    // Inicia processo minimizado e 100% desacoplado via cmd start nativo do Windows
    const apacheDir = path.join(XAMPP_DIR, 'apache');
    const cmd = `start "Apache" /min "${httpdExe}" -d "${apacheDir}"`;
    
    return new Promise((resolve) => {
        exec(cmd, { cwd: apacheDir, shell: 'cmd.exe' }, (err) => {
            if (err) addLog(`[AVISO] Erro ao disparar httpd: ${err.message}`, 'warning');
            setTimeout(resolve, 2000);
        });
    });
}

async function startMysql() {
    const mysqlExe = path.join(XAMPP_DIR, 'mysql', 'bin', 'mysqld.exe');
    if (!fs.existsSync(mysqlExe)) {
        addLog(`[AVISO] mysqld.exe não encontrado em ${mysqlExe}`, 'warning');
        return;
    }

    addLog('Iniciando MySQL (mysqld.exe)...', 'action');
    const mysqlDir = path.join(XAMPP_DIR, 'mysql');
    const myIni = path.join(mysqlDir, 'bin', 'my.ini');
    const cmd = `start "MySQL" /min "${mysqlExe}" --defaults-file="${myIni}" --standalone`;

    return new Promise((resolve) => {
        exec(cmd, { cwd: mysqlDir, shell: 'cmd.exe' }, (err) => {
            if (err) addLog(`[AVISO] Erro ao disparar mysqld: ${err.message}`, 'warning');
            setTimeout(resolve, 1500);
        });
    });
}

async function startNgrok(targetPort) {
    const ngrokExe = findNgrokExe();
    if (!fs.existsSync(ngrokExe)) {
        addLog(`[ERRO] ngrok.exe não encontrado em ${ngrokExe}. Coloque ngrok.exe na pasta do GLPI.`, 'error');
        return;
    }

    // Verifica se já há uma sessão Ngrok ativa respondendo na porta 4040
    const activeUrl = await fetchNgrokPublicUrl();
    if (activeUrl) {
        addLog(`Ngrok já ativo com túnel: ${activeUrl}`, 'success');
        return;
    }

    addLog(`Iniciando Túnel Ngrok oficial para a porta ${targetPort}...`, 'action');

    const cmd = `start "Ngrok" /min "${ngrokExe}" http 127.0.0.1:${targetPort}`;
    exec(cmd, { cwd: GLPI_DIR, shell: 'cmd.exe' }, (err) => {
        if (err) addLog(`[AVISO] Erro ao disparar ngrok: ${err.message}`, 'warning');
    });

    // Monitora a geração do link público
    let attempts = 0;
    const interval = setInterval(async () => {
        attempts++;
        const url = await fetchNgrokPublicUrl();
        if (url) {
            clearInterval(interval);
            addLog(`Túnel Ngrok gerado com sucesso: ${url}`, 'success');
        } else if (attempts >= 10) {
            clearInterval(interval);
            addLog(`[NGROK ALERTA] Túnel ainda gerando. Verifique seu token com: ngrok config add-authtoken <token>`, 'warning');
        }
    }, 1500);
}

async function startSystem() {
    if (isStarting) return;
    isStarting = true;
    cooldownUntil = Date.now() + 25000; // 25s de carência para a auditoria

    addLog('Iniciando serviços do GLPI com Ngrok (Obrigatório)...', 'info');

    // Mata qualquer vestígio do Cloudflare
    exec('taskkill /F /IM cloudflared.exe', () => {});

    const apachePort = getApacheConfiguredPort();
    const status = await getSystemStatus();

    // 1. MySQL
    if (!status.services.mysql.running) {
        await startMysql();
    } else {
        addLog('MySQL já em execução.', 'success');
    }

    // 2. Apache
    if (!status.services.apache.running) {
        await startApache(apachePort);
    } else {
        addLog('Apache já em execução.', 'success');
    }

    // 3. Ngrok
    if (!status.services.ngrok.running) {
        await startNgrok(apachePort);
    } else {
        addLog('Ngrok já em execução.', 'success');
    }

    isStarting = false;
}

async function stopSystem() {
    addLog('Encerrando processos httpd, mysqld, ngrok e cloudflared...', 'warning');
    cooldownUntil = Date.now() + 15000; // Bloqueia auditoria durante parada intencional
    consecutiveFails = { apache: 0, mysql: 0, ngrok: 0 };
    exec('taskkill /F /IM httpd.exe /IM mysqld.exe /IM ngrok.exe /IM cloudflared.exe', () => {
        addLog('Processos finalizados com sucesso.', 'warning');
    });
}

// Auditoria automática de queda a cada 10 segundos com debounce (evita loops e falso-positivos)
setInterval(async () => {
    if (!autoRecover || isStarting || Date.now() < cooldownUntil) return;

    try {
        const st = await getSystemStatus();
        let triggerRecovery = false;

        // Auditoria Apache
        if (!st.services.apache.running) {
            consecutiveFails.apache++;
            if (consecutiveFails.apache >= 2) {
                addLog('[AUDITORIA] Apache fora do ar confirmado. Restaurando serviço...', 'error');
                triggerRecovery = true;
            }
        } else {
            consecutiveFails.apache = 0;
        }

        // Auditoria MySQL
        if (!st.services.mysql.running) {
            consecutiveFails.mysql++;
            if (consecutiveFails.mysql >= 2) {
                addLog('[AUDITORIA] MySQL fora do ar confirmado. Restaurando serviço...', 'error');
                triggerRecovery = true;
            }
        } else {
            consecutiveFails.mysql = 0;
        }

        // Auditoria Ngrok
        if (!st.services.ngrok.running) {
            consecutiveFails.ngrok++;
            if (consecutiveFails.ngrok >= 2) {
                addLog('[AUDITORIA] Ngrok fora do ar confirmado. Restaurando túnel...', 'error');
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
