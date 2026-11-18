const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require("discord.js");

function clean(value, max = 900) {
    if (!value) return "Not available";
    return String(value).replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim().slice(0, max) || "Not available";
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("steam")
        .setDescription("Search Steam games and show details and system requirements.")
        .addStringOption(option => option.setName("name").setDescription("Game title to search on Steam.").setMaxLength(100).setRequired(true)),
    async execute(interaction) {
        const query = interaction.options.getString("name", true);
        await interaction.deferReply();
        try {
            const searchUrl = new URL("https://store.steampowered.com/api/storesearch/");
            searchUrl.searchParams.set("term", query);
            searchUrl.searchParams.set("l", "english");
            searchUrl.searchParams.set("cc", "us");
            const searchResponse = await fetch(searchUrl);
            if (!searchResponse.ok) throw new Error(`Steam search returned HTTP ${searchResponse.status}`);
            const searchData = await searchResponse.json();
            const game = searchData.items?.[0];
            if (!game) return interaction.editReply(`❌ No Steam game found for **${query}**.`);

            const detailsUrl = new URL("https://store.steampowered.com/api/appdetails");
            detailsUrl.searchParams.set("appids", String(game.id));
            detailsUrl.searchParams.set("cc", "us");
            detailsUrl.searchParams.set("l", "english");
            const detailsResponse = await fetch(detailsUrl);
            if (!detailsResponse.ok) throw new Error(`Steam details returned HTTP ${detailsResponse.status}`);
            const detailsData = await detailsResponse.json();
            const details = detailsData[String(game.id)]?.data;
            if (!detailsData[String(game.id)]?.success || !details) return interaction.editReply(`❌ Steam returned no detailed information for **${game.name}**.`);

            const requirements = details.pc_requirements || {};
            const min = clean(requirements.minimum, 900);
            const rec = clean(requirements.recommended, 900);
            const genres = (details.genres || []).map(item => item.description).join(", ") || "Not listed";
            const platforms = Object.entries(details.platforms || {}).filter(([, enabled]) => enabled).map(([name]) => name.toUpperCase()).join(", ") || "Not listed";
            const price = details.is_free ? "Free to Play" : details.price_overview?.final_formatted || (details.release_date?.coming_soon ? "Coming soon / price not listed" : "Not listed");
            const embed = new EmbedBuilder()
                .setColor(0x1B9FFF)
                .setTitle(clean(details.name, 250))
                .setURL(`https://store.steampowered.com/app/${game.id}/`)
                .setThumbnail(details.header_image || game.tiny_image || null)
                .setDescription(clean(details.short_description, 1000))
                .addFields(
                    { name: "Price", value: clean(price, 100), inline: true },
                    { name: "Release", value: clean(details.release_date?.date, 100), inline: true },
                    { name: "Platforms", value: clean(platforms, 100), inline: true },
                    { name: "Developer", value: clean((details.developers || []).join(", "), 250), inline: true },
                    { name: "Publisher", value: clean((details.publishers || []).join(", "), 250), inline: true },
                    { name: "Genres", value: clean(genres, 250), inline: false },
                    { name: "Minimum PC Requirements", value: min, inline: false },
                    { name: "Recommended PC Requirements", value: rec, inline: false }
                )
                .setFooter({ text: `Steam App ID: ${game.id} • Requirements may be unavailable for some games.` });
            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error("Steam command error:", error);
            return interaction.editReply("❌ Could not retrieve Steam information right now. Please try again later.");
        }
    }
};
