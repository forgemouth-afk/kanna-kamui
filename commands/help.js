const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("help")
        .setDescription("Show the bot's commands and features."),
    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle("📚 Bot Help & Features")
            .setDescription("Here are the commands and systems available in this bot.")
            .addFields(
                { name: "🎙️ Temporary Voice", value: "`/jointocreate` — setup personal voice rooms with rename, limit, lock, kick, and permission controls.", inline: false },
                { name: "⭐ Leveling", value: "`/rank` · `/leaderboard` · `/setuplevel` · `/setlevel` · `/resetlevel` · `/boosterxp`\nEarn XP from chat and voice, claim daily XP, activate 2x–4x XP boosters, and receive level reward roles.", inline: false },
                { name: "🎭 Self-Assignable Roles", value: "`/autorole` — create a role claim panel with up to 20 role buttons. Administrators can update the available roles and panel text; an optional image attachment can be added when setting up the panel.", inline: false },
                { name: "📋 Changelog", value: "`/changelog` — browse bot updates, five entries per page, with Previous and Next buttons.", inline: false },
                { name: "🎉 Giveaways", value: "`/giveaway` · `/reroll`\nButton-based entry, member list, random winner selection, and persistent giveaways across bot restarts.", inline: false },
                { name: "🚀 Booster Notifications", value: "`/setupbooster` — configure a channel for boost started and boost ended notifications.", inline: false },
                { name: "🎭 Booster Custom Role", value: "`/customrole` — open one interactive control panel to create and manage your custom role. Rename it, change its color, gift it through a User Select Menu, set a role icon using an image link or a gallery upload when the server has unlocked Role Icons, remove shared members with the Remove User button, or delete it. Active boosters can own one custom role and share it with up to two other members (3 holders total). Gift requests expire after 3 minutes, the role is automatically removed when its owner stops boosting, and its position is maintained below Moderator.", inline: false },
                { name: "🗄️ Developer Tools", value: "`/deletedatabase` — open a protected collection deletion panel with Accept/Deny confirmation (3-minute expiry). `/gitpush` — review project changes and push them to the configured GitHub repository after confirmation. GitHub settings and authorized user IDs are configured in `config/config.js`.", inline: false },
                { name: "🛡️ Moderation & Logs", value: "`/kick` · `/ban` · `/to` · `/honeypot` · `/auditlog`\nConfirmation buttons, member timeouts, and server activity logging.", inline: false },
                { name: "💬 Community", value: "`/confess` · `/setupconfess` · `/confessblacklist` · `/welcome` · `/goodbye` · `/starboard`", inline: false },
                { name: "⏰ Reminders", value: "`/setreminder` — create one-time or repeating reminders for a channel or private message. `/reminder` — view, edit, or delete your reminders; administrators can manage all server reminders.", inline: false },
                { name: "🔎 Message Tools", value: "`/snipe` · `/editsnipe` — view the latest deleted or edited message in the current channel.", inline: false },
                { name: "🧰 Utilities", value: "`/ping` · `/avatar` · `/say` · `/steam` · `/play` · `/stats` · `/help`\nYouTube audio downloads with live progress, bot runtime, library, and MongoDB statistics plus automatic social-media embeds for supported links.", inline: false }
            )
            .setFooter({ text: "Some setup and moderation commands require administrator permissions." })
            .setTimestamp();
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }
};
