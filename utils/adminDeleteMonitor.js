const { AuditLogEvent, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Events, MessageFlags, PermissionFlagsBits } = require("discord.js");
const GuildConfig = require("../models/GuildConfig");
const AdminDeleteCase = require("../models/AdminDeleteCase");

function formatWIB(date = new Date()) {
    return new Intl.DateTimeFormat("id-ID", {
        timeZone: "Asia/Jakarta",
        dateStyle: "long",
        timeStyle: "medium",
        hour12: false
    }).format(date) + " WIB";
}

function getWIBDateKey(date = new Date()) {
    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Jakarta",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
}

function getPunishmentForCount(count) {
    if (count >= 10) return { action: "kick", label: "Softkick", button: "Softkick", style: ButtonStyle.Danger };
    if (count >= 7) return { action: "7d", label: "Timeout 1 week + 2 warns", button: "Timeout 7d + 2 Warns", style: ButtonStyle.Danger };
    if (count >= 5) return { action: "1h", label: "Timeout 1 hour + 1 warn", button: "Timeout 1h + Warn", style: ButtonStyle.Primary };
    if (count >= 3) return { action: "10m", label: "Timeout 10 minutes", button: "Timeout 10m", style: ButtonStyle.Secondary };
    return { action: "5m", label: "Timeout 5 minutes", button: "Timeout 5m", style: ButtonStyle.Secondary };
}

async function sendAdminDeleteAudit(guild, message, executor, deletedAt = new Date(), count = 1) {
    const cfg = await GuildConfig.findOne({ guildId: guild.id }).lean();
    if (!cfg?.auditLogChannelId) return;
    const channel = await guild.channels.fetch(cfg.auditLogChannelId).catch(() => null);
    if (!channel?.isTextBased()) return;
    const embed = new EmbedBuilder().setColor(0xED4245).setTitle("🛡️ Staff Deleted a Member Message")
        .setDescription(`**Message author:** <@${message.author.id}>\n**Deleted by:** <@${executor.id}>\n**Channel:** <#${message.channelId}>\n**Deleted at:** ${formatWIB(deletedAt)}\n**Deleted count today:** ${count}x\n\n**Message:**\n${String(message.content || "*Content unavailable*").slice(0, 3000)}`)
        .setTimestamp();
    await channel.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch(() => null);
}

async function resetDailyCasesWIB() {
    const today = getWIBDateKey();
    await AdminDeleteCase.updateMany(
        { resetDateWIB: { $ne: today } },
        { $set: { count: 0, warnCount: 0, resetDateWIB: today, windowStartedAt: new Date() } }
    );
}

async function handleStaffDelete(message) {
    if (message.partial) await message.fetch().catch(() => null);
    if (!message.guild || !message.author || message.author.bot) return;
    const cfg = await GuildConfig.findOne({ guildId: message.guild.id }).lean();
    if (!cfg?.adminDeleteChannelId || !cfg.adminDeleteRoleIds?.length) return;
    await new Promise(resolve => setTimeout(resolve, 1400));
    const logs = await message.guild.fetchAuditLogs({ type: AuditLogEvent.MessageDelete, limit: 8 }).catch(() => null);
    if (!logs) return;
    const entry = logs.entries.find(item => item.target?.id === message.author.id && item.extra?.channel?.id === message.channelId && Date.now() - item.createdTimestamp < 10000);
    if (!entry?.executorId || entry.executorId === message.client.user.id) return;
    const executor = await message.guild.members.fetch(entry.executorId).catch(() => null);
    if (!executor || !executor.roles.cache.some(role => cfg.adminDeleteRoleIds.includes(role.id))) return;

    const today = getWIBDateKey();
    let record = await AdminDeleteCase.findOne({ guildId: message.guild.id, targetId: message.author.id });
    if (!record) record = new AdminDeleteCase({ guildId: message.guild.id, targetId: message.author.id, resetDateWIB: today });
    if (record.resetDateWIB !== today) {
        record.count = 0;
        record.warnCount = 0;
        record.resetDateWIB = today;
    }
    record.count += 1;
    record.updatedAt = new Date();
    await record.save();

    await sendAdminDeleteAudit(message.guild, message, entry.executor, new Date(), record.count);

    const deletedAuthor = await message.guild.members.fetch(message.author.id).catch(() => null);
    const isConfiguredStaffAuthor = deletedAuthor?.roles.cache.some(role => cfg.adminDeleteRoleIds.includes(role.id));
    if (isConfiguredStaffAuthor) return;

    const alertChannel = await message.guild.channels.fetch(cfg.adminDeleteChannelId).catch(() => null);
    if (!alertChannel?.isTextBased()) return;
    const rolesText = cfg.adminDeleteRoleIds.map(id => `<@&${id}>`).join(" ");
    const punishment = getPunishmentForCount(record.count);
    const embed = new EmbedBuilder().setColor(0xF1C40F).setTitle("⚠️ Staff Deletion Review")
        .setDescription(`**Deleted member:** <@${message.author.id}>\n**Deleted by:** <@${entry.executorId}>\n**Channel:** <#${message.channelId}>\n**Detected at:** ${formatWIB(new Date())}\n**Deleted-message count today:** ${record.count}x\n**Suggested action:** ${punishment.label}\n\n**Deleted message:**\n${String(message.content || "*Content unavailable*").slice(0, 2500)}`)
        .setTimestamp();
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`admindel_punish:${message.guild.id}:${message.author.id}:${punishment.action}`).setLabel(punishment.button).setStyle(punishment.style)
    );
    await alertChannel.send({ content: rolesText, embeds: [embed], components: [row], allowedMentions: { roles: cfg.adminDeleteRoleIds, users: [] } }).catch(() => null);
}

async function handleAdminDeleteButton(interaction) {
    const [, guildId, targetId, action] = interaction.customId.split(":");
    const cfg = await GuildConfig.findOne({ guildId }).lean();
    if (!cfg || !cfg.adminDeleteRoleIds?.length || !interaction.member.roles.cache.some(role => cfg.adminDeleteRoleIds.includes(role.id))) {
        return interaction.reply({ content: "❌ Only configured staff roles can apply this punishment.", flags: MessageFlags.Ephemeral });
    }
    const target = await interaction.guild.members.fetch(targetId).catch(() => null);
    if (!target) return interaction.reply({ content: "❌ Target member is no longer in this server.", flags: MessageFlags.Ephemeral });
    const me = interaction.guild.members.me;
    if (!me.permissions.has(PermissionFlagsBits.ModerateMembers) || !me.permissions.has(PermissionFlagsBits.KickMembers)) return interaction.reply({ content: "❌ Bot needs Moderate Members and Kick Members permissions.", flags: MessageFlags.Ephemeral });
    if (action === "kick") await target.kick("Staff deletion escalation: softkick");
    else {
        const durations = { "5m": 300000, "10m": 600000, "1h": 3600000, "7d": 604800000 };
        await target.timeout(durations[action], "Staff deletion escalation");
        if (action === "1h" || action === "7d") {
            await AdminDeleteCase.updateOne({ guildId, targetId }, { $inc: { warnCount: action === "1h" ? 1 : 2 } });
        }
    }
    await interaction.message.delete().catch(() => null);
    return interaction.reply({ content: `✅ ${target.user.tag} has been punished.`, flags: MessageFlags.Ephemeral });
}

function startAdminDeleteMonitor(client) {
    resetDailyCasesWIB().catch(error => console.error("[AdminDelete reset]", error));
    setInterval(() => resetDailyCasesWIB().catch(error => console.error("[AdminDelete reset]", error)), 60000);
    client.on(Events.MessageDelete, message => handleStaffDelete(message).catch(error => console.error("[AdminDelete]", error)));
    client.on(Events.MessageDeleteBulk, messages => {
        for (const message of messages.values()) handleStaffDelete(message).catch(error => console.error("[AdminDelete] bulk", error));
    });
}
module.exports = { startAdminDeleteMonitor, handleAdminDeleteButton };
