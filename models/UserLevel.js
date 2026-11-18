const mongoose = require("mongoose");

const userLevelSchema = new mongoose.Schema({
    guildId: { type: String, required: true },
    userId: { type: String, required: true },
    xp: { type: Number, default: 0 },
    level: { type: Number, default: 0 },
    lastMessageXpAt: { type: Date, default: null },
    lastXpClaimAt: { type: Date, default: null }
}, { timestamps: true });

userLevelSchema.index({ guildId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.models.UserLevel
    || mongoose.model("UserLevel", userLevelSchema);