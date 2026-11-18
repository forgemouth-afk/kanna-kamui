const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { buildSnipePage } = require("../utils/snipePages");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("snipe")
        .setDescription("Show deleted messages in this channel."),
    async execute(interaction) {
        const entries = interaction.client.snipes?.get(interaction.channelId) || [];
        if (!entries.length) return interaction.reply({ content: "❌ There is no deleted message to snipe in this channel.", ephemeral: true });
        return interaction.reply(buildSnipePage("snipe", interaction.channelId, entries, 0, interaction.user.id, interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)));
    }
};
