const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");
const { buildLogView } = require("../utils/commandLogs");

module.exports = {
    adminOnly: true,
    data: new SlashCommandBuilder()
        .setName("log")
        .setDescription("View command usage logs for this server.")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
        return interaction.reply({
            ...await buildLogView(interaction.guildId, interaction.user.id, 1),
            flags: MessageFlags.Ephemeral
        });
    }
};
