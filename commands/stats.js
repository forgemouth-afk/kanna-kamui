const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const mongoose = require("mongoose");

const modelFiles = [
    "GuildConfig",
    "UserLevel",
    "VoiceRoom",
    "Confession",
    "StarboardPost",
    "Giveaway",
    "Reminder"
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName("stats")
        .setDescription("Show bot, runtime, library, and database statistics."),
    async execute(interaction) {
        await interaction.deferReply();

        const client = interaction.client;
        const memory = process.memoryUsage();
        const uptimeSeconds = Math.floor(process.uptime());
        const days = Math.floor(uptimeSeconds / 86400);
        const hours = Math.floor((uptimeSeconds % 86400) / 3600);
        const minutes = Math.floor((uptimeSeconds % 3600) / 60);
        const seconds = uptimeSeconds % 60;
        const uptime = `${days}d ${hours}h ${minutes}m ${seconds}s`;
        const db = mongoose.connection.db;
        let collectionsText = "Database belum terhubung.";

        if (db && mongoose.connection.readyState === 1) {
            try {
                const collections = await db.listCollections({}, { nameOnly: true }).toArray();
                const lines = [];

                for (const collection of collections) {
                    const count = await db.collection(collection.name).estimatedDocumentCount().catch(() => 0);
                    lines.push(`• \`${collection.name}\`: **${count.toLocaleString()}** dokumen`);
                }

                collectionsText = lines.length ? lines.join("\n") : "Belum ada collection.";
            } catch (error) {
                collectionsText = `Gagal membaca collection: ${error.message}`;
            }
        }

        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle(`📊 ${client.user.username} — Bot Statistics`)
            .setThumbnail(client.user.displayAvatarURL({ size: 256 }))
            .addFields(
                {
                    name: "🤖 Bot",
                    value: [
                        `**Tag:** ${client.user.tag}`,
                        `**ID:** \`${client.user.id}\``,
                        `**Servers:** ${client.guilds.cache.size.toLocaleString()}`,
                        `**Users (cached):** ${client.guilds.cache.reduce((total, guild) => total + guild.memberCount, 0).toLocaleString()}`,
                        `**Uptime:** ${uptime}`,
                        `**WebSocket Ping:** ${client.ws.ping} ms`
                    ].join("\n"),
                    inline: true
                },
                {
                    name: "🧩 Runtime & Libraries",
                    value: [
                        `**Node.js:** ${process.version}`,
                        `**Discord.js:** ${require("discord.js").version}`,
                        `**Mongoose:** ${mongoose.version}`,
                        `**Canvacord:** ${require("../package.json").dependencies.canvacord}`,
                        `**Platform:** ${process.platform} (${process.arch})`,
                        `**RAM:** ${(memory.rss / 1024 / 1024).toFixed(1)} MB RSS`
                    ].join("\n"),
                    inline: true
                },
                {
                    name: "🗄️ MongoDB",
                    value: [
                        `**Status:** ${mongoose.connection.readyState === 1 ? "🟢 Connected" : "🔴 Disconnected"}`,
                        `**Database:** \`${db?.databaseName || "Unknown"}\``,
                        `**Host:** \`${mongoose.connection.host || "Unknown"}\``
                    ].join("\n")
                },
                {
                    name: "📚 Database Collections",
                    value: collectionsText.slice(0, 1024)
                },
                {
                    name: "🧱 Bot Data Models",
                    value: modelFiles.map(name => `• \`${name}\``).join("\n"),
                    inline: true
                }
            )
            .setFooter({ text: `Requested by ${interaction.user.tag}` })
            .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
    }
};
