// server-linux.js
const express = require('express');
const { exec } = require('child_process');
const fs = require('fs/promises');
const path = require('path');

const API_PORT = 8778;
const SHARED_SECRET_KEY = 'kxAeVVYSgMUEXw7UszHJ+EeC0bdQ//zPP/dXUoKzgcc=';
const WG_INTERFACE = 'wg_server'; 
const WG_CONFIG_PATH = path.join('/etc/wireguard/', `${WG_INTERFACE}.conf`);

const app = express();
app.use(express.json());

function runCommand(command) {
    const commandToRun = command.startsWith('wg') ? `sudo ${command}` : command;
    console.log(`Executing: ${commandToRun}`);
    return new Promise((resolve, reject) => {
        exec(commandToRun, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error: ${stderr || error.message}`);
                return reject(new Error(stderr || error.message));
            }
            resolve(stdout.trim());
        });
    });
}

function parseWgShowOutput(output) {
    if (!output) {
       throw new Error("output of status is empty")
    }

    const lines = output.split('\n');
    const result = {
        peers: [],
        port: null,
        publicKey: null,
        status: 'up'
    };
    let currentPeer = null;

    lines.forEach(line => {
        line = line.trim();
        if (line.startsWith('interface:')) result.publicKey = lines[1]?.trim().split(': ')[1];
        if (line.startsWith('listening port:')) result.port = parseInt(line.split(': ')[1], 10);
        
        const peerMatch = line.match(/^peer: (.+)/);
        if (peerMatch) {
            if (currentPeer) result.peers.push(currentPeer);
            currentPeer = { publicKey: peerMatch[1] };
        }

        if (currentPeer) {
            if (line.startsWith('endpoint:')) currentPeer.endpoint = line.split(': ')[1];
            if (line.startsWith('allowed ips:')) currentPeer.allowedIps = line.split(': ')[1];
            if (line.startsWith('latest handshake:')) currentPeer.latestHandshake = line.split(': ')[1];
            if (line.startsWith('transfer:')) {
                const parts = line.split(': ')[1].split(', ');
                currentPeer.transfer = { received: parts[0], sent: parts[1] };
            }
        }
    });

    if (currentPeer) result.peers.push(currentPeer);
    return result;
}

const securityMiddleware = (req, res, next) => {
    const authKey = req.headers['authorization'];
    if (!authKey || authKey !== SHARED_SECRET_KEY) {
        return res.status(401).json({ error: 'Unauthorized: Invalid Authorization key' });
    }
    next();
};

app.use(securityMiddleware);


app.get('/interface', async (req, res) => {
    try {
        const statusOutput = await runCommand(`wg show ${WG_INTERFACE}`);
        const parsedStatus = parseWgShowOutput(statusOutput);
        res.json(parsedStatus);
    } catch (error) {
        res.status(500).json({ error : `Failed to get wireguard status: ${error.message}`})
    }
});

app.get('/key', async (req, res) => {
    try {
        const privateKey = await runCommand('wg genkey');
        const publicKey = await runCommand(`echo "${privateKey}" | wg pubkey`);
        const psk = await runCommand('wg genpsk');
        res.json({ private: privateKey, public: publicKey, psk: psk });
    } catch (error) {
        res.status(500).json({ error: 'Failed to generate keys', details: error.message });
    }
});

app.patch(`/interface/${WG_INTERFACE}`, async (req, res) => {
    try {
        await runCommand(`wg-quick up ${WG_INTERFACE}`);
        res.json({ message: `Interface ${WG_INTERFACE} started successfully.` });
    } catch (error) {
        res.status(500).json({ error: 'Failed to start interface', details: error.message });
    }
});

app.delete(`/interface/${WG_INTERFACE}`, async (req, res) => {
    try {
        await runCommand(`wg-quick down ${WG_INTERFACE}`);
        res.json({ message: `Interface ${WG_INTERFACE} stopped successfully.` });
    } catch (error) {
        res.status(500).json({ error: 'Failed to stop interface', details: error.message });
    }
});

app.post(`/interface/${WG_INTERFACE}/config`, async (req, res) => {
    const peers = req.body;

    if (!Array.isArray(peers) || peers.length === 0) {
        return res.status(400).json({ error: 'Request body must be a non-empty array of peers.' });
    }

    let allNewPeersConfig = '';
    
    for (const peer of peers) {
        const { allowedIps, persistentKeepalive, presharedKey, publicKey, title } = peer;

        if (!publicKey || !allowedIps) {
            return res.status(400).json({ 
                error: 'Each peer object must contain "publicKey" and "allowedIps".',
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
        
        console.log('Restarting interface to apply new peer configurations...');
        await runCommand(`wg-quick down ${WG_INTERFACE}`);
        await runCommand(`wg-quick up ${WG_INTERFACE}`);
        
        res.status(201).json({ message: `${peers.length} peers added and service restarted successfully.` });
    } catch (error) {
        res.status(500).json({ error: 'Failed to add peers to config file', details: error.message });
    }
});

app.listen(API_PORT, () => {
    console.log(`WireGuard API server for Linux is running on port ${API_PORT}`);
});