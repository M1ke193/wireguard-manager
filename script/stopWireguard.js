const runCommand = require('../utils/runCommand')
const getWindowExePath = require('../utils/getWindowExePath');
const path = require('path');

(async function () {
    let command;

    if (process.platform === 'win32') {
        const wgExe = await getWindowExePath();
        command = `"${wgExe}" /uninstalltunnelservice wg0`
    } else {
        command = `wg-quick down ${path.resolve('./config/wg0.conf')}`
    }

    console.log("STOPPING WIREGUARD SERVER");
    await runCommand(command);
    console.log("WIREGUARD IS STOPPING!");
})(); 





