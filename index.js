const {
    MessageFlags,
    Client,
    GatewayIntentBits,
    Events,
    ChannelType,
    PermissionFlagsBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    StringSelectMenuBuilder,
    EmbedBuilder,
    Partials
} = require("discord.js");
const mongoose = require("mongoose");
const config = require("./config/config");
const { loadSlashCommands, handleSlashCommands } = require("./handler/slashCommandHandler");
const GuildConfig = require("./models/GuildConfig");
const VoiceRoom = require("./models/VoiceRoom");
const UserLevel = require("./models/UserLevel");
const Confession = require("./models/Confession");
const { startDatabaseMonitor } = require("./utils/databaseMonitor");
const { startAuditLogMonitor } = require("./utils/auditLogMonitor");
const { startAdminDeleteMonitor, handleAdminDeleteButton } = require("./utils/adminDeleteMonitor");
const { startAutoThreadMonitor, handleAutoThreadButton } = require("./utils/autoThreadMonitor");
const { handleStaffPunishSelect, handleStaffPunishButton, handleStaffPunishModal, startStaffRoleRestoreMonitor } = require("./utils/staffPunish");
const { startWelcomeGoodbyeMonitor } = require("./utils/welcomeGoodbyeMonitor");
const { handleAutoRoleButton, handleAutoRoleSelect, handleAutoRoleModal } = require("./utils/autoRoleManager");
const changelogCommand = require("./commands/changelog");
const gitpushCommand = require("./commands/gitpush");
const { startBoosterMonitor } = require("./utils/boosterMonitor");
const { handleDatabaseSelect, handleDatabaseButton } = require("./commands/deletedatabase");
const { startStarboardMonitor } = require("./utils/starboardMonitor");
const { handleCommandLogComponent } = require("./utils/commandLogs");
const { startReminderMonitor, handleReminderButton, handleReminderSelect, handleReminderRoleSelect, handleReminderUserSelect, handleReminderModal } = require("./utils/reminderManager");
const { startVoiceLeveling } = require("./utils/voiceLeveling");
const { startTemporaryVoiceMonitor } = require("./utils/temporaryVoiceMonitor");
const { handleSocialEmbeds } = require("./utils/socialEmbeds");
const { buildRankCard } = require("./utils/rankCard");
const { toContainerPayload, wrapInteraction } = require("./utils/container");
const { startGiveawayMonitor, handleGiveawayButton } = require("./utils/giveawayManager");
const { startCustomRoleMonitor, handleCustomRoleButton, handleCustomRoleModal, handleCustomRoleSelect } = require("./utils/customRoleManager");
const {
    randomInt,
    grantXp,
    CHAT_XP_MIN,
    CHAT_XP_MAX,
    CHAT_COOLDOWN_MS,
} = require("./utils/leveling");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.GuildInvites,
        GatewayIntentBits.GuildMessageReactions
    ],
    partials: [Partials.Message, Partials.Channel, Partials.GuildMember, Partials.User, Partials.Reaction]
});

function getVoiceMemberCount(channel) {
    return channel.guild.voiceStates.cache.filter(state =>
        state.channelId === channel.id && !state.member?.user?.bot
    ).size;
}

function buildVoicePanel() {
    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle("🎙️ Voice Control Panel")
        .setDescription("Manage your personal voice room using the buttons below. Join the configured Create Voice channel to automatically create your room, then use this panel to manage it. Channel Info can be used by everyone inside a personal voice room.")
        .setFooter({ text: "Room controls are available to the current room owner only." });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("vc_rename").setLabel("Rename").setEmoji("✏️").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("vc_limit").setLabel("User Limit").setEmoji("👥").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("vc_lock").setLabel("Lock / Unlock").setEmoji("🔒").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("vc_kick").setLabel("Kick Member").setEmoji("👢").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("vc_addperm").setLabel("Add Permission").setEmoji("➕").setStyle(ButtonStyle.Success)
    );
    const statusRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("vc_status").setLabel("Edit Status").setEmoji("📝").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("vc_visibility").setLabel("Make Invisible / Visible").setEmoji("🙈").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("vc_delete").setLabel("Delete Room").setEmoji("🗑️").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("vc_info").setLabel("Channel Info").setEmoji("ℹ️").setStyle(ButtonStyle.Primary)
    );
    return { embeds: [embed], components: [row, statusRow] };
}

const voicePanelRefreshLocks = new Set();

async function refreshVoicePanel(guild, room) {
    return;
}

async function createPersonalVoice(member, triggerChannel) {
    const guild = member.guild;
    const voice = await guild.channels.create({
        name: `🔊 ${member.displayName}`.slice(0, 100),
        type: ChannelType.GuildVoice,
        parent: triggerChannel.parentId ?? undefined,
        permissionOverwrites: [
            {
                id: guild.roles.everyone.id,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect]
            },
            {
                id: member.id,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.Connect,
                    PermissionFlagsBits.ManageChannels,
                    PermissionFlagsBits.MoveMembers
                ]
            },
            {
                id: client.user.id,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.Connect,
                    PermissionFlagsBits.ManageChannels,
                    PermissionFlagsBits.MoveMembers,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ReadMessageHistory
                ]
            }
        ],
        reason: `Temporary voice room for ${member.user.tag}`
    });

    const room = await VoiceRoom.create({
        guildId: guild.id,
        channelId: voice.id,
        ownerId: member.id
    });

    await member.voice.setChannel(voice).catch(async error => {
        console.error("Could not move member to personal voice:", error.message);
        await voice.delete("Could not move owner to personal voice").catch(() => null);
        await VoiceRoom.deleteOne({ channelId: voice.id });
        throw error;
    });

    const guildConfig = await GuildConfig.findOne({ guildId: guild.id });
    const panelChannel = guildConfig?.voicePanelChannelId
        ? await guild.channels.fetch(guildConfig.voicePanelChannelId).catch(() => null)
        : null;
    if (panelChannel) {
        await voice.send(`🎙️ Your personal voice room is ready, ${member}. Use the Voice Control Panel in ${panelChannel} to manage this room.`).catch(() => null);
    }
}

async function handleVoiceStateUpdate(oldState, newState) {
    const member = newState.member ?? oldState.member;
    if (!member || member.user.bot) return;

    const guild = newState.guild ?? oldState.guild;

    if (newState.channelId && newState.channelId !== oldState.channelId) {
        const joinedRoom = await VoiceRoom.findOne({ guildId: guild.id, channelId: newState.channelId });
        if (joinedRoom) {
            await refreshVoicePanel(guild, joinedRoom);
        }
    }

    if (newState.channelId && newState.channelId !== oldState.channelId) {
        const config = await GuildConfig.findOne({ guildId: guild.id });
        if (config?.triggerChannelId === newState.channelId) {
            const trigger = await guild.channels.fetch(config.triggerChannelId).catch(() => null);
            if (trigger?.type === ChannelType.GuildVoice) {
                await createPersonalVoice(member, trigger).catch(error => console.error("Create voice failed:", error));
            }
        }
    }

    if (oldState.channelId && oldState.channelId !== newState.channelId) {
        const room = await VoiceRoom.findOne({ guildId: guild.id, channelId: oldState.channelId });
        if (!room) return;

        const channel = await guild.channels.fetch(room.channelId).catch(() => null);
        if (!channel || channel.type !== ChannelType.GuildVoice) {
            await VoiceRoom.deleteOne({ channelId: room.channelId });
            return;
        }

        const remaining = [...channel.members.values()].filter(m => !m.user.bot);
        if (remaining.length === 0) {
            await channel.delete("Temporary voice room is empty").catch(() => null);
            await VoiceRoom.deleteOne({ channelId: room.channelId });
            return;
        }

        if (room.ownerId === member.id) {
            const nextOwner = remaining.length > 5
                ? remaining[Math.floor(Math.random() * remaining.length)]
                : remaining[0];

            room.ownerId = nextOwner.id;
            await room.save();
            await channel.permissionOverwrites.delete(member.id).catch(() => null);
            await channel.permissionOverwrites.edit(nextOwner.id, {
                ViewChannel: true,
                Connect: true,
                ManageChannels: true,
                MoveMembers: true
            }).catch(() => null);

            await refreshVoicePanel(guild, room);
        }
    }
}

async function handleVoicePanel(interaction) {
    const [action, storedChannelId] = interaction.customId.split(":");
    const channelId = storedChannelId || interaction.member.voice?.channelId;
    if (!channelId) {
        return interaction.reply({ content: "❌ Join your personal voice room first to use this control panel.", flags: MessageFlags.Ephemeral });
    }
    const room = await VoiceRoom.findOne({ guildId: interaction.guildId, channelId });

    if (action === "vc_info") {
        if (!room) {
            return interaction.reply({ content: "❌ You are not currently in a registered personal voice room.", flags: MessageFlags.Ephemeral });
        }
        const infoChannel = await interaction.guild.channels.fetch(channelId).catch(() => null);
        if (!infoChannel || infoChannel.type !== ChannelType.GuildVoice) {
            return interaction.reply({ content: "❌ This voice room could not be found.", flags: MessageFlags.Ephemeral });
        }
        const everyone = infoChannel.permissionOverwrites.cache.get(interaction.guild.roles.everyone.id);
        const hidden = everyone?.deny.has(PermissionFlagsBits.ViewChannel) ?? false;
        const locked = everyone?.deny.has(PermissionFlagsBits.Connect) ?? false;
        const memberCount = [...infoChannel.members.values()].filter(member => !member.user.bot).length;
        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle("📋 Voice Channel Info")
            .setDescription(`Information for ${infoChannel}.`)
            .addFields(
                { name: "👑 Owner", value: `<@${room.ownerId}>`, inline: true },
                { name: "👥 Members", value: `${memberCount}${infoChannel.userLimit ? `/${infoChannel.userLimit}` : "/∞"}`, inline: true },
                { name: "👁️ Visibility", value: hidden ? "Invisible" : "Visible", inline: true },
                { name: "🔒 Access", value: locked ? "Locked" : "Unlocked", inline: true }
            )
            .setTimestamp();
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    if (!room) {
        return interaction.reply({ content: "❌ This voice room is no longer registered.", flags: MessageFlags.Ephemeral });
    }
    if (room.ownerId !== interaction.user.id) {
        return interaction.reply({ content: "❌ Only the current voice room owner can use this panel.", flags: MessageFlags.Ephemeral });
    }

    const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
    if (!channel || channel.type !== ChannelType.GuildVoice) {
        await VoiceRoom.deleteOne({ channelId });
        return interaction.reply({ content: "❌ The voice channel could not be found.", flags: MessageFlags.Ephemeral });
    }

    if (action === "vc_delete") {
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`vc_delete_confirm:${channelId}`).setLabel("Yes, delete room").setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`vc_delete_cancel:${channelId}`).setLabel("Cancel").setStyle(ButtonStyle.Secondary)
        );
        return interaction.reply({
            content: "⚠️ Are you sure you want to delete your personal voice room? Everyone inside will be disconnected.",
            components: [row],
            flags: MessageFlags.Ephemeral
        });
    }

    if (action === "vc_delete_confirm") {
        await interaction.deferUpdate();
        await VoiceRoom.deleteOne({ guildId: interaction.guildId, channelId });
        await channel.delete(`Personal voice room deleted by owner ${interaction.user.tag}`).catch(async error => {
            console.error("Could not delete personal voice room:", error.message);
        });
        return interaction.editReply({ content: "🗑️ Your personal voice room has been deleted.", components: [] });
    }

    if (action === "vc_delete_cancel") {
        return interaction.update({ content: "❎ Voice room deletion cancelled.", components: [] });
    }

    if (action === "vc_rename") {
        const modal = new ModalBuilder().setCustomId(`vc_modal_rename:${channelId}`).setTitle("Rename Voice Room");
        const input = new TextInputBuilder()
            .setCustomId("voice_name")
            .setLabel("New voice room name")
            .setStyle(TextInputStyle.Short)
            .setMinLength(1)
            .setMaxLength(100)
            .setRequired(true)
            .setValue(channel.name);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return interaction.showModal(modal);
    }

    if (action === "vc_status") {
        const modal = new ModalBuilder().setCustomId(`vc_modal_status:${channelId}`).setTitle("Edit Voice Channel Status");
        const input = new TextInputBuilder()
            .setCustomId("voice_status")
            .setLabel("Voice channel status (leave empty to clear)")
            .setStyle(TextInputStyle.Paragraph)
            .setMaxLength(500)
            .setRequired(false)
            .setPlaceholder("What are you doing?");
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return interaction.showModal(modal);
    }

    if (action === "vc_limit") {
        const modal = new ModalBuilder().setCustomId(`vc_modal_limit:${channelId}`).setTitle("Set User Limit");
        const input = new TextInputBuilder()
            .setCustomId("voice_limit")
            .setLabel("Member limit (0 = unlimited)")
            .setStyle(TextInputStyle.Short)
            .setMinLength(1)
            .setMaxLength(2)
            .setRequired(true)
            .setValue(String(channel.userLimit));
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return interaction.showModal(modal);
    }

    if (action === "vc_kick" || action === "vc_addperm") {
        const eligibleMembers = [...channel.members.values()]
            .filter(member => !member.user.bot && member.id !== room.ownerId);

        if (!eligibleMembers.length) {
            return interaction.reply({
                content: action === "vc_addperm"
                    ? "❌ A member must be inside this voice channel before you can grant them access."
                    : "❌ There are no other members in this voice channel to kick.",
                flags: MessageFlags.Ephemeral
            });
        }

        const menu = new StringSelectMenuBuilder()
            .setCustomId(`${action === "vc_kick" ? "vc_selectkick" : "vc_selectperm"}:${channelId}`)
            .setPlaceholder(action === "vc_kick" ? "Select a member to disconnect" : "Select a present member to allow access")
            .addOptions(eligibleMembers.slice(0, 25).map(member => ({
                label: member.displayName.slice(0, 100),
                description: member.user.tag.slice(0, 100),
                value: member.id
            })));

        return interaction.reply({
            content: action === "vc_addperm"
                ? "➕ Select a member who is currently in this voice channel. They will keep access even when the room is locked."
                : "👢 Select the member you want to disconnect from this voice channel.",
            components: [new ActionRowBuilder().addComponents(menu)],
            flags: MessageFlags.Ephemeral
        });
    }

    if (action === "vc_visibility") {
        const everyone = channel.permissionOverwrites.cache.get(interaction.guild.roles.everyone.id);
        const hidden = everyone?.deny.has(PermissionFlagsBits.ViewChannel) ?? false;
        await channel.permissionOverwrites.edit(interaction.guild.roles.everyone.id, {
            ViewChannel: hidden ? true : false
        });
        await interaction.reply({
            content: hidden ? "👁️ Your voice room is now visible." : "🙈 Your voice room is now invisible.",
            flags: MessageFlags.Ephemeral
        });
        await refreshVoicePanel(interaction.guild, room);
        return;
    }

    if (action === "vc_lock") {
        const everyone = channel.permissionOverwrites.cache.get(interaction.guild.roles.everyone.id);
        const locked = everyone?.deny.has(PermissionFlagsBits.Connect) ?? false;
        await channel.permissionOverwrites.edit(interaction.guild.roles.everyone.id, {
            Connect: locked ? true : false
        });
        await interaction.reply({
            content: locked ? "🔓 Your voice room is now unlocked." : "🔒 Your voice room is now locked.",
            flags: MessageFlags.Ephemeral
        });
        await refreshVoicePanel(interaction.guild, room);
    }
}

async function handleVoiceSelect(interaction) {
    const [action, storedChannelId] = interaction.customId.split(":");
    const channelId = storedChannelId || interaction.member.voice?.channelId;
    if (!channelId) {
        return interaction.reply({ content: "❌ Join your personal voice room first to use this control panel.", flags: MessageFlags.Ephemeral });
    }
    const room = await VoiceRoom.findOne({ guildId: interaction.guildId, channelId });

    if (!room || room.ownerId !== interaction.user.id) {
        return interaction.reply({ content: "❌ Only the current room owner can use this control.", flags: MessageFlags.Ephemeral });
    }

    const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
    if (!channel || channel.type !== ChannelType.GuildVoice) {
        return interaction.reply({ content: "❌ Voice channel not found.", flags: MessageFlags.Ephemeral });
    }

    const targetId = interaction.values[0];
    const target = await interaction.guild.members.fetch(targetId).catch(() => null);
    if (!target || target.voice.channelId !== channelId || target.user.bot || target.id === room.ownerId) {
        return interaction.update({ content: "❌ That member is no longer in your voice channel.", components: [] });
    }

    if (action === "vc_selectkick") {
        await target.voice.disconnect("Removed by temporary voice room owner");
        return interaction.update({ content: `👢 Disconnected **${target.displayName}** from your voice room.`, components: [] });
    }

    if (action === "vc_selectperm") {
        await channel.permissionOverwrites.edit(target.id, {
            ViewChannel: true,
            Connect: true
        });
        return interaction.update({
            content: `✅ **${target.displayName}** now has permission to view and join this voice room, including while it is locked.`,
            components: []
        });
    }
}

async function handleVoiceModal(interaction) {
    const [action, storedChannelId] = interaction.customId.split(":");
    const channelId = storedChannelId || interaction.member.voice?.channelId;
    if (!channelId) {
        return interaction.reply({ content: "❌ Join your personal voice room first to use this control panel.", flags: MessageFlags.Ephemeral });
    }
    const room = await VoiceRoom.findOne({ guildId: interaction.guildId, channelId });

    if (!room || room.ownerId !== interaction.user.id) {
        return interaction.reply({ content: "❌ You are not the owner of this voice room.", flags: MessageFlags.Ephemeral });
    }

    const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
    if (!channel || channel.type !== ChannelType.GuildVoice) {
        return interaction.reply({ content: "❌ Voice channel not found.", flags: MessageFlags.Ephemeral });
    }

    if (action === "vc_modal_status") {
        const status = interaction.fields.getTextInputValue("voice_status").trim();
        const botMember = interaction.guild.members.me;
        const permissions = channel.permissionsFor(botMember);
        if (!permissions?.has(PermissionFlagsBits.ManageChannels) || !permissions?.has("SetVoiceChannelStatus")) {
            return interaction.reply({ content: "❌ I need Manage Channels and Set Voice Channel Status permissions to edit this voice status.", flags: MessageFlags.Ephemeral });
        }

        await client.rest.put(`/channels/${channelId}/voice-status`, {
            body: { status: status || null }
        });
        await interaction.reply({
            content: status ? `✅ Voice channel status updated to: **${status}**` : "✅ Voice channel status cleared.",
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    if (action === "vc_modal_rename") {
        const name = interaction.fields.getTextInputValue("voice_name").trim();
        if (!name) return interaction.reply({ content: "❌ The voice room name cannot be empty.", flags: MessageFlags.Ephemeral });
        await channel.setName(name);
        await interaction.reply({ content: `✅ Voice room renamed to **${name}**.`, flags: MessageFlags.Ephemeral });
        await refreshVoicePanel(interaction.guild, room);
    }

    if (action === "vc_modal_limit") {
        const limit = Number(interaction.fields.getTextInputValue("voice_limit").trim());
        if (!Number.isInteger(limit) || limit < 0 || limit > 99) {
            return interaction.reply({ content: "❌ Enter a number from 0 to 99. Use 0 for unlimited.", flags: MessageFlags.Ephemeral });
        }
        await channel.setUserLimit(limit);
        await interaction.reply({
            content: limit === 0 ? "✅ Member limit removed." : `✅ Member limit set to **${limit}**.`,
            flags: MessageFlags.Ephemeral
        });
        await refreshVoicePanel(interaction.guild, room);
    }
}

async function handleConfessionReply(interaction) {
    const confessionId = interaction.customId.split(":")[1];
    const confession = await Confession.findOne({ guildId: interaction.guildId, confessionId, blacklisted: false });
    if (!confession) return interaction.reply({ content: "❌ This confession is no longer available.", flags: MessageFlags.Ephemeral });

    if (confession.threadId) {
        const existing = await interaction.guild.channels.fetch(confession.threadId).catch(() => null);
        if (existing) return interaction.reply({ content: `💬 Reply thread: ${existing}`, flags: MessageFlags.Ephemeral });
    }

    const parent = await interaction.guild.channels.fetch(confession.channelId).catch(() => null);
    const message = parent?.isTextBased() ? await parent.messages.fetch(confession.messageId).catch(() => null) : null;
    if (!message) return interaction.reply({ content: "❌ The confession message could not be found.", flags: MessageFlags.Ephemeral });

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const thread = await message.startThread({
        name: `Confession #${confessionId} replies`.slice(0, 100),
        autoArchiveDuration: 1440,
        reason: `Discussion thread for confession ${confessionId}`
    });
    confession.threadId = thread.id;
    await confession.save();
    await thread.send(toContainerPayload({ content: `💬 Discussion for anonymous confession **#${confessionId}**. Please be respectful.`, allowedMentions: { parse: [] } }));
    return interaction.editReply({ content: `✅ Reply thread created: ${thread}` });
}

async function handleRankClaim(interaction) {
    const targetId = interaction.customId.split(":")[1];

    if (interaction.user.id !== targetId) {
        return interaction.reply({
            content: "❌ This XP claim button belongs to another member. Run `/rank` to claim your own XP.",
            flags: MessageFlags.Ephemeral
        });
    }

    const cooldownMs = 24 * 60 * 60 * 1000;
    const now = new Date();
    const cooldownCutoff = new Date(now.getTime() - cooldownMs);

    await UserLevel.updateOne(
        { guildId: interaction.guildId, userId: targetId },
        { $setOnInsert: { xp: 0, level: 0 } },
        { upsert: true }
    );

    const claimedRecord = await UserLevel.findOneAndUpdate(
        {
            guildId: interaction.guildId,
            userId: targetId,
            $or: [
                { lastXpClaimAt: null },
                { lastXpClaimAt: { $exists: false } },
                { lastXpClaimAt: { $lte: cooldownCutoff } }
            ]
        },
        { $set: { lastXpClaimAt: now } },
        { new: false }
    );

    if (!claimedRecord) {
        const current = await UserLevel.findOne({ guildId: interaction.guildId, userId: targetId }).lean();
        const lastClaim = current?.lastXpClaimAt ? new Date(current.lastXpClaimAt).getTime() : Date.now();
        const remaining = Math.max(0, cooldownMs - (Date.now() - lastClaim));
        const hours = Math.floor(remaining / (60 * 60 * 1000));
        const minutes = Math.ceil((remaining % (60 * 60 * 1000)) / (60 * 1000));
        return interaction.reply({
            content: `⏳ You have already claimed your XP. Try again in **${hours}h ${minutes}m**.`,
            flags: MessageFlags.Ephemeral
        });
    }

    await interaction.deferUpdate();

    try {
        const maxXp = 500 + (Math.max(0, claimedRecord.level || 0) * 50);
        const amount = randomInt(100, maxXp);
        const result = await grantXp(interaction.guild, interaction.user, amount);
        const data = await buildRankCard(interaction.guild, interaction.user);
        const levelText = result.leveledUp
            ? ` 🎉 You reached **Level ${result.record.level}**!`
            : "";
        const embed = new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle("🎁 XP Reward Claimed!")
            .setDescription(`You received **${result.amount.toLocaleString()} XP**${result.multiplier > 1 ? ` (${result.multiplier}x XP Booster)` : ""}.${levelText}\n\nYour rank card has been updated below.`)
            .addFields(
                { name: "Level", value: `${data.level}`, inline: true },
                { name: "XP", value: `${data.xp.toLocaleString()} / ${data.requiredXp.toLocaleString()}`, inline: true },
                { name: "Rank", value: `#${data.rankPosition}`, inline: true }
            )
            .setImage("attachment://rank-card.png")
            .setFooter({ text: interaction.guild.name })
            .setTimestamp();

        await interaction.message.edit(toContainerPayload({
            embeds: [embed],
            files: [data.attachment],
            attachments: [],
            components: [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`rank_claim:${targetId}`)
                        .setLabel("XP Claimed")
                        .setEmoji("✅")
                        .setStyle(ButtonStyle.Success)
                        .setDisabled(true)
                )
            ]
        }));
    } catch (error) {
        console.error("XP claim failed:", error);
        await interaction.followUp({
            content: "❌ Your XP claim could not be completed. Please contact an administrator.",
            flags: MessageFlags.Ephemeral
        }).catch(() => null);
    }
}

async function handleResetButton(interaction) {
    const [action, targetId, adminId] = interaction.customId.split(":");

    if (interaction.user.id !== adminId) {
        return interaction.reply({
            content: "❌ Only the administrator who started this reset request can confirm it.",
            flags: MessageFlags.Ephemeral
        });
    }

    if (action === "levelreset_deny") {
        return interaction.update({
            content: "❎ The level reset request was cancelled.",
            embeds: [],
            components: []
        });
    }

    const config = await GuildConfig.findOne({ guildId: interaction.guildId });
    const rewardRoleIds = config?.levelRewards?.map(reward => reward.roleId) ?? [];

    if (targetId === "all") {
        await UserLevel.updateMany(
            { guildId: interaction.guildId },
            { $set: { xp: 0, level: 0 } }
        );

        if (rewardRoleIds.length) {
            const members = await interaction.guild.members.fetch();
            for (const member of members.values()) {
                if (member.user.bot) continue;
                const rolesToRemove = member.roles.cache.filter(role => rewardRoleIds.includes(role.id));
                if (rolesToRemove.size) {
                    await member.roles.remove(
                        rolesToRemove,
                        "All server leveling data reset by an administrator"
                    ).catch(error => {
                        console.error(`Could not remove level reward roles from ${member.user.tag}:`, error.message);
                    });
                }
            }
        }

        return interaction.update({
            content: "✅ Level and XP data for **all server members** have been reset to **Level 0 / 0 XP**. Configured level reward roles have also been removed where possible.",
            embeds: [],
            components: []
        });
    }

    const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);

    await UserLevel.findOneAndUpdate(
        { guildId: interaction.guildId, userId: targetId },
        { $set: { xp: 0, level: 0 } },
        { upsert: true, new: true }
    );

    if (targetMember && rewardRoleIds.length) {
        await targetMember.roles.remove(
            rewardRoleIds,
            "Member leveling data reset by an administrator"
        ).catch(() => null);
    }

    return interaction.update({
        content: `✅ Level and XP data for <@${targetId}> have been reset to **Level 0 / 0 XP**. Configured level reward roles have also been removed where possible.`,
        embeds: [],
        components: []
    });
}


async function handleModerationButton(interaction) {
    const [action, targetId, requesterId, deleteDaysRaw] = interaction.customId.split(":");
    if (interaction.user.id !== requesterId) {
        return interaction.reply({ content: "❌ Only the moderator who started this request can confirm or deny it.", flags: MessageFlags.Ephemeral });
    }
    if (action.endsWith("_deny")) {
        return interaction.update({ content: "❎ The moderation action was cancelled.", embeds: [], components: [] });
    }

    const reason = interaction.message.embeds[0]?.description
        ?.match(/\*\*Reason:\*\* ([\s\S]*?)(?:\n\*\*Delete message history:|\n\nChoose)/)?.[1]
        ?.trim() || `Moderation action requested by ${interaction.user.tag}`;

    if (action === "moderation_kick_accept") {
        const member = await interaction.guild.members.fetch(targetId).catch(() => null);
        if (!member) return interaction.update({ content: "❌ The target member is no longer in this server.", embeds: [], components: [] });
        if (!member.kickable) return interaction.update({ content: "❌ I cannot kick this member. Check my permissions and role hierarchy.", embeds: [], components: [] });
        await member.kick(reason);
        return interaction.update({ content: `✅ <@${targetId}> has been kicked.\n**Reason:** ${reason}`, embeds: [], components: [] });
    }

    if (action === "moderation_ban_accept") {
        const member = await interaction.guild.members.fetch(targetId).catch(() => null);
        if (member && !member.bannable) return interaction.update({ content: "❌ I cannot ban this member. Check my permissions and role hierarchy.", embeds: [], components: [] });
        const deleteDays = Math.max(0, Math.min(7, Number(deleteDaysRaw) || 0));
        await interaction.guild.members.ban(targetId, {
            reason,
            deleteMessageSeconds: deleteDays * 24 * 60 * 60
        });
        return interaction.update({ content: `✅ <@${targetId}> has been banned.\n**Reason:** ${reason}`, embeds: [], components: [] });
    }
}

client.once(Events.ClientReady, readyClient => {
    console.log(`Logged in as ${readyClient.user.tag}`);

    startVoicePanelAutoRefresh(readyClient);
    startVoiceLeveling(client);
    startTemporaryVoiceMonitor(client);
    startGiveawayMonitor(client);
    startCustomRoleMonitor(client).catch(error => console.error("Custom role monitor failed:", error));
    startReminderMonitor(client);
});

client.snipes = new Map();
client.editSnipes = new Map();

function pushSnipe(cache, channelId, item) {
    const entries = cache.get(channelId) || [];
    entries.unshift(item);
    cache.set(channelId, entries.slice(0, 200));
}

client.on(Events.MessageDelete, async message => {
    try {
        if (message.partial) message = await message.fetch().catch(() => null);
        if (!message?.guild || message.author?.bot) return;
        pushSnipe(client.snipes, message.channelId, {
            authorTag: message.author?.tag || "Unknown user",
            avatarURL: message.author?.displayAvatarURL({ extension: "png", size: 256 }),
            content: message.content || "",
            attachmentURL: message.attachments?.first()?.url || null,
            createdAt: message.createdAt || new Date()
        });
    } catch (error) {
        console.error("MessageDelete snipe cache error:", error);
    }
});

client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
    try {
        if (oldMessage.partial) oldMessage = await oldMessage.fetch().catch(() => null);
        if (newMessage.partial) newMessage = await newMessage.fetch().catch(() => null);
        if (!oldMessage?.guild || newMessage?.author?.bot || !newMessage) return;
        if (oldMessage.content === newMessage.content) return;
        pushSnipe(client.editSnipes, newMessage.channelId, {
            authorTag: newMessage.author?.tag || "Unknown user",
            avatarURL: newMessage.author?.displayAvatarURL({ extension: "png", size: 256 }),
            before: oldMessage.content || "",
            after: newMessage.content || "",
            editedAt: new Date()
        });
    } catch (error) {
        console.error("MessageUpdate editsnipe cache error:", error);
    }
});

client.on(Events.MessageCreate, async message => {
    if (!message.guild || message.author.bot) return;

    try {
        const config = await GuildConfig.findOne({ guildId: message.guild.id });

        if (config?.honeypotChannelId === message.channelId) {
            const member = await message.guild.members.fetch(message.author.id).catch(() => null);

            if (member && !member.permissions.has(PermissionFlagsBits.Administrator)) {
                const timeoutMs = 28 * 24 * 60 * 60 * 1000;

                if (member.moderatable) {
                    await member.timeout(timeoutMs, "Honeypot channel message");
                    await message.delete().catch(() => null);

                    const notice = await message.channel.send(toContainerPayload({
                        content: `🚨 <@${message.author.id}> has been timed out for **28 days** for sending a message in this honeypot channel.`
                    })).catch(() => null);

                    if (notice) setTimeout(() => notice.delete().catch(() => null), 10000);
                } else {
                    await message.channel.send(toContainerPayload({
                        content: `⚠️ <@${message.author.id}> triggered the honeypot, but I could not apply the timeout. Check my **Moderate Members** permission and role hierarchy.`
                    })).catch(() => null);
                }
            }
            return;
        }

        await handleSocialEmbeds(message).catch(error => {
            console.error("Social embed handler error:", error);
        });

        const record = await UserLevel.findOne({ guildId: message.guild.id, userId: message.author.id });
        const now = Date.now();
        if (record?.lastMessageXpAt && now - record.lastMessageXpAt.getTime() < CHAT_COOLDOWN_MS) return;

        const amount = randomInt(CHAT_XP_MIN, CHAT_XP_MAX);
        await grantXp(message.guild, message.author, amount);
        await UserLevel.updateOne(
            { guildId: message.guild.id, userId: message.author.id },
            { $set: { lastMessageXpAt: new Date(now) } },
            { upsert: true }
        );
    } catch (error) {
        console.error("MessageCreate processing error:", error);
    }
});

client.on(Events.InteractionCreate, async interaction => {
    wrapInteraction(interaction);
    try {
        if (interaction.isChatInputCommand()) {
            await handleSlashCommands(interaction);
            return;
        }

        if (interaction.isButton() && interaction.customId.startsWith("gitpush_")) {
            await gitpushCommand.handleButton(interaction);
            return;
        }

        if ((interaction.isButton() || interaction.isStringSelectMenu()) && interaction.customId.startsWith("commandlogs_")) {
            await handleCommandLogComponent(interaction);
            return;
        }

        if (interaction.isButton() && interaction.customId.startsWith("deletedatabase_")) {
            await handleDatabaseButton(interaction);
            return;
        }

        if (interaction.isStringSelectMenu() && interaction.customId.startsWith("deletedatabase_select:")) {
            await handleDatabaseSelect(interaction);
            return;
        }

        if (interaction.isButton() && interaction.customId.startsWith("customrole_")) {
            await handleCustomRoleButton(interaction);
            return;
        }

        if (interaction.isModalSubmit() && interaction.customId.startsWith("customrole_")) {
            await handleCustomRoleModal(interaction);
            return;
        }

        if (interaction.isUserSelectMenu() && interaction.customId.startsWith("customrole_")) {
            await handleCustomRoleSelect(interaction);
            return;
        }

        if (interaction.isButton() && (interaction.customId.startsWith("giveaway_join:") || interaction.customId.startsWith("giveaway_list:"))) {
            await handleGiveawayButton(interaction);
            return;
        }

        if (interaction.isButton() && interaction.customId.startsWith("rank_claim:")) {
            await handleRankClaim(interaction);
            return;
        }

        if (interaction.isButton() && (interaction.customId.startsWith("snipe_clear:") || interaction.customId.startsWith("editsnipe_clear:"))) {
            if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
                return interaction.reply({ content: "❌ Only administrators can clear snipe history.", flags: MessageFlags.Ephemeral });
            }
            const [kind, channelId] = interaction.customId.split(":");
            const cache = kind === "snipe_clear" ? client.snipes : client.editSnipes;
            cache.delete(channelId);
            await interaction.reply({
                content: kind === "snipe_clear" ? "🧹 Deleted-message snipe history in this channel has been cleared." : "🧹 Edited-message snipe history in this channel has been cleared.",
                flags: MessageFlags.Ephemeral
            });
            await interaction.message.delete().catch(() => null);
            return;
        }

        if (interaction.isButton() && (interaction.customId.startsWith("snipe_page:") || interaction.customId.startsWith("editsnipe_page:"))) {
            const [kind, channelId, pageRaw, ownerId] = interaction.customId.split(":");
            if (interaction.user.id !== ownerId) {
                return interaction.reply({ content: "❌ Only the person who opened this snipe list can change pages.", flags: MessageFlags.Ephemeral });
            }
            const cache = kind === "snipe_page" ? client.snipes : client.editSnipes;
            const entries = cache.get(channelId) || [];
            const page = Number(pageRaw);
            const totalPages = Math.max(1, Math.ceil(entries.length / 5));
            if (!Number.isInteger(page) || page < 0 || page >= totalPages) {
                return interaction.reply({ content: "❌ This page is no longer available.", flags: MessageFlags.Ephemeral });
            }
            const { buildSnipePage } = require("./utils/snipePages");
            return interaction.update(buildSnipePage(kind === "snipe_page" ? "snipe" : "editsnipe", channelId, entries, page, ownerId, interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)));
        }

        if (interaction.isButton() && interaction.customId.startsWith("autorole_")) {
            await handleAutoRoleButton(interaction);
            return;
        }

        if (interaction.isRoleSelectMenu() && interaction.customId === "autorole_update_select") {
            await handleAutoRoleSelect(interaction);
            return;
        }

        if (interaction.isModalSubmit() && interaction.customId === "autorole_edit_modal") {
            await handleAutoRoleModal(interaction);
            return;
        }

        if (interaction.isButton() && interaction.customId.startsWith("changelog_page:")) {
            const [, pageRaw, ownerId] = interaction.customId.split(":");
            if (interaction.user.id !== ownerId) {
                return interaction.reply({ content: "❌ Only the person who opened this changelog can change pages.", flags: MessageFlags.Ephemeral });
            }
            return interaction.update(changelogCommand.buildPage(Number(pageRaw), ownerId));
        }

        if (interaction.isButton() && interaction.customId.startsWith("admindel_punish:")) {
            await handleAdminDeleteButton(interaction);
            return;
        }

        if (interaction.isButton() && interaction.customId.startsWith("autothread_text_toggle:")) {
            await handleAutoThreadButton(interaction);
            return;
        }

        if (interaction.isUserSelectMenu() && interaction.customId.startsWith("staffpunish_user:")) {
            await handleStaffPunishSelect(interaction);
            return;
        }

        if (interaction.isButton() && interaction.customId.startsWith("staffpunish_")) {
            await handleStaffPunishButton(interaction);
            return;
        }

        if (interaction.isModalSubmit() && interaction.customId.startsWith("staffpunish_modal:")) {
            await handleStaffPunishModal(interaction);
            return;
        }

        if (interaction.isButton() && interaction.customId.startsWith("reminder_")) {
            await handleReminderButton(interaction);
            return;
        }

        if (interaction.isStringSelectMenu() && interaction.customId.startsWith("reminder_select:")) {
            await handleReminderSelect(interaction);
            return;
        }

        if (interaction.isRoleSelectMenu() && interaction.customId.startsWith("reminder_role_select:")) {
            await handleReminderRoleSelect(interaction);
            return;
        }
        if (interaction.isUserSelectMenu() && interaction.customId.startsWith("reminder_user_select:")) {
            await handleReminderUserSelect(interaction);
            return;
        }

        if (interaction.isModalSubmit() && interaction.customId.startsWith("reminder_edit_modal:")) {
            await handleReminderModal(interaction);
            return;
        }

        if (interaction.isButton() && interaction.customId.startsWith("vc_")) {
            await handleVoicePanel(interaction);
            return;
        }

        if (interaction.isStringSelectMenu() && (interaction.customId.startsWith("vc_selectkick:") || interaction.customId.startsWith("vc_selectperm:"))) {
            await handleVoiceSelect(interaction);
            return;
        }

        if (interaction.isModalSubmit() && interaction.customId.startsWith("vc_modal_")) {
            await handleVoiceModal(interaction);
            return;
        }

        if (interaction.isButton() && interaction.customId.startsWith("confess_reply:")) {
            await handleConfessionReply(interaction);
            return;
        }

        if (interaction.isButton() && interaction.customId.startsWith("levelreset_")) {
            await handleResetButton(interaction);
            return;
        }

        if (interaction.isButton() && interaction.customId.startsWith("moderation_")) {
            await handleModerationButton(interaction);
        }
    } catch (error) {
        console.error("Interaction error:", error);
        const payload = { content: "❌ Something went wrong while processing this interaction.", flags: MessageFlags.Ephemeral };
        if (interaction.deferred || interaction.replied) {
            await interaction.followUp(payload).catch(() => null);
        } else {
            await interaction.reply(payload).catch(() => null);
        }
    }
});


let voicePanelRefreshRunning = false;

async function refreshAllVoicePanels(client) {
    const configs = await GuildConfig.find({ voicePanelChannelId: { $ne: null } });
    for (const config of configs) {
        const guild = client.guilds.cache.get(config.guildId);
        if (!guild) continue;
        const channel = await guild.channels.fetch(config.voicePanelChannelId).catch(() => null);
        if (!channel?.isTextBased()) continue;
        let message = config.voicePanelMessageId
            ? await channel.messages.fetch(config.voicePanelMessageId).catch(() => null)
            : null;
        if (!message || message.author.id !== client.user.id) {
            message = await channel.send(buildVoicePanel()).catch(() => null);
            if (message) {
                config.voicePanelMessageId = message.id;
                await config.save();
            }
        } else {
            await message.edit(buildVoicePanel()).catch(() => null);
        }
    }
}

function startVoicePanelAutoRefresh(client) {
    refreshAllVoicePanels(client).catch(error => console.error("Initial voice panel refresh error:", error));
    setInterval(() => {
        refreshAllVoicePanels(client).catch(error => console.error("Scheduled voice panel refresh error:", error));
    }, 15000);
    console.log("[VoicePanel] Automatic panel refresh is active (15 seconds).");
}

async function refreshChangedVoicePanels(oldState, newState) {
    const channelIds = new Set([oldState.channelId, newState.channelId].filter(Boolean));
    if (!channelIds.size) return;

    await new Promise(resolve => setTimeout(resolve, 1000));

    for (const channelId of channelIds) {
        const room = await VoiceRoom.findOne({
            guildId: newState.guild.id,
            channelId
        });
        if (room) {
            await refreshVoicePanel(newState.guild, room);
        }
    }
}

client.on(Events.VoiceStateUpdate, (oldState, newState) => {
    handleVoiceStateUpdate(oldState, newState).catch(error => console.error("VoiceStateUpdate error:", error));
    refreshChangedVoicePanels(oldState, newState).catch(error => console.error("Voice panel refresh error:", error));
});

async function start() {
    const { token, clientId } = config.discord;
    const mongoUri = config.mongodb.uri;

    if (!token || token === "PASTE_BOT_TOKEN_HERE") {
        throw new Error("Please set discord.token in config/config.js");
    }
    if (!clientId || clientId === "PASTE_APPLICATION_CLIENT_ID_HERE") {
        throw new Error("Please set discord.clientId in config/config.js");
    }
    if (!mongoUri) {
        throw new Error("Please set mongodb.uri in config/config.js");
    }

    await mongoose.connect(mongoUri);
    console.log("Connected to MongoDB.");

    await loadSlashCommands(client, clientId);
    startDatabaseMonitor(client);
    startAuditLogMonitor(client);
    startAdminDeleteMonitor(client);
    startAutoThreadMonitor(client);
    startStaffRoleRestoreMonitor(client);
    startWelcomeGoodbyeMonitor(client);
    startBoosterMonitor(client);
    startStarboardMonitor(client);
    await client.login(token);
}

start().catch(error => {
    console.error("Bot startup failed:", error);
    process.exit(1);
});