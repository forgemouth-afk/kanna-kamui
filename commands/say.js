const { SlashCommandBuilder, MessageFlags } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("say")
        .setDescription("Make the bot send a message in this channel.")
        .addStringOption(option =>
            option.setName("text")
                .setDescription("Message the bot should send.")
                .setMaxLength(2000)
                .setRequired(true)
        ),
    async execute(interaction) {
        const text = interaction.options.getString("text", true)
            .replace(/@everyone/gi, "@\u200beveryone")
            .replace(/@here/gi, "@\u200bhere");

        if (!interaction.channel?.isTextBased() || !interaction.channel.send) {
            return interaction.reply({
                content: "❌ I cannot send messages in this channel.",
                flags: MessageFlags.Ephemeral
            });
        }

        await interaction.channel.send({
            content: text,
            allowedMentions: { parse: [] }
        });

        return interaction.reply({
            content: "✅ Message sent.",
            flags: MessageFlags.Ephemeral
        });
    }
};
