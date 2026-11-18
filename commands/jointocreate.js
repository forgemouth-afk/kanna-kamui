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
        .setName("jointocreate")
        .setDescription("Set the voice channel that creates personal voice rooms.")
        .addChannelOption(option =>
            option.setName("channel")
                .setDescription("The Join to Create voice channel.")
                .addChannelTypes(ChannelType.GuildVoice)
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
        const channel = interaction.options.getChannel("channel", true);

        await GuildConfig.findOneAndUpdate(
            { guildId: interaction.guildId },
            { $set: { triggerChannelId: channel.id } },
            { upsert: true, new: true }
        );

        return interaction.reply({
            content: `✅ Join to Create is now set to ${channel}. Members who join it will receive their own voice room.`,
            flags: MessageFlags.Ephemeral
        });
    }
};