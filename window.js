const express = require('express');
const runCommand = require('./utils/runCommand');
const parseWgShowOutput = require('./utils/parseWgShowOutput');
const fs = require('fs/promises');
const path = require('path');

const API_PORT = 8778;
const SHARED_SECRET_KEY = 'kxAeVVYSgMUEXw7UszHJ+EeC0bdQ//zPP/dXUoKzgcc=';
const WG_INTERFACE = 'wg0'; 
const WG_CONFIG_PATH = path.resolve('./config/wg0.conf');
let wireguardExePath;

const app = express();
app.use(express.json());

const getWindowExePath = async () => {
    try {
        const stdout = await runCommand('where wg');
        const wgPath = stdout.trim();

        const wireguardDir = path.dirname(wgPath);
        const wireguardExePath = path.join(wireguardDir, 'wireguard.exe');

        await fs.access(wireguardExePath);

        this.execPath = wireguardExePath;
        return wireguardExePath;
    } catch {
        throw new Error('Not found wireguard.exe on the system or PATH');
    }
}

function sleep(time) {
    return new Promise((rs) => setTimeout(rs, time));
}

const securityMiddleware = (req, res, next) => {
    const authKey = req.headers['authorization'];
    if (!authKey || authKey !== SHARED_SECRET_KEY) {
        return res.status(401).json({ error: 'Unauthorized: Invalid Authorization key' });
    }
    next();
};

app.use(securityMiddleware);

app.get(`/interface/${WG_INTERFACE}`, async (req, res) => {
    try {
        const statusOutput = await runCommand(`wg show ${WG_INTERFACE}`);
        const parsedStatus = parseWgShowOutput(statusOutput);
        res.json(parsedStatus);
    } catch (error) {
       console.error(`[${req.method}] ${req.originalUrl} - ${error.message}`);
       res.status(500).json({ error : `Failed to get wireguard status: ${error.message}`})
    }
});

app.get('/key', async (req, res) => {
    try {
        const privateKey = await runCommand('wg genkey');
        const publicKey = await runCommand(`echo ${privateKey} | wg pubkey`);
        const psk = await runCommand('wg genpsk');
        res.json({ private: privateKey, public: publicKey, psk: psk });
    } catch (error) {
        console.error(`[${req.method}] ${req.originalUrl} - ${error.message}`);
        res.status(500).json({ error: 'Failed to generate keys. Make sure WireGuard is in your system PATH.', details: error.message });
    }
});

app.patch(`/interface/${WG_INTERFACE}`, async (req, res) => {
    try {
        await runCommand(`wireguard.exe /installtunnelservice "${WG_CONFIG_PATH}"`);
        res.json({ message: `Service for ${WG_INTERFACE} installed and started successfully.` });
    } catch (error) {
        console.error(`[${req.method}] ${req.originalUrl} - ${error.message}`);
        res.status(500).json({ error: 'Failed to start interface service', details: error.message });
    }
});

app.delete(`/interface/${WG_INTERFACE}`, async (req, res) => {
    try {
        await runCommand(`wireguard.exe /uninstalltunnelservice ${WG_INTERFACE}`);
        res.json({ message: `Service for ${WG_INTERFACE} uninstalled and stopped successfully.` });
    } catch (error) {
        console.error(`[${req.method}] ${req.originalUrl} - ${error.message}`);
        res.status(500).json({ error: 'Failed to stop interface service', details: error.message });
    }
});

app.post(`/interface/${WG_INTERFACE}/config`, async (req, res) => {
    const peers = req.body;

    if (!Array.isArray(peers)) {
        return res.status(400).json({ error: 'Request body must be a array of peers.' });
    }

    let allNewPeersConfig = '';
    
    for (const peer of peers) {
        const { allowedIps, persistentKeepalive, presharedKey, publicKey, title } = peer;

        if (!allowedIps || !publicKey) {
            return res.status(400).json({ 
                error: 'Each peer object must contain "public_key" and "address".',
                invalidPeer: peer 
            });
        }

        const peerConfig = `
# Peer: ${title || 'Untitled Peer'} (added on ${new Date().toISOString()})
[Peer]
PublicKey = ${publicKey}
AllowedIPs = ${allowedIps}
${presharedKey ? `PresharedKey = ${presharedKey}` : ''}
${persistentKeepalive ? `PersistentKeepalive = ${persistentKeepalive}` : ''}
`;
        allNewPeersConfig += peerConfig;
    }

    try {
        await fs.appendFile(WG_CONFIG_PATH, allNewPeersConfig);
        
        console.log('Restarting service to apply new peer configurations...');

        if (!wireguardExePath) wireguardExePath = await getWindowExePath();

        await runCommand(`"${wireguardExePath}" /uninstalltunnelservice  ${WG_INTERFACE}`);
        await sleep(1000);
        await runCommand(`"${wireguardExePath}" /installtunnelservice "${WG_CONFIG_PATH}"`);
        await sleep(1000);
        
        res.status(201).json({ message: `${peers.length} peers added and service restarted successfully.` });
    } catch (error) {
        console.error(`[${req.method}] ${req.originalUrl} - ${error.message}`);
        res.status(500).json({ error: 'Failed to add peers to config file', details: error.message });
    }
});

app.listen(API_PORT, () => {
    console.log(`WireGuard API server for Windows is running on port ${API_PORT}`);
});