const {
    MessageFlags,
    SlashCommandBuilder,
    PermissionFlagsBits
} = require("discord.js");
const GuildConfig = require("../models/GuildConfig");

module.exports = {
    adminOnly: true,
    data: new SlashCommandBuilder()
        .setName("deletevoicepanel")
        .setDescription("Delete the configured shared Voice Control Panel." )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
        const config = await GuildConfig.findOne({ guildId: interaction.guildId });

        if (!config?.voicePanelChannelId) {
            return interaction.reply({
                content: "❌ Voice Control Panel belum diatur di server ini.",
                flags: MessageFlags.Ephemeral
            });
        }

        const channel = await interaction.guild.channels.fetch(config.voicePanelChannelId).catch(() => null);
        let deleted = false;

        if (channel?.isTextBased() && config.voicePanelMessageId) {
            const message = await channel.messages.fetch(config.voicePanelMessageId).catch(() => null);
            if (message) {
                await message.delete().then(() => {
                    deleted = true;
                }).catch(() => null);
            }
        }

        config.voicePanelChannelId = null;
        config.voicePanelMessageId = null;
        await config.save();

        return interaction.reply({
            content: `✅ Pengaturan Voice Control Panel berhasil dihapus${deleted ? " dan pesan panelnya juga dihapus" : ""}. Sekarang kamu bisa menggunakan /voicepanel untuk memasang panel di channel lain.`,
            flags: MessageFlags.Ephemeral
        });
    }
};
