require("dotenv").config();
const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const { sendRconCommand } = require("./rcon");

// Environment Variables
const TOKEN = process.env.DISCORD_TOKEN;
const STATUS_CHANNEL_ID = process.env.STATUS_CHANNEL_ID;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildPresences
    ]
});

// Track if we're in restart mode
let isInRestartMode = false;
let restartTimer = null;

// Function to update server status and player data
async function updateServerStatus() {
    try {
        // Validate channel configuration
        if (!STATUS_CHANNEL_ID) {
            console.error("❌ STATUS_CHANNEL_ID is not set in .env file!");
            return;
        }

        const statusChannel = client.channels.cache.get(STATUS_CHANNEL_ID);

        if (!statusChannel) {
            console.error("❌ Could not find the status channel!");
            return;
        }

        // Get current system time
        const now = new Date();
        const hours = now.getHours();
        const minutes = now.getMinutes();

        // If it's 7:59 AM and not already in restart mode, set channel status to "Restarting"
        if (hours === 7 && minutes === 59 && !isInRestartMode) {
            isInRestartMode = true;
            console.log("🔄 Server restart initiated at", now.toLocaleString());
            await statusChannel.setName("🟠 Restarting");

            // Create restart status embed
            const restartEmbed = new EmbedBuilder()
                .setColor(0xFFA500) // Orange color
                .setTitle("🖥️ Isle Server Status")
                .setDescription("🟠 Isle Server is Restarting")
                .setTimestamp();

            // Send or update status message
            try {
                const statusMessages = await statusChannel.messages.fetch({ limit: 1 });
                const lastStatusMessage = statusMessages.first();

                if (lastStatusMessage && lastStatusMessage.author.id === client.user.id) {
                    await lastStatusMessage.edit({
                        content: "🟠 Server Restarting",
                        embeds: [restartEmbed]
                    });
                } else {
                    await statusChannel.send({
                        content: "🟠 Server Restarting",
                        embeds: [restartEmbed]
                    });
                }
            } catch (error) {
                console.error("❌ Error updating restart message:", error);
            }

            // Wait 1 minute before starting restart checks
            console.log("⏱️ Waiting 1 minute before starting restart checks...");

            // Clear any existing restart timer
            if (restartTimer !== null) {
                clearInterval(restartTimer);
            }

            // Wait 1 minute, then start checking every 30 seconds
            setTimeout(() => {
                console.log("🔍 Starting restart checks every 30 seconds...");
                restartTimer = setInterval(checkServerDuringRestart, 30000);
                // Do an immediate check
                checkServerDuringRestart();
            }, 60000);

            return;
        }

        // If we're in restart mode, skip the normal update
        if (isInRestartMode) {
            return;
        }

        // Try to get player data via RCON (which will indicate server status)
        try {
            const playerResult = await sendRconCommand();

            const serverStatus = {
                online: true,
                message: "🟢 Isle Server is Online!",
                emoji: "🟢",
                color: 0x00ff00,
                channelName: "🟢 Online"
            };

            // Update status channel name
            try {
                if (statusChannel.name !== serverStatus.channelName) {
                    await statusChannel.setName(serverStatus.channelName);
                    console.log(`✅ Channel renamed to: ${serverStatus.channelName}`);
                }
            } catch (renameError) {
                console.error("❌ Could not rename status channel:", renameError);
            }

            // Create Comprehensive Status Embed
            const statusEmbed = new EmbedBuilder()
                .setColor(serverStatus.color)
                .setTitle("🖥️ Isle Server Status")
                .setDescription(serverStatus.message)
                .addFields(
                    { name: "Host", value: "TheDawnOfTime", inline: true },
                    { name: "Total Players", value: playerResult.totalPlayers.toString(), inline: true }
                )
                .setTimestamp();

            // Add player names to the embed if players exist
            if (playerResult.playerDetails.length > 0) {
                const playerNames = playerResult.playerDetails
                    .map(player => player.name)
                    .slice(0, 10)  // Limit to first 10 players
                    .join(", ");

                statusEmbed.addFields({
                    name: "Current Players",
                    value: playerNames +
                        (playerResult.playerDetails.length > 10
                            ? `\n+${playerResult.playerDetails.length - 10} more`
                            : ""),
                    inline: false
                });
            } else {
                statusEmbed.addFields({
                    name: "Players",
                    value: "No players currently on the server.",
                    inline: false
                });
            }

            // Update or send status message
            try {
                const statusMessages = await statusChannel.messages.fetch({ limit: 1 });
                const lastStatusMessage = statusMessages.first();

                if (lastStatusMessage && lastStatusMessage.author.id === client.user.id) {
                    await lastStatusMessage.edit({
                        content: `${serverStatus.emoji} Last Updated`,
                        embeds: [statusEmbed]
                    });
                } else {
                    await statusChannel.send({
                        content: `${serverStatus.emoji} Server Status`,
                        embeds: [statusEmbed]
                    });
                }
            } catch (editError) {
                await statusChannel.send({
                    content: `${serverStatus.emoji} Server Status`,
                    embeds: [statusEmbed]
                });
            }

            console.log(`✅ Server status updated at ${now.toLocaleString()}`);

        } catch (rconError) {
            // RCON connection failed - server is likely offline
            const serverStatus = {
                online: false,
                message: "🔴 Isle Server is Offline",
                emoji: "🔴",
                color: 0xff0000,
                channelName: "🔴 Offline"
            };

            // Update status channel name
            try {
                if (statusChannel.name !== serverStatus.channelName) {
                    await statusChannel.setName(serverStatus.channelName);
                    console.log(`✅ Channel renamed to: ${serverStatus.channelName}`);
                }
            } catch (renameError) {
                console.error("❌ Could not rename status channel:", renameError);
            }

            // Create offline status embed
            const statusEmbed = new EmbedBuilder()
                .setColor(serverStatus.color)
                .setTitle("🖥️ Isle Server Status")
                .setDescription(serverStatus.message)
                .setTimestamp();

            // Send or update status message
            try {
                const statusMessages = await statusChannel.messages.fetch({ limit: 1 });
                const lastStatusMessage = statusMessages.first();

                if (lastStatusMessage && lastStatusMessage.author.id === client.user.id) {
                    await lastStatusMessage.edit({
                        content: `${serverStatus.emoji} Last Updated`,
                        embeds: [statusEmbed]
                    });
                } else {
                    await statusChannel.send({
                        content: `${serverStatus.emoji} Server Status`,
                        embeds: [statusEmbed]
                    });
                }
            } catch (editError) {
                await statusChannel.send({
                    content: `${serverStatus.emoji} Server Status`,
                    embeds: [statusEmbed]
                });
            }

            console.error(`❌ Server appears to be offline at ${now.toLocaleString()}:`, rconError);
        }

    } catch (error) {
        console.error("❌ Unexpected error in update process:", error);
    }
}

// Function to check server during restart mode
async function checkServerDuringRestart() {
    if (!isInRestartMode) return;

    console.log("🔍 Checking if server is back online after restart...");

    try {
        const statusChannel = client.channels.cache.get(STATUS_CHANNEL_ID);
        if (!statusChannel) {
            console.error("❌ Could not find the status channel for restart check!");
            return;
        }

        // Try to connect to the server via RCON
        await sendRconCommand();

        // If we get here, connection was successful - server is back online
        console.log("🎉 Server is back online after restart!");

        // Clear the restart timer
        if (restartTimer !== null) {
            clearInterval(restartTimer);
            restartTimer = null;
        }

        // Exit restart mode
        isInRestartMode = false;

        // Update channel to online
        await statusChannel.setName("🟢 Online");

        // Create online status embed
        const onlineEmbed = new EmbedBuilder()
            .setColor(0x00ff00)
            .setTitle("🖥️ Isle Server Status")
            .setDescription("🟢 Isle Server is Online!")
            .setFooter({ text: "Server restart completed successfully" })
            .setTimestamp();

        // Update status message
        try {
            const statusMessages = await statusChannel.messages.fetch({ limit: 1 });
            const lastStatusMessage = statusMessages.first();

            if (lastStatusMessage && lastStatusMessage.author.id === client.user.id) {
                await lastStatusMessage.edit({
                    content: "🟢 Server Back Online",
                    embeds: [onlineEmbed]
                });
            } else {
                await statusChannel.send({
                    content: "🟢 Server Back Online",
                    embeds: [onlineEmbed]
                });
            }
        } catch (error) {
            console.error("❌ Error updating online message after restart:", error);
        }

        // Run a full status update
        setTimeout(updateServerStatus, 5000);

    } catch (error) {
        console.log("⏳ Server still restarting, will check again in 30 seconds");
    }
}

// Bot Ready Event
client.once("ready", async () => {
    console.log(`✅ Logged in as ${client.user.tag}`);

    // Initial update
    await updateServerStatus();

    // Update every 3 minutes
    setInterval(updateServerStatus, 180000);
});

// Log in the bot
client.login(TOKEN).catch((err) => {
    console.error("❌ Failed to log in:", err);
});