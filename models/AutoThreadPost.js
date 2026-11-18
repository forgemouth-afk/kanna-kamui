const mongoose = require("mongoose");
const schema = new mongoose.Schema({
    guildId: { type: String, required: true, index: true },
    sourceMessageId: { type: String, required: true, index: true },
    threadId: { type: String, required: true, unique: true },
    ownerId: { type: String, required: true },
    allowTextOnly: { type: Boolean, default: false }
}, { timestamps: true });
module.exports = mongoose.models.AutoThreadPost || mongoose.model("AutoThreadPost", schema);
