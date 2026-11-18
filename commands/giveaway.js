const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const Giveaway = require("../models/Giveaway");
const { toContainerPayload } = require("../utils/container");

function parseDuration(value) {
    const match = value.match(/^(\d+)(m|h|d)$/i);
    if (!match) return null;
    const amount = Number(match[1]);
    const unit = match[2].toLowerCase();
    const ms = amount * (unit === "m" ? 60000 : unit === "h" ? 3600000 : 86400000);
    return ms >= 60000 && ms <= 30 * 86400000 ? ms : null;
}

function giveawayPayload(giveaway) {
    const embed = new EmbedBuilder()
        .setColor(giveaway.ended ? 0x747F8D : 0x57F287)
        .setTitle(giveaway.ended ? "🎉 Giveaway Ended" : "🎉 Giveaway")
        .setDescription(`**Prize:** ${giveaway.prize}\n**Host:** <@${giveaway.hostId}>\n**Winners:** ${giveaway.winnerCount}\n**Entries:** ${giveaway.entries.length}\n**Ends:** <t:${Math.floor(new Date(giveaway.endAt).getTime() / 1000)}:R>${giveaway.ended ? `\n\n**Winner(s):** ${giveaway.winners.length ? giveaway.winners.map(id => `<@${id}>`).join(", ") : "No eligible entries"}` : ""}`)
        .setFooter({ text: `Giveaway ID: ${giveaway.messageId}` });
    const components = giveaway.ended ? [] : [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`giveaway_join:${giveaway.messageId}`).setLabel("Join Giveaway").setEmoji("🎉").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`giveaway_list:${giveaway.messageId}`).setLabel("Member List").setEmoji("👥").setStyle(ButtonStyle.Secondary)
    )];
    return { embeds: [embed], components };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("giveaway")
        .setDescription("Start a giveaway with buttons.")
        .addStringOption(o => o.setName("prize").setDescription("Giveaway prize.").setMaxLength(200).setRequired(true))
        .addStringOption(o => o.setName("duration").setDescription("Duration, for example 10m, 2h, or 1d (maximum 30d). ").setRequired(true))
        .addIntegerOption(o => o.setName("winners").setDescription("Number of winners.").setMinValue(1).setMaxValue(20).setRequired(false))
        .addChannelOption(o => o.setName("channel").setDescription("Giveaway channel (defaults to this channel).").setRequired(false)),
    async execute(interaction) {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            return interaction.reply({ content: "❌ You need Manage Server permission to start a giveaway.", ephemeral: true });
        }

        const duration = parseDuration(interaction.options.getString("duration", true));
        if (!duration) return interaction.reply({ content: "❌ Invalid duration. Use 10m, 2h, or 1d. Maximum duration is 30 days.", ephemeral: true });

        const channel = interaction.options.getChannel("channel") || interaction.channel;
        if (!channel?.isTextBased() || !channel.send) {
            return interaction.reply({ content: "❌ Please select a text channel.", ephemeral: true });
        }

        const giveaway = {
            guildId: interaction.guildId,
            channelId: channel.id,
            messageId: "pending",
            hostId: interaction.user.id,
            prize: interaction.options.getString("prize", true),
            winnerCount: interaction.options.getInteger("winners") || 1,
            endAt: new Date(Date.now() + duration),
            entries: [],
            ended: false,
            winners: []
        };

        await interaction.deferReply({ ephemeral: true });
        const message = await channel.send(toContainerPayload({ embeds: [new EmbedBuilder().setColor(0x57F287).setTitle("🎉 Giveaway").setDescription(`**Prize:** ${giveaway.prize}\n**Host:** <@${giveaway.hostId}>\n**Winners:** ${giveaway.winnerCount}\n**Entries:** 0\n**Ends:** <t:${Math.floor(giveaway.endAt.getTime() / 1000)}:R>`)], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("giveaway_setup_pending").setLabel("Join Giveaway").setEmoji("🎉").setStyle(ButtonStyle.Success).setDisabled(true))] }));
        giveaway.messageId = message.id;
        const saved = await Giveaway.create(giveaway);
        await message.edit(toContainerPayload(giveawayPayload(saved)));
        return interaction.editReply(`✅ Giveaway created in ${channel}: ${message.url}`);
    }
};
