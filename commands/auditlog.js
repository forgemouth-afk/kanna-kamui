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
        .setName("auditlog")
        .setDescription("Set the channel for server activity logs.")
        .addChannelOption(option =>
            option.setName("channel")
                .setDescription("The channel where audit logs will be sent.")
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
        const channel = interaction.options.getChannel("channel", true);

        await GuildConfig.findOneAndUpdate(
            { guildId: interaction.guildId },
            { $set: { auditLogChannelId: channel.id } },
            { upsert: true, new: true }
        );

        return interaction.reply({
            content: `✅ Audit logging is now enabled in ${channel}.`,
            flags: MessageFlags.Ephemeral
        });
    }
};