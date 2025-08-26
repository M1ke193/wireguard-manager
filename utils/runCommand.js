const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

async function runCommand(command) {
    console.log(`Executing: ${command}`);
    try {
        const { stdout, stderr } = await execPromise(command);
        if (stderr) {
            console.error(`Error: ${stderr}`);
            throw new Error(stderr);
        }
        return stdout.trim();
    } catch (error) {
        console.error(`Exec failed: ${error.message}`);
        throw error;
    }
}

module.exports = runCommand;
