const { Events, ChannelType } = require("discord.js");
const { grantXp, randomInt, VOICE_XP_MIN, VOICE_XP_MAX, VOICE_INTERVAL_MS } = require("./leveling");

const eligibleMembers = new Map();
let interval = null;
const refreshTimers = new Map();

function makeKey(guildId, userId) {
    return `${guildId}:${userId}`;
}

function isVoiceEligible(member, channel, afkChannelId) {
    if (!member || member.user.bot || !channel) return false;
    if (channel.id === afkChannelId) return false;

    const state = member.voice;
    if (!state?.channelId || state.channelId !== channel.id) return false;
    return true;
}

function refreshGuild(guild) {
    const now = Date.now();
    const current = new Map();

    for (const channel of guild.channels.cache.values()) {
        if (
            channel.type !== ChannelType.GuildVoice &&
            channel.type !== ChannelType.GuildStageVoice
        ) continue;
        if (channel.id === guild.afkChannelId) continue;

        const humans = [...channel.members.values()].filter(member => !member.user.bot);

        for (const member of humans) {
            if (!isVoiceEligible(member, channel, guild.afkChannelId)) continue;

            const key = makeKey(guild.id, member.id);
            const previous = eligibleMembers.get(key);
            current.set(key, {
                guildId: guild.id,
                userId: member.id,
                since: previous?.since ?? now,
                lastAwardAt: previous?.lastAwardAt ?? now,
                channelId: channel.id
            });
        }
    }

    for (const [key, entry] of eligibleMembers) {
        if (entry.guildId === guild.id && !current.has(key)) {
            eligibleMembers.delete(key);
        }
    }

    for (const [key, entry] of current) {
        eligibleMembers.set(key, entry);
    }
}

function scheduleRefresh(guild) {
    const existing = refreshTimers.get(guild.id);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
        refreshTimers.delete(guild.id);
        refreshGuild(guild);
    }, 300);

    refreshTimers.set(guild.id, timer);
}

async function awardEligibleMembers(client) {
    const now = Date.now();

    for (const guild of client.guilds.cache.values()) {
        refreshGuild(guild);
    }

    for (const [key, entry] of eligibleMembers) {
        if (now - entry.since < VOICE_INTERVAL_MS) continue;
        if (now - entry.lastAwardAt < VOICE_INTERVAL_MS) continue;

        const guild = client.guilds.cache.get(entry.guildId);
        if (!guild) {
            eligibleMembers.delete(key);
            continue;
        }

        const member = guild.members.cache.get(entry.userId);
        if (!member || !member.voice.channelId || member.voice.channelId !== entry.channelId) {
            eligibleMembers.delete(key);
            continue;
        }

        entry.lastAwardAt = now;

        try {
            await grantXp(guild, member.user, randomInt(VOICE_XP_MIN, VOICE_XP_MAX));
        } catch (error) {
            console.error(`[VoiceLeveling] Could not grant voice XP to ${entry.userId}:`, error);
        }
    }
}

function startVoiceLeveling(client) {
    if (interval) clearInterval(interval);

    for (const guild of client.guilds.cache.values()) {
        refreshGuild(guild);
    }

    client.on(Events.VoiceStateUpdate, (oldState, newState) => {
        const guild = newState.guild ?? oldState.guild;
        if (guild) scheduleRefresh(guild);
    });

    interval = setInterval(() => {
        awardEligibleMembers(client).catch(error => {
            console.error("[VoiceLeveling] Interval error:", error);
        });
    }, 5000);

    console.log("[VoiceLeveling] Native voice XP is active for all human members outside the AFK channel.");
}

module.exports = { startVoiceLeveling };
