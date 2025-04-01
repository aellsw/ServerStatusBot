require("dotenv").config();
const { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder } = require("discord.js");
const { sendRconCommand } = require("./rcon");

// Environment Variables
const TOKEN = process.env.DISCORD_TOKEN;
const STATUS_CHANNEL_ID = process.env.STATUS_CHANNEL_ID;

// Retry configuration
const NORMAL_RETRY_DELAY = 30000; // 30 seconds
const RESTART_INITIAL_DELAY = 60000; // 1 minute
const RESTART_RETRY_DELAY = 30000; // 30 seconds

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildPresences
    ]
});

// Flag to track if server is in restart mode
let isInRestartMode = false;

// Function to update server status and player data
async function updateServerStatus(retryCount = 0, isRestarting = false) {
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

        // If it's 7:59 AM, set channel status to "Restarting" and enter restart mode
        if (hours === 7 && minutes === 59 && !isInRestartMode) {
            await statusChannel.setName("🟠 Restarting");
            console.log("🔄 Server restarting: Channel name set to '🟠 Restarting'");
            isInRestartMode = true;

            // Create "Restarting" embed
            const restartEmbed = new EmbedBuilder()
                .setColor(0xFFA500)
                .setTitle("🖥️ Isle Server Status")
                .setDescription("🟠 Isle Server is Restarting")
                .setTimestamp();

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
            } catch (editError) {
                await statusChannel.send({
                    content: "🟠 Server Restarting",
                    embeds: [restartEmbed]
                });
            }

            // Schedule first check after restart begins
            setTimeout(() => {
                updateServerStatus(0, true);
            }, RESTART_INITIAL_DELAY);

            return;
        }

        // Try to get player data via RCON (which will indicate server status)
        try {
            const playerResult = await sendRconCommand();

            // Debug log to check player data structure
            console.log("Player data received:", JSON.stringify(playerResult, null, 2));

            // If we get here, the server is online
            const serverStatus = {
                online: true,
                message: "🟢 Isle Server is Online!",
                emoji: "🟢",
                color: 0x00ff00,
                channelName: "🟢Online"
            };

            // If we were in restart mode, we're no longer restarting
            if (isInRestartMode) {
                isInRestartMode = false;
                console.log("✅ Server has successfully restarted and is now online");
            }

            // Update status channel name
            try {
                if (statusChannel.name !== serverStatus.channelName) {
                    await statusChannel.setName(serverStatus.channelName);
                    console.log(`✅ Channel renamed to: ${serverStatus.channelName}`);
                }
            } catch (renameError) {
                console.error("❌ Could not rename status channel:", renameError);
            }

            // Make sure playerResult has the expected structure
            if (!playerResult || !playerResult.playerDetails || !Array.isArray(playerResult.playerDetails)) {
                console.error("❌ Unexpected player data structure:", playerResult);
                playerResult = {
                    playerDetails: [],
                    uniqueIds: []
                };
            }

            // Create Comprehensive Status Embed
            const statusEmbed = new EmbedBuilder()
                .setColor(serverStatus.color)
                .setTitle("🖥️ Isle Server Status")
                .setDescription(serverStatus.message)
                .addFields(
                    { name: "Host", value: "TheDawnOfTime", inline: true },
                    {
                        name: "Total Players",
                        value: (playerResult.uniqueIds && playerResult.uniqueIds.length)
                            ? playerResult.uniqueIds.length.toString()
                            : playerResult.playerDetails.length.toString(),
                        inline: true
                    }
                )
                .setTimestamp();

            // Add player names to the embed if players exist
            if (playerResult.playerDetails.length > 0) {
                // Ensure each player has a name property
                const validPlayers = playerResult.playerDetails.filter(player => player && player.name);

                if (validPlayers.length > 0) {
                    const playerNames = validPlayers
                        .map(player => player.name.trim())
                        .filter(name => name)  // Remove empty names
                        .slice(0, 10)  // Limit to first 10 players
                        .join(", ");

                    statusEmbed.addFields({
                        name: "Current Players",
                        value: playerNames +
                            (validPlayers.length > 10
                                ? `\n+${validPlayers.length - 10} more`
                                : ""),
                        inline: false
                    });

                    // Log for debugging
                    console.log(`✅ Found ${validPlayers.length} players: ${playerNames}`);
                } else {
                    statusEmbed.addFields({
                        name: "Players",
                        value: "No player names available.",
                        inline: false
                    });
                }
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
                console.error("❌ Error updating status message:", editError);
                await statusChannel.send({
                    content: `${serverStatus.emoji} Server Status`,
                    embeds: [statusEmbed]
                });
            }

            console.log(`✅ Server status updated at ${now.toLocaleString()}`);

        } catch (rconError) {
            // RCON connection failed - server might be offline OR connection issue

            // If in restart mode, keep retrying without changing status
            if (isInRestartMode) {
                console.log(`🔄 Server still restarting. Retry attempt ${retryCount + 1} at ${now.toLocaleString()}`);
                setTimeout(() => {
                    updateServerStatus(retryCount + 1, true);
                }, RESTART_RETRY_DELAY);
                return;
            }

            // For normal operation, try one more time before declaring offline
            if (retryCount === 0) {
                console.log(`⚠️ RCON connection failed. Retrying in ${NORMAL_RETRY_DELAY / 1000} seconds...`);
                setTimeout(() => {
                    updateServerStatus(retryCount + 1);
                }, NORMAL_RETRY_DELAY);
                return;
            }

            // If still failing after retry, mark as offline
            const serverStatus = {
                online: false,
                message: "🔴 Isle Server is Offline",
                emoji: "🔴",
                color: 0xff0000,
                channelName: "🔴Offline"
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

            console.error(`❌ Server appears to be offline at ${now.toLocaleString()} after ${retryCount + 1} attempts:`, rconError);
        }

    } catch (error) {
        console.error("❌ Unexpected error in update process:", error);
    }
}

// Bot Ready Event
client.once("ready", async () => {
    console.log(`✅ Logged in as ${client.user.tag}`);

    // Register slash commands (to make the /update_server_status available)
    await client.application.commands.set([
        new SlashCommandBuilder()
            .setName('update_server_status')
            .setDescription('Manually updates the server status')
    ]);

    // Initial update
    await updateServerStatus();

    // Update every 3 minutes
    setInterval(() => updateServerStatus(0, isInRestartMode), 180000);
});

// Command handling for /update_server_status
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;

    if (interaction.commandName === 'update_server_status') {
        await interaction.reply('🔄 Updating server status...');

        // Call the function to update server status
        await updateServerStatus();

        // Reply after update
        await interaction.followUp('✅ Server status updated successfully.');
    }
});

// Log in the bot
client.login(TOKEN).catch((err) => {
    console.error("❌ Failed to log in:", err);
});
