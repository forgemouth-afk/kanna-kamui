const { Events, EmbedBuilder } = require("discord.js");
const GuildConfig = require("../models/GuildConfig");
const StarboardPost = require("../models/StarboardPost");

function normalizeEmoji(emoji) {
    return String(emoji || "").replace(/\uFE0F/g, "");
}

function isStarReaction(reaction, configuredEmoji) {
    return normalizeEmoji(reaction.emoji.name) === normalizeEmoji(configuredEmoji || "⭐");
}

async function resolveReaction(reaction) {
    if (reaction.partial) await reaction.fetch();
    if (reaction.message.partial) await reaction.message.fetch();
    return reaction;
}

function isImageAttachment(attachment) {
    if (attachment.contentType?.startsWith("image/")) return true;
    return /\.(png|jpe?g|gif|webp|avif)$/i.test(attachment.name || attachment.url || "");
}

async function syncStarboard(reaction) {
    await resolveReaction(reaction);

    const message = reaction.message;
    if (!message.guild || message.author?.bot) return;

    const guildConfig = await GuildConfig.findOne({ guildId: message.guild.id }).lean();
    if (!guildConfig?.starboardChannelId || !isStarReaction(reaction, guildConfig.starboardEmoji)) return;

    const starboardChannel = await message.guild.channels.fetch(guildConfig.starboardChannelId).catch(() => null);
    if (!starboardChannel || !starboardChannel.isTextBased() || !starboardChannel.isSendable()) return;
    if (message.channelId === starboardChannel.id) return;

    const threshold = Math.max(1, guildConfig.starboardThreshold || 3);
    const starEmoji = guildConfig.starboardEmoji || "⭐";
    const starCount = reaction.count || 0;
    let savedPost = await StarboardPost.findOne({
        guildId: message.guild.id,
        sourceMessageId: message.id
    });

    if (starCount < threshold) {
        if (savedPost?.starboardMessageId) {
            const oldPost = await starboardChannel.messages.fetch(savedPost.starboardMessageId).catch(() => null);
            if (oldPost) await oldPost.delete().catch(() => null);
        }
        if (savedPost) await savedPost.deleteOne();
        return;
    }

    const attachments = [...message.attachments.values()];
    const images = attachments.filter(isImageAttachment);
    const otherAttachments = attachments.filter(file => !isImageAttachment(file));
    const descriptionParts = [];

    if (message.content?.trim()) descriptionParts.push(message.content.trim().slice(0, 3000));
    if (otherAttachments.length) {
        descriptionParts.push(otherAttachments.map(file => `[${file.name || "Attachment"}](${file.url})`).join("\n"));
    }
    descriptionParts.push(`[Jump to original message](${message.url})`);

    const mainEmbed = new EmbedBuilder()
        .setColor(0xF1C40F)
        .setAuthor({
            name: message.member?.displayName || message.author.tag,
            iconURL: message.author.displayAvatarURL({ extension: "png", forceStatic: true })
        })
        .setDescription(descriptionParts.join("\n\n").slice(0, 4096))
        .addFields({ name: `${starEmoji} Reactions`, value: String(starCount), inline: true })
        .setFooter({ text: `#${message.channel.name} • ${message.guild.name}` })
        .setTimestamp(message.createdAt);

    if (!images.length && message.stickers.size) {
        const sticker = message.stickers.first();
        if (sticker?.url) mainEmbed.setImage(sticker.url);
    }

    const embeds = [mainEmbed];
    for (const attachment of images.slice(0, 9)) {
        embeds.push(new EmbedBuilder().setColor(0xF1C40F).setImage(attachment.url));
    }

    const payload = {
        content: `${starEmoji} **${starCount}** <#${message.channelId}>`,
        embeds,
        allowedMentions: { parse: [] }
    };

    if (savedPost?.starboardMessageId) {
        const existingMessage = await starboardChannel.messages.fetch(savedPost.starboardMessageId).catch(() => null);
        if (existingMessage) {
            await existingMessage.edit(payload);
            savedPost.starCount = starCount;
            await savedPost.save();
            return;
        }
    }

    const postedMessage = await starboardChannel.send(payload);
    if (savedPost) {
        savedPost.starboardMessageId = postedMessage.id;
        savedPost.starboardChannelId = starboardChannel.id;
        savedPost.starCount = starCount;
        await savedPost.save();
    } else {
        await StarboardPost.create({
            guildId: message.guild.id,
            sourceMessageId: message.id,
            starboardMessageId: postedMessage.id,
            starboardChannelId: starboardChannel.id,
            starCount
        });
    }
}

function startStarboardMonitor(client) {
    client.on(Events.MessageReactionAdd, reaction => {
        syncStarboard(reaction).catch(error => console.error("Starboard reaction add error:", error));
    });

    client.on(Events.MessageReactionRemove, reaction => {
        syncStarboard(reaction).catch(error => console.error("Starboard reaction remove error:", error));
    });

    console.log("[Starboard] Reaction monitoring is active.");
}

module.exports = { startStarboardMonitor };
