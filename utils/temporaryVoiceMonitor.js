const { ChannelType } = require("discord.js");
const VoiceRoom = require("../models/VoiceRoom");

const CHECK_INTERVAL_MS = 60 * 1000;
const STARTUP_GRACE_MS = 15 * 1000;
const deletingRooms = new Set();

async function reconcileTemporaryVoiceRooms(client) {
    const rooms = await VoiceRoom.find({}).lean();

    for (const room of rooms) {
        if (deletingRooms.has(room.channelId)) continue;
        deletingRooms.add(room.channelId);

        try {
            const guild = client.guilds.cache.get(room.guildId);
            if (!guild) continue;

            let channel = guild.channels.cache.get(room.channelId);
            if (!channel) {
                try {
                    channel = await guild.channels.fetch(room.channelId);
                } catch (error) {
                    if (error.code === 10003 || error.code === "UNKNOWN_CHANNEL") {
                        await VoiceRoom.deleteOne({ _id: room._id });
                        console.log(`[TemporaryVoiceMonitor] Removed stale room record ${room.channelId}; channel no longer exists.`);
                    } else {
                        console.error(`[TemporaryVoiceMonitor] Could not fetch channel ${room.channelId}:`, error.message);
                    }
                    continue;
                }
            }

            if (!channel) {
                await VoiceRoom.deleteOne({ _id: room._id });
                console.log(`[TemporaryVoiceMonitor] Removed stale room record ${room.channelId}; channel no longer exists.`);
                continue;
            }

            if (channel.type !== ChannelType.GuildVoice) {
                await VoiceRoom.deleteOne({ _id: room._id });
                console.log(`[TemporaryVoiceMonitor] Removed stale room record ${room.channelId}; it is no longer a voice channel.`);
                continue;
            }

            const humanMembers = [...channel.members.values()].filter(member => !member.user.bot);
            if (humanMembers.length > 0) continue;

            await channel.delete("Temporary voice room cleanup: no human members remain.");
            await VoiceRoom.deleteOne({ _id: room._id });
            console.log(`[TemporaryVoiceMonitor] Deleted empty temporary voice channel ${channel.name} (${channel.id}).`);
        } catch (error) {
            console.error(`[TemporaryVoiceMonitor] Failed to reconcile room ${room.channelId}:`, error);
        } finally {
            deletingRooms.delete(room.channelId);
        }
    }
}

function startTemporaryVoiceMonitor(client) {
    let running = false;

    const run = async () => {
        if (running || !client.isReady()) return;
        running = true;
        try {
            await reconcileTemporaryVoiceRooms(client);
        } catch (error) {
            console.error("[TemporaryVoiceMonitor] Monitor cycle failed:", error);
        } finally {
            running = false;
        }
    };

    setTimeout(() => {
        run();
        const interval = setInterval(run, CHECK_INTERVAL_MS);
        interval.unref?.();
    }, STARTUP_GRACE_MS).unref?.();

    console.log("[TemporaryVoiceMonitor] Startup reconciliation and 60-second empty-room monitoring enabled.");
}

module.exports = {
    startTemporaryVoiceMonitor,
    reconcileTemporaryVoiceRooms
};
