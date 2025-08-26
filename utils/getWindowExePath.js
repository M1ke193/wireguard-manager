const runCommand = require('../utils/runCommand')
const path = require('path');
const fs = require('fs/promises');

const getWindowExePath = async () => {
    try {
        const stdout = await runCommand('where wg');
        const wgPath = stdout.trim();

        const wireguardDir = path.dirname(wgPath);
        const wireguardExePath = path.join(wireguardDir, 'wireguard.exe');

        await fs.access(wireguardExePath);

        return wireguardExePath;
    } catch {
        throw new Error('Not found wireguard.exe on the system or PATH');
    }
}

module.exports = getWindowExePath;