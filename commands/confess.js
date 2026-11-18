const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require("discord.js");
const GuildConfig = require("../models/GuildConfig");
const Confession = require("../models/Confession");
const { toContainerPayload } = require("../utils/container");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("confess")
        .setDescription("Send an anonymous confession.")
        .addStringOption(option => option.setName("message").setDescription("Your confession.").setMaxLength(1800).setRequired(true)),
    async execute(interaction) {
        const content = interaction.options.getString("message", true).trim();
        if (!content) return interaction.reply({ content: "❌ Confession cannot be empty.", flags: MessageFlags.Ephemeral });
        const config = await GuildConfig.findOne({ guildId: interaction.guildId });
        if (!config?.confessionChannelId) return interaction.reply({ content: "❌ Confessions have not been configured by an administrator.", flags: MessageFlags.Ephemeral });
        const channel = await interaction.guild.channels.fetch(config.confessionChannelId).catch(() => null);
        if (!channel || !channel.isTextBased()) return interaction.reply({ content: "❌ The configured confession channel is unavailable.", flags: MessageFlags.Ephemeral });

        const updatedConfig = await GuildConfig.findOneAndUpdate(
            { guildId: interaction.guildId },
            { $inc: { confessionCounter: 1 } },
            { new: true }
        );
        const confessionId = String(updatedConfig.confessionCounter).padStart(5, "0");

        if (config.latestConfessionMessageId) {
            const previous = await channel.messages.fetch(config.latestConfessionMessageId).catch(() => null);
            if (previous) {
                const retained = previous.components
                    .filter(component => component.type === 17)
                    .map(component => component.toJSON());
                await previous.edit(toContainerPayload({ components: retained })).catch(() => null);
            }
        }

        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle(`💌 Anonymous Confession #${confessionId}`)
            .setDescription(content)
            .setFooter({ text: "Use the Reply button to start a private-to-this-channel discussion thread." })
            .setTimestamp();
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`confess_reply:${confessionId}`).setLabel("Reply / Create Thread").setEmoji("💬").setStyle(ButtonStyle.Primary)
        );
        const posted = await channel.send(toContainerPayload({ embeds: [embed], components: [row], allowedMentions: { parse: [] } }));
        await Confession.create({ guildId: interaction.guildId, confessionId, messageId: posted.id, channelId: channel.id, authorId: interaction.user.id, content });
        await GuildConfig.updateOne(
            { guildId: interaction.guildId },
            { $set: { latestConfessionMessageId: posted.id } }
        );
        return interaction.reply({ content: `✅ Your confession was submitted anonymously. ID: **${confessionId}**`, flags: MessageFlags.Ephemeral });
    }
};
