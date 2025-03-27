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

        // If it's 7:59 AM, set channel status to "Restarting"
        if (hours === 7 && minutes === 59) {
            await statusChannel.setName("🟠 Restarting");
            console.log("🔄 Server restarting: Channel name set to '🟠 Restarting'");
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
                    { name: "Total Players", value: playerResult.uniqueIds.length.toString(), inline: true }
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