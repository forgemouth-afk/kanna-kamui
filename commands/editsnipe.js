const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { buildSnipePage } = require("../utils/snipePages");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("editsnipe")
        .setDescription("Show edited messages in this channel."),
    async execute(interaction) {
        const entries = interaction.client.editSnipes?.get(interaction.channelId) || [];
        if (!entries.length) return interaction.reply({ content: "❌ There is no edited message to snipe in this channel.", ephemeral: true });
        return interaction.reply(buildSnipePage("editsnipe", interaction.channelId, entries, 0, interaction.user.id, interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)));
    }
};
