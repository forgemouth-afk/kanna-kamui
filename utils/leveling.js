const { EmbedBuilder } = require("discord.js");
const GuildConfig = require("../models/GuildConfig");
const UserLevel = require("../models/UserLevel");
const { toContainerPayload } = require("./container");

const CHAT_XP_MIN = 100;
const CHAT_XP_MAX = 300;
const CHAT_COOLDOWN_MS = 60 * 1000;
const VOICE_XP_MIN = 15;
const VOICE_XP_MAX = 30;
const VOICE_INTERVAL_MS = 60 * 1000;

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function xpForNextLevel(level) {
    return 1000 * (level + 1);
}

async function getOrCreateUser(guildId, userId) {
    return UserLevel.findOneAndUpdate(
        { guildId, userId },
        { $setOnInsert: { xp: 0, level: 0 } },
        { upsert: true, new: true }
    );
}

async function grantXp(guild, user, amount) {
    const config = await GuildConfig.findOne({ guildId: guild.id });
    let multiplier = 1;

    if (config?.xpBoosterExpiresAt && new Date(config.xpBoosterExpiresAt).getTime() > Date.now()) {
        multiplier = Math.min(4, Math.max(1, Number(config.xpBoosterMultiplier) || 1));
    } else if (config?.xpBoosterMultiplier && config.xpBoosterMultiplier !== 1) {
        config.xpBoosterMultiplier = 1;
        config.xpBoosterExpiresAt = null;
        config.xpBoosterStartedBy = null;
        await config.save();
    }

    const awardedAmount = Math.max(0, Math.floor(amount * multiplier));
    const record = await getOrCreateUser(guild.id, user.id);
    const oldLevel = record.level;

    record.xp += awardedAmount;

    while (record.xp >= xpForNextLevel(record.level)) {
        record.xp -= xpForNextLevel(record.level);
        record.level += 1;
    }

    await record.save();

    if (record.level > oldLevel) {
        await applyRewardRoles(guild, user, record.level);

        const config = await GuildConfig.findOne({ guildId: guild.id });
        if (config?.levelChannelId) {
            const channel = await guild.channels.fetch(config.levelChannelId).catch(() => null);
            if (channel && channel.isTextBased()) {
                const embed = new EmbedBuilder()
                    .setColor(0x57F287)
                    .setTitle("🎉 Level Up!")
                    .setDescription(`Congratulations <@${user.id}>! You reached **Level ${record.level}**.`)
                    .addFields(
                        { name: "⭐ New Level", value: `${record.level}`, inline: true },
                        { name: "✨ XP Remaining", value: `${record.xp}`, inline: true }
                    )
                    .setThumbnail(user.displayAvatarURL({ size: 256 }))
                    .setTimestamp();

                await channel.send(toContainerPayload({ embeds: [embed] })).catch(() => null);
            }
        }
    }

    return { record, leveledUp: record.level > oldLevel, amount: awardedAmount, multiplier };
}

async function applyRewardRoles(guild, user, level) {
    const config = await GuildConfig.findOne({ guildId: guild.id });
    if (!config?.levelRewards?.length) return;

    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) return;

    const eligibleRewards = config.levelRewards.filter(reward => level >= reward.level);
    for (const reward of eligibleRewards) {
        if (member.roles.cache.has(reward.roleId)) continue;
        await member.roles.add(reward.roleId, "Automatic level reward").catch(error => {
            console.error(`Could not assign level reward ${reward.roleId}:`, error.message);
        });
    }
}

module.exports = {
    randomInt,
    xpForNextLevel,
    getOrCreateUser,
    grantXp,
    applyRewardRoles,
    CHAT_XP_MIN,
    CHAT_XP_MAX,
    CHAT_COOLDOWN_MS,
    VOICE_XP_MIN,
    VOICE_XP_MAX,
    VOICE_INTERVAL_MS
};