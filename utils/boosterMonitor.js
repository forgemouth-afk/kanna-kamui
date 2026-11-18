const { Events, EmbedBuilder } = require("discord.js");
const GuildConfig = require("../models/GuildConfig");

function startBoosterMonitor(client) {
    client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
        const started = !oldMember.premiumSince && Boolean(newMember.premiumSince);
        const ended = Boolean(oldMember.premiumSince) && !newMember.premiumSince;
        if (!started && !ended) return;

        try {
            const config = await GuildConfig.findOne({ guildId: newMember.guild.id }).lean();
            if (!config?.boosterChannelId) return;
            const channel = await newMember.guild.channels.fetch(config.boosterChannelId).catch(() => null);
            if (!channel?.isTextBased() || !channel.send) return;

            const embed = new EmbedBuilder()
                .setColor(started ? 0xF47FFF : 0xED4245)
                .setTitle(started ? "🚀 New Server Boost!" : "💔 Server Boost Ended")
                .setDescription(started
                    ? `Thank you <@${newMember.id}> for boosting **${newMember.guild.name}**!`
                    : `The server boost from <@${newMember.id}> has ended. It may have been removed or expired.`)
                .setThumbnail(newMember.user.displayAvatarURL({ extension: "png", size: 256 }))
                .setTimestamp();
            await channel.send({ embeds: [embed], allowedMentions: { users: [newMember.id] } });
        } catch (error) {
            console.error("[Booster] Notification failed:", error);
        }
    });
    console.log("[Booster] Boost notification monitoring is active.");
}

module.exports = { startBoosterMonitor };
