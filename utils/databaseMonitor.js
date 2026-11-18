const { Events, ChannelType, PermissionFlagsBits } = require("discord.js");
const UserLevel = require("../models/UserLevel");
const VoiceRoom = require("../models/VoiceRoom");
const { toContainerPayload } = require("./container");

async function cleanDepartedMember(member) {
    const { guild, user } = member;

    const result = await UserLevel.deleteMany({
        guildId: guild.id,
        userId: user.id
    });

    const ownedRooms = await VoiceRoom.find({
        guildId: guild.id,
        ownerId: user.id
    });

    for (const room of ownedRooms) {
        const channel = await guild.channels.fetch(room.channelId).catch(() => null);

        if (!channel || channel.type !== ChannelType.GuildVoice) {
            await VoiceRoom.deleteOne({ _id: room._id });
            continue;
        }

        const remainingMembers = [...channel.members.values()]
            .filter(memberInVoice => !memberInVoice.user.bot && memberInVoice.id !== user.id);

        if (remainingMembers.length === 0) {
            await channel.delete("The voice room owner left the server and the room is empty.")
                .catch(() => null);
            await VoiceRoom.deleteOne({ _id: room._id });
            continue;
        }

        const nextOwner = remainingMembers.length > 5
            ? remainingMembers[Math.floor(Math.random() * remainingMembers.length)]
            : remainingMembers[0];

        room.ownerId = nextOwner.id;
        await room.save();

        await channel.permissionOverwrites.delete(user.id).catch(() => null);
        await channel.permissionOverwrites.edit(nextOwner.id, {
            ViewChannel: true,
            Connect: true,
            ManageChannels: true,
            MoveMembers: true
        }).catch(() => null);

        if (room.panelMessageId) {
            const panelMessage = await channel.messages.fetch(room.panelMessageId).catch(() => null);
            if (panelMessage) {
                const embed = panelMessage.embeds[0];
                if (embed) {
                    const { EmbedBuilder } = require("discord.js");
                    const updatedEmbed = EmbedBuilder.from(embed)
                        .setDescription("Manage your personal voice room using the buttons below.")
                        .setFields(
                            { name: "👑 Owner", value: `<@${nextOwner.id}>`, inline: true },
                            { name: "👥 Members", value: `${remainingMembers.length}/${channel.userLimit || "∞"}`, inline: true },
                            { name: "🔒 Access", value: channel.permissionOverwrites.cache.get(guild.roles.everyone.id)?.deny.has(PermissionFlagsBits.Connect) ? "Locked" : "Unlocked", inline: true }
                        );
                    await panelMessage.edit(toContainerPayload({ embeds: [updatedEmbed] })).catch(() => null);
                }
            }
        }
    }

    console.log(
        `[DatabaseMonitor] Cleaned departed member ${user.tag} (${user.id}) in ${guild.name}. ` +
        `Deleted ${result.deletedCount} leveling record(s).`
    );
}

function startDatabaseMonitor(client) {
    client.on(Events.GuildMemberRemove, member => {
        cleanDepartedMember(member).catch(error => {
            console.error(
                `[DatabaseMonitor] Failed to clean ${member.user.tag} (${member.user.id}):`,
                error
            );
        });
    });

    console.log("[DatabaseMonitor] Guild member departure monitoring is active.");
}

module.exports = {
    startDatabaseMonitor,
    cleanDepartedMember
};