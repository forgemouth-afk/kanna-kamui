const mongoose = require("mongoose");
const schema = new mongoose.Schema({
    guildId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    roleIds: { type: [String], default: [] },
    restoreAt: { type: Date, required: true, index: true }
}, { timestamps: true });
module.exports = mongoose.models.StaffRoleRestore || mongoose.model("StaffRoleRestore", schema);
