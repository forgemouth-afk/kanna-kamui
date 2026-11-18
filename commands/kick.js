const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } = require("discord.js");
const { scheduleDisableButtons } = require("../utils/disableButtons");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("kick")
        .setDescription("Request to kick a member from this server.")
        .addUserOption(o => o.setName("user").setDescription("Member to kick.").setRequired(true))
        .addStringOption(o => o.setName("reason").setDescription("Reason for the kick.").setMaxLength(500).setRequired(false)),
    async execute(interaction) {
        const allowed = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
            || interaction.memberPermissions?.has(PermissionFlagsBits.KickMembers);
        if (!allowed) return interaction.reply({ content: "❌ You need Kick Members or Administrator permission.", flags: MessageFlags.Ephemeral });

        const target = await interaction.guild.members.fetch(interaction.options.getUser("user", true).id).catch(() => null);
        const reason = interaction.options.getString("reason") || "No reason provided.";
        if (!target) return interaction.reply({ content: "❌ That member is not in this server.", flags: MessageFlags.Ephemeral });
        if (target.id === interaction.user.id) return interaction.reply({ content: "❌ You cannot kick yourself.", flags: MessageFlags.Ephemeral });
        if (target.id === interaction.guild.ownerId) return interaction.reply({ content: "❌ The server owner cannot be kicked.", flags: MessageFlags.Ephemeral });
        if (!target.kickable) return interaction.reply({ content: "❌ I cannot kick this member. Check my Kick Members permission and role hierarchy.", flags: MessageFlags.Ephemeral });

        const embed = new EmbedBuilder().setColor(0xFEE75C).setTitle("⚠️ Confirm Member Kick")
            .setDescription(`**Moderator:** <@${interaction.user.id}>\n**Target:** <@${target.id}>\n**Reason:** ${reason}\n\nChoose **Accept** to kick this member or **Deny** to cancel.`)
            .setTimestamp();
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`moderation_kick_accept:${target.id}:${interaction.user.id}`).setLabel("Accept").setEmoji("✅").setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`moderation_kick_deny:${target.id}:${interaction.user.id}`).setLabel("Deny").setEmoji("❌").setStyle(ButtonStyle.Secondary)
        );
        await interaction.reply({ embeds: [embed], components: [row] });
        scheduleDisableButtons(interaction);
        return;
    }
};