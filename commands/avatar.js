const {
    SlashCommandBuilder,
    EmbedBuilder,
    MessageFlags
} = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("avatar")
        .setDescription("Show a member's avatar.")
        .addUserOption(option =>
            option.setName("user")
                .setDescription("Member whose avatar you want to see.")
                .setRequired(false)
        ),
    async execute(interaction) {
        const user = interaction.options.getUser("user") || interaction.user;
        const avatarUrl = user.displayAvatarURL({
            extension: "png",
            size: 4096,
            forceStatic: true
        });

        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle(`${user.username}'s Avatar`)
            .setImage(avatarUrl)
            .setDescription(`[Open full-size avatar](${avatarUrl})`)
            .setFooter({ text: `Requested by ${interaction.user.username}` })
            .setTimestamp();

        return interaction.reply({ embeds: [embed] });
    }
};
