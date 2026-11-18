const {
    SlashCommandBuilder,
    ChannelType,
    MessageFlags,
    PermissionFlagsBits
} = require("discord.js");
const Reminder = require("../models/Reminder");

function parseDuration(input) {
    const match = String(input).trim().match(/^(\d+)\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)$/i);
    if (!match) return null;
    const amount = Number(match[1]);
    const unit = match[2].toLowerCase();
    const multiplier = unit.startsWith("s") ? 1000
        : unit.startsWith("m") ? 60000
        : unit.startsWith("h") ? 3600000
        : 86400000;
    const duration = amount * multiplier;
    return Number.isSafeInteger(duration) && duration >= 10000 && duration <= 365 * 86400000 ? duration : null;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("setreminder")
        .setDescription("Create a one-time or repeating reminder.")
        .addStringOption(option => option
            .setName("destination")
            .setDescription("Where the reminder should be sent.")
            .addChoices(
                { name: "Channel", value: "channel" },
                { name: "Private Message", value: "pm" }
            )
            .setRequired(true))
        .addStringOption(option => option
            .setName("format")
            .setDescription("Send the reminder as an embed or plain message.")
            .addChoices(
                { name: "Embed", value: "embed" },
                { name: "Non-embed", value: "non-embed" }
            )
            .setRequired(true))
        .addStringOption(option => option
            .setName("mode")
            .setDescription("Send once or repeat automatically.")
            .addChoices(
                { name: "Auto", value: "auto" },
                { name: "Non-auto", value: "non-auto" }
            )
            .setRequired(true))
        .addStringOption(option => option
            .setName("timer")
            .setDescription("Examples: 30m, 2h, 1d.")
            .setRequired(true))
        .addStringOption(option => option
            .setName("message")
            .setDescription("Reminder message.")
            .setMaxLength(2000)
            .setRequired(true))
        .addChannelOption(option => option
            .setName("channel")
            .setDescription("Target channel (defaults to this channel).")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false)),
    async execute(interaction) {
        if (!interaction.guildId) {
            return interaction.reply({ content: "❌ This command can only be used inside a server.", flags: MessageFlags.Ephemeral });
        }

        const destination = interaction.options.getString("destination", true);
        const format = interaction.options.getString("format", true);
        const mode = interaction.options.getString("mode", true);
        const timer = interaction.options.getString("timer", true);
        const message = interaction.options.getString("message", true).trim();
        const intervalMs = parseDuration(timer);

        if (!intervalMs) {
            return interaction.reply({
                content: "❌ Invalid timer. Use a format such as `30s`, `15m`, `2h`, or `1d` (minimum 10 seconds, maximum 365 days).",
                flags: MessageFlags.Ephemeral
            });
        }
        if (!message) {
            return interaction.reply({ content: "❌ Reminder message cannot be empty.", flags: MessageFlags.Ephemeral });
        }

        const channel = destination === "channel"
            ? interaction.options.getChannel("channel") || interaction.channel
            : null;
        if (destination === "channel" && (!channel?.isTextBased() || !channel.send)) {
            return interaction.reply({ content: "❌ The selected destination is not a text channel I can send messages to.", flags: MessageFlags.Ephemeral });
        }

        const reminder = await Reminder.create({
            guildId: interaction.guildId,
            userId: interaction.user.id,
            destination,
            channelId: channel?.id || null,
            repeat: mode === "auto",
            embed: format === "embed",
            creatorIsAdmin: Boolean(interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)),
            intervalMs,
            message,
            nextRunAt: new Date(Date.now() + intervalMs)
        });

        const timerLabel = timer.trim();
        return interaction.reply({
            content: `✅ Reminder created successfully.\n**Destination:** ${destination === "pm" ? "Private Message" : channel}\n**Format:** ${format === "embed" ? "Embed" : "Non-embed"}\n**Mode:** ${mode === "auto" ? "Auto (repeats)" : "Non-auto (once)"}\n**Timer:** ${timerLabel}\n**Message:** ${message}\n**Reminder ID:** \`${reminder._id || reminder.id}\``,
            flags: MessageFlags.Ephemeral
        });
    }
};
