require("dotenv").config();
const net = require("net");

const RCON_IP = process.env.RCON_IP;
const RCON_PORT = parseInt(process.env.RCON_PORT);
const RCON_PASSWORD = process.env.RCON_PASSWORD;
const TIMEOUT = 20000; // 20 seconds timeout

async function sendRconCommand() {
    return new Promise((resolve, reject) => {
        const client = new net.Socket();
        let responseData = "";
        let loggedIn = false;

        client.setTimeout(TIMEOUT);

        client.connect(RCON_PORT, RCON_IP, () => {
            console.log(`Connected to RCON server (${RCON_IP}:${RCON_PORT}). Sending login...`);

            const loginPayload = Buffer.concat([
                Buffer.from([0x01]), // Login packet type
                Buffer.from(RCON_PASSWORD, "utf-8"),
                Buffer.from([0x00]) // Null terminator
            ]);

            client.write(loginPayload);
        });

        client.on("data", (data) => {
            responseData += data.toString();

            if (!loggedIn && responseData.includes("Accepted")) {
                loggedIn = true;
                console.log("Login successful!");

                setTimeout(() => {
                    console.log("Requesting player data");
                    const commandBuffer = Buffer.concat([
                        Buffer.from([0x02, 0x77]), // RCON_GETPLAYERDATA (0x77)
                        Buffer.from([0x00])
                    ]);
                    client.write(commandBuffer);
                }, 500);
            } else {
                const playerList = extractPlayerList(responseData);
                client.end();
                resolve(playerList);
            }
        });

        client.on("error", (err) => {
            client.destroy();
            reject(err.message);
        });

        client.on("timeout", () => {
            client.destroy();
            reject("Timeout occurred");
        });
    });
}

function extractPlayerList(response) {
    console.log("Raw Server Response:", response);

    // Initialize arrays and sets here
    const uniqueIds = new Set();
    const playerDetails = [];

    // Improved regex to capture all player formats
    const playerRegex = /(?:PlayerDataName|Name):\s*([^,]+),\s*PlayerID:\s*(\d+),\s*Location:[^,]+,\s*Class:\s*([^,\s]+)/g;

    let match;
    while ((match = playerRegex.exec(response)) !== null) {
        const [, rawName, id, playerClass] = match;
        const name = rawName.replace(/['"]/g, '').trim(); // Remove unwanted characters

        if (name && id) {
            // Avoid duplicate players
            if (!uniqueIds.has(id)) {
                uniqueIds.add(id);
                playerDetails.push({
                    id,
                    name,
                    class: playerClass
                });
                console.log(`✅ Found player: ${name} (${id})`);
            }
        }
    }

    console.log(`✅ Total players found: ${playerDetails.length}`);
    console.log("✅ Player list:", playerDetails.map(p => `${p.name} (${p.id})`).join(", "));

    return {
        uniqueIds: Array.from(uniqueIds),
        playerDetails: playerDetails,
        totalPlayers: playerDetails.length
    };
}

module.exports = { sendRconCommand };