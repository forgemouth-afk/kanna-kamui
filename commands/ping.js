const { SlashCommandBuilder } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("ping")
        .setDescription("Check the bot latency."),
    async execute(interaction) {
        const sent = await interaction.reply({
            content: "🏓 Checking latency...",
            fetchReply: true
        });

        const latency = sent.createdTimestamp - interaction.createdTimestamp;
        await interaction.editReply(
            `🏓 Pong!\nBot latency: **${latency}ms**\nWebSocket ping: **${interaction.client.ws.ping}ms**`
        );
    }
};