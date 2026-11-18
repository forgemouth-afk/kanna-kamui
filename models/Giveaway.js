const mongoose = require("mongoose");

const giveawaySchema = new mongoose.Schema({
    guildId: { type: String, required: true },
    channelId: { type: String, required: true },
    messageId: { type: String, required: true, unique: true },
    hostId: { type: String, required: true },
    prize: { type: String, required: true },
    winnerCount: { type: Number, default: 1 },
    endAt: { type: Date, required: true },
    entries: { type: [String], default: [] },
    ended: { type: Boolean, default: false },
    winners: { type: [String], default: [] }
}, { timestamps: true });

giveawaySchema.index({ guildId:  1, ended: 1, endAt: 1 });

module.exports = mongoose.models.Giveaway || mongoose.model("Giveaway", giveawaySchema);
