const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { showReminderList } = require("../utils/reminderManager");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("reminder")
        .setDescription("View and manage your reminders. Administrators can manage all server reminders."),
    async execute(interaction) {
        if (!interaction.guildId) {
            return interaction.reply({ content: "❌ This command can only be used inside a server.", flags: MessageFlags.Ephemeral });
        }
        return showReminderList(interaction, 0);
    }
};
