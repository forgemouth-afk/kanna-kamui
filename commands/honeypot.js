const { SlashCommandBuilder, ChannelType, PermissionFlagsBits, MessageFlags, EmbedBuilder } = require("discord.js");
const GuildConfig = require("../models/GuildConfig");
const { toContainerPayload } = require("../utils/container");

module.exports = {
    adminOnly: true,
    data: new SlashCommandBuilder()
        .setName("honeypot")
        .setDescription("Configure a channel that automatically times out members who message in it.")
        .addChannelOption(o => o.setName("channel").setDescription("Honeypot text channel.").addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
        const channel = interaction.options.getChannel("channel", true);
        await GuildConfig.findOneAndUpdate(
            { guildId: interaction.guildId },
            { $set: { honeypotChannelId: channel.id } },
            { upsert: true, new: true }
        );

        const warning = new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle("🚨 HONEYPOT — DO NOT SEND MESSAGES")
            .setDescription(
                "This channel is monitored automatically. **Members must not send messages here.**\n\n" +
                "Any non-administrator member who sends a message will receive an automatic **28-day timeout**, and their message will be deleted.\n\n" +
                "This channel is reserved for bot monitoring."
            )
            .setFooter({ text: "Server administrators are exempt from the automatic timeout." })
            .setTimestamp();

        const warningMessage = await channel.send(toContainerPayload({ embeds: [warning] })).catch(error => {
            console.error("Could not send honeypot warning:", error);
            return null;
        });

        return interaction.reply({
            content: warningMessage
                ? `✅ Honeypot configured for ${channel}. A warning message has been posted there. Non-admin members who send messages will receive a 28-day timeout.`
                : `⚠️ Honeypot configured for ${channel}, but I could not post the warning. Please give me permission to send messages and embed links in that channel.`,
            flags: MessageFlags.Ephemeral
        });
    }
};