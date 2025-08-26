const runCommand = require('../utils/runCommand')
const getWindowExePath = require('../utils/getWindowExePath');
const path = require('path');

(async function () {
    let command;

    if (process.platform === 'win32') {
        const wgExe = await getWindowExePath();
        command = `"${wgExe}" /installtunnelservice ${path.resolve('./config/wg0.conf')}`
    } else {
        command = `wg-quick up ${path.resolve('./config/wg0.conf')}`
    }

    console.log("STARTING WIREGUARD SERVER");
    await runCommand(command);
    console.log("WIREGUARD IS RUNNING!");
})(); 





