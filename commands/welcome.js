const {
    MessageFlags,
    SlashCommandBuilder,
    ChannelType,
    PermissionFlagsBits
} = require("discord.js");
const GuildConfig = require("../models/GuildConfig");

module.exports = {
    adminOnly: true,
    data: new SlashCommandBuilder()
        .setName("welcome")
        .setDescription("Set welcome card and welcome chat channels.")
        .addChannelOption(option => option
            .setName("channel")
            .setDescription("Channel for the welcome image card.")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true))
        .addChannelOption(option => option
            .setName("messagechannel")
            .setDescription("Channel for the temporary welcome text message.")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
        const channel = interaction.options.getChannel("channel", true);
        const messageChannel = interaction.options.getChannel("messagechannel", true);
        await GuildConfig.findOneAndUpdate(
            { guildId: interaction.guildId },
            { $set: { welcomeChannelId: channel.id, welcomeMessageChannelId: messageChannel.id } },
            { upsert: true, new: true }
        );
        return interaction.reply({
            content: `✅ Welcome cards will be sent to ${channel}, and welcome messages will be sent to ${messageChannel} and deleted after 5 minutes.`,
            flags: MessageFlags.Ephemeral
        });
    }
};
