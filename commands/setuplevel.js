const {
    MessageFlags,
    SlashCommandBuilder,
    ChannelType,
    PermissionFlagsBits,
    EmbedBuilder
} = require("discord.js");
const GuildConfig = require("../models/GuildConfig");

const REWARD_LEVELS = [10, 20, 30, 50, 100, 150, 200, 250, 300, 500];

const data = new SlashCommandBuilder()
    .setName("setuplevel")
    .setDescription("Configure the level-up announcement channel and up to 10 reward roles.")
    .addChannelOption(option =>
        option.setName("channel")
            .setDescription("Channel for level-up announcements.")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

for (let i = 1; i <= 10; i++) {
    data.addRoleOption(option =>
        option.setName(`role${i}`)
            .setDescription(`Reward role for reaching level ${REWARD_LEVELS[i - 1]}.`)
            .setRequired(i === 1)
    );
}

module.exports = {
    adminOnly: true,
    data,
    async execute(interaction) {
        const channel = interaction.options.getChannel("channel", true);
        const rewards = [];

        for (let i = 1; i <= 10; i++) {
            const role = interaction.options.getRole(`role${i}`);
            if (role) {
                if (role.managed || role.id === interaction.guildId) {
                    return interaction.reply({
                        content: `❌ ${role} cannot be used as a level reward role.`,
                        flags: MessageFlags.Ephemeral
                    });
                }
                rewards.push({
                    roleId: role.id,
                    level: REWARD_LEVELS[i - 1]
                });
            }
        }

        await GuildConfig.findOneAndUpdate(
            { guildId: interaction.guildId },
            {
                $set: {
                    levelChannelId: channel.id,
                    levelRewards: rewards
                }
            },
            { upsert: true, new: true }
        );

        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle("✅ Leveling System Configured")
            .setDescription(`Level-up announcements will be sent to ${channel}.\nReward roles will be assigned automatically when members reach the required level.`)
            .addFields(rewards.map(reward => ({
                name: `Level ${reward.level}`,
                value: `<@&${reward.roleId}>`,
                inline: true
            })))
            .setTimestamp();

        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
};