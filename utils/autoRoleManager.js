const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    RoleSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    MessageFlags,
    PermissionFlagsBits
} = require("discord.js");
const GuildConfig = require("../models/GuildConfig");

function buildRows(config, guild) {
    const roles = config.autoRoleIds || [];
    const rows = [];
    for (let i = 0; i < roles.length; i += 5) {
        const row = new ActionRowBuilder();
        for (const roleId of roles.slice(i, i + 5)) {
            const role = guild?.roles?.cache?.get(roleId);
            row.addComponents(new ButtonBuilder()
                .setCustomId(`autorole_claim:${roleId}`)
                .setLabel((role?.name || `Role ${roleId}`).slice(0, 80))
                .setStyle(ButtonStyle.Secondary));
        }
        rows.push(row);
    }
    if (rows.length < 5) {
        rows.push(new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("autorole_update_roles").setLabel("Update Roles").setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId("autorole_edit_text").setLabel("Edit Panel Text").setStyle(ButtonStyle.Secondary)
        ));
    }
    return rows.slice(0, 5);
}

function buildEmbed(config, guild) {
    const roleLines = (config.autoRoleIds || []).map(roleId => {
        const role = guild?.roles?.cache?.get(roleId);
        return role ? `<@&${roleId}>` : null;
    }).filter(Boolean);
    const description = config.autoRoleDescription || "Want to get the game roles you are interested in? Click a role button below to claim or remove it!";
    const roleList = roleLines.length ? `\n\n**Available Roles**\n${roleLines.join("\n")}` : "";
    const embed = new EmbedBuilder()
        .setColor(0x3498DB)
        .setDescription(`${description}${roleList}`.slice(0, 4096));
    if (config.autoRoleImageUrl) embed.setImage(config.autoRoleImageUrl);
    return embed;
}

async function publishAutoRolePanel(client, guildId) {
    const config = await GuildConfig.findOne({ guildId });
    if (!config?.autoRoleChannelId) return;
    const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) return;
    const channel = await guild.channels.fetch(config.autoRoleChannelId).catch(() => null);
    if (!channel?.isTextBased()) return;
    let message = config.autoRoleMessageId
        ? await channel.messages.fetch(config.autoRoleMessageId).catch(() => null)
        : null;
    const payload = { embeds: [buildEmbed(config, guild)], components: buildRows(config, guild) };
    if (message) await message.edit(payload);
    else {
        message = await channel.send(payload);
        config.autoRoleMessageId = message.id;
        await config.save();
    }
}

async function handleAutoRoleButton(interaction) {
    const config = await GuildConfig.findOne({ guildId: interaction.guildId });
    if (!config) return interaction.reply({ content: "❌ The role panel is not configured.", flags: MessageFlags.Ephemeral });
    if (interaction.customId === "autorole_update_roles") {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: "❌ Only administrators can update this role panel.", flags: MessageFlags.Ephemeral });
        }
        return interaction.reply({
            content: "Select the roles to add to the role panel. Existing roles will remain available.",
            components: [new ActionRowBuilder().addComponents(
                new RoleSelectMenuBuilder()
                    .setCustomId("autorole_update_select")
                    .setPlaceholder("Select roles to add")
                    .setMinValues(1)
                    .setMaxValues(20)
            )],
            flags: MessageFlags.Ephemeral
        });
    }
    if (interaction.customId === "autorole_edit_text") {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: "❌ Only administrators can edit this panel.", flags: MessageFlags.Ephemeral });
        }
        const modal = new ModalBuilder()
            .setCustomId("autorole_edit_modal")
            .setTitle("Edit Role Panel Text")
            .addComponents(new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId("description")
                    .setLabel("Panel description")
                    .setStyle(TextInputStyle.Paragraph)
                    .setMaxLength(4000)
                    .setRequired(true)
                    .setValue(config.autoRoleDescription || "Want to get the game roles you are interested in? Click a role button below to claim or remove it!")
            ), new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId("image_url")
                    .setLabel("Panel image attachment URL (optional)")
                    .setStyle(TextInputStyle.Short)
                    .setMaxLength(1000)
                    .setRequired(false)
                    .setValue(config.autoRoleImageUrl || "")
            ));
        return interaction.showModal(modal);
    }
    if (interaction.customId.startsWith("autorole_claim:")) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const roleId = interaction.customId.split(":")[1];
        if (!(config.autoRoleIds || []).includes(roleId)) {
            return interaction.editReply({ content: "❌ This role is no longer available in the panel." });
        }
        const role = await interaction.guild.roles.fetch(roleId).catch(() => null);
        const botMember = interaction.guild.members.me || await interaction.guild.members.fetchMe();
        if (!role || role.managed || role.position >= botMember.roles.highest.position) {
            return interaction.editReply({ content: "❌ This role cannot be assigned by the bot." });
        }
        const member = await interaction.guild.members.fetch(interaction.user.id);
        if (member.roles.cache.has(roleId)) {
            await member.roles.remove(roleId, "Self-service role panel");
            return interaction.editReply({ content: `➖ Removed the ${role} role from you.` });
        }
        await member.roles.add(roleId, "Self-service role panel");
        return interaction.editReply({ content: `✅ Added the ${role} role to you.` });
    }
}

async function handleAutoRoleSelect(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: "❌ Only administrators can update this role panel.", flags: MessageFlags.Ephemeral });
    }
    await interaction.deferUpdate();
    const config = await GuildConfig.findOne({ guildId: interaction.guildId });
    if (!config) return interaction.editReply({ content: "❌ The role panel is not configured.", components: [] });
    const roles = new Set(config.autoRoleIds || []);
    for (const roleId of interaction.values) roles.add(roleId);
    if (roles.size > 20) return interaction.editReply({ content: "❌ The role panel supports up to 20 roles.", components: [] });
    config.autoRoleIds = [...roles];
    await config.save();
    await publishAutoRolePanel(interaction.client, interaction.guildId);
    return interaction.editReply({ content: "✅ The role panel has been updated.", components: [] });
}

async function handleAutoRoleModal(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: "❌ Only administrators can edit this panel.", flags: MessageFlags.Ephemeral });
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const config = await GuildConfig.findOne({ guildId: interaction.guildId });
    if (!config) return interaction.editReply({ content: "❌ The role panel is not configured." });
    config.autoRoleDescription = interaction.fields.getTextInputValue("description");
    const imageUrl = interaction.fields.getTextInputValue("image_url").trim();
    if (imageUrl) {
        if (!/^https?:\/\//i.test(imageUrl)) {
            return interaction.editReply({ content: "❌ Please provide a valid image attachment URL." });
        }
        config.autoRoleImageUrl = imageUrl;
    } else {
        config.autoRoleImageUrl = null;
    }
    await config.save();
    await publishAutoRolePanel(interaction.client, interaction.guildId);
    return interaction.editReply({ content: "✅ The role panel text has been updated." });
}

module.exports = { publishAutoRolePanel, handleAutoRoleButton, handleAutoRoleSelect, handleAutoRoleModal };
