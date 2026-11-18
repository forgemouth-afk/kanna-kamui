const {

    SlashCommandBuilder,

    AttachmentBuilder

} = require("discord.js");

const { LeaderboardBuilder, Font } = require("canvacord");

const UserLevel = require("../models/UserLevel");

module.exports = {

    data: new SlashCommandBuilder()

        .setName("leaderboard")

        .setDescription("Show the server leveling leaderboard as an image."),

    async execute(interaction) {

        await interaction.deferReply();

        try {

            Font.loadDefault();

            const records = await UserLevel.find({

                guildId: interaction.guildId

            })

                .sort({ level: -1, xp: -1 })

                .limit(10)

                .lean();

            if (!records.length) {

                return interaction.editReply(

                    "Belum ada data leveling di server ini."

                );

            }

            const players = [];

            for (const record of records) {

                const member = await interaction.guild.members

                    .fetch(record.userId)

                    .catch(() => null);

                if (!member || member.user.bot) continue;

                players.push({

                    avatar: member.user.displayAvatarURL({

                        extension: "png",

                        forceStatic: true,

                        size: 256

                    }),

                    displayName: member.displayName,

                    username: member.user.username,

                    level: Number(record.level) || 0,

                    xp: Number(record.xp) || 0,

                    rank: players.length + 1

                });

            }

            if (!players.length) {

                return interaction.editReply(

                    "Belum ada anggota aktif dalam leaderboard."

                );

            }

            const headerImage =

                interaction.guild.iconURL({

                    extension: "png",

                    size: 256

                }) || players[0].avatar;

            const leaderboard = new LeaderboardBuilder()

                .setHeader({

                    title: `${interaction.guild.name} Leaderboard`,

                    subtitle: "Top 10 Members",

                    image: headerImage

                })

                .setPlayers(players)

                .setVariant("default")

                .setBackgroundColor("#23272A");

            const image = await leaderboard.build({

                format: "png"

            });

            return interaction.editReply({

                files: [

                    new AttachmentBuilder(image, {

                        name: "leaderboard.png"

                    })

                ]

            });

        } catch (error) {

            console.error("[Leaderboard Error]", error);

            return interaction.editReply(

                "❌ Gagal membuat leaderboard. Silakan coba lagi."

            );

        }

    }

};