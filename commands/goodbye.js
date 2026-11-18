const {
    SlashCommandBuilder,
    ChannelType,
    PermissionFlagsBits
} = require("discord.js");
const GuildConfig = require("../models/GuildConfig");

module.exports = {
    adminOnly: true,
    data: new SlashCommandBuilder()
        .setName("goodbye")
        .setDescription("Set the channel for leaving member goodbye cards.")
        .addChannelOption(option =>
            option.setName("channel")
                .setDescription("Channel where goodbye cards will be sent.")
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
        const channel = interaction.options.getChannel("channel", true);

        await GuildConfig.findOneAndUpdate(
            { guildId: interaction.guildId },
            { $set: { goodbyeChannelId: channel.id } },
            { upsert: true, new: true }
        );

        return interaction.reply({
            content: `✅ Goodbye cards for departing members will be sent to ${channel}.`,
            flags: MessageFlags.Ephemeral
        });
    }
};
