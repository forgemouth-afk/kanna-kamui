const {
    SlashCommandBuilder,
    ChannelType,
    PermissionFlagsBits,
    MessageFlags,
    EmbedBuilder
} = require("discord.js");
const GuildConfig = require("../models/GuildConfig");

module.exports = {
    adminOnly: true,
    data: new SlashCommandBuilder()
        .setName("starboard")
        .setDescription("Configure the starboard channel and required star count.")
        .addChannelOption(option =>
            option.setName("channel")
                .setDescription("Text channel where starred messages will be posted.")
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName("emoji")
                .setDescription("One default Unicode emoji to track.")
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option.setName("count")
                .setDescription("Number of reactions required (1-100).")
                .setMinValue(1)
                .setMaxValue(100)
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
        const channel = interaction.options.getChannel("channel", true);
        const emoji = interaction.options.getString("emoji", true).trim();
        const count = interaction.options.getInteger("count", true);
        const segments = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(emoji)];
        const isDefaultEmoji = segments.length === 1
            && (/\p{Extended_Pictographic}/u.test(emoji)
                || /\p{Regional_Indicator}{2}/u.test(emoji)
                || /^[0-9#*]\uFE0F?\u20E3$/u.test(emoji));

        if (!isDefaultEmoji || emoji.length > 32 || /<a?:\w+:\d+>/.test(emoji)) {
            return interaction.reply({
                content: "❌ Please provide exactly one default Unicode emoji. Custom server emojis are not supported.",
                flags: MessageFlags.Ephemeral
            });
        }

        const previousConfig = await GuildConfig.findOne({ guildId: interaction.guildId });
        if (previousConfig?.starboardNoticeMessageId && previousConfig.starboardChannelId) {
            const previousChannel = await interaction.guild.channels.fetch(previousConfig.starboardChannelId).catch(() => null);
            if (previousChannel?.isTextBased()) {
                const previousNotice = await previousChannel.messages.fetch(previousConfig.starboardNoticeMessageId).catch(() => null);
                if (previousNotice) await previousNotice.delete().catch(() => null);
            }
        }

        const noticeEmbed = new EmbedBuilder()
            .setColor(0xF1C40F)
            .setTitle("📌 Starboard is active in this channel!")
            .setDescription(`React to messages in this server with ${emoji}. When a message receives at least **${count}** ${emoji} reactions, the bot will feature it here automatically.`)
            .addFields(
                { name: "Channel", value: `${channel}`, inline: true },
                { name: "Tracked Emoji", value: emoji, inline: true },
                { name: "Required Reactions", value: String(count), inline: true }
            )
            .setFooter({ text: "Messages are automatically added, updated, or removed as reactions change." });

        const notice = await channel.send({
            embeds: [noticeEmbed],
            allowedMentions: { parse: [] }
        });

        await GuildConfig.findOneAndUpdate(
            { guildId: interaction.guildId },
            {
                $set: {
                    starboardChannelId: channel.id,
                    starboardThreshold: count,
                    starboardEmoji: emoji,
                    starboardNoticeMessageId: notice.id
                }
            },
            { upsert: true, new: true }
        );

        return interaction.reply({
            content: `⭐ Starboard is configured in ${channel}. A message will be featured after **${count}** ${emoji} reactions.`,
            flags: MessageFlags.Ephemeral
        });
    }
};
