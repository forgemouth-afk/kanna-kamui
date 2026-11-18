const mongoose = require("mongoose");

const commandLogSchema = new mongoose.Schema({
    guildId: { type: String, required: true, index: true },
    userId: { type: String, required: true },
    username: { type: String, required: true },
    displayName: { type: String, default: null },
    commandName: { type: String, required: true },
    channelId: { type: String, default: null },
    options: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdAt: { type: Date, default: Date.now, index: true }
}, { versionKey: false });

commandLogSchema.index({ guildId:  1, createdAt: -1 });

module.exports = mongoose.models.CommandLog
    || mongoose.model("CommandLog", commandLogSchema);
