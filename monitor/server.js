const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec, spawn } = require('child_process');

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
let isRecovering = false;
let lastPublicUrl = null;

function addLog(msg, type = 'info') {
    const time = new Date().toLocaleTimeString('pt-BR');
    const entry = { time, msg, type };
    logs.push(entry);
    if (logs.length > 200) logs.shift();
    console.log(`[${time}] [${type.toUpperCase()}] ${msg}`);
}

addLog('Iniciando Painel Guardião GLPI com Túnel Ngrok (Obrigatório)...', 'info');

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
        exec('tasklist /FO CSV /NH', { timeout: 3000 }, (err, stdout) => {
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
function getListeningPorts() {
    return new Promise((resolve) => {
        exec('netstat -ano', { timeout: 3000 }, (err, stdout) => {
            const ports = { 80: null, 3306: null };
            if (err || !stdout) return resolve(ports);
            const lines = stdout.split('\r\n');
            for (const line of lines) {
                if (line.includes('LISTENING')) {
                    if (line.includes(':80 ') || line.includes(':80\t')) {
                        const m = line.trim().match(/\s+(\d+)$/);
                        if (m) ports[80] = parseInt(m[1], 10);
                    }
                    if (line.includes(':3306 ') || line.includes(':3306\t')) {
                        const m = line.trim().match(/\s+(\d+)$/);
                        if (m) ports[3306] = parseInt(m[1], 10);
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
    const [procs, ports] = await Promise.all([getRunningProcesses(), getListeningPorts()]);

    const apacheProcs = procs.filter(p => p.name.includes('httpd'));
    const mysqlProcs = procs.filter(p => p.name.includes('mysqld'));
    const ngrokProcs = procs.filter(p => p.name.includes('ngrok'));

    const isApacheRunning = apacheProcs.length > 0 || ports[80] !== null;
    const isMysqlRunning = mysqlProcs.length > 0 || ports[3306] !== null;
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
                port: 80,
                statusText: isApacheRunning ? `Rodando (PID: ${apacheProcs.map(p => p.pid).join(', ') || ports[80]})` : 'Parado'
            },
            mysql: {
                running: isMysqlRunning,
                pids: mysqlProcs.map(p => p.pid),
                port: 3306,
                statusText: isMysqlRunning ? `Rodando (PID: ${mysqlProcs.map(p => p.pid).join(', ') || ports[3306]})` : 'Parado'
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

let lastNgrokAttempt = 0;

async function startSystem() {
    addLog('Iniciando serviços do GLPI com Ngrok (Obrigatório)...', 'info');

    // Garante que qualquer resquício antigo do Cloudflare seja abortado imediatamente
    exec('taskkill /F /IM cloudflared.exe', () => {});

    const status = await getSystemStatus();

    // 1. Iniciar Apache
    if (!status.services.apache.running) {
        const httpdExe = path.join(XAMPP_DIR, 'apache', 'bin', 'httpd.exe');
        if (fs.existsSync(httpdExe)) {
            addLog('Iniciando Apache (httpd.exe)...', 'action');
            const child = spawn(httpdExe, [], {
                cwd: path.join(XAMPP_DIR, 'apache'),
                detached: true,
                stdio: 'ignore'
            });
            child.unref();
        } else {
            addLog(`[AVISO] httpd.exe não encontrado em ${httpdExe}`, 'warning');
        }
    } else {
        addLog('Apache já em execução.', 'success');
    }

    // 2. Iniciar MySQL
    if (!status.services.mysql.running) {
        const mysqlExe = path.join(XAMPP_DIR, 'mysql', 'bin', 'mysqld.exe');
        if (fs.existsSync(mysqlExe)) {
            addLog('Iniciando MySQL (mysqld.exe)...', 'action');
            const myIni = path.join(XAMPP_DIR, 'mysql', 'bin', 'my.ini');
            const child = spawn(mysqlExe, [`--defaults-file=${myIni}`, '--standalone'], {
                cwd: path.join(XAMPP_DIR, 'mysql'),
                detached: true,
                stdio: 'ignore'
            });
            child.unref();
        } else {
            addLog(`[AVISO] mysqld.exe não encontrado em ${mysqlExe}`, 'warning');
        }
    } else {
        addLog('MySQL já em execução.', 'success');
    }

    // 3. Iniciar Ngrok (Obrigatório)
    if (!status.services.ngrok.running) {
        const now = Date.now();
        if (now - lastNgrokAttempt < 10000) {
            return;
        }
        lastNgrokAttempt = now;

        const ngrokExe = findNgrokExe();
        if (fs.existsSync(ngrokExe)) {
            const targetPort = status.services.apache.port || 80;
            const logPath = path.join(XAMPP_DIR, 'ngrok.log');
            addLog(`Iniciando Túnel Ngrok na porta ${targetPort}...`, 'action');
            
            // Limpa instancias antigas ou travadas do ngrok antes de subir
            exec('taskkill /F /IM ngrok.exe', () => {
                setTimeout(() => {
                    let logFd;
                    try {
                        logFd = fs.openSync(logPath, 'w');
                    } catch (e) {
                        logFd = 'ignore';
                    }
                    const child = spawn(ngrokExe, ['http', `127.0.0.1:${targetPort}`, '--log=stdout'], {
                        detached: true,
                        stdio: ['ignore', logFd, logFd]
                    });
                    child.unref();

                    // Aguarda 3s e busca a URL pública gerada ou lê log de erro
                    setTimeout(async () => {
                        const url = await fetchNgrokPublicUrl();
                        if (url) {
                            addLog(`Túnel Ngrok gerado com sucesso: ${url}`, 'success');
                        } else if (fs.existsSync(logPath)) {
                            try {
                                const content = fs.readFileSync(logPath, 'utf8');
                                const errorMatch = content.match(/ERR_NGROK_\d+.*?$/m) || content.match(/lvl=eror.*?err="([^"]+)"/);
                                if (errorMatch) {
                                    addLog(`[NGROK ALERTA] ${errorMatch[1] || errorMatch[0]}`, 'warning');
                                }
                            } catch (e) {}
                        }
                    }, 3000);
                }, 800);
            });
        } else {
            addLog(`[ERRO] ngrok.exe não encontrado em ${ngrokExe}. Coloque ngrok.exe na pasta do GLPI.`, 'error');
        }
    } else {
        addLog('Ngrok já em execução.', 'success');
    }
}

async function stopSystem() {
    addLog('Encerrando processos httpd, mysqld, ngrok e cloudflared...', 'warning');
    exec('taskkill /F /IM httpd.exe /IM mysqld.exe /IM ngrok.exe /IM cloudflared.exe', () => {
        addLog('Processos finalizados com sucesso.', 'warning');
    });
}

// Auditoria automática de queda a cada 6 segundos
setInterval(async () => {
    if (!autoRecover || isRecovering) return;

    try {
        const st = await getSystemStatus();
        let needsRecovery = false;

        if (!st.services.apache.running) {
            addLog('[AUDITORIA] Apache caiu! Restaurando serviço...', 'error');
            needsRecovery = true;
        }
        if (!st.services.mysql.running) {
            addLog('[AUDITORIA] MySQL caiu! Restaurando serviço...', 'error');
            needsRecovery = true;
        }
        if (!st.services.ngrok.running) {
            if (Date.now() - lastNgrokAttempt >= 15000) {
                addLog('[AUDITORIA] Ngrok caiu! Restaurando túnel...', 'error');
                needsRecovery = true;
            }
        }

        if (needsRecovery) {
            isRecovering = true;
            await startSystem();
            setTimeout(() => { isRecovering = false; }, 8000);
        }
    } catch (err) {
        console.error('Erro na auditoria:', err);
    }
}, 6000);

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
        }, 1500);
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
