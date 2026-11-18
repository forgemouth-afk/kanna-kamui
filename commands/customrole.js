const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionFlagsBits
} = require("discord.js");
const CustomRole = require("../models/CustomRole");
const { buildCustomRolePanel } = require("../utils/customRoleManager");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("customrole")
        .setDescription("Open your booster custom role control panel."),
    async execute(interaction) {
        const member = await interaction.guild.members.fetch(interaction.user.id);
        if (!member.premiumSince) {
            return interaction.reply({ content: "❌ You must be actively boosting this server to use a custom role.", ephemeral: true });
        }

        const record = await CustomRole.findOne({ guildId: interaction.guildId, ownerId: member.id });
        if (!record) {
            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle("🎭 Booster Custom Role")
                .setDescription("You do not have a custom role yet. Create your personal role to get started.")
                .setFooter({ text: "One custom role per active server booster." });
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId("customrole_create").setLabel("Create Custom Role").setEmoji("➕").setStyle(ButtonStyle.Success)
            );
            return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
        }

        return interaction.reply({ ...await buildCustomRolePanel(interaction.guild, member, record), ephemeral: true });
    }
};
