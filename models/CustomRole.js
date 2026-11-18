const mongoose = require("mongoose");

const customRoleSchema = new mongoose.Schema({
    guildId: { type: String, required: true },
    ownerId: { type: String, required: true },
    roleId: { type: String, required: true },
    recipients: { type: [String], default: [] }
}, { timestamps: true });

customRoleSchema.index({ guildId: 1, ownerId: 1 }, { unique: true });
customRoleSchema.index({ guildId: 1, roleId: 1 }, { unique: true });

module.exports = mongoose.models.CustomRole || mongoose.model("CustomRole", customRoleSchema);
