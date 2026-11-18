const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { rerollGiveaway } = require("../utils/giveawayManager");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("reroll")
        .setDescription("Reroll winner(s) for an ended giveaway.")
        .addStringOption(o => o.setName("giveaway_id").setDescription("Message ID of the giveaway.").setRequired(true)),
    async execute(interaction) {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            return interaction.reply({ content: "❌ You need Manage Server permission to reroll a giveaway.", ephemeral: true });
        }
        await interaction.deferReply({ ephemeral: true });
        const result = await rerollGiveaway(interaction.client, interaction.options.getString("giveaway_id", true));
        return interaction.editReply(result.message);
    }
};
