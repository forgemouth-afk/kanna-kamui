const {
    MessageFlags,
    SlashCommandBuilder,
    PermissionFlagsBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder
} = require("discord.js");

module.exports = {
    adminOnly: true,
    data: new SlashCommandBuilder()
        .setName("resetlevel")
        .setDescription("Request a level reset for one member or every member.")
        .addUserOption(option =>
            option.setName("user")
                .setDescription("Member to reset. Leave empty to reset all members.")
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
        const target = interaction.options.getUser("user");
        if (target?.bot) {
            return interaction.reply({
                content: "❌ Bot accounts do not have leveling data.",
                flags: MessageFlags.Ephemeral
            });
        }

        const targetId = target?.id ?? "all";
        const targetText = target ? `<@${target.id}>` : "**All server members**";

        const embed = new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle("⚠️ Confirm Level Reset")
            .setDescription(
                `Administrator <@${interaction.user.id}> requested to reset leveling data for ${targetText}.\n\n` +
                "Press **Accept** to reset the selected leveling data, or **Deny** to cancel."
            )
            .addFields({
                name: "Reset Target",
                value: target ? `<@${target.id}>` : "All members in this server",
                inline: true
            })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`levelreset_accept:${targetId}:${interaction.user.id}`)
                .setLabel("Accept")
                .setEmoji("✅")
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`levelreset_deny:${targetId}:${interaction.user.id}`)
                .setLabel("Deny")
                .setEmoji("❌")
                .setStyle(ButtonStyle.Secondary)
        );

        return interaction.reply({ embeds: [embed], components: [row] });
    }
};