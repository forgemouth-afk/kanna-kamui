const { SlashCommandBuilder, ChannelType, PermissionFlagsBits, MessageFlags } = require("discord.js");
const GuildConfig = require("../models/GuildConfig");
module.exports = {
    adminOnly: true,
    data: new SlashCommandBuilder()
        .setName("setupadmindelete")
        .setDescription("Configure staff message-deletion monitoring and punishment alerts.")
        .addChannelOption(option => option.setName("channel").setDescription("Channel for staff deletion alerts.").addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true))
        .addRoleOption(option => option.setName("role1").setDescription("Admin/moderator role 1 to monitor.").setRequired(true))
        .addRoleOption(option => option.setName("role2").setDescription("Admin/moderator role 2 to monitor.").setRequired(false))
        .addRoleOption(option => option.setName("role3").setDescription("Admin/moderator role 3 to monitor.").setRequired(false))
        .addRoleOption(option => option.setName("role4").setDescription("Admin/moderator role 4 to monitor.").setRequired(false))
        .addRoleOption(option => option.setName("role5").setDescription("Admin/moderator role 5 to monitor.").setRequired(false))
        .addRoleOption(option => option.setName("role6").setDescription("Admin/moderator role 6 to monitor.").setRequired(false))
        .addRoleOption(option => option.setName("role7").setDescription("Admin/moderator role 7 to monitor.").setRequired(false))
        .addRoleOption(option => option.setName("role8").setDescription("Admin/moderator role 8 to monitor.").setRequired(false))
        .addRoleOption(option => option.setName("role9").setDescription("Admin/moderator role 9 to monitor.").setRequired(false))
        .addRoleOption(option => option.setName("role10").setDescription("Admin/moderator role 10 to monitor.").setRequired(false)),
    async execute(interaction) {
        const channel = interaction.options.getChannel("channel", true);
        const roleIds = [];
        for (let i = 1; i <= 10; i++) {
            const role = interaction.options.getRole(`role${i}`);
            if (role && !roleIds.includes(role.id)) roleIds.push(role.id);
        }
        if (!roleIds.length) return interaction.reply({ content: "❌ Select at least one role.", flags: MessageFlags.Ephemeral });
        await GuildConfig.findOneAndUpdate({ guildId: interaction.guildId }, { $set: { adminDeleteChannelId: channel.id, adminDeleteRoleIds: roleIds } }, { upsert: true });
        return interaction.reply({ content: `✅ Staff deletion monitoring configured in ${channel}. Monitored roles: ${roleIds.map(id => `<@&${id}>`).join(", ")}`, flags: MessageFlags.Ephemeral });
    }
};
