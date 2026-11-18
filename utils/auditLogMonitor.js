const {
    EmbedBuilder,
    Events,
    ChannelType,
    AuditLogEvent
} = require("discord.js");
const GuildConfig = require("../models/GuildConfig");

const MAX_FIELD_LENGTH = 1000;

function clip(value, max = MAX_FIELD_LENGTH) {
    if (!value) return "*None*";
    const text = String(value);
    return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

async function getLogChannel(guild) {
    const config = await GuildConfig.findOne({ guildId: guild.id }).lean();
    if (!config?.auditLogChannelId) return null;

    const channel = await guild.channels.fetch(config.auditLogChannelId).catch(() => null);
    if (!channel || !channel.isTextBased() || channel.type === ChannelType.GuildVoice) return null;
    return channel;
}

async function sendLog(guild, title, description, color = 0x5865F2, fields = []) {
    try {
        const channel = await getLogChannel(guild);
        if (!channel) return;

        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle(title)
            .setDescription(clip(description, 4000))
            .addFields(fields.slice(0, 25).map(field => ({
                name: clip(field.name, 256),
                value: clip(field.value, 1024),
                inline: Boolean(field.inline)
            })))
            .setFooter({ text: `Server: ${guild.name} • ID: ${guild.id}` })
            .setTimestamp();

        await channel.send({ embeds: [embed] });
    } catch (error) {
        console.error("[AuditLog] Failed to send log:", error);
    }
}

function startAuditLogMonitor(client) {
    client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
        try {
            if (!newMessage.guild || newMessage.author?.bot) return;
            if (oldMessage.partial) await oldMessage.fetch().catch(() => null);
            if (newMessage.partial) await newMessage.fetch().catch(() => null);

            const before = oldMessage.content;
            const after = newMessage.content;
            if (before === after) return;

            await sendLog(
                newMessage.guild,
                "✏️ Message Edited",
                `A message was edited by <@${newMessage.author.id}> in <#${newMessage.channelId}>.`,
                0xF1C40F,
                [
                    { name: "Before", value: clip(before || "*Content unavailable*") },
                    { name: "After", value: clip(after || "*Empty message*") },
                    { name: "Message Link", value: newMessage.url || "*Unavailable*" }
                ]
            );
        } catch (error) {
            console.error("[AuditLog] MessageUpdate error:", error);
        }
    });

    client.on(Events.MessageDelete, async message => {
        try {
            if (message.partial) await message.fetch().catch(() => null);
            if (!message.guild || message.author?.bot) return;

            await sendLog(
                message.guild,
                "🗑️ Message Deleted",
                `A message was deleted in <#${message.channelId}>.`,
                0xED4245,
                [
                    { name: "Author", value: message.author ? `<@${message.author.id}> (${message.author.tag})` : "*Unknown / unavailable*" },
                    { name: "Content", value: clip(message.content || "*Content unavailable*") },
                    { name: "Attachments", value: message.attachments?.size ? [...message.attachments.values()].map(item => item.url).join("\n") : "*None*" }
                ]
            );
        } catch (error) {
            console.error("[AuditLog] MessageDelete error:", error);
        }
    });

    client.on(Events.MessageDeleteBulk, async messages => {
        const first = messages.first();
        if (!first?.guild) return;

        await sendLog(
            first.guild,
            "🧹 Bulk Messages Deleted",
            `**${messages.size}** messages were bulk deleted in <#${first.channelId}>.`,
            0xED4245,
            [{ name: "Channel", value: `<#${first.channelId}>` }]
        );
    });

    client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
        const member = newState.member ?? oldState.member;
        if (!member || member.user.bot) return;

        const oldChannel = oldState.channel;
        const newChannel = newState.channel;

        if (!oldChannel && newChannel) {
            await sendLog(
                newState.guild,
                "🔊 Voice Channel Joined",
                `<@${member.id}> joined **${newChannel.name}**.`,
                0x57F287,
                [{ name: "Member", value: `<@${member.id}>` }, { name: "Channel", value: `<#${newChannel.id}>` }]
            );
            return;
        }

        if (oldChannel && !newChannel) {
            await sendLog(
                oldState.guild,
                "🔇 Voice Channel Left",
                `<@${member.id}> left **${oldChannel.name}**.`,
                0xED4245,
                [{ name: "Member", value: `<@${member.id}>` }, { name: "Channel", value: `<#${oldChannel.id}>` }]
            );
            return;
        }

        if (oldChannel && newChannel && oldChannel.id !== newChannel.id) {
            await sendLog(
                newState.guild,
                "🔀 Voice Channel Moved",
                `<@${member.id}> moved from **${oldChannel.name}** to **${newChannel.name}**.`,
                0x5865F2,
                [
                    { name: "Member", value: `<@${member.id}>` },
                    { name: "From", value: `<#${oldChannel.id}>` },
                    { name: "To", value: `<#${newChannel.id}>` }
                ]
            );
            return;
        }

        const changes = [];
        if (oldState.streaming !== newState.streaming) changes.push(`Streaming: **${newState.streaming ? "Started" : "Stopped"}**`);

        if (changes.length) {
            await sendLog(
                newState.guild,
                "🎙️ Voice State Updated",
                `<@${member.id}> updated voice settings.`,
                0x5865F2,
                [{ name: "Changes", value: changes.join("\n") }, { name: "Channel", value: newChannel ? `<#${newChannel.id}>` : "*Not connected*" }]
            );
        }
    });

    client.on(Events.GuildMemberAdd, async member => {
        await sendLog(
            member.guild,
            "📥 Member Joined",
            `<@${member.id}> joined the server.`,
            0x57F287,
            [
                { name: "User", value: `${member.user.tag} (${member.id})` },
                { name: "Account Created", value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:F>` }
            ]
        );
    });

    client.on(Events.GuildMemberRemove, async member => {
        await sendLog(
            member.guild,
            "📤 Member Left",
            `${member.user.tag} left or was removed from the server.`,
            0xED4245,
            [{ name: "User", value: `${member.user.tag} (${member.id})` }]
        );
    });

    client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
        const changes = [];

        if (oldMember.nickname !== newMember.nickname) {
            changes.push(`Nickname: **${oldMember.nickname || oldMember.user.username}** → **${newMember.nickname || newMember.user.username}**`);
        }

        const oldRoles = oldMember.roles.cache;
        const newRoles = newMember.roles.cache;
        const addedRoles = newRoles.filter(role => !oldRoles.has(role.id));
        const removedRoles = oldRoles.filter(role => !newRoles.has(role.id));

        if (addedRoles.size) changes.push(`Roles added: ${addedRoles.map(role => `<@&${role.id}>`).join(", ")}`);
        if (removedRoles.size) changes.push(`Roles removed: ${removedRoles.map(role => `<@&${role.id}>`).join(", ")}`);

        if (oldMember.communicationDisabledUntilTimestamp !== newMember.communicationDisabledUntilTimestamp) {
            changes.push(`Timeout: **${newMember.communicationDisabledUntil ? `<t:${Math.floor(newMember.communicationDisabledUntilTimestamp / 1000)}:F>` : "Removed"}**`);
        }

        if (changes.length) {
            await sendLog(
                newMember.guild,
                "👤 Member Updated",
                `Changes detected for <@${newMember.id}>.`,
                0xF1C40F,
                [{ name: "Member", value: `<@${newMember.id}> (${newMember.user.tag})` }, { name: "Changes", value: changes.join("\n") }]
            );
        }
    });

    client.on(Events.GuildBanAdd, async ban => {
        await sendLog(
            ban.guild,
            "🔨 Member Banned",
            `**${ban.user.tag}** was banned from the server.`,
            0xED4245,
            [{ name: "User", value: `${ban.user.tag} (${ban.user.id})` }, { name: "Reason", value: ban.reason || "*No reason provided / unavailable*" }]
        );
    });

    client.on(Events.GuildBanRemove, async ban => {
        await sendLog(
            ban.guild,
            "♻️ Member Unbanned",
            `**${ban.user.tag}** was unbanned from the server.`,
            0x57F287,
            [{ name: "User", value: `${ban.user.tag} (${ban.user.id})` }]
        );
    });

    client.on(Events.ChannelCreate, async channel => {
        if (!channel.guild) return;
        await sendLog(channel.guild, "📁 Channel Created", `Channel ${channel} was created.`, 0x57F287, [
            { name: "Channel", value: `${channel.name} (${channel.id})` },
            { name: "Type", value: String(channel.type) }
        ]);
    });

    client.on(Events.ChannelDelete, async channel => {
        if (!channel.guild) return;
        await sendLog(channel.guild, "🗑️ Channel Deleted", `Channel **${channel.name}** was deleted.`, 0xED4245, [
            { name: "Channel", value: `${channel.name} (${channel.id})` },
            { name: "Type", value: String(channel.type) }
        ]);
    });

    client.on(Events.ChannelUpdate, async (oldChannel, newChannel) => {
        if (!newChannel.guild) return;
        const changes = [];
        if (oldChannel.name !== newChannel.name) changes.push(`Name: **${oldChannel.name}** → **${newChannel.name}**`);
        if (oldChannel.parentId !== newChannel.parentId) changes.push(`Category changed.`);
        if (oldChannel.topic !== newChannel.topic) changes.push(`Topic updated.`);
        if (changes.length) {
            await sendLog(newChannel.guild, "🛠️ Channel Updated", `${newChannel} was updated.`, 0xF1C40F, [
                { name: "Channel", value: `${newChannel.name} (${newChannel.id})` },
                { name: "Changes", value: changes.join("\n") }
            ]);
        }
    });

    client.on(Events.GuildRoleCreate, async role => {
        await sendLog(role.guild, "🏷️ Role Created", `Role ${role} was created.`, 0x57F287, [
            { name: "Role", value: `${role.name} (${role.id})` }
        ]);
    });

    client.on(Events.GuildRoleDelete, async role => {
        await sendLog(role.guild, "🗑️ Role Deleted", `Role **${role.name}** was deleted.`, 0xED4245, [
            { name: "Role", value: `${role.name} (${role.id})` }
        ]);
    });

    client.on(Events.GuildRoleUpdate, async (oldRole, newRole) => {
        const changes = [];
        if (oldRole.name !== newRole.name) changes.push(`Name: **${oldRole.name}** → **${newRole.name}**`);
        if (oldRole.color !== newRole.color) changes.push("Role color changed.");
        if (oldRole.permissions.bitfield !== newRole.permissions.bitfield) changes.push("Role permissions changed.");
        if (oldRole.hoist !== newRole.hoist) changes.push(`Hoist: **${newRole.hoist ? "Enabled" : "Disabled"}**`);
        if (oldRole.mentionable !== newRole.mentionable) changes.push(`Mentionable: **${newRole.mentionable ? "Enabled" : "Disabled"}**`);

        if (changes.length) {
            await sendLog(newRole.guild, "🏷️ Role Updated", `Role ${newRole} was updated.`, 0xF1C40F, [
                { name: "Role", value: `${newRole.name} (${newRole.id})` },
                { name: "Changes", value: changes.join("\n") }
            ]);
        }
    });

    client.on(Events.InviteCreate, async invite => {
        if (!invite.guild) return;
        await sendLog(invite.guild, "🔗 Invite Created", `An invite was created for ${invite.channel ? `<#${invite.channel.id}>` : "a channel"}.`, 0x57F287, [
            { name: "Code", value: invite.code },
            { name: "Creator", value: invite.inviter ? `<@${invite.inviter.id}>` : "*Unknown*" },
            { name: "Expires", value: invite.expiresAt ? `<t:${Math.floor(invite.expiresAt.getTime() / 1000)}:F>` : "Never" }
        ]);
    });

    client.on(Events.InviteDelete, async invite => {
        if (!invite.guild) return;
        await sendLog(invite.guild, "🔗 Invite Deleted", `Invite **${invite.code}** was deleted.`, 0xED4245, [
            { name: "Channel", value: invite.channel ? `<#${invite.channel.id}>` : "*Unknown*" }
        ]);
    });

    client.on(Events.GuildAuditLogEntryCreate, async (entry, guild) => {
        const actionName = String(entry.action);
        await sendLog(
            guild,
            "📋 Audit Log Event",
            `A server audit-log event was recorded: **${actionName}**.`,
            0x5865F2,
            [
                ...(entry.executor ? [{ name: "Executor", value: `<@${entry.executor.id}>` }] : []),
                ...(entry.target ? [{ name: "Target", value: `${entry.target.tag ?? entry.target.name ?? "Unknown"} (${entry.target.id ?? "N/A"})` }] : []),
                ...(entry.reason ? [{ name: "Reason", value: entry.reason }] : [])
            ]
        );
    });

    console.log("[AuditLog] Server activity logging is active.");
}

module.exports = { startAuditLogMonitor, sendLog };