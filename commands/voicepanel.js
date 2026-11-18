const {
    MessageFlags,
    SlashCommandBuilder,
    ChannelType,
    PermissionFlagsBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");
const GuildConfig = require("../models/GuildConfig");

function buildVoiceControlPanel() {
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

module.exports = {
    adminOnly: true,
    data: new SlashCommandBuilder()
        .setName("voicepanel")
        .setDescription("Send the personal voice room control panel to a channel.")
        .addChannelOption(option => option
            .setName("channel")
            .setDescription("Text channel where the shared voice control panel will be posted.")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
        const channel = interaction.options.getChannel("channel", true);
        let config = await GuildConfig.findOne({ guildId: interaction.guildId });

        if (config?.voicePanelChannelId && config.voicePanelChannelId !== channel.id) {
            const currentChannel = await interaction.guild.channels.fetch(config.voicePanelChannelId).catch(() => null);
            return interaction.reply({
                content: `❌ Voice Control Panel sudah diatur di ${currentChannel ? currentChannel : "channel sebelumnya"}. Hapus pengaturan tersebut dengan /deletevoicepanel terlebih dahulu sebelum memasang panel di channel lain.`,
                flags: MessageFlags.Ephemeral
            });
        }

        if (!config) {
            config = await GuildConfig.create({ guildId: interaction.guildId });
        }

        let panelMessage = config.voicePanelMessageId
            ? await channel.messages.fetch(config.voicePanelMessageId).catch(() => null)
            : null;

        if (!panelMessage || panelMessage.author.id !== interaction.client.user.id) {
            panelMessage = await channel.send(buildVoiceControlPanel());
        } else {
            await panelMessage.edit(buildVoiceControlPanel());
        }

        config.voicePanelChannelId = channel.id;
        config.voicePanelMessageId = panelMessage.id;
        await config.save();

        return interaction.reply({
            content: `✅ Voice Control Panel is ready in ${channel}. Members can join the configured Create Voice channel to create their room, then use this shared panel to manage it.`,
            flags: MessageFlags.Ephemeral
        });
    }
};
