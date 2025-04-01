require("dotenv").config();
const net = require("net");

const RCON_IP = process.env.RCON_IP;
const RCON_PORT = parseInt(process.env.RCON_PORT);
const RCON_PASSWORD = process.env.RCON_PASSWORD;
const TIMEOUT = 20000; // 20 seconds timeout
const RETRY_ATTEMPTS = 2; // Number of retry attempts for connection issues

async function sendRconCommand(retryCount = 0) {
    return new Promise((resolve, reject) => {
        const client = new net.Socket();
        let responseData = "";
        let loggedIn = false;
        let responseReceived = false; // ✅ Track if response has been received
        let responseTimer = null;

        client.setTimeout(TIMEOUT);

        client.connect(RCON_PORT, RCON_IP, () => {
            console.log(`Connected to RCON server (${RCON_IP}:${RCON_PORT}). Sending login...`);
            client.write(Buffer.concat([
                Buffer.from([0x01]),
                Buffer.from(RCON_PASSWORD, "utf-8"),
                Buffer.from([0x00])
            ]));
        });

        client.on("data", (data) => {
            responseData += data.toString();

            if (!loggedIn && responseData.includes("Accepted")) {
                loggedIn = true;
                console.log("Login successful!");

                setTimeout(() => {
                    console.log("Requesting player data");
                    client.write(Buffer.concat([
                        Buffer.from([0x02, 0x77]),
                        Buffer.from([0x00])
                    ]));

                    responseTimer = setTimeout(() => {
                        console.log("Response timeout - ending connection");
                        client.end();
                        resolve({ uniqueIds: [], playerDetails: [] });
                    }, 5000);
                }, 500);
            } else if (loggedIn) {
                clearTimeout(responseTimer);

                if (responseData.includes("PlayerDataName") || responseData.includes("Name:")) {
                    responseReceived = true; // ✅ Mark response as received
                    const playerList = extractPlayerList(responseData);
                    client.end();
                    resolve(playerList);
                }
            }
        });

        client.on("error", (err) => {
            client.destroy();
            clearTimeout(responseTimer);

            if (retryCount < RETRY_ATTEMPTS && !responseReceived) { // ✅ Only retry if no data received
                console.log(`RCON connection error (attempt ${retryCount + 1}): ${err.message}. Retrying...`);
                setTimeout(() => {
                    sendRconCommand(retryCount + 1).then(resolve).catch(reject);
                }, 2000);
            } else {
                reject(`RCON connection failed after ${retryCount + 1} attempts: ${err.message}`);
            }
        });

        client.on("timeout", () => {
            client.destroy();
            clearTimeout(responseTimer);

            if (retryCount < RETRY_ATTEMPTS && !responseReceived) { // ✅ Stop retrying if data was received
                console.log(`RCON connection timeout (attempt ${retryCount + 1}). Retrying...`);
                setTimeout(() => {
                    sendRconCommand(retryCount + 1).then(resolve).catch(reject);
                }, 2000);
            } else {
                reject(`RCON connection timed out after ${retryCount + 1} attempts`);
            }
        });

        client.on("end", () => {
            clearTimeout(responseTimer);
            console.log("RCON connection closed");
        });
    });
}

function extractPlayerList(response) {
    //console.log("Raw Server Response:", response);

    // ✅ Handle "No Players Connected" case
    if (response.includes("No Players Connected")) {
        return {
            uniqueIds: [],
            playerDetails: []
        };
    }

    const uniqueIds = new Set();
    const playerDetails = [];

    // ✅ Improved regex to capture **ALL** player formats
    const playerRegex = /(?:PlayerDataName|Name):\s*([^,]+),\s*PlayerID:\s*(\d+),\s*Location:[^,]+,\s*Class:\s*([^,\s]+)/g;

    let match;
    while ((match = playerRegex.exec(response)) !== null) {
        const [, rawName, id, playerClass] = match;
        const name = rawName.replace(/['"]/g, '').trim(); // Remove unwanted characters

        if (name && id) {
            // ✅ Avoid duplicate players
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
        playerDetails: playerDetails
    };
}

module.exports = { sendRconCommand };
