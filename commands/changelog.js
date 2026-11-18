const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require("discord.js");

const entries = [
    { version: "V61", date: "2026-11-19", title: "GitHub Push Command", details: "Added an owner-restricted /gitpush command with change preview, confirmation, and config/config.js exclusion from Git commits." },
    { version: "V58", date: "2026-11-18", title: "AutoRole Panel & Changelog", details: "Added a self-assignable role panel with up to 20 role buttons, administrator role updates, optional panel image, and paginated changelog." },
    { version: "V57", date: "2026-11-16", title: "Admin Delete & AutoThread Refinement", details: "Added staff-to-staff deletion notification filtering, Comments threads, owner message-only controls, and automatic thread cleanup when the source post is deleted." },
    { version: "V56", date: "2026-11-14", title: "Admin Delete & AutoThread", details: "Added staged admin-delete tracking and automatic image discussion threads." },
    { version: "V55", date: "2026-11-14", title: "WIB Timestamp & Staff Role Fix", details: "Added Jakarta time display and excluded Founder from staff punishment targets." },
    { version: "V54", date: "2026-11-14", title: "Admin Delete & Staff Punish", details: "Added admin-delete monitoring, escalation controls, and protected staff punishment management." },
    { version: "V53", date: "2026-11-13", title: "Reminder Edit Format", details: "Added embed and non-embed format editing for reminders." },
    { version: "V52", date: "2026-11-13", title: "Reminder Panel & User Mention", details: "Fixed administrator panel navigation and added user mention selection." },
    { version: "V51", date: "2026-11-13", title: "Reminder Role Mention", details: "Added administrator-only role mention management for reminders." },
    { version: "V50", date: "2026-11-13", title: "Reminder Pagination", details: "Added five-item pagination to personal and administrator reminder lists." },
    { version: "V49", date: "2026-11-13", title: "Reminder Manage Navigation", details: "Added in-place navigation between personal and server reminder views." },
    { version: "V48", date: "2026-11-13", title: "Reminder Panel Update", details: "Updated reminder selections and management controls in the same panel." }
];

function buildPage(page, ownerId) {
    const totalPages = Math.max(1, Math.ceil(entries.length / 5));
    const current = Math.min(Math.max(page, 0), totalPages - 1);
    const slice = entries.slice(current * 5, current * 5 + 5);
    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle("📋 Bot Changelog")
        .setDescription(slice.map(item => `**${item.version} · ${item.title}**\n${item.details}\n*${item.date}*`).join("\n\n"))
        .setFooter({ text: `Page ${current + 1}/${totalPages} • Showing 5 updates per page` });
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`changelog_page:${current - 1}:${ownerId}`).setLabel("Previous").setStyle(ButtonStyle.Secondary).setDisabled(current === 0),
        new ButtonBuilder().setCustomId(`changelog_page:${current + 1}:${ownerId}`).setLabel("Next").setStyle(ButtonStyle.Secondary).setDisabled(current >= totalPages - 1)
    );
    return { embeds: [embed], components: [row] };
}

module.exports = {
    data: new SlashCommandBuilder().setName("changelog").setDescription("Browse the bot's update history."),
    async execute(interaction) {
        return interaction.reply({ ...buildPage(0, interaction.user.id), flags: MessageFlags.Ephemeral });
    },
    buildPage
};
