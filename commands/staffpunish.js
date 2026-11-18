const { SlashCommandBuilder, ActionRowBuilder, UserSelectMenuBuilder, EmbedBuilder, MessageFlags } = require("discord.js");
const config = require("../config/config");
module.exports = {
    data: new SlashCommandBuilder().setName("staffpunish").setDescription("Manage timeout for Administrator and Moderator staff members."),
    async execute(interaction) {
        if (!(config.staffManageID || []).filter(Boolean).includes(interaction.user.id)) return interaction.reply({ content: "❌ You are not authorized to manage staff punishments.", flags: MessageFlags.Ephemeral });
        const embed = new EmbedBuilder().setColor(0x5865F2).setTitle("🛡️ Staff Punishment Panel").setDescription("Choose an Administrator or Moderator to manage their timeout.");
        const row = new ActionRowBuilder().addComponents(new UserSelectMenuBuilder().setCustomId(`staffpunish_user:${interaction.user.id}`).setPlaceholder("Select a staff member").setMinValues(1).setMaxValues(1));
        return interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
    }
};
