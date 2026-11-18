const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    EmbedBuilder,
    MessageFlags,
    PermissionFlagsBits
} = require("discord.js");
const config = require("../config/config");
const StaffRoleRestore = require("../models/StaffRoleRestore");

function authorized(userId) {
    return (config.staffManageID || []).filter(Boolean).includes(userId);
}

function staffRole(member) {
    return member.roles.cache.filter(role => ["administrator", "moderator"].includes(role.name.toLowerCase()));
}

async function handleStaffPunishSelect(interaction) {
    const ownerId = interaction.customId.split(":")[1];
    if (interaction.user.id !== ownerId || !authorized(interaction.user.id)) return interaction.reply({ content: "❌ This panel is not yours or you are not authorized.", flags: MessageFlags.Ephemeral });
    const member = await interaction.guild.members.fetch(interaction.values[0]).catch(() => null);
    if (!member || !staffRole(member).size) return interaction.reply({ content: "❌ Select a member with Administrator or Moderator role.", flags: MessageFlags.Ephemeral });
    const embed = new EmbedBuilder().setColor(0x5865F2).setTitle("🛡️ Staff Punishment Management").setDescription(`**Member:** ${member}\n**Roles:** ${staffRole(member).map(role => role.name).join(", ")}\n**Timeout:** ${member.communicationDisabledUntil ? `<t:${Math.floor(member.communicationDisabledUntilTimestamp / 1000)}:F>` : "Not timed out"}`);
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`staffpunish_timeout:${ownerId}:${member.id}`).setLabel("Set Timeout").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`staffpunish_remove:${ownerId}:${member.id}`).setLabel("Remove Timeout").setStyle(ButtonStyle.Success)
    );
    return interaction.update({ embeds: [embed], components: [row] });
}

async function handleStaffPunishButton(interaction) {
    const [action, ownerId, memberId] = interaction.customId.split(":");
    if (interaction.user.id !== ownerId || !authorized(interaction.user.id)) return interaction.reply({ content: "❌ You are not authorized to use this panel.", flags: MessageFlags.Ephemeral });
    const member = await interaction.guild.members.fetch(memberId).catch(() => null);
    if (!member) return interaction.reply({ content: "❌ Member not found.", flags: MessageFlags.Ephemeral });
    if (action === "staffpunish_timeout") {
        const modal = new ModalBuilder().setCustomId(`staffpunish_modal:${ownerId}:${memberId}`).setTitle("Set Staff Timeout");
        const input = new TextInputBuilder().setCustomId("duration").setLabel("Duration (e.g. 30m, 12h, 7d, 28d)").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(10);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return interaction.showModal(modal);
    }
    const record = await StaffRoleRestore.findOne({ guildId: interaction.guildId, userId: memberId });
    if (member.communicationDisabledUntilTimestamp && member.communicationDisabledUntilTimestamp > Date.now()) await member.timeout(null, "Staff timeout manually removed").catch(() => null);
    if (record?.roleIds?.length) {
        await member.roles.add(record.roleIds.filter(id => interaction.guild.roles.cache.has(id)), "Restore staff roles after timeout removed").catch(() => null);
        await record.deleteOne();
    }
    return interaction.reply({ content: `✅ Timeout removed for ${member}.`, flags: MessageFlags.Ephemeral });
}

async function handleStaffPunishModal(interaction) {
    const [, ownerId, memberId] = interaction.customId.split(":");
    if (interaction.user.id !== ownerId || !authorized(interaction.user.id)) return interaction.reply({ content: "❌ You are not authorized.", flags: MessageFlags.Ephemeral });
    const raw = interaction.fields.getTextInputValue("duration").trim().match(/^(\d+)\s*(m|h|d)$/i);
    if (!raw) return interaction.reply({ content: "❌ Use minutes, hours, or days, for example `30m`, `12h`, or `28d`.", flags: MessageFlags.Ephemeral });
    const amount = Number(raw[1]);
    const unit = raw[2].toLowerCase();
    const ms = amount * (unit === "m" ? 60000 : unit === "h" ? 3600000 : 86400000);
    if (!Number.isSafeInteger(ms) || ms < 60000 || ms > 28 * 86400000) return interaction.reply({ content: "❌ Timeout must be between 1 minute and Discord's 28-day maximum.", flags: MessageFlags.Ephemeral });
    const member = await interaction.guild.members.fetch(memberId).catch(() => null);
    if (!member || !staffRole(member).size) return interaction.reply({ content: "❌ Staff member not found or staff roles are already absent.", flags: MessageFlags.Ephemeral });
    const me = interaction.guild.members.me;
    if (!me.permissions.has(PermissionFlagsBits.ModerateMembers) || !me.permissions.has(PermissionFlagsBits.ManageRoles)) return interaction.reply({ content: "❌ Bot needs Moderate Members and Manage Roles permissions.", flags: MessageFlags.Ephemeral });
    const roles = staffRole(member).filter(role => role.editable);
    if (!roles.size) return interaction.reply({ content: "❌ Bot role must be above the staff roles it manages.", flags: MessageFlags.Ephemeral });
    await StaffRoleRestore.findOneAndUpdate({ guildId: interaction.guildId, userId: memberId }, { $set: { roleIds: roles.map(role => role.id), restoreAt: new Date(Date.now() + ms) } }, { upsert: true });
    await member.roles.remove(roles, "Temporarily remove staff roles during timeout");
    await member.timeout(ms, "Staff punishment panel");
    return interaction.reply({ content: `✅ ${member} timed out for ${raw[1]}${unit}. Staff roles will be restored when the timeout expires.`, flags: MessageFlags.Ephemeral });
}

function startStaffRoleRestoreMonitor(client) {
    const run = async () => {
        const due = await StaffRoleRestore.find({ restoreAt: { $lte: new Date() } }).limit(100);
        for (const item of due) {
            const guild = client.guilds.cache.get(item.guildId);
            const member = guild ? await guild.members.fetch(item.userId).catch(() => null) : null;
            if (member) {
                const roles = item.roleIds.filter(id => guild.roles.cache.has(id));
                if (roles.length) await member.roles.add(roles, "Restore staff roles after timeout expiry").catch(() => null);
            }
            await item.deleteOne();
        }
    };
    run().catch(console.error);
    setInterval(() => run().catch(console.error), 60000);
}

module.exports = { handleStaffPunishSelect, handleStaffPunishButton, handleStaffPunishModal, startStaffRoleRestoreMonitor };
