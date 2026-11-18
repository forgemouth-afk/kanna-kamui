const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } = require("discord.js");
const { scheduleDisableButtons } = require("../utils/disableButtons");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("ban")
        .setDescription("Request to ban a user from this server.")
        .addUserOption(o => o.setName("user").setDescription("User to ban.").setRequired(true))
        .addStringOption(o => o.setName("reason").setDescription("Reason for the ban.").setMaxLength(500).setRequired(false))
        .addIntegerOption(o => o.setName("delete_days").setDescription("Days of message history to delete (0-7).").setMinValue(0).setMaxValue(7).setRequired(false)),
    async execute(interaction) {
        const allowed = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
            || interaction.memberPermissions?.has(PermissionFlagsBits.BanMembers);
        if (!allowed) return interaction.reply({ content: "❌ You need Ban Members or Administrator permission.", flags: MessageFlags.Ephemeral });

        const target = interaction.options.getUser("user", true);
        const reason = interaction.options.getString("reason") || "No reason provided.";
        const deleteDays = interaction.options.getInteger("delete_days") ?? 0;
        if (target.id === interaction.user.id) return interaction.reply({ content: "❌ You cannot ban yourself.", flags: MessageFlags.Ephemeral });
        if (target.id === interaction.guild.ownerId) return interaction.reply({ content: "❌ The server owner cannot be banned.", flags: MessageFlags.Ephemeral });

        const member = await interaction.guild.members.fetch(target.id).catch(() => null);
        if (member && !member.bannable) return interaction.reply({ content: "❌ I cannot ban this member. Check my Ban Members permission and role hierarchy.", flags: MessageFlags.Ephemeral });

        const embed = new EmbedBuilder().setColor(0xED4245).setTitle("⚠️ Confirm Member Ban")
            .setDescription(`**Moderator:** <@${interaction.user.id}>\n**Target:** <@${target.id}>\n**Reason:** ${reason}\n**Delete message history:** ${deleteDays} day(s)\n\nChoose **Accept** to ban this user or **Deny** to cancel.`)
            .setTimestamp();
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`moderation_ban_accept:${target.id}:${interaction.user.id}:${deleteDays}`).setLabel("Accept").setEmoji("✅").setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`moderation_ban_deny:${target.id}:${interaction.user.id}:${deleteDays}`).setLabel("Deny").setEmoji("❌").setStyle(ButtonStyle.Secondary)
        );
        await interaction.reply({ embeds: [embed], components: [row] });
        scheduleDisableButtons(interaction);
        return;
    }
};