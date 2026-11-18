const mongoose = require("mongoose");

const reminderSchema = new mongoose.Schema({
    guildId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    destination: { type: String, enum: ["channel", "pm"], required: true },
    channelId: { type: String, default: null },
    repeat: { type: Boolean, default: false },
    embed: { type: Boolean, default: false },
    creatorIsAdmin: { type: Boolean, default: false },
    allowRoleMentions: { type: Boolean, default: false },
    allowUserMentions: { type: Boolean, default: false },
    intervalMs: { type: Number, required: true },
    message: { type: String, required: true, maxlength: 2000 },
    nextRunAt: { type: Date, required: true, index: true },
    lastSentAt: { type: Date, default: null }
}, { timestamps: true });

module.exports = mongoose.models.Reminder || mongoose.model("Reminder", reminderSchema);
