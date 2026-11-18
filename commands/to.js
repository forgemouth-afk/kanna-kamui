const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

const durations = [
    { name: "60 detik", value: 60 },
    { name: "5 menit", value: 300 },
    { name: "10 menit", value: 600 },
    { name: "1 jam", value: 3600 },
    { name: "6 jam", value: 21600 },
    { name: "12 jam", value: 43200 },
    { name: "1 hari", value: 86400 },
    { name: "3 hari", value: 259200 },
    { name: "7 hari", value: 604800 }
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName("to")
        .setDescription("Timeout a member for a selected duration.")
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addUserOption(option =>
            option.setName("user")
                .setDescription("Member to timeout.")
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option.setName("duration")
                .setDescription("How long the member should be timed out.")
                .setRequired(true)
                .addChoices(...durations.map(item => ({ name: item.name, value: item.value })))
        )
        .addStringOption(option =>
            option.setName("reason")
                .setDescription("Reason for the timeout.")
                .setRequired(false)
        ),
    async execute(interaction) {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers)) {
            return interaction.reply({ content: "❌ You need the **Moderate Members** permission to use this command.", ephemeral: true });
        }

        const botMember = interaction.guild.members.me;
        if (!botMember?.permissions.has(PermissionFlagsBits.ModerateMembers)) {
            return interaction.reply({ content: "❌ I need the **Moderate Members** permission to timeout members.", ephemeral: true });
        }

        const user = interaction.options.getUser("user");
        const seconds = interaction.options.getInteger("duration");
        const reason = interaction.options.getString("reason") || "No reason provided.";
        const member = await interaction.guild.members.fetch(user.id).catch(() => null);

        if (!member) {
            return interaction.reply({ content: "❌ Member not found in this server.", ephemeral: true });
        }

        if (member.id === interaction.guild.ownerId) {
            return interaction.reply({ content: "❌ I cannot timeout the server owner.", ephemeral: true });
        }

        if (member.id === interaction.user.id) {
            return interaction.reply({ content: "❌ You cannot timeout yourself.", ephemeral: true });
        }

        if (member.roles.highest.position >= interaction.member.roles.highest.position && interaction.guild.ownerId !== interaction.user.id) {
            return interaction.reply({ content: "❌ You cannot timeout a member with an equal or higher role than yours.", ephemeral: true });
        }

        if (!member.moderatable) {
            return interaction.reply({ content: "❌ I cannot timeout this member. Check role hierarchy and my permissions.", ephemeral: true });
        }

        const duration = durations.find(item => item.value === seconds);
        await member.timeout(seconds * 1000, reason);

        return interaction.reply({
            content: `🔇 <@${user.id}> has been timed out for **${duration?.name || `${seconds} seconds`}**.\n**Reason:** ${reason}`,
            allowedMentions: { users: [] }
        });
    }
};
