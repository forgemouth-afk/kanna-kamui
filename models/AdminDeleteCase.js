const mongoose = require("mongoose");
const schema = new mongoose.Schema({
    guildId: { type: String, required: true, index: true },
    targetId: { type: String, required: true, index: true },
    count: { type: Number, default: 0 },
    windowStartedAt: { type: Date, default: Date.now },
    warnCount: { type: Number, default: 0 },
    resetDateWIB: { type: String, default: null },
    updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });
schema.index({ guildId: 1, targetId: 1 }, { unique: true });
module.exports = mongoose.models.AdminDeleteCase || mongoose.model("AdminDeleteCase", schema);
