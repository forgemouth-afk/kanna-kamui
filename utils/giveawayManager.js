const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const Giveaway = require("../models/Giveaway");
const { toContainerPayload } = require("./container");

function payload(giveaway) {
    const embed = new EmbedBuilder()
        .setColor(giveaway.ended ? 0x747F8D : 0x57F287)
        .setTitle(giveaway.ended ? "🎉 Giveaway Ended" : "🎉 Giveaway")
        .setDescription(`**Prize:** ${giveaway.prize}\n**Host:** <@${giveaway.hostId}>\n**Winners:** ${giveaway.winnerCount}\n**Entries:** ${giveaway.entries.length}\n**Ends:** <t:${Math.floor(new Date(giveaway.endAt).getTime() / 1000)}:R>${giveaway.ended ? `\n\n**Winner(s):** ${giveaway.winners.length ? giveaway.winners.map(id => `<@${id}>`).join(", ") : "No eligible entries"}` : ""}`)
        .setFooter({ text: `Giveaway ID: ${giveaway.messageId}` });
    return {
        embeds: [embed],
        components: giveaway.ended ? [] : [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`giveaway_join:${giveaway.messageId}`).setLabel("Join Giveaway").setEmoji("🎉").setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`giveaway_list:${giveaway.messageId}`).setLabel("Member List").setEmoji("👥").setStyle(ButtonStyle.Secondary)
        )]
    };
}

async function updateGiveawayMessage(client, giveaway) {
    const channel = await client.channels.fetch(giveaway.channelId).catch(() => null);
    if (!channel?.isTextBased()) return;
    const message = await channel.messages.fetch(giveaway.messageId).catch(() => null);
    if (message) await message.edit(toContainerPayload(payload(giveaway))).catch(error => console.error("Giveaway message update failed:", error.message));
}

async function finishGiveaway(client, giveaway) {
    if (giveaway.ended) return giveaway;
    const entrants = [...new Set(giveaway.entries)];
    const winners = [];
    while (entrants.length && winners.length < giveaway.winnerCount) {
        const index = Math.floor(Math.random() * entrants.length);
        winners.push(entrants.splice(index, 1)[0]);
    }
    giveaway.ended = true;
    giveaway.winners = winners;
    await giveaway.save();
    await updateGiveawayMessage(client, giveaway);

    const channel = await client.channels.fetch(giveaway.channelId).catch(() => null);
    if (channel?.isTextBased()) {
        await channel.send(toContainerPayload({
            content: winners.length
                ? `🎉 Congratulations ${winners.map(id => `<@${id}>`).join(", ")}! You won **${giveaway.prize}**!`
                : `The giveaway for **${giveaway.prize}** ended with no eligible entries.`,
            allowedMentions: { users: winners }
        })).catch(() => null);
    }
    return giveaway;
}

async function rerollGiveaway(client, messageId) {
    const giveaway = await Giveaway.findOne({ messageId });
    if (!giveaway) return { message: "❌ Giveaway not found." };
    if (!giveaway.ended) return { message: "❌ This giveaway has not ended yet." };
    const previous = new Set(giveaway.winners);
    const entrants = [...new Set(giveaway.entries)].filter(id => !previous.has(id));
    if (!entrants.length) return { message: "❌ There are no remaining eligible members to reroll." };
    const winners = [];
    while (entrants.length && winners.length < giveaway.winnerCount) {
        winners.push(entrants.splice(Math.floor(Math.random() * entrants.length), 1)[0]);
    }
    giveaway.winners = winners;
    await giveaway.save();
    const channel = await client.channels.fetch(giveaway.channelId).catch(() => null);
    if (channel?.isTextBased()) {
        await channel.send(toContainerPayload({ content: `🔁 Giveaway reroll! New winner(s) for **${giveaway.prize}**: ${winners.map(id => `<@${id}>`).join(", ")}`, allowedMentions: { users: winners } }));
    }
    await updateGiveawayMessage(client, giveaway);
    return { message: `✅ Rerolled successfully. New winner(s): ${winners.map(id => `<@${id}>`).join(", ")}` };
}

function startGiveawayMonitor(client) {
    const check = async () => {
        const due = await Giveaway.find({ ended: false, endAt: { $lte: new Date() } }).limit(50);
        for (const giveaway of due) {
            await finishGiveaway(client, giveaway).catch(error => console.error("Giveaway finish failed:", error));
        }
    };
    check().catch(error => console.error("Giveaway recovery failed:", error));
    setInterval(() => check().catch(error => console.error("Giveaway monitor failed:", error)), 15000);
}

async function handleGiveawayButton(interaction) {
    const [action, messageId] = interaction.customId.split(":");
    const giveaway = await Giveaway.findOne({ messageId });
    if (!giveaway) return interaction.reply({ content: "❌ This giveaway no longer exists.", ephemeral: true });
    if (giveaway.ended || new Date(giveaway.endAt).getTime() <= Date.now()) {
        await finishGiveaway(interaction.client, giveaway);
        return interaction.reply({ content: "⏰ This giveaway has already ended.", ephemeral: true });
    }

    if (action === "giveaway_join") {
        const index = giveaway.entries.indexOf(interaction.user.id);
        if (index >= 0) {
            giveaway.entries.splice(index, 1);
            await giveaway.save();
            await interaction.reply({ content: "You have left the giveaway.", ephemeral: true });
        } else {
            giveaway.entries.push(interaction.user.id);
            await giveaway.save();
            await interaction.reply({ content: "🎉 You have entered the giveaway! Good luck.", ephemeral: true });
        }
        await updateGiveawayMessage(interaction.client, giveaway);
        return;
    }

    if (action === "giveaway_list") {
        const mentions = giveaway.entries.map((id, index) => `${index + 1}. <@${id}>`);
        const chunks = [];
        for (let i = 0; i < mentions.length; i += 50) chunks.push(mentions.slice(i, i + 50));
        const description = chunks[0]?.join("\n") || "No members have joined yet.";
        const embed = new EmbedBuilder().setColor(0x5865F2).setTitle(`👥 Giveaway Members (${giveaway.entries.length})`).setDescription(description);
        if (chunks.length > 1) embed.setFooter({ text: `Showing first 50 of ${giveaway.entries.length} members.` });
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }
}

module.exports = { startGiveawayMonitor, handleGiveawayButton, rerollGiveaway };
