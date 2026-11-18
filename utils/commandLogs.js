const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    EmbedBuilder,
    MessageFlags
} = require("discord.js");
const CommandLog = require("../models/CommandLog");

const PAGE_SIZE = 20;

function serializeOptions(options, commandName) {
    const result = {};

    for (const option of options || []) {
        if (option.options?.length) {
            result[option.name] = serializeOptions(option.options, commandName);
            continue;
        }

        if (/token|password|secret|api.?key/i.test(option.name)) {
            result[option.name] = "[redacted]";
            continue;
        }

        if (commandName === "confess") {
            result[option.name] = "[private content omitted]";
            continue;
        }

        if (option.value !== undefined) {
            result[option.name] = typeof option.value === "string"
                ? option.value.slice(0, 1000)
                : option.value;
        } else if (option.user) {
            result[option.name] = `${option.user.username} (${option.user.id})`;
        } else if (option.member?.user) {
            result[option.name] = `${option.member.user.username} (${option.member.user.id})`;
        } else if (option.channel) {
            result[option.name] = `${option.channel.name} (${option.channel.id})`;
        } else if (option.role) {
            result[option.name] = `${option.role.name} (${option.role.id})`;
        }
    }

    return result;
}

async function recordCommandUsage(interaction) {
    if (!interaction.guildId || !interaction.user || !interaction.commandName) return;

    await CommandLog.create({
        guildId: interaction.guildId,
        userId: interaction.user.id,
        username: interaction.user.tag || interaction.user.username,
        displayName: interaction.member?.displayName || interaction.user.globalName || interaction.user.username,
        commandName: interaction.commandName,
        channelId: interaction.channelId || null,
        options: serializeOptions(interaction.options?.data, interaction.commandName)
    });
}

function formatOptions(options) {
    const entries = Object.entries(options || {});
    if (!entries.length) return "No options";

    return entries.map(([key, value]) => {
        const text = typeof value === "object" && value !== null
            ? JSON.stringify(value)
            : String(value);
        return `${key}: ${text.slice(0, 120)}`;
    }).join(" • ").slice(0, 160);
}

function buildLogComponents(page, totalPages, ownerId, confirmClear = false) {
    const rows = [];

    if (totalPages > 1) {
        const startPage = Math.max(1, Math.min(page - 12, totalPages - 24));
        const endPage = Math.min(totalPages, startPage + 24);
        const select = new StringSelectMenuBuilder()
            .setCustomId(`commandlogs_page:${ownerId}`)
            .setPlaceholder(`Select log page (${page}/${totalPages})`)
            .addOptions(Array.from({ length: endPage - startPage + 1 }, (_, index) => {
                const pageNumber = startPage + index;
                return {
                    label: `Log ${pageNumber}`,
                    value: String(pageNumber),
                    default: pageNumber === page
                };
            }));
        rows.push(new ActionRowBuilder().addComponents(select));
    }

    const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(confirmClear ? `commandlogs_confirm:${ownerId}` : `commandlogs_clear:${ownerId}`)
            .setLabel(confirmClear ? "Confirm Clear" : "Clear All")
            .setEmoji(confirmClear ? "⚠️" : "🗑️")
            .setStyle(ButtonStyle.Danger),
        ...(confirmClear ? [new ButtonBuilder()
            .setCustomId(`commandlogs_cancel:${ownerId}:${page}`)
            .setLabel("Cancel")
            .setStyle(ButtonStyle.Secondary)] : [])
    );
    rows.push(buttons);
    return rows;
}

async function buildLogView(guildId, ownerId, requestedPage = 1, confirmClear = false) {
    const total = await CommandLog.countDocuments({ guildId });
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const page = Math.min(Math.max(1, requestedPage), totalPages);
    const logs = await CommandLog.find({ guildId })
        .sort({ createdAt: -1 })
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .lean();

    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle("📋 Command Usage Logs")
        .setDescription(logs.length ? logs.map((entry, index) => {
            const number = (page - 1) * PAGE_SIZE + index + 1;
            return `**${number}. /${entry.commandName}** — <@${entry.userId}> • <t:${Math.floor(new Date(entry.createdAt).getTime() / 1000)}:R>\n` +
                `└ ${formatOptions(entry.options)} • <#${entry.channelId || "0"}>`;
        }).join("\n\n").slice(0, 4096) : "No command usage has been recorded yet.")
        .setFooter({ text: `Page ${page}/${totalPages} • ${total} total command logs • 20 logs per page` });

    if (confirmClear) {
        embed.setDescription("⚠️ **Are you sure you want to clear every command log in this server?**\nThis action cannot be undone.");
    }

    return {
        embeds: [embed],
        components: buildLogComponents(page, totalPages, ownerId, confirmClear)
    };
}

async function handleCommandLogComponent(interaction) {
    const [action, ownerId, pageValue] = interaction.customId.split(":");

    if (interaction.user.id !== ownerId) {
        return interaction.reply({ content: "❌ Only the administrator who opened this log panel can use it.", flags: MessageFlags.Ephemeral });
    }

    if (!interaction.memberPermissions?.has("Administrator")) {
        return interaction.reply({ content: "❌ This control is available to server administrators only.", flags: MessageFlags.Ephemeral });
    }

    if (action === "commandlogs_page") {
        return interaction.update(await buildLogView(interaction.guildId, ownerId, Number(interaction.values[0])));
    }

    if (action === "commandlogs_cancel") {
        return interaction.update(await buildLogView(interaction.guildId, ownerId, Number(pageValue) || 1));
    }

    if (action === "commandlogs_clear") {
        return interaction.update(await buildLogView(interaction.guildId, ownerId, 1, true));
    }

    if (action === "commandlogs_confirm") {
        const result = await CommandLog.deleteMany({ guildId: interaction.guildId });
        const view = await buildLogView(interaction.guildId, ownerId, 1);
        view.embeds[0].setDescription(`✅ Successfully cleared **${result.deletedCount}** command logs.`);
        return interaction.update(view);
    }
}

module.exports = { recordCommandUsage, handleCommandLogComponent, buildLogView };
