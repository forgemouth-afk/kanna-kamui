const { SlashCommandBuilder, ChannelType, MessageFlags } = require("discord.js");
const GuildConfig = require("../models/GuildConfig");

module.exports = {
    adminOnly: true,
    data: new SlashCommandBuilder()
        .setName("autothread")
        .setDescription("Enable automatic image threads in a channel.")
        .addChannelOption(option => option
            .setName("channel")
            .setDescription("Channel where image posts automatically create threads.")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true)),
    async execute(interaction) {
        const channel = interaction.options.getChannel("channel", true);
        const config = await GuildConfig.findOneAndUpdate(
            { guildId: interaction.guildId },
            { $addToSet: { autoThreadChannelIds: channel.id } },
            { upsert: true, new: true }
        );
        return interaction.reply({
            content: `✅ Auto-thread is enabled in ${channel}. Image posts will automatically create a thread. Text-only messages inside those threads will be removed.`,
            flags: MessageFlags.Ephemeral
        });
    }
};
