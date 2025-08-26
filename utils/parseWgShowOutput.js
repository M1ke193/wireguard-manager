function parseWgShowOutput(output) {
    if (!output) {
        throw new Error("output of status is empty")
    }

    const lines = output.split('\n');

    const result = {
        peers: [],
        port: null,
        publicKey: null,
    };

    let currentPeer = null;

    lines.forEach(line => {
        line = line.trim();
        const publicKeyMatch = line.match(/public key: (.+)/);
        if (publicKeyMatch) result.publicKey = publicKeyMatch[1];
        
        const portMatch = line.match(/listening port: (.+)/);
        if (portMatch) result.port = parseInt(portMatch[1], 10);
        
        const peerMatch = line.match(/peer: (.+)/);
        if (peerMatch) {
            if (currentPeer) result.peers.push(currentPeer);
            currentPeer = { publicKey: peerMatch[1] };
        }

        if (currentPeer) {
            const endpointMatch = line.match(/endpoint: (.+)/);
            if (endpointMatch) currentPeer.endpoint = endpointMatch[1];
            
            const allowedIpsMatch = line.match(/allowed ips: (.+)/);
            if (allowedIpsMatch) currentPeer.allowedIps = allowedIpsMatch[1];
            
            const handshakeMatch = line.match(/latest handshake: (.+)/);
            if (handshakeMatch) currentPeer.latestHandshake = handshakeMatch[1];

            const transferMatch = line.match(/transfer: (.+)/);
            currentPeer.transfer = {
                received : "0 MiB",
                sent : "0 MiB"
            }
            if (transferMatch) {
                const parts = transferMatch[1].split(', ');
                currentPeer.transfer = {
                    received: parts[0],
                    sent: parts[1]
                };
            }
        }
    });

    if (currentPeer) result.peers.push(currentPeer);
    return result;
}

module.exports = parseWgShowOutput;