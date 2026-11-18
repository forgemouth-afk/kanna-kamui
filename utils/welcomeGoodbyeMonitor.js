const { Events, AttachmentBuilder } = require("discord.js");
const GuildConfig = require("../models/GuildConfig");
const { createGreetingsCard } = require("./greetingsCard");
const appConfig = require("../config/config");
const { toContainerPayload } = require("./container");

async function sendGreeting(member, channelId, type) {
    if (!channelId) return;

    const channel = await member.guild.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased() || !channel.send) return;

    const defaultMessage = type === "welcome"
        ? appConfig.greetings.welcomeMessage
        : appConfig.greetings.goodbyeMessage;
    const greetingText = String(defaultMessage || "")
        .replace(/\{user\}/gi, `<@${member.id}>`)
        .replace(/\{username\}/gi, member.user.globalName || member.user.username)
        .replace(/\{server\}/gi, member.guild.name)
        .replace(/\{memberCount\}/gi, String(member.guild.memberCount));

    try {
        const cardText = greetingText.replace(new RegExp(`<@!?${member.id}>`, "g"), member.user.globalName || member.user.username);
        const image = await createGreetingsCard(member, type, cardText);
        const attachment = new AttachmentBuilder(image, {
            name: `${type}-${member.id}.png`
        });

        let content = greetingText || (type === "welcome"
            ? `🎉 Welcome to **${member.guild.name}**!`
            : `👋 **${member.user.globalName || member.user.username}** has left the server.`);
        if (!content.includes(`<@${member.id}>`) && !content.includes(`<@!${member.id}>`)) {
            content = `${content} <@${member.id}>`;
        }

        await channel.send(toContainerPayload({
            content,
            files: [attachment],
            allowedMentions: { users: [member.id] }
        }));
    } catch (error) {
        console.error(`[${type}] Could not generate/send card for ${member.user.tag}:`, error);
        await channel.send(toContainerPayload({ content: greetingText || (type === "welcome"
            ? `🎉 Welcome to **${member.guild.name}**, <@${member.id}>!`
            : `👋 **${member.user.globalName || member.user.username}** (<@${member.id}>) has left the server.`
        ), allowedMentions: { users: [member.id] } })).catch(() => null);
    }
}

async function sendWelcomeText(member, channelId) {
    if (!channelId) return;
    const channel = await member.guild.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased() || !channel.send) return;

    const message = await channel.send({
        content: `🎉 Welcome to **${member.guild.name}**, <@${member.id}>!
We're happy to have you here. Make yourself at home and enjoy your stay!`,
        allowedMentions: { users: [member.id] }
    }).catch(error => {
        console.error("[welcome] Could not send welcome chat message:", error.message);
        return null;
    });

    if (message) setTimeout(() => message.delete().catch(() => null), 5 * 60 * 1000).unref?.();
}

function startWelcomeGoodbyeMonitor(client) {
    client.on(Events.GuildMemberAdd, async member => {
        const guildConfig = await GuildConfig.findOne({ guildId: member.guild.id }).catch(() => null);
        const configuredChannelId = guildConfig?.welcomeChannelId || appConfig.greetings.welcomeChannelId;
        const channelId = configuredChannelId && /^\d{17,20}$/.test(configuredChannelId)
            ? configuredChannelId
            : null;
        await sendGreeting(member, channelId, "welcome");
        await sendWelcomeText(member, guildConfig?.welcomeMessageChannelId);
    });

    client.on(Events.GuildMemberRemove, async member => {
        const guildConfig = await GuildConfig.findOne({ guildId: member.guild.id }).catch(() => null);
        const configuredChannelId = appConfig.greetings.goodbyeChannelId;
        const channelId = configuredChannelId && /^\d{17,20}$/.test(configuredChannelId)
            ? configuredChannelId
            : guildConfig?.goodbyeChannelId;
        await sendGreeting(member, channelId, "goodbye");
    });

    console.log("[WelcomeGoodbye] Member greeting cards are active.");
}

module.exports = { startWelcomeGoodbyeMonitor };
