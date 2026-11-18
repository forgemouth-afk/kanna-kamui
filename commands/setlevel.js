const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    MessageFlags,
    EmbedBuilder
} = require("discord.js");
const UserLevel = require("../models/UserLevel");
const GuildConfig = require("../models/GuildConfig");
const { applyRewardRoles } = require("../utils/leveling");

module.exports = {
    adminOnly: true,
    data: new SlashCommandBuilder()
        .setName("setlevel")
        .setDescription("Set a member's level manually.")
        .addUserOption(option =>
            option.setName("user")
                .setDescription("Member whose level will be changed.")
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option.setName("level")
                .setDescription("New level for the member.")
                .setMinValue(0)
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
        const user = interaction.options.getUser("user", true);
        const level = interaction.options.getInteger("level", true);

        if (user.bot) {
            return interaction.reply({
                content: "❌ Bot accounts cannot receive levels.",
                flags: MessageFlags.Ephemeral
            });
        }

        const member = await interaction.guild.members.fetch(user.id).catch(() => null);
        if (!member) {
            return interaction.reply({
                content: "❌ Member not found in this server.",
                flags: MessageFlags.Ephemeral
            });
        }

        const record = await UserLevel.findOneAndUpdate(
            { guildId: interaction.guildId, userId: user.id },
            { $set: { level, xp: 0 } },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        const guildConfig = await GuildConfig.findOne({ guildId: interaction.guildId });
        if (guildConfig?.levelRewards?.length) {
            const memberRewardRoles = guildConfig.levelRewards
                .filter(reward => reward.level > level)
                .map(reward => reward.roleId)
                .filter(roleId => member.roles.cache.has(roleId));

            if (memberRewardRoles.length) {
                await member.roles.remove(memberRewardRoles, "Manual level adjustment").catch(error => {
                    console.error("Could not remove ineligible level reward roles:", error.message);
                });
            }
        }

        await applyRewardRoles(interaction.guild, user, level);

        const embed = new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle("✅ Member Level Updated")
            .setDescription(`${user} is now **Level ${record.level}**.`)
            .addFields({ name: "XP", value: "0", inline: true })
            .setThumbnail(user.displayAvatarURL({ size: 256 }))
            .setTimestamp();

        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
};
