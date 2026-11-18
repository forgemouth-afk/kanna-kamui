const URL_REGEX = /https?:\/\/[^\s<>]+/gi;
const appConfig = require("../config/config");

const PROVIDERS = [
    {
        platform: "TikTok",
        hosts: ["tiktok.com", "www.tiktok.com", "m.tiktok.com", "vm.tiktok.com", "vt.tiktok.com"],
        replacement: "tnktok.com"
    },
    {
        platform: "Instagram",
        hosts: ["instagram.com", "www.instagram.com", "m.instagram.com"],
        replacement: appConfig.socialEmbeds.instagramProvider.trim().toLowerCase()
    },
    {
        platform: "Facebook",
        hosts: ["facebook.com", "www.facebook.com", "m.facebook.com", "web.facebook.com"],
        replacement: "facebed.com"
    },
    {
        platform: "X",
        hosts: ["x.com", "www.x.com"],
        replacement: "fixupx.com"
    },
    {
        platform: "X",
        hosts: ["twitter.com", "www.twitter.com", "mobile.twitter.com"],
        replacement: "fxtwitter.com"
    }
];

function cleanUrl(rawUrl) {
    return rawUrl.replace(/[),.!?;:]+$/g, "");
}

function convertSocialUrl(rawUrl) {
    let parsed;

    try {
        parsed = new URL(rawUrl);
    } catch {
        return null;
    }

    const provider = PROVIDERS.find(item => item.hosts.includes(parsed.hostname.toLowerCase()));
    if (!provider) return null;

    parsed.hostname = provider.replacement;
    parsed.protocol = "https:";
    parsed.port = "";

    return {
        platform: provider.platform,
        originalUrl: rawUrl,
        fixedUrl: parsed.toString()
    };
}

function findSocialEmbeds(content) {
    const matches = content.match(URL_REGEX) || [];
    const results = [];
    const seen = new Set();

    for (const match of matches) {
        const cleaned = cleanUrl(match);
        const converted = convertSocialUrl(cleaned);
        if (!converted || seen.has(converted.fixedUrl)) continue;

        seen.add(converted.fixedUrl);
        results.push(converted);
    }

    return results;
}

async function handleSocialEmbeds(message) {
    if (!message.guild || message.author.bot || !message.content) return;
    if (/\bfxignore\b/i.test(message.content)) return;

    const embeds = findSocialEmbeds(message.content);
    if (!embeds.length) return;

    const fixedLinks = embeds.map(item => item.fixedUrl);
    await message.reply({
        content: fixedLinks.join("\n"),
        allowedMentions: { repliedUser: false }
    });
    await message.delete().catch(error => {
        console.error("Could not delete original social link message:", error.message);
    });
}

module.exports = {
    findSocialEmbeds,
    handleSocialEmbeds
};
