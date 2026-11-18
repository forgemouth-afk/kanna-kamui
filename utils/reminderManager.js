const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    MessageFlags,
    PermissionFlagsBits,
    StringSelectMenuBuilder,
    RoleSelectMenuBuilder,
    UserSelectMenuBuilder
} = require("discord.js");
const Reminder = require("../models/Reminder");

const PAGE_SIZE = 5;
let schedulerRunning = false;

function formatDuration(ms) {
    const units = [
        [86400000, "d"],
        [3600000, "h"],
        [60000, "m"],
        [1000, "s"]
    ];
    for (const [size, label] of units) {
        if (ms % size === 0) return `${ms / size}${label}`;
    }
    return `${Math.ceil(ms / 1000)}s`;
}

function parseDuration(input) {
    const match = String(input).trim().match(/^(\d+)\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)$/i);
    if (!match) return null;
    const amount = Number(match[1]);
    const unit = match[2].toLowerCase();
    const multiplier = unit.startsWith("s") ? 1000
        : unit.startsWith("m") ? 60000
        : unit.startsWith("h") ? 3600000
        : 86400000;
    const duration = amount * multiplier;
    return Number.isSafeInteger(duration) && duration >= 10000 && duration <= 365 * 86400000 ? duration : null;
}

function isAdmin(interaction) {
    return Boolean(interaction.memberPermissions?.has(PermissionFlagsBits.Administrator));
}

function canManage(interaction, reminder) {
    return reminder.userId === interaction.user.id || isAdmin(interaction);
}

function getReminderId(reminder) {
    return String(reminder?._id || reminder?.id || "");
}

function buildReminderView(interaction, reminders, page, adminView, selectedId = null, manageMode = false) {
    const totalPages = Math.max(1, Math.ceil(reminders.length / PAGE_SIZE));
    const start = page * PAGE_SIZE;
    const current = reminders.slice(start, start + PAGE_SIZE);
    const selected = current.find(reminder => getReminderId(reminder) === selectedId)
        || (reminders.length === 1 ? reminders[0] : null);
    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(adminView ? "⏰ Server Reminders" : "⏰ Your Reminders")
        .setDescription(reminders.length
            ? `Showing ${start + 1}–${Math.min(start + PAGE_SIZE, reminders.length)} of ${reminders.length} reminder(s).${selected ? `\n\n**Selected reminder:** ${getReminderId(selected)}` : "\n\nSelect a reminder below to edit or delete it."}`
            : "You don't have any reminders yet.")
        .setFooter({ text: `Page ${page + 1}/${totalPages} • Auto reminders repeat until deleted` });

    for (const reminder of current) {
        const reminderId = getReminderId(reminder);
        const destination = reminder.destination === "pm" ? "Private Message" : `<#${reminder.channelId}>`;
        const nextRunAt = reminder.nextRunAt instanceof Date ? reminder.nextRunAt : new Date(reminder.nextRunAt);
        const next = Number.isNaN(nextRunAt.getTime()) ? "Unknown" : `<t:${Math.floor(nextRunAt.getTime() / 1000)}:R>`;
        embed.addFields({
            name: `${reminder.repeat ? "🔁 Auto" : "🔔 One-time"} • ${reminderId}`,
            value: [
                `**Created by:** <@${reminder.userId}>`,
                `**Destination:** ${destination}`,
                `**Format:** ${reminder.embed ? "Embed" : "Non-embed"}`,
                `**Interval:** ${formatDuration(reminder.intervalMs)}`,
                `**Next send:** ${next}`,
                `**Message:** ${String(reminder.message || "").slice(0, 700)}`
            ].join("\n").slice(0, 1024)
        });
    }

    const components = [];
    if (reminders.length > 1 && current.length) {
        components.push(new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`reminder_select:${interaction.user.id}:${page}:${adminView ? "all" : "mine"}`)
                .setPlaceholder("Select a reminder to manage")
                .addOptions(current.map(reminder => ({
                    label: `${reminder.repeat ? "Auto" : "One-time"} • ${getReminderId(reminder).slice(-12)}`.slice(0, 100),
                    description: String(reminder.message || "No message").slice(0, 100),
                    value: getReminderId(reminder),
                    default: selected ? getReminderId(selected) === getReminderId(reminder) : false
                })))
        ));
    }

    if (selected) {
        const reminderId = getReminderId(selected);
        if (isAdmin(interaction)) {
            components.push(new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`reminder_role:${reminderId}:${interaction.user.id}:${adminView ? "all" : "mine"}`)
                    .setLabel("Add Role Mention")
                    .setEmoji("🏷️")
                    .setStyle(ButtonStyle.Secondary)
            ));
            components.push(new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`reminder_user:${reminderId}:${interaction.user.id}:${adminView ? "all" : "mine"}`)
                    .setLabel("Add User Mention")
                    .setEmoji("👤")
                    .setStyle(ButtonStyle.Secondary)
            ));
        }
        if (isAdmin(interaction) && !adminView && !manageMode) {
            components.push(new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`reminder_manage:${reminderId}:${interaction.user.id}:mine`)
                    .setLabel("Manage Selected")
                    .setEmoji("⚙️")
                    .setStyle(ButtonStyle.Primary)
            ));
        } else {
            components.push(new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`reminder_edit:${reminderId}:${interaction.user.id}:${adminView ? "all" : "mine"}`)
                    .setLabel("Edit Selected")
                    .setEmoji("✏️")
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`reminder_delete:${reminderId}:${interaction.user.id}:${adminView ? "all" : "mine"}`)
                    .setLabel("Delete Selected")
                    .setEmoji("🗑️")
                    .setStyle(ButtonStyle.Danger)
            ));
        }
    }

    if (isAdmin(interaction)) {
        components.push(new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(adminView ? `reminder_mine:${interaction.user.id}` : `reminder_members:${interaction.user.id}`)
                .setLabel(adminView ? "Your Reminders" : "Check Member Reminders")
                .setEmoji(adminView ? "👤" : "👥")
                .setStyle(ButtonStyle.Secondary)
        ));
    }

    if (totalPages > 1) {
        components.push(new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`reminder_page:${Math.max(0, page - 1)}:${interaction.user.id}:${adminView ? "all" : "mine"}`)
                .setLabel("Previous")
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page <= 0),
            new ButtonBuilder()
                .setCustomId(`reminder_page:${Math.min(totalPages - 1, page + 1)}:${interaction.user.id}:${adminView ? "all" : "mine"}`)
                .setLabel("Next")
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page >= totalPages - 1)
        ));
    }

    return { content: null, embeds: [embed], components, flags: MessageFlags.Ephemeral };
}

async function getVisibleReminders(interaction, ownOnly = false) {
    const filter = { guildId: interaction.guildId };
    if (!isAdmin(interaction) || ownOnly) filter.userId = interaction.user.id;
    return Reminder.find(filter).sort({ createdAt: -1 }).lean();
}

async function showReminderList(interaction, page = 0, selectedId = null, ownOnly = false, manageMode = false) {
    const reminders = await getVisibleReminders(interaction, ownOnly);
    const totalPages = Math.max(1, Math.ceil(reminders.length / PAGE_SIZE));
    const safePage = Math.min(Math.max(0, page), totalPages - 1);
    const adminView = isAdmin(interaction) && !ownOnly;
    const payload = buildReminderView(interaction, reminders, safePage, adminView, selectedId, manageMode);
    if (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isRoleSelectMenu()) return interaction.update(payload);
    if (interaction.deferred || interaction.replied) return interaction.editReply(payload);
    return interaction.reply(payload);
}

async function handleReminderSelect(interaction) {
    const [, ownerId, pageRaw, scope] = interaction.customId.split(":");
    if (ownerId !== interaction.user.id) {
        return interaction.reply({ content: "❌ This reminder panel belongs to another user. Run `/reminder` to open your own panel.", flags: MessageFlags.Ephemeral });
    }
    const selectedId = interaction.values?.[0];
    const reminder = await Reminder.findOne({ _id: selectedId, guildId: interaction.guildId });
    if (!reminder || !canManage(interaction, reminder)) {
        return interaction.reply({ content: "❌ This reminder no longer exists or you cannot manage it.", flags: MessageFlags.Ephemeral });
    }
    return showReminderList(interaction, Number(pageRaw) || 0, getReminderId(reminder), scope === "mine");
}

async function handleReminderButton(interaction) {
    const [action, id, ownerId, scope] = interaction.customId.split(":");
    const panelOwnerId = ["reminder_mine", "reminder_members"].includes(action) ? id : ownerId;
    if (panelOwnerId !== interaction.user.id) {
        return interaction.reply({ content: "❌ This reminder panel belongs to another user. Run `/reminder` to open your own panel.", flags: MessageFlags.Ephemeral });
    }

    if (action === "reminder_mine") {
        return showReminderList(interaction, 0, null, true);
    }

    if (action === "reminder_members") {
        if (!isAdmin(interaction)) {
            return interaction.reply({ content: "❌ Administrator permission is required.", flags: MessageFlags.Ephemeral });
        }
        return showReminderList(interaction, 0, null, false);
    }

    if (action === "reminder_manage") {
        const reminder = await Reminder.findOne({ _id: id, guildId: interaction.guildId });
        if (!reminder || !canManage(interaction, reminder)) {
            return interaction.reply({ content: "❌ This reminder no longer exists or you cannot manage it.", flags: MessageFlags.Ephemeral });
        }
        return showReminderList(interaction, 0, getReminderId(reminder), scope === "mine", true);
    }

    if (action === "reminder_role") {
        if (!isAdmin(interaction)) {
            return interaction.reply({ content: "❌ Administrator permission is required to add role mentions.", flags: MessageFlags.Ephemeral });
        }
        const reminder = await Reminder.findOne({ _id: id, guildId: interaction.guildId });
        if (!reminder || !canManage(interaction, reminder)) {
            return interaction.reply({ content: "❌ This reminder no longer exists or you cannot manage it.", flags: MessageFlags.Ephemeral });
        }
        const row = new ActionRowBuilder().addComponents(
            new RoleSelectMenuBuilder()
                .setCustomId(`reminder_role_select:${getReminderId(reminder)}:${interaction.user.id}:${scope}`)
                .setPlaceholder("Select a role to mention")
                .setMinValues(1)
                .setMaxValues(1)
        );
        return interaction.update({
            content: "🏷️ Select a role to add its mention to this reminder message. Only administrators can configure role mentions.",
            components: [row]
        });
    }

    if (action === "reminder_user") {
        if (!isAdmin(interaction)) {
            return interaction.reply({ content: "❌ Administrator permission is required to add user mentions.", flags: MessageFlags.Ephemeral });
        }
        const reminder = await Reminder.findOne({ _id: id, guildId: interaction.guildId });
        if (!reminder || !canManage(interaction, reminder)) {
            return interaction.reply({ content: "❌ This reminder no longer exists or you cannot manage it.", flags: MessageFlags.Ephemeral });
        }
        const row = new ActionRowBuilder().addComponents(
            new UserSelectMenuBuilder()
                .setCustomId(`reminder_user_select:${getReminderId(reminder)}:${interaction.user.id}:${scope}`)
                .setPlaceholder("Select a user to mention")
                .setMinValues(1)
                .setMaxValues(1)
        );
        return interaction.update({
            content: "👤 Select a user to add their mention to this reminder message. Only administrators can configure user mentions.",
            components: [row]
        });
    }

    if (action === "reminder_page") {
        const page = Number(id);
        if (!Number.isInteger(page) || page < 0) {
            return interaction.reply({ content: "❌ Invalid reminder page.", flags: MessageFlags.Ephemeral });
        }
        return showReminderList(interaction, page, null, scope === "mine");
    }

    const reminder = await Reminder.findOne({ _id: id, guildId: interaction.guildId });
    if (!reminder) {
        return interaction.reply({ content: "❌ This reminder no longer exists.", flags: MessageFlags.Ephemeral });
    }
    if (!canManage(interaction, reminder)) {
        return interaction.reply({ content: "❌ You cannot manage this reminder.", flags: MessageFlags.Ephemeral });
    }

    if (action === "reminder_delete") {
        await Reminder.deleteOne({ _id: reminder._id });
        return showReminderList(interaction, 0, null, scope === "mine");
    }

    if (action === "reminder_edit") {
        const modal = new ModalBuilder()
            .setCustomId(`reminder_edit_modal:${getReminderId(reminder)}:${interaction.user.id}`)
            .setTitle("Edit Reminder");
        const timerInput = new TextInputBuilder()
            .setCustomId("timer")
            .setLabel("Timer (e.g. 30m, 2h, 1d)")
            .setStyle(TextInputStyle.Short)
            .setValue(formatDuration(reminder.intervalMs))
            .setRequired(true)
            .setMaxLength(20);
        const messageInput = new TextInputBuilder()
            .setCustomId("message")
            .setLabel("Reminder message")
            .setStyle(TextInputStyle.Paragraph)
            .setValue(String(reminder.message || "").slice(0, 2000))
            .setRequired(true)
            .setMaxLength(2000);
        const formatInput = new TextInputBuilder()
            .setCustomId("format")
            .setLabel("Format: embed or non-embed")
            .setStyle(TextInputStyle.Short)
            .setValue(reminder.embed ? "embed" : "non-embed")
            .setRequired(true)
            .setMaxLength(10);
        modal.addComponents(
            new ActionRowBuilder().addComponents(timerInput),
            new ActionRowBuilder().addComponents(messageInput),
            new ActionRowBuilder().addComponents(formatInput)
        );
        return interaction.showModal(modal);
    }
}

async function handleReminderRoleSelect(interaction) {
    const [, id, ownerId, scope] = interaction.customId.split(":");
    if (ownerId !== interaction.user.id || !isAdmin(interaction)) {
        return interaction.reply({ content: "❌ Only administrators who opened this panel can add role mentions.", flags: MessageFlags.Ephemeral });
    }
    const reminder = await Reminder.findOne({ _id: id, guildId: interaction.guildId });
    if (!reminder || !canManage(interaction, reminder)) {
        return interaction.reply({ content: "❌ This reminder no longer exists or you cannot manage it.", flags: MessageFlags.Ephemeral });
    }
    const roleId = interaction.values?.[0];
    const role = interaction.guild.roles.cache.get(roleId) || await interaction.guild.roles.fetch(roleId).catch(() => null);
    if (!role || role.id === interaction.guild.id || role.managed) {
        return interaction.reply({ content: "❌ That role cannot be mentioned by this reminder.", flags: MessageFlags.Ephemeral });
    }
    const roleMention = `<@&${role.id}>`;
    if (!String(reminder.message || "").includes(roleMention)) {
        const updatedMessage = `${String(reminder.message || "").trim()} ${roleMention}`.trim();
        if (updatedMessage.length > 2000) {
            return interaction.reply({ content: "❌ The reminder message is too long to add this role mention.", flags: MessageFlags.Ephemeral });
        }
        reminder.message = updatedMessage;
    }
    reminder.allowRoleMentions = true;
    await reminder.save();
    return showReminderList(interaction, 0, getReminderId(reminder), scope === "mine", true);
}

async function handleReminderUserSelect(interaction) {
    const [, id, ownerId, scope] = interaction.customId.split(":");
    if (ownerId !== interaction.user.id || !isAdmin(interaction)) {
        return interaction.reply({ content: "❌ Only administrators who opened this panel can add user mentions.", flags: MessageFlags.Ephemeral });
    }
    const reminder = await Reminder.findOne({ _id: id, guildId: interaction.guildId });
    if (!reminder || !canManage(interaction, reminder)) {
        return interaction.reply({ content: "❌ This reminder no longer exists or you cannot manage it.", flags: MessageFlags.Ephemeral });
    }
    const userId = interaction.values?.[0];
    const user = await interaction.client.users.fetch(userId).catch(() => null);
    if (!user || user.bot) {
        return interaction.reply({ content: "❌ That user cannot be mentioned by this reminder.", flags: MessageFlags.Ephemeral });
    }
    const userMention = `<@${user.id}>`;
    if (!String(reminder.message || "").includes(userMention)) {
        const updatedMessage = `${String(reminder.message || "").trim()} ${userMention}`.trim();
        if (updatedMessage.length > 2000) {
            return interaction.reply({ content: "❌ The reminder message is too long to add this user mention.", flags: MessageFlags.Ephemeral });
        }
        reminder.message = updatedMessage;
    }
    reminder.allowUserMentions = true;
    await reminder.save();
    return showReminderList(interaction, 0, getReminderId(reminder), scope === "mine", true);
}

async function handleReminderModal(interaction) {
    const [, id, ownerId] = interaction.customId.split(":");
    if (ownerId !== interaction.user.id) {
        return interaction.reply({ content: "❌ This reminder editor belongs to another user.", flags: MessageFlags.Ephemeral });
    }

    const reminder = await Reminder.findOne({ _id: id, guildId: interaction.guildId });
    if (!reminder || !canManage(interaction, reminder)) {
        return interaction.reply({ content: "❌ This reminder no longer exists or you cannot manage it.", flags: MessageFlags.Ephemeral });
    }

    const timer = interaction.fields.getTextInputValue("timer");
    const message = interaction.fields.getTextInputValue("message").trim();
    const format = interaction.fields.getTextInputValue("format").trim().toLowerCase();
    const intervalMs = parseDuration(timer);
    if (!intervalMs) {
        return interaction.reply({ content: "❌ Invalid timer. Use `30s`, `15m`, `2h`, or `1d` (minimum 10 seconds, maximum 365 days).", flags: MessageFlags.Ephemeral });
    }
    if (!message) {
        return interaction.reply({ content: "❌ Reminder message cannot be empty.", flags: MessageFlags.Ephemeral });
    }
    if (!["embed", "non-embed"].includes(format)) {
        return interaction.reply({ content: "❌ Invalid format. Choose `embed` or `non-embed`.", flags: MessageFlags.Ephemeral });
    }

    reminder.intervalMs = intervalMs;
    reminder.message = message;
    reminder.embed = format === "embed";
    reminder.nextRunAt = new Date(Date.now() + intervalMs);
    await reminder.save();
    return interaction.reply({ content: "✅ Reminder timer, message, and format have been updated. The next send time has been reset using the new timer.", flags: MessageFlags.Ephemeral });
}

function suppressMassMentions(message) {
    return String(message).replace(/@(everyone|here)/gi, "@\u200b$1");
}

async function deliverReminder(client, reminder) {
    let destination;
    if (reminder.destination === "pm") {
        const user = await client.users.fetch(reminder.userId);
        destination = await user.createDM();
    } else {
        const guild = client.guilds.cache.get(reminder.guildId);
        destination = guild ? await guild.channels.fetch(reminder.channelId).catch(() => null) : null;
        if (!destination?.isTextBased() || !destination.send) {
            throw new Error("Reminder target channel is unavailable.");
        }
    }

    const safeMessage = reminder.destination === "channel" && !reminder.creatorIsAdmin
        ? suppressMassMentions(reminder.message)
        : reminder.message;

    const roleMentions = reminder.allowRoleMentions
        ? [...String(reminder.message || "").matchAll(/<@&(\d{17,20})>/g)].map(match => match[1])
        : [];
    const userMentions = reminder.allowUserMentions
        ? [...String(reminder.message || "").matchAll(/<@(\d{17,20})>/g)].map(match => match[1])
        : [];
    const allowedMentions = {
        parse: reminder.destination === "channel" && reminder.creatorIsAdmin ? ["everyone"] : [],
        roles: reminder.destination === "channel" ? roleMentions : [],
        users: reminder.destination === "channel" ? [...userMentions, ...(reminder.repeat ? [] : [reminder.userId])] : []
    };

    if (reminder.embed) {
        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setDescription(safeMessage)
            .setTimestamp(new Date());
        const pingContent = [
            ...(reminder.repeat ? [] : [`<@${reminder.userId}>`]),
            ...roleMentions.map(roleId => `<@&${roleId}>`),
            ...userMentions.map(userId => `<@${userId}>`)
        ].join(" ");
        await destination.send({
            content: pingContent || undefined,
            embeds: [embed],
            allowedMentions
        });
        return;
    }

    await destination.send({
        content: reminder.repeat ? safeMessage : `<@${reminder.userId}>\n${safeMessage}`,
        allowedMentions
    });
}

async function processDueReminders(client) {
    if (schedulerRunning) return;
    schedulerRunning = true;
    try {
        const due = await Reminder.find({ nextRunAt: { $lte: new Date() } }).sort({ nextRunAt: 1 }).limit(50);
        for (const reminder of due) {
            try {
                await deliverReminder(client, reminder);
                if (reminder.repeat) {
                    const now = Date.now();
                    const previous = reminder.nextRunAt.getTime();
                    const missedIntervals = Math.max(1, Math.floor((now - previous) / reminder.intervalMs) + 1);
                    reminder.nextRunAt = new Date(previous + missedIntervals * reminder.intervalMs);
                    reminder.lastSentAt = new Date();
                    await reminder.save();
                } else {
                    await Reminder.deleteOne({ _id: reminder._id });
                }
            } catch (error) {
                console.error(`[Reminder] Delivery failed for ${getReminderId(reminder)}:`, error.message);
                reminder.nextRunAt = new Date(Date.now() + 5 * 60 * 1000);
                await reminder.save().catch(saveError => console.error("[Reminder] Retry schedule error:", saveError.message));
            }
        }
    } catch (error) {
        console.error("[Reminder] Scheduler error:", error);
    } finally {
        schedulerRunning = false;
    }
}

function startReminderMonitor(client) {
    processDueReminders(client).catch(error => console.error("[Reminder] Initial scheduler error:", error));
    setInterval(() => {
        processDueReminders(client).catch(error => console.error("[Reminder] Scheduled scheduler error:", error));
    }, 10000);
    console.log("[Reminder] Reminder scheduler is active (10 seconds).");
}

module.exports = {
    showReminderList,
    handleReminderButton,
    handleReminderSelect,
    handleReminderRoleSelect,
    handleReminderUserSelect,
    handleReminderModal,
    startReminderMonitor
};
