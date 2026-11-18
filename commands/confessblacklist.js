const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");
const Confession = require("../models/Confession");
const GuildConfig = require("../models/GuildConfig");

module.exports = {
    adminOnly: true,
    data: new SlashCommandBuilder()
        .setName("confessblacklist")
        .setDescription("Remove a confession by its ID and block its further discussion.")
        .addStringOption(option => option.setName("id").setDescription("Confession ID, for example 00012.").setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
        const id = interaction.options.getString("id", true).trim().replace(/^#/, "");
        const confession = await Confession.findOne({ guildId: interaction.guildId, confessionId: id });
        if (!confession) return interaction.reply({ content: `❌ Confession **${id}** was not found.`, flags: MessageFlags.Ephemeral });
        const channel = await interaction.guild.channels.fetch(confession.channelId).catch(() => null);
        const message = channel?.isTextBased() ? await channel.messages.fetch(confession.messageId).catch(() => null) : null;
        if (message) await message.delete().catch(() => null);
        if (confession.threadId) {
            const thread = await interaction.guild.channels.fetch(confession.threadId).catch(() => null);
            if (thread) await thread.delete("Confession blacklisted by an administrator").catch(() => null);
        }
        confession.blacklisted = true;
        await confession.save();
        await GuildConfig.updateOne({ guildId: interaction.guildId }, { $addToSet: { confessionBlacklist: id } });
        return interaction.reply({ content: `✅ Confession **${id}** has been removed and blacklisted.`, flags: MessageFlags.Ephemeral });
    }
};
