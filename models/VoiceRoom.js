const mongoose = require("mongoose");

const voiceRoomSchema = new mongoose.Schema({
    guildId: { type: String, required: true },
    channelId: { type: String, required: true, unique: true },
    ownerId: { type: String, required: true },
    panelMessageId: { type: String, default: null }
}, { timestamps: true });

module.exports = mongoose.models.VoiceRoom
    || mongoose.model("VoiceRoom", voiceRoomSchema);