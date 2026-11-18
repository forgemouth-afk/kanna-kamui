const {
    SlashCommandBuilder,
    EmbedBuilder,
    AttachmentBuilder
} = require("discord.js");
const axios = require("axios");
const ytSearch = require("yt-search");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { pipeline } = require("node:stream/promises");
const config = require("../config/config");

const API_URL = "https://api.autoresbot.com/api/downloader/ytplay";
const MAX_DOWNLOAD_SIZE = 24 * 1024 * 1024;

module.exports = {
    data: new SlashCommandBuilder()
        .setName("play")
        .setDescription("Search and download audio from YouTube with live progress.")
        .addStringOption(option => option
            .setName("query")
            .setDescription("Song title or YouTube URL")
            .setMaxLength(200)
            .setRequired(true)),
    async execute(interaction) {
        const query = interaction.options.getString("query", true).trim();
        const tempPath = path.join(os.tmpdir(), `discord-play-${interaction.id}.mp3`);
        let progressMessage;

        const progressEmbed = (title, description, percent = null) => {
            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle(title)
                .setDescription(description)
                .setTimestamp();

            if (percent !== null) {
                const safePercent = Math.max(0, Math.min(100, percent));
                const filled = Math.round(safePercent / 10);
                const bar = "▰".repeat(filled) + "▱".repeat(10 - filled);
                embed.addFields({
                    name: "Download Progress",
                    value: `\`${bar}\` **${safePercent}%**`,
                    inline: false
                });
            }

            return embed;
        };

        const updateProgress = async (embed) => {
            try {
                if (!progressMessage) {
                    progressMessage = await interaction.editReply({ embeds: [embed] });
                } else {
                    await interaction.editReply({ embeds: [embed] });
                }
            } catch (error) {
                console.error("Play progress update error:", error);
            }
        };

        await interaction.deferReply();

        try {
            await updateProgress(progressEmbed(
                "🔎 Searching YouTube",
                `Looking for **${query.replace(/[*_`]/g, "\\$&")}**...`
            ));

            const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//i;
            const isUrl = youtubeRegex.test(query);
            let youtubeUrl = query;
            let title = query;
            let duration = 0;
            let thumbnail = null;

            if (!isUrl) {
                const search = await ytSearch(query);
                const video = search?.videos?.[0];
                if (!video) throw new Error("No YouTube results found for that query.");
                youtubeUrl = video.url;
                title = video.title;
                duration = video.seconds || 0;
                thumbnail = video.thumbnail || null;
            } else {
                const videoId = youtubeUrl.match(/(?:v=|youtu\.be\/|shorts\/)([a-zA-Z0-9_-]{11})/)?.[1];
                if (videoId) {
                    try {
                        const info = await ytSearch({ videoId });
                        title = info?.title || title;
                        duration = info?.seconds || 0;
                        thumbnail = info?.thumbnail || null;
                    } catch (error) {
                        console.warn("Could not retrieve YouTube metadata:", error.message);
                    }
                }
            }

            await updateProgress(progressEmbed(
                "🎵 Track Found",
                `**[${title.slice(0, 240)}](${youtubeUrl})**\n${duration ? `Duration: **${formatDuration(duration)}**\n` : ""}Preparing audio download...`
            ));

            let audioUrl = null;
            const apiKey = config.autoresbotApiKey;
            if (apiKey && apiKey !== "PASTE_API_KEY_HERE") {
                for (let attempt = 1; attempt <= 3; attempt++) {
                    try {
                        const response = await axios.get(API_URL, {
                            params: { apikey: apiKey, url: youtubeUrl },
                            timeout: 30000,
                            validateStatus: () => true
                        });

                        if (response.status >= 200 && response.status < 300) {
                            audioUrl = getAudioUrl(response.data);
                            if (audioUrl) break;
                        }
                    } catch (error) {
                        console.warn(`YouTube downloader attempt ${attempt} failed:`, error.message);
                    }

                    if (attempt < 3) {
                        await updateProgress(progressEmbed(
                            "⚙️ Preparing Download",
                            `The audio provider is taking longer than expected. Retrying... **${attempt}/3**`
                        ));
                        await sleep(1200);
                    }
                }
            }

            if (!audioUrl) {
                throw new Error("Could not retrieve the audio download link. Check the API key in config/config.js or try again later.");
            }

            await updateProgress(progressEmbed(
                "⬇️ Downloading Audio",
                `**${title.slice(0, 240)}**\nConnecting to the audio server...`,
                0
            ));

            const response = await axios.get(audioUrl, {
                responseType: "stream",
                timeout: 120000,
                maxRedirects: 8,
                validateStatus: status => status >= 200 && status < 300
            });

            const totalBytes = Number(response.headers["content-length"]) || 0;
            if (totalBytes > MAX_DOWNLOAD_SIZE) {
                response.data.destroy();
                throw new Error("The audio file is larger than the bot's 24 MB upload limit. Try a shorter version of the song.");
            }

            let downloadedBytes = 0;
            let lastUpdate = 0;
            let lastPercent = -1;
            let oversized = false;

            response.data.on("data", chunk => {
                downloadedBytes += chunk.length;
                if (downloadedBytes > MAX_DOWNLOAD_SIZE) {
                    oversized = true;
                    response.data.destroy(new Error("The audio file is larger than the bot's 24 MB upload limit."));
                    return;
                }

                const now = Date.now();
                const percent = totalBytes ? Math.min(100, Math.floor(downloadedBytes / totalBytes * 100)) : null;
                if (percent !== null && (percent >= lastPercent + 5 || percent === 100) && now - lastUpdate >= 900) {
                    lastPercent = percent;
                    lastUpdate = now;
                    updateProgress(progressEmbed(
                        "⬇️ Downloading Audio",
                        `**${title.slice(0, 240)}**\n${formatBytes(downloadedBytes)} of ${formatBytes(totalBytes)} downloaded.`,
                        percent
                    ));
                } else if (!totalBytes && now - lastUpdate >= 1500) {
                    lastUpdate = now;
                    updateProgress(progressEmbed(
                        "⬇️ Downloading Audio",
                        `**${title.slice(0, 240)}**\n${formatBytes(downloadedBytes)} downloaded...`
                    ));
                }
            });

            try {
                await pipeline(response.data, fs.createWriteStream(tempPath));
            } catch (error) {
                if (oversized) {
                    throw new Error("The audio file is larger than the bot's 24 MB upload limit. Try a shorter version of the song.");
                }
                throw error;
            }

            if (!fs.existsSync(tempPath) || fs.statSync(tempPath).size === 0) {
                throw new Error("The audio provider returned an empty file.");
            }

            await updateProgress(progressEmbed(
                "📤 Uploading to Discord",
                `**${title.slice(0, 240)}**\nDownload complete: **${formatBytes(fs.statSync(tempPath).size)}**. Uploading the audio...`,
                100
            ));

            const attachment = new AttachmentBuilder(tempPath, {
                name: `${sanitizeFilename(title)}.mp3`,
                description: `Audio: ${title}`.slice(0, 200)
            });
            const embed = new EmbedBuilder()
                .setColor(0x57F287)
                .setTitle("🎶 Now Playing — Download Complete")
                .setDescription(`**[${title.slice(0, 240)}](${youtubeUrl})**`)
                .addFields(
                    { name: "Duration", value: duration ? formatDuration(duration) : "Unknown", inline: true },
                    { name: "File Size", value: formatBytes(fs.statSync(tempPath).size), inline: true }
                )
                .setFooter({ text: "YouTube Audio Downloader" })
                .setTimestamp();
            if (thumbnail) embed.setThumbnail(thumbnail);

            await interaction.editReply({ content: null, embeds: [embed], files: [attachment] });
        } catch (error) {
            console.error("Play command error:", error);
            await interaction.editReply({
                embeds: [progressEmbed(
                    "❌ Download Failed",
                    error?.message || "An unexpected error occurred while processing the audio."
                )]
            }).catch(() => {});
        } finally {
            if (fs.existsSync(tempPath)) {
                await fs.promises.unlink(tempPath).catch(() => {});
            }
        }
    }
};

function getAudioUrl(data) {
    if (!data) return null;
    const paths = [
        data?.data?.url,
        data?.data?.download_url,
        data?.data?.downloadUrl,
        data?.data?.result?.url,
        data?.data?.result?.download_url,
        data?.result?.url,
        data?.result?.download_url,
        data?.url,
        data?.audio,
        data?.audio_url,
        data?.download,
        data?.download_url,
        data?.link,
        data?.data?.audio,
        data?.data?.mp3,
        data?.mp3
    ];

    for (const value of paths) {
        if (typeof value === "string" && /^https?:\/\//i.test(value)) return value;
    }

    function deepSearch(value, depth = 0) {
        if (depth > 12 || !value || typeof value !== "object") return null;
        if (Array.isArray(value)) {
            for (const item of value) {
                const found = deepSearch(item, depth + 1);
                if (found) return found;
            }
            return null;
        }
        for (const key of Object.keys(value)) {
            const item = value[key];
            if (typeof item === "string" && /^https?:\/\//i.test(item) && !item.includes("ytimg.com")) return item;
            if (item && typeof item === "object") {
                const found = deepSearch(item, depth + 1);
                if (found) return found;
            }
        }
        return null;
    }

    return deepSearch(data);
}

function formatDuration(seconds) {
    const value = Math.max(0, Number(seconds) || 0);
    const hours = Math.floor(value / 3600);
    const minutes = Math.floor((value % 3600) / 60);
    const remaining = value % 60;
    return hours
        ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`
        : `${minutes}:${String(remaining).padStart(2, "0")}`;
}

function formatBytes(bytes) {
    if (!bytes) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / Math.pow(1024, index)).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function sanitizeFilename(name) {
    return String(name)
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80) || "youtube_audio";
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
