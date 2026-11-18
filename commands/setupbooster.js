const { SlashCommandBuilder, ChannelType, PermissionFlagsBits, MessageFlags } = require("discord.js");
const GuildConfig = require("../models/GuildConfig");

module.exports = {
    adminOnly: true,
    data: new SlashCommandBuilder()
        .setName("setupbooster")
        .setDescription("Set the channel for server boost notifications.")
        .addChannelOption(option => option
            .setName("channel")
            .setDescription("Channel for boost notifications.")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
        const channel = interaction.options.getChannel("channel", true);
        await GuildConfig.findOneAndUpdate(
            { guildId: interaction.guildId },
            { $set: { boosterChannelId: channel.id } },
            { upsert: true, new: true }
        );
        return interaction.reply({
            content: `✅ Booster notifications will be sent to ${channel}.`,
            flags: MessageFlags.Ephemeral
        });
    }
};
