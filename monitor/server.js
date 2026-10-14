const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec, spawn } = require('child_process');

const PORT = 4040;
const XAMPP_DIR = 'C:\\xampp';
const GLPI_DIR = 'c:\\Users\\Aprendiz Ti\\Downloads\\GLPI\\glpi';
const CLOUDFLARED_LOG = 'C:\\xampp\\cloudflared_quick.log';

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

addLog('Iniciando Painel Guardião GLPI...', 'info');

// Usar tasklist nativo do Windows (ultrarrápido, sem delay de powershell)
function getRunningProcesses() {
    return new Promise((resolve) => {
        exec('tasklist /FO CSV /NH', { timeout: 3000 }, (err, stdout) => {
            if (err || !stdout) return resolve([]);
            const lines = stdout.split('\r\n');
            const procs = [];
            for (const line of lines) {
                if (!line.trim()) continue;
                // Exemplo CSV: "httpd.exe","1234","Services","0","12,340 K"
                const parts = line.split('","').map(s => s.replace(/"/g, ''));
                if (parts.length >= 2) {
                    const name = parts[0].toLowerCase();
                    const pid = parseInt(parts[1], 10);
                    if (name.includes('httpd') || name.includes('mysqld') || name.includes('cloudflared') || name.includes('ngrok')) {
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

async function getSystemStatus() {
    const [procs, ports] = await Promise.all([getRunningProcesses(), getListeningPorts()]);

    const apacheProcs = procs.filter(p => p.name.includes('httpd'));
    const mysqlProcs = procs.filter(p => p.name.includes('mysqld'));
    const cfProcs = procs.filter(p => p.name.includes('cloudflared'));

    const isApacheRunning = apacheProcs.length > 0 || ports[80] !== null;
    const isMysqlRunning = mysqlProcs.length > 0 || ports[3306] !== null;
    const isCfRunning = cfProcs.length > 0;

    let publicUrl = lastPublicUrl;
    if (fs.existsSync(CLOUDFLARED_LOG)) {
        try {
            const logContent = fs.readFileSync(CLOUDFLARED_LOG, 'utf8');
            const match = logContent.match(/https:\/\/[a-zA-Z0-9\-]+\.trycloudflare\.com/);
            if (match) {
                publicUrl = match[0] + '/glpi/';
                lastPublicUrl = publicUrl;
            }
        } catch (e) {}
    }

    const prereqs = {
        xampp: fs.existsSync(XAMPP_DIR),
        apacheExe: fs.existsSync(path.join(XAMPP_DIR, 'apache', 'bin', 'httpd.exe')),
        mysqlExe: fs.existsSync(path.join(XAMPP_DIR, 'mysql', 'bin', 'mysqld.exe')),
        glpiDir: fs.existsSync(GLPI_DIR),
        cloudflaredExe: fs.existsSync(path.join(XAMPP_DIR, 'cloudflared.exe'))
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
            cloudflared: {
                running: isCfRunning,
                pids: cfProcs.map(p => p.pid),
                url: publicUrl,
                statusText: isCfRunning ? `Rodando (PID: ${cfProcs.map(p => p.pid).join(', ')})` : 'Parado'
            }
        },
        autoRecover,
        publicUrl,
        glpiOnline: isApacheRunning && isMysqlRunning
    };
}

async function startSystem() {
    addLog('Iniciando serviços do GLPI...', 'info');
    const status = await getSystemStatus();

    if (!status.services.apache.running) {
        addLog('Iniciando Apache (httpd.exe)...', 'action');
        const child = spawn('C:\\xampp\\apache\\bin\\httpd.exe', [], {
            cwd: 'C:\\xampp\\apache',
            detached: true,
            stdio: 'ignore'
        });
        child.unref();
    } else {
        addLog('Apache já em execução.', 'success');
    }

    if (!status.services.mysql.running) {
        addLog('Iniciando MySQL (mysqld.exe)...', 'action');
        const child = spawn('C:\\xampp\\mysql\\bin\\mysqld.exe', ['--defaults-file=C:\\xampp\\mysql\\bin\\my.ini', '--standalone'], {
            cwd: 'C:\\xampp\\mysql',
            detached: true,
            stdio: 'ignore'
        });
        child.unref();
    } else {
        addLog('MySQL já em execução.', 'success');
    }

    if (!status.services.cloudflared.running) {
        addLog('Iniciando Cloudflare Tunnel...', 'action');
        if (fs.existsSync(CLOUDFLARED_LOG)) {
            try { fs.unlinkSync(CLOUDFLARED_LOG); } catch (e) {}
        }
        const cfLog = fs.openSync(CLOUDFLARED_LOG, 'a');
        const child = spawn('C:\\xampp\\cloudflared.exe', ['tunnel', '--url', 'http://127.0.0.1:80', '--logfile', CLOUDFLARED_LOG], {
            detached: true,
            stdio: ['ignore', cfLog, cfLog]
        });
        child.unref();
    } else {
        addLog('Cloudflare Tunnel já em execução.', 'success');
    }
}

async function stopSystem() {
    addLog('Encerrando processos httpd, mysqld e cloudflared...', 'warning');
    exec('taskkill /F /IM httpd.exe /IM mysqld.exe /IM cloudflared.exe', () => {
        addLog('Processos finalizados com sucesso.', 'warning');
    });
}

// Auditoria automática de queda a cada 4 segundos
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
        if (!st.services.cloudflared.running) {
            addLog('[AUDITORIA] Cloudflare Tunnel caiu! Restaurando serviço...', 'error');
            needsRecovery = true;
        }

        if (needsRecovery) {
            isRecovering = true;
            await startSystem();
            setTimeout(() => { isRecovering = false; }, 6000);
        }
    } catch (err) {
        console.error('Erro na auditoria:', err);
    }
}, 4000);

// Anti-inatividade (Keep-Alive Reposit via WScript a cada 45s)
setInterval(() => {
    exec('cscript //nologo -e:vbscript -', (err) => {}).stdin.end('Set WshShell = WScript.CreateObject("WScript.Shell") : WshShell.SendKeys("{F15}")');
}, 45000);

// Servidor Web
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
        addLog('Reiniciando sistema completo...', 'warning');
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
    addLog(`Painel Guardião GLPI disponível na porta ${PORT}`, 'success');
});
