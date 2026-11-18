const mongoose = require("mongoose");

const starboardPostSchema = new mongoose.Schema({
    guildId: { type: String, required: true },
    sourceMessageId: { type: String, required: true },
    starboardMessageId: { type: String, default: null },
    starboardChannelId: { type: String, required: true },
    starCount: { type: Number, default: 0 }
}, { timestamps: true });

starboardPostSchema.index({ guildId: 1, sourceMessageId: 1 }, { unique: true });

module.exports = mongoose.models.StarboardPost
    || mongoose.model("StarboardPost", starboardPostSchema);
