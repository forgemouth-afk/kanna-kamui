const { AttachmentBuilder } = require("discord.js");
const { RankCardBuilder, Font } = require("canvacord");
const UserLevel = require("../models/UserLevel");
const { xpForNextLevel } = require("./leveling");
const { fetchAvatarImage } = require("./avatarImage");

async function buildRankCard(guild, user) {
    Font.loadDefault();

    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) throw new Error("Member could not be found in this server.");

    const record = await UserLevel.findOne({
        guildId: guild.id,
        userId: user.id
    }).lean();

    const level = record?.level ?? 0;
    const xp = record?.xp ?? 0;
    const requiredXp = xpForNextLevel(level);

    const rankPosition = await UserLevel.countDocuments({
        guildId: guild.id,
        $or: [
            { level: { $gt: level } },
            { level, xp: { $gt: xp } }
        ]
    }) + 1;

    const avatar = await fetchAvatarImage(user);
    const card = new RankCardBuilder()
        .setUsername(user.username)
        .setDisplayName(member.displayName)
        .setAvatar(avatar)
        .setCurrentXP(xp)
        .setRequiredXP(requiredXp)
        .setLevel(level)
        .setRank(rankPosition)
        .setStatus(member.presence?.status ?? "offline");

    const image = await card.build({ format: "png" });
    return {
        attachment: new AttachmentBuilder(image, { name: "rank-card.png" }),
        record,
        level,
        xp,
        requiredXp,
        rankPosition,
        member
    };
}

module.exports = { buildRankCard };
