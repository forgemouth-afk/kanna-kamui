const {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder
} = require("discord.js");
const UserLevel = require("../models/UserLevel");
const { buildRankCard } = require("../utils/rankCard");
const { scheduleDisableButtons } = require("../utils/disableButtons");

const CLAIM_COOLDOWN_MS = 24 * 60 * 60 * 1000;

function claimRow(userId, disabled = false) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`rank_claim:${userId}`)
            .setLabel(disabled ? "XP Claimed" : "Claim XP")
            .setEmoji(disabled ? "✅" : "🎁")
            .setStyle(ButtonStyle.Success)
            .setDisabled(disabled)
    );
}

function rankEmbed(guild, user, data, description = "Your current leveling progress.") {
    return new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`🏆 ${user.username}'s Rank`)
        .setDescription(description)
        .addFields(
            { name: "Level", value: `${data.level}`, inline: true },
            { name: "XP", value: `${data.xp.toLocaleString()} / ${data.requiredXp.toLocaleString()}`, inline: true },
            { name: "Rank", value: `#${data.rankPosition}`, inline: true }
        )
        .setImage("attachment://rank-card.png")
        .setFooter({ text: guild.name })
        .setTimestamp();
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("rank")
        .setDescription("Display a member's rank card.")
        .addUserOption(option =>
            option.setName("user")
                .setDescription("Member whose rank card you want to view.")
                .setRequired(false)
        ),
    async execute(interaction) {
        await interaction.deferReply();

        try {
            const specifiedUser = interaction.options.getUser("user");
            const target = specifiedUser ?? interaction.user;
            if (target.bot) {
                return interaction.editReply("❌ Bot accounts do not have rank cards.");
            }

            const data = await buildRankCard(interaction.guild, target);
            const isOwnRank = !specifiedUser;
            const lastClaimAt = data.record?.lastXpClaimAt?.getTime?.() ?? 0;
            const claimAvailable = !lastClaimAt || Date.now() - lastClaimAt >= CLAIM_COOLDOWN_MS;
            const description = isOwnRank
                ? claimAvailable
                    ? "Your current leveling progress. Press **Claim XP** to collect your random XP reward."
                    : "Your current leveling progress. You have already claimed your XP reward; check back after the 24-hour cooldown."
                : "Current leveling progress for this member.";

            await interaction.editReply({
                embeds: [rankEmbed(interaction.guild, target, data, description)],
                files: [data.attachment],
                components: isOwnRank ? [claimRow(target.id, !claimAvailable)] : []
            });
            if (isOwnRank && claimAvailable) scheduleDisableButtons(interaction);
            return;
        } catch (error) {
            console.error("Rank card generation failed:", error);
            return interaction.editReply("❌ I couldn't generate the rank card. Please try again in a moment.");
        }
    }
};
