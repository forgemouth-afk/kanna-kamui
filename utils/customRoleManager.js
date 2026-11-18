const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    UserSelectMenuBuilder,
    FileUploadBuilder,
    LabelBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    PermissionFlagsBits
} = require("discord.js");
const CustomRole = require("../models/CustomRole");

const REQUEST_TIMEOUT = 3 * 60 * 1000;
const MAX_HOLDERS = 3;

async function cleanupCustomRole(guild, record, reason = "Custom role owner is no longer boosting") {
    const role = await guild.roles.fetch(record.roleId).catch(() => null);
    if (role) {
        try {
            await role.delete(reason);
        } catch (error) {
            console.error(`[CustomRole] Could not delete role ${record.roleId}:`, error.message);
            return false;
        }
    }
    await CustomRole.deleteOne({ _id: record._id });
    return true;
}

async function placeCustomRole(guild, role) {
    const moderatorRole = guild.roles.cache.find(item => item.name.toLowerCase() === "moderator");
    if (!moderatorRole) return;
    const targetPosition = Math.max(1, moderatorRole.position - 1);
    if (role.position !== targetPosition) {
        await role.setPosition(targetPosition, { reason: "Place booster custom role below Moderator" });
    }
}

async function buildCustomRolePanel(guild, member, record) {
    const role = await guild.roles.fetch(record.roleId).catch(() => null);
    if (!role) {
        await CustomRole.deleteOne({ _id: record._id });
        const embed = new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle("🎭 Booster Custom Role")
            .setDescription("❌ Your custom role no longer exists. Create a new one while boosting.");
        return { embeds: [embed], components: [] };
    }

    const holders = record.recipients.map(id => `<@${id}>`).join("\n") || "No members";
    const embed = new EmbedBuilder()
        .setColor(role.color || 0x5865F2)
        .setTitle("🎭 Your Custom Role")
        .setDescription(`Manage your booster custom role using the buttons below.\n\n**Role:** ${role}\n**Name:** ${role.name}\n**Color:** ${role.hexColor}`)
        .addFields(
            { name: "👑 Owner", value: `<@${member.id}>`, inline: true },
            { name: "👥 Holders", value: `${record.recipients.length}/${MAX_HOLDERS}`, inline: true },
            { name: "📋 Members", value: holders, inline: false }
        )
        .setFooter({ text: "Only the role owner can customize and share this role." });

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("customrole_rename").setLabel("Rename").setEmoji("✏️").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("customrole_color").setLabel("Change Color").setEmoji("🎨").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("customrole_gift").setLabel("Gift Role").setEmoji("🎁").setStyle(ButtonStyle.Success)
    );
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("customrole_icon").setLabel("Icon by Link").setEmoji("🔗").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("customrole_icon_upload").setLabel("Upload Icon").setEmoji("🖼️").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("customrole_remove_user").setLabel("Remove User").setEmoji("➖").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("customrole_delete").setLabel("Delete").setEmoji("🗑️").setStyle(ButtonStyle.Danger)
    );
    return { embeds: [embed], components: [row1, row2] };
}

function ownerRecord(interaction) {
    return CustomRole.findOne({ guildId: interaction.guildId, ownerId: interaction.user.id });
}

async function getOwnedRole(interaction) {
    const record = await ownerRecord(interaction);
    if (!record) return { error: "❌ You do not have a custom role yet. Use `/customrole` first." };
    const role = await interaction.guild.roles.fetch(record.roleId).catch(() => null);
    if (!role) {
        await CustomRole.deleteOne({ _id: record._id });
        return { error: "❌ Your custom role no longer exists. Create a new one while boosting." };
    }
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!member.premiumSince) {
        await cleanupCustomRole(interaction.guild, record, "Server boost ended");
        return { error: "❌ You must be actively boosting this server to use a custom role." };
    }
    return { record, role, member };
}

function makeModal(customId, title, fieldId, label, placeholder, maxLength = 100) {
    return new ModalBuilder()
        .setCustomId(customId)
        .setTitle(title)
        .addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId(fieldId)
                .setLabel(label)
                .setPlaceholder(placeholder)
                .setStyle(TextInputStyle.Short)
                .setMaxLength(maxLength)
                .setRequired(true)
        ));
}

async function handleCustomRoleButton(interaction) {
    if (interaction.customId.startsWith("customrole_accept:") || interaction.customId.startsWith("customrole_deny:")) {
        return handleGiftRequest(interaction);
    }

    const state = await getOwnedRole(interaction);
    if (interaction.customId !== "customrole_create" && state.error) {
        return interaction.reply({ content: state.error, ephemeral: true });
    }

    if (interaction.customId === "customrole_create") {
        const member = await interaction.guild.members.fetch(interaction.user.id);
        if (!member.premiumSince) return interaction.reply({ content: "❌ You must be actively boosting this server to use a custom role.", ephemeral: true });
        if (await ownerRecord(interaction)) return interaction.reply({ content: "❌ You can only have one custom role in this server.", ephemeral: true });
        const botMember = await interaction.guild.members.fetchMe();
        if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) return interaction.reply({ content: "❌ I need Manage Roles permission.", ephemeral: true });
        return interaction.showModal(makeModal("customrole_create_modal", "Create Custom Role", "name", "Role name", "My Custom Role"));
    }

    if (interaction.customId === "customrole_rename") return interaction.showModal(makeModal("customrole_rename_modal", "Rename Custom Role", "name", "New role name", state.role.name));
    if (interaction.customId === "customrole_color") return interaction.showModal(makeModal("customrole_color_modal", "Change Role Color", "hex", "Hex color", "#5865F2", 7));
    if (interaction.customId === "customrole_icon") {
        if (!interaction.guild.features.includes("ROLE_ICONS")) {
            return interaction.reply({ content: "❌ Role icons are not unlocked on this server.", ephemeral: true });
        }
        return interaction.showModal(makeModal("customrole_icon_modal", "Set Custom Role Icon", "url", "Image URL", "https://example.com/icon.png", 500));
    }
    if (interaction.customId === "customrole_icon_upload") {
        if (!interaction.guild.features.includes("ROLE_ICONS")) {
            return interaction.reply({ content: "❌ Role icons are not unlocked on this server.", ephemeral: true });
        }
        const upload = new FileUploadBuilder()
            .setCustomId("icon_file")
            .setMinValues(1)
            .setMaxValues(1)
            .setRequired(true)
            .setFileTypes("image");
        const modal = new ModalBuilder()
            .setCustomId("customrole_icon_upload_modal")
            .setTitle("Upload Custom Role Icon")
            .addLabelComponents(
                new LabelBuilder()
                    .setLabel("Choose an image from your device")
                    .setDescription("PNG, JPG, or GIF. Maximum 256 KB.")
                    .setFileUploadComponent(upload)
            );
        return interaction.showModal(modal);
    }
    if (interaction.customId === "customrole_remove_user") {
        const removable = state.record.recipients.filter(id => id !== interaction.user.id);
        if (!removable.length) return interaction.reply({ content: "ℹ️ No other members currently have your custom role.", ephemeral: true });
        const row = new ActionRowBuilder().addComponents(
            new UserSelectMenuBuilder()
                .setCustomId("customrole_remove_select")
                .setPlaceholder("Select a member to remove from this role")
                .setMinValues(1)
                .setMaxValues(removable.length)
        );
        return interaction.reply({ content: "Choose the member(s) you want to remove from your custom role.", components: [row], ephemeral: true });
    }
    if (interaction.customId === "customrole_gift") {
        if (state.record.recipients.length >= MAX_HOLDERS) return interaction.reply({ content: `❌ Your custom role has reached the maximum of ${MAX_HOLDERS} holders.`, ephemeral: true });
        const row = new ActionRowBuilder().addComponents(
            new UserSelectMenuBuilder().setCustomId("customrole_gift_select").setPlaceholder("Select a member to gift this role").setMinValues(1).setMaxValues(1)
        );
        return interaction.reply({ content: "Choose a member to receive your custom role.", components: [row], ephemeral: true });
    }
    if (interaction.customId === "customrole_delete") {
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("customrole_delete_confirm").setLabel("Confirm Delete").setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId("customrole_delete_cancel").setLabel("Cancel").setStyle(ButtonStyle.Secondary)
        );
        return interaction.reply({ content: "Are you sure you want to delete your custom role?", components: [row], ephemeral: true });
    }
    if (interaction.customId === "customrole_delete_cancel") return interaction.update({ content: "Custom role deletion cancelled.", components: [] });
    if (interaction.customId === "customrole_delete_confirm") {
        await interaction.deferUpdate();
        await state.role.delete("Booster deleted their custom role");
        await CustomRole.deleteOne({ _id: state.record._id });
        return interaction.editReply({ content: "✅ Your custom role has been deleted.", embeds: [], components: [] });
    }
}

async function handleCustomRoleModal(interaction) {
    const state = await getOwnedRole(interaction);
    const creating = interaction.customId === "customrole_create_modal";
    if (!creating && state.error) return interaction.reply({ content: state.error, ephemeral: true });
    const name = creating ? interaction.fields.getTextInputValue("name").trim() : null;

    if (creating) {
        if (await ownerRecord(interaction)) return interaction.reply({ content: "❌ You can only have one custom role in this server.", ephemeral: true });
        if (!name) return interaction.reply({ content: "❌ Role name cannot be empty.", ephemeral: true });
        await interaction.deferReply({ ephemeral: true });
        const role = await interaction.guild.roles.create({
            name,
            colors: { primaryColor: 0x5865F2 },
            reason: `Booster custom role created by ${interaction.user.tag}`,
            permissions: [],
            hoist: false,
            mentionable: false
        });
        if (!role.editable) {
            await role.delete().catch(() => null);
            return interaction.editReply("❌ Move my bot role higher than the position where custom roles should be created.");
        }
        await placeCustomRole(interaction.guild, role).catch(error => console.error("[CustomRole] Position update failed:", error.message));
        const member = await interaction.guild.members.fetch(interaction.user.id);
        await member.roles.add(role, "Booster custom role owner");
        const record = await CustomRole.create({ guildId: interaction.guildId, ownerId: member.id, roleId: role.id, recipients: [member.id] });
        return interaction.editReply({ content: `✅ Your custom role **${role.name}** has been created. You can share it with up to ${MAX_HOLDERS - 1} other members (maximum ${MAX_HOLDERS} holders including you).`, ...await buildCustomRolePanel(interaction.guild, member, record) });
    }

    if (interaction.customId === "customrole_rename_modal") {
        const value = interaction.fields.getTextInputValue("name").trim();
        if (!value) return interaction.reply({ content: "❌ Role name cannot be empty.", ephemeral: true });
        await state.role.setName(value, "Booster custom role renamed");
        return interaction.reply({ content: `✅ Custom role renamed to **${value}**.`, ephemeral: true });
    }
    if (interaction.customId === "customrole_color_modal") {
        const value = interaction.fields.getTextInputValue("hex").trim();
        if (!/^#?(?:[0-9a-fA-F]{6})$/.test(value)) return interaction.reply({ content: "❌ Invalid color. Use a hex color such as #FF99CC.", ephemeral: true });
        await state.role.setColor(parseInt(value.replace("#", ""), 16), "Booster custom role color changed");
        return interaction.reply({ content: `✅ Custom role color changed to **#${value.replace("#", "").toUpperCase()}**.`, ephemeral: true });
    }
    if (interaction.customId === "customrole_icon_modal") {
        if (!interaction.guild.features.includes("ROLE_ICONS")) return interaction.reply({ content: "❌ Role icons are not unlocked on this server.", ephemeral: true });
        const url = interaction.fields.getTextInputValue("url").trim();
        if (!/^https:\/\//i.test(url)) return interaction.reply({ content: "❌ Please provide a valid HTTPS image URL.", ephemeral: true });
        await interaction.deferReply({ ephemeral: true });
        try {
            const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
            if (!response.ok || !response.headers.get("content-type")?.startsWith("image/")) throw new Error("URL must point to an image.");
            const buffer = Buffer.from(await response.arrayBuffer());
            if (!buffer.length || buffer.length > 256 * 1024) throw new Error("Image must be 256 KB or smaller.");
            await state.role.setIcon(buffer, "Booster custom role icon updated");
            return interaction.editReply("✅ Custom role icon updated.");
        } catch (error) {
            return interaction.editReply(`❌ Could not set the role icon: ${error.message}`);
        }
    }
    if (interaction.customId === "customrole_icon_upload_modal") {
        if (!interaction.guild.features.includes("ROLE_ICONS")) return interaction.reply({ content: "❌ Role icons are not unlocked on this server.", ephemeral: true });
        const uploaded = interaction.fields.getUploadedFiles("icon_file")?.first();
        if (!uploaded) return interaction.reply({ content: "❌ Please attach an image from your device.", ephemeral: true });
        if (!uploaded.contentType?.startsWith("image/")) return interaction.reply({ content: "❌ The uploaded file must be an image.", ephemeral: true });
        if (uploaded.size > 256 * 1024) return interaction.reply({ content: "❌ Image must be 256 KB or smaller.", ephemeral: true });
        await interaction.deferReply({ ephemeral: true });
        try {
            const response = await fetch(uploaded.url, { signal: AbortSignal.timeout(10000) });
            if (!response.ok) throw new Error("Could not download the uploaded image from Discord.");
            const buffer = Buffer.from(await response.arrayBuffer());
            if (!buffer.length || buffer.length > 256 * 1024) throw new Error("Image must be 256 KB or smaller.");
            await state.role.setIcon(buffer, "Booster custom role icon uploaded");
            return interaction.editReply("✅ Custom role icon updated.");
        } catch (error) {
            return interaction.editReply(`❌ Could not set the role icon: ${error.message}`);
        }
    }
}

async function handleCustomRoleSelect(interaction) {
    if (interaction.customId === "customrole_remove_select") {
        const state = await getOwnedRole(interaction);
        if (state.error) return interaction.reply({ content: state.error, ephemeral: true });
        const selectedIds = interaction.values.filter(id => id !== interaction.user.id && state.record.recipients.includes(id));
        if (!selectedIds.length) return interaction.reply({ content: "❌ Select a member who currently has your custom role.", ephemeral: true });
        const removed = [];
        for (const userId of selectedIds) {
            const member = await interaction.guild.members.fetch(userId).catch(() => null);
            if (member) await member.roles.remove(state.role, `Removed from custom role by owner ${interaction.user.tag}`);
            await CustomRole.updateOne({ _id: state.record._id }, { $pull: { recipients: userId } });
            removed.push(userId);
        }
        const mentions = removed.map(id => `<@${id}>`).join(", ");
        return interaction.update({ content: `✅ Removed ${mentions} from **${state.role.name}**.`, components: [] });
    }
    if (interaction.customId !== "customrole_gift_select") return;
    const state = await getOwnedRole(interaction);
    if (state.error) return interaction.reply({ content: state.error, ephemeral: true });
    const targetId = interaction.values[0];
    const target = await interaction.guild.members.fetch(targetId).catch(() => null);
    if (!target || target.user.bot || target.id === interaction.user.id) return interaction.reply({ content: "❌ Choose another human member.", ephemeral: true });
    if (state.record.recipients.includes(targetId)) return interaction.reply({ content: "ℹ️ This member already has your custom role.", ephemeral: true });
    if (state.record.recipients.length >= MAX_HOLDERS) return interaction.reply({ content: `❌ Your custom role has reached the maximum of ${MAX_HOLDERS} holders.`, ephemeral: true });

    const expiresAtMs = Date.now() + REQUEST_TIMEOUT;
    const expiresAt = Math.floor(expiresAtMs / 1000);
    const embed = new EmbedBuilder()
        .setColor(state.role.color || 0x5865F2)
        .setTitle("🎭 Custom Role Request")
        .setDescription(`<@${interaction.user.id}> wants to share **${state.role.name}** with <@${targetId}>.\n\nThe request expires <t:${expiresAt}:R>.`)
        .setFooter({ text: `Maximum ${MAX_HOLDERS} role holders including the booster.` });
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`customrole_accept:${interaction.guildId}:${interaction.user.id}:${targetId}:${expiresAtMs}`).setLabel("Accept").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`customrole_deny:${interaction.guildId}:${interaction.user.id}:${targetId}:${expiresAtMs}`).setLabel("Deny").setStyle(ButtonStyle.Danger)
    );
    await interaction.channel.send({ content: `<@${targetId}>`, embeds: [embed], components: [row], allowedMentions: { users: [targetId] } });
    return interaction.update({ content: `Gift request sent to <@${targetId}>.`, components: [] });
}

async function handleGiftRequest(interaction) {
    const [action, guildId, ownerId, targetId, expiresAtRaw] = interaction.customId.split(":");
    const expiresAt = Number(expiresAtRaw) || 0;
    if (interaction.guildId !== guildId) return interaction.reply({ content: "❌ This request belongs to another server.", ephemeral: true });
    if (expiresAt && Date.now() > expiresAt) return interaction.update({ content: "⌛ This custom role request has expired.", embeds: [], components: [] });
    if (interaction.user.id !== targetId) return interaction.reply({ content: "❌ Only the selected member can accept or deny this role request.", ephemeral: true });
    const record = await CustomRole.findOne({ guildId, ownerId });
    if (!record) return interaction.update({ content: "❌ This custom role is no longer available.", embeds: [], components: [] });
    const guild = interaction.guild;
    const owner = await guild.members.fetch(ownerId).catch(() => null);
    const target = await guild.members.fetch(targetId).catch(() => null);
    const role = await guild.roles.fetch(record.roleId).catch(() => null);
    if (!owner || !owner.premiumSince || !role) {
        await cleanupCustomRole(guild, record);
        return interaction.update({ content: "❌ The booster is no longer active. The custom role has been removed.", embeds: [], components: [] });
    }
    if (action === "customrole_deny") return interaction.update({ content: `❎ <@${targetId}> declined the custom role request.`, embeds: [], components: [] });
    if (!target) return interaction.update({ content: "❌ The selected member is no longer in this server.", embeds: [], components: [] });
    if (record.recipients.includes(targetId)) return interaction.update({ content: "ℹ️ This member already has the custom role.", embeds: [], components: [] });
    if (record.recipients.length >= MAX_HOLDERS) return interaction.update({ content: "❌ This custom role has reached its maximum of 3 holders.", embeds: [], components: [] });
    if (!role.editable) return interaction.update({ content: "❌ I cannot assign this role because of the bot's role hierarchy or permissions.", embeds: [], components: [] });

    const updatedRecord = await CustomRole.findOneAndUpdate(
        { _id: record._id, recipients: { $ne: targetId }, $expr: { $lt: [{ $size: { $ifNull: ["$recipients", []] } }, MAX_HOLDERS] } },
        { $addToSet: { recipients: targetId } },
        { new: true }
    );
    if (!updatedRecord) return interaction.update({ content: `❌ This custom role has reached its maximum of ${MAX_HOLDERS} holders or the member already has it.`, embeds: [], components: [] });
    try {
        await target.roles.add(role, `Accepted custom role shared by ${owner.user.tag}`);
    } catch (error) {
        await CustomRole.updateOne({ _id: record._id }, { $pull: { recipients: targetId } });
        throw error;
    }
    return interaction.update({ content: `✅ <@${targetId}> accepted **${role.name}**. The role now has **${updatedRecord.recipients.length}/${MAX_HOLDERS}** holders.`, embeds: [], components: [] });
}

async function startCustomRoleMonitor(client) {
    const cleanupGuild = async guild => {
        const records = await CustomRole.find({ guildId: guild.id });
        if (records.length) await guild.members.fetch().catch(() => null);
        for (const record of records) {
            const owner = await guild.members.fetch(record.ownerId).catch(() => null);
            const role = await guild.roles.fetch(record.roleId).catch(() => null);
            if (!owner || !owner.premiumSince || !role) {
                await cleanupCustomRole(guild, record, "Booster ended or custom role is missing");
                continue;
            }
            const actualHolders = record.recipients.filter(id => role.members.has(id));
            if (!role.members.has(record.ownerId)) await owner.roles.add(role, "Restore booster custom role ownership").catch(() => null);
            const nextRecipients = [record.ownerId, ...actualHolders.filter(id => id !== record.ownerId)].slice(0, MAX_HOLDERS);
            const overflow = actualHolders.filter(id => !nextRecipients.includes(id));
            for (const userId of overflow) {
                const holder = await guild.members.fetch(userId).catch(() => null);
                if (holder) await holder.roles.remove(role, "Custom role holder limit enforced").catch(() => null);
            }
            if (JSON.stringify(record.recipients) !== JSON.stringify(nextRecipients)) {
                record.recipients = nextRecipients;
                await record.save();
            }
        }
    };
    const runSweep = async () => {
        for (const record of await CustomRole.find({})) {
            const guild = client.guilds.cache.get(record.guildId) || await client.guilds.fetch(record.guildId).catch(() => null);
            if (!guild) {
                await CustomRole.deleteOne({ _id: record._id });
                continue;
            }
            await cleanupGuild(guild).catch(error => console.error(`[CustomRole] Sweep failed for ${guild.id}:`, error.message));
        }
    };
    await runSweep();
    const timer = setInterval(runSweep, 60 * 1000);
    timer.unref?.();
    client.on("guildMemberUpdate", async (oldMember, newMember) => {
        if (oldMember.premiumSince && !newMember.premiumSince) {
            const record = await CustomRole.findOne({ guildId: newMember.guild.id, ownerId: newMember.id });
            if (record) await cleanupCustomRole(newMember.guild, record, "Server boost ended");
        }
    });
    client.on("guildMemberRemove", async member => {
        const record = await CustomRole.findOne({ guildId: member.guild.id, ownerId: member.id });
        if (record) await cleanupCustomRole(member.guild, record, "Custom role owner left the server");
    });
}

module.exports = {
    MAX_HOLDERS,
    REQUEST_TIMEOUT,
    buildCustomRolePanel,
    handleCustomRoleButton,
    handleCustomRoleModal,
    handleCustomRoleSelect,
    startCustomRoleMonitor,
    cleanupCustomRole
};
