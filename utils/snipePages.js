const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

function buildSnipePage(type, channelId, entries, page, ownerId, canClear = false) {
    const pageSize = 5;
    const totalPages = Math.max(1, Math.ceil(entries.length / pageSize));
    const selected = entries.slice(page * pageSize, (page + 1) * pageSize);
    const embed = new EmbedBuilder()
        .setColor(type === "snipe" ? 0xED4245 : 0xFEE75C)
        .setTitle(type === "snipe" ? "🗑️ Deleted Messages" : "✏️ Edited Messages")
        .setDescription(selected.map((item, index) => {
            const number = page * pageSize + index + 1;
            const author = item.authorTag || "Unknown user";
            const time = new Date(item.createdAt || item.editedAt || Date.now()).toLocaleString("en-US");
            if (type === "snipe") {
                return `**${number}. ${author}** · ${time}
${(item.content || "*(No text content)*").slice(0, 700)}${item.attachmentURL ? `\n[Attachment](${item.attachmentURL})` : ""}`;
            }
            return `**${number}. ${author}** · ${time}
**Before:** ${(item.before || "*(No text content)*").slice(0, 300)}
**After:** ${(item.after || "*(No text content)*").slice(0, 300)}`;
        }).join("\n\n").slice(0, 4000) || "No messages on this page.")
        .addFields({ name: "Channel", value: `<#${channelId}>`, inline: true })
        .setFooter({ text: `Page ${page + 1}/${totalPages} · ${entries.length} stored messages` });

    const buttons = [];
    if (totalPages > 1) {
        buttons.push(
            new ButtonBuilder().setCustomId(`${type}_page:${channelId}:${page - 1}:${ownerId}`).setLabel("Previous").setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
            new ButtonBuilder().setCustomId(`${type}_page:${channelId}:${page + 1}:${ownerId}`).setLabel("Next").setStyle(ButtonStyle.Primary).setDisabled(page >= totalPages - 1)
        );
    }
    if (canClear) {
        buttons.push(
            new ButtonBuilder().setCustomId(`${type}_clear:${channelId}`).setLabel(type === "snipe" ? "Clear Snipe" : "Clear Editsnipe").setStyle(ButtonStyle.Danger)
        );
    }
    const components = buttons.length ? [new ActionRowBuilder().addComponents(...buttons)] : [];
    return { embeds: [embed], components };
}

module.exports = { buildSnipePage };
