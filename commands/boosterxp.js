const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const GuildConfig = require("../models/GuildConfig");

const durations = [
    { name: "1 jam", value: "1h", milliseconds: 60 * 60 * 1000 },
    { name: "6 jam", value: "6h", milliseconds: 6 * 60 * 60 * 1000 },
    { name: "12 jam", value: "12h", milliseconds: 12 * 60 * 60 * 1000 },
    { name: "1 hari", value: "1d", milliseconds: 24 * 60 * 60 * 1000 },
    { name: "2 hari", value: "2d", milliseconds: 2 * 24 * 60 * 60 * 1000 },
    { name: "3 hari", value: "3d", milliseconds: 3 * 24 * 60 * 60 * 1000 },
    { name: "7 hari", value: "7d", milliseconds: 7 * 24 * 60 * 60 * 1000 }
];

module.exports = {
    adminOnly: true,
    data: new SlashCommandBuilder()
        .setName("boosterxp")
        .setDescription("Activate a temporary XP multiplier for this server.")
        .addStringOption(option =>
            option.setName("time")
                .setDescription("How long the XP booster should last.")
                .setRequired(true)
                .addChoices(...durations.map(item => ({ name: item.name, value: item.value })))
        )
        .addStringOption(option =>
            option.setName("multiplier")
                .setDescription("XP multiplier (maximum 4x).")
                .setRequired(true)
                .addChoices(
                    { name: "2x XP", value: "2" },
                    { name: "3x XP", value: "3" },
                    { name: "4x XP", value: "4" }
                )
        ),
    async execute(interaction) {
        const durationValue = interaction.options.getString("time");
        const multiplier = Number(interaction.options.getString("multiplier"));
        const duration = durations.find(item => item.value === durationValue);

        if (!duration || ![2, 3, 4].includes(multiplier)) {
            return interaction.reply({ content: "❌ Pilihan booster XP tidak valid.", ephemeral: true });
        }

        const expiresAt = new Date(Date.now() + duration.milliseconds);
        await GuildConfig.findOneAndUpdate(
            { guildId: interaction.guildId },
            {
                $set: {
                    xpBoosterMultiplier: multiplier,
                    xpBoosterExpiresAt: expiresAt,
                    xpBoosterStartedBy: interaction.user.id
                },
                $setOnInsert: { guildId: interaction.guildId }
            },
            { upsert: true, new: true }
        );

        const embed = new EmbedBuilder()
            .setColor(0xF1C40F)
            .setTitle("🚀 XP Booster Activated!")
            .setDescription(`XP server sekarang mendapatkan **${multiplier}x multiplier**!`)
            .addFields(
                { name: "Multiplier", value: `**${multiplier}x XP**`, inline: true },
                { name: "Duration", value: `**${duration.name}**`, inline: true },
                { name: "Ends", value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:F>\n<t:${Math.floor(expiresAt.getTime() / 1000)}:R>` }
            )
            .setFooter({ text: `Activated by ${interaction.user.tag}` })
            .setTimestamp();

        return interaction.reply({ embeds: [embed] });
    }
};
