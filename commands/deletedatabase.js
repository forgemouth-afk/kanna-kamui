const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags
} = require("discord.js");
const mongoose = require("mongoose");
const config = require("../config/config");

const REQUEST_TIMEOUT = 3 * 60 * 1000;

function isDeveloper(userId) {
    return Array.isArray(config.devID) && config.devID.includes(userId);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("deletedatabase")
        .setDescription("Open the database deletion panel (developers only)."),
    async execute(interaction) {
        if (!isDeveloper(interaction.user.id)) {
            return interaction.reply({ content: "❌ This command is available to configured developers only.", flags: MessageFlags.Ephemeral });
        }
        if (mongoose.connection.readyState !== 1) {
            return interaction.reply({ content: "❌ MongoDB is not connected.", flags: MessageFlags.Ephemeral });
        }

        const collections = await mongoose.connection.db.listCollections({}, { nameOnly: true }).toArray();
        if (!collections.length) {
            return interaction.reply({ content: "ℹ️ No collections are available in this database.", flags: MessageFlags.Ephemeral });
        }

        const menu = new StringSelectMenuBuilder()
            .setCustomId(`deletedatabase_select:${interaction.user.id}`)
            .setPlaceholder("Select a database collection to delete")
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions(collections.slice(0, 25).map(collection => ({
                label: collection.name.slice(0, 100),
                value: collection.name,
                description: `Delete collection ${collection.name}`.slice(0, 100)
            })));

        const embed = new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle("🗄️ Database Management")
            .setDescription(`Select a collection below to review its deletion.\n\n**Available collections:** ${collections.length}\n**Database:** ${mongoose.connection.name}\n\n⚠️ Deleting a collection permanently removes its documents.`)
            .setFooter({ text: collections.length > 25 ? "Only the first 25 collections are shown." : "Developer-only database panel." });

        return interaction.reply({
            embeds: [embed],
            components: [new ActionRowBuilder().addComponents(menu)],
            flags: MessageFlags.Ephemeral
        });
    }
};

module.exports.handleDatabaseSelect = async function(interaction) {
    const [, ownerId] = interaction.customId.split(":");
    if (interaction.user.id !== ownerId || !isDeveloper(interaction.user.id)) {
        return interaction.reply({ content: "❌ This database panel does not belong to you.", flags: MessageFlags.Ephemeral });
    }
    const collectionName = interaction.values[0];
    const exists = await mongoose.connection.db.listCollections({ name: collectionName }, { nameOnly: true }).hasNext();
    if (!exists) return interaction.update({ content: "❌ This collection no longer exists.", embeds: [], components: [] });

    const expiresAt = Date.now() + REQUEST_TIMEOUT;
    const embed = new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle("⚠️ Confirm Database Deletion")
        .setDescription(`Are you sure you want to permanently delete collection **${collectionName}**?\n\nThis action cannot be undone.\nRequest expires <t:${Math.floor(expiresAt / 1000)}:R>.`)
        .setFooter({ text: `Requested by ${interaction.user.tag}` });
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`deletedatabase_accept:${ownerId}:${expiresAt}:${encodeURIComponent(collectionName)}`).setLabel("Accept").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`deletedatabase_deny:${ownerId}:${expiresAt}`).setLabel("Deny").setStyle(ButtonStyle.Secondary)
    );
    await interaction.update({ embeds: [embed], components: [row] });
    const message = interaction.message;
    const timeout = setTimeout(async () => {
        const disabledRows = [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`deletedatabase_accept:${ownerId}:${expiresAt}:${encodeURIComponent(collectionName)}`).setLabel("Accept").setStyle(ButtonStyle.Danger).setDisabled(true),
            new ButtonBuilder().setCustomId(`deletedatabase_deny:${ownerId}:${expiresAt}`).setLabel("Deny").setStyle(ButtonStyle.Secondary).setDisabled(true)
        )];
        await message.edit({ components: disabledRows }).catch(() => null);
    }, REQUEST_TIMEOUT);
    timeout.unref?.();
    return;
};

module.exports.handleDatabaseButton = async function(interaction) {
    const [action, ownerId, expiresAtRaw, encodedName] = interaction.customId.split(":");
    if (interaction.user.id !== ownerId || !isDeveloper(interaction.user.id)) {
        return interaction.reply({ content: "❌ Only the developer who opened this request can confirm it.", flags: MessageFlags.Ephemeral });
    }
    if (Date.now() > Number(expiresAtRaw)) {
        return interaction.update({ content: "⌛ This database deletion request has expired.", embeds: [], components: [] });
    }
    if (action === "deletedatabase_deny") {
        return interaction.update({ content: "❎ Database deletion cancelled.", embeds: [], components: [] });
    }

    const collectionName = decodeURIComponent(encodedName || "");
    const exists = await mongoose.connection.db.listCollections({ name: collectionName }, { nameOnly: true }).hasNext();
    if (!exists) return interaction.update({ content: "❌ This collection no longer exists.", embeds: [], components: [] });
    await mongoose.connection.db.dropCollection(collectionName);
    return interaction.update({ content: `✅ Database collection **${collectionName}** has been deleted.`, embeds: [], components: [] });
};
