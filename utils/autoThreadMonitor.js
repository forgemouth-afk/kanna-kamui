const { Events, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require("discord.js");
const GuildConfig = require("../models/GuildConfig");
const AutoThreadPost = require("../models/AutoThreadPost");

function hasImageAttachment(message) {
    return message.attachments.some(attachment => {
        const contentType = attachment.contentType || "";
        return contentType.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|avif)$/i.test(attachment.name || attachment.url || "");
    });
}

async function handleAutoThreadMessage(message) {
    if (!message.guild || message.author.bot || message.system) return;
    const config = await GuildConfig.findOne({ guildId: message.guild.id }).lean();

    if (message.channel.isThread()) {
        const threadPost = await AutoThreadPost.findOne({ guildId: message.guild.id, threadId: message.channelId });
        if (!threadPost) return;
        if (!threadPost.allowTextOnly && !message.attachments.size) {
            await message.delete().catch(() => null);
        }
        return;
    }

    if (!config?.autoThreadChannelIds?.includes(message.channelId)) return;
    if (!hasImageAttachment(message)) {
        await message.delete().catch(() => null);
        return;
    }

    const botPermissions = message.channel.permissionsFor(message.guild.members.me);
    if (!botPermissions?.has(PermissionFlagsBits.CreatePublicThreads) || !botPermissions?.has(PermissionFlagsBits.SendMessagesInThreads)) return;

    const thread = await message.startThread({
        name: `Comments - ${message.member?.displayName || message.author.username}`.slice(0, 100),
        autoArchiveDuration: 1440,
        reason: "Automatic comments thread for member image attachment"
    }).catch(error => {
        console.error("[AutoThread] Could not create thread:", error.message);
        return null;
    });
    if (!thread) return;

    await AutoThreadPost.create({
        guildId: message.guild.id,
        sourceMessageId: message.id,
        threadId: thread.id,
        ownerId: message.author.id,
        allowTextOnly: false
    });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`autothread_text_toggle:${thread.id}:${message.author.id}`)
            .setLabel("Allow Message Only")
            .setStyle(ButtonStyle.Secondary)
    );
    await thread.send({
        content: `🖼️ Comments for ${message.author}. Messages must include an attachment unless the post owner enables text-only messages.`,
        components: [row],
        allowedMentions: { users: [message.author.id] }
    }).catch(() => null);
}

async function handleAutoThreadButton(interaction) {
    const [, threadId, ownerId] = interaction.customId.split(":");
    if (interaction.user.id !== ownerId) {
        return interaction.reply({ content: "❌ Only the member who created this image post can change this setting.", flags: MessageFlags.Ephemeral });
    }
    const record = await AutoThreadPost.findOne({ guildId: interaction.guildId, threadId });
    if (!record) return interaction.reply({ content: "❌ This image thread is no longer registered.", flags: MessageFlags.Ephemeral });
    record.allowTextOnly = !record.allowTextOnly;
    await record.save();
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`autothread_text_toggle:${threadId}:${ownerId}`)
            .setLabel(record.allowTextOnly ? "Disable Message Only" : "Allow Message Only")
            .setStyle(record.allowTextOnly ? ButtonStyle.Success : ButtonStyle.Secondary)
    );
    return interaction.update({
        content: record.allowTextOnly
            ? "🖼️ Comments thread: text-only messages are now allowed by the post owner."
            : "🖼️ Comments thread: messages must include an attachment.",
        components: [row]
    });
}

async function handleAutoThreadSourceDelete(message) {
    if (!message.guild || !message.id) return;
    const record = await AutoThreadPost.findOne({ guildId: message.guild.id, sourceMessageId: message.id });
    if (!record) return;
    const thread = await message.guild.channels.fetch(record.threadId).catch(() => null);
    if (thread) await thread.delete("Original image post was deleted").catch(() => null);
    await AutoThreadPost.deleteOne({ _id: record._id });
}

function startAutoThreadMonitor(client) {
    client.on(Events.MessageCreate, message => {
        handleAutoThreadMessage(message).catch(error => console.error("[AutoThread]", error));
    });
    client.on(Events.MessageDelete, message => {
        handleAutoThreadSourceDelete(message).catch(error => console.error("[AutoThread delete]", error));
    });
}

module.exports = { startAutoThreadMonitor, handleAutoThreadButton };
