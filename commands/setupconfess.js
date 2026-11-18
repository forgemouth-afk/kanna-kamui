const { SlashCommandBuilder, ChannelType, PermissionFlagsBits, MessageFlags } = require("discord.js");
const GuildConfig = require("../models/GuildConfig");

module.exports = {
    adminOnly: true,
    data: new SlashCommandBuilder()
        .setName("setupconfess")
        .setDescription("Set the channel where anonymous confessions are posted.")
        .addChannelOption(option => option.setName("channel").setDescription("Confession channel.").addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
        const channel = interaction.options.getChannel("channel", true);
        await GuildConfig.findOneAndUpdate({ guildId: interaction.guildId }, { $set: { confessionChannelId: channel.id } }, { upsert: true });
        return interaction.reply({ content: `✅ Confession channel configured: ${channel}.`, flags: MessageFlags.Ephemeral });
    }
};
