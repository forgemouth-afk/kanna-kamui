const {
    SlashCommandBuilder,
    ChannelType,
    PermissionFlagsBits,
    MessageFlags
} = require("discord.js");
const GuildConfig = require("../models/GuildConfig");
const { publishAutoRolePanel } = require("../utils/autoRoleManager");

const data = new SlashCommandBuilder()
    .setName("autorole")
    .setDescription("Create or update the self-assignable role panel.")
    .addChannelOption(option => option
        .setName("channel")
        .setDescription("Channel where the role panel will be posted.")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true));

for (let i = 1; i <= 20; i++) {
    data.addRoleOption(option => option
        .setName(`role${i}`)
        .setDescription(`Role option ${i}.`)
        .setRequired(i === 1));
}

data.addAttachmentOption(option => option
    .setName("attachment")
    .setDescription("Optional image shown in the role panel.")
    .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

module.exports = {
    adminOnly: true,
    data,
    async execute(interaction) {
        const channel = interaction.options.getChannel("channel", true);
        const roles = [];
        for (let i = 1; i <= 20; i++) {
            const role = interaction.options.getRole(`role${i}`);
            if (role && !role.managed && role.id !== interaction.guildId && !roles.includes(role.id)) roles.push(role.id);
        }
        const attachment = interaction.options.getAttachment("attachment");
        const current = await GuildConfig.findOne({ guildId: interaction.guildId });
        await GuildConfig.findOneAndUpdate(
            { guildId: interaction.guildId },
            { $set: {
                autoRoleChannelId: channel.id,
                autoRoleIds: roles,
                autoRoleImageUrl: attachment?.url || current?.autoRoleImageUrl || null
            } },
            { upsert: true, new: true }
        );
        await publishAutoRolePanel(interaction.client, interaction.guildId);
        return interaction.reply({
            content: `✅ The role claim panel has been created or updated in ${channel}. Members can use the buttons to claim or remove roles.`,
            flags: MessageFlags.Ephemeral
        });
    }
};
