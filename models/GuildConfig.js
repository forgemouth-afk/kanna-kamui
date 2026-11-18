const mongoose = require("mongoose");

const rewardSchema = new mongoose.Schema({
    roleId: { type: String, required: true },
    level: { type: Number, required: true }
}, { _id: false });

const guildConfigSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    triggerChannelId: { type: String, default: null },
    levelChannelId: { type: String, default: null },
    honeypotChannelId: { type: String, default: null },
    auditLogChannelId: { type: String, default: null },
    adminDeleteChannelId: { type: String, default: null },
    adminDeleteRoleIds: { type: [String], default: [] },
    autoThreadChannelIds: { type: [String], default: [] },
    autoThreadIds: { type: [String], default: [] },
    autoRoleChannelId: { type: String, default: null },
    autoRoleMessageId: { type: String, default: null },
    autoRoleIds: { type: [String], default: [] },
    autoRoleImageUrl: { type: String, default: null },
    autoRoleDescription: { type: String, default: "Want to get the game roles you are interested in? Click a role button below to claim or remove it!" },
    welcomeChannelId: { type: String, default: null },
    welcomeMessageChannelId: { type: String, default: null },
    voicePanelChannelId: { type: String, default: null },
    voicePanelMessageId: { type: String, default: null },
    goodbyeChannelId: { type: String, default: null },
    boosterChannelId: { type: String, default: null },
    starboardChannelId: { type: String, default: null },
    starboardNoticeMessageId: { type: String, default: null },
    starboardThreshold: { type: Number, default: 3 },
    starboardEmoji: { type: String, default: "⭐" },
    confessionChannelId: { type: String, default: null },
    confessionCounter: { type: Number, default: 0 },
    latestConfessionMessageId: { type: String, default: null },
    confessionBlacklist: { type: [String], default: [] },
    levelRewards: { type: [rewardSchema], default: [] },
    xpBoosterMultiplier: { type: Number, default: 1 },
    xpBoosterExpiresAt: { type: Date, default: null },
    xpBoosterStartedBy: { type: String, default: null }
}, { timestamps: true });

module.exports = mongoose.models.GuildConfig
    || mongoose.model("GuildConfig", guildConfigSchema);