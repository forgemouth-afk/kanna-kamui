const mongoose = require("mongoose");

const confessionSchema = new mongoose.Schema({
    guildId: { type: String, required: true },
    confessionId: { type: String, required: true },
    messageId: { type: String, required: true },
    channelId: { type: String, required: true },
    threadId: { type: String, default: null },
    authorId: { type: String, required: true },
    content: { type: String, required: true },
    blacklisted: { type: Boolean, default: false }
}, { timestamps: true });

confessionSchema.index({ guildId: 1, confessionId: 1 }, { unique: true });

module.exports = mongoose.models.Confession
    || mongoose.model("Confession", confessionSchema);
