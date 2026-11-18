const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags
} = require("discord.js");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const fs = require("node:fs");
const path = require("node:path");
const config = require("../config/config");

const execFileAsync = promisify(execFile);
const PROJECT_ROOT = path.resolve(__dirname, "..");
const CONFIRM_TTL = 10 * 60 * 1000;

function settings() {
    return config.github || {};
}

function isAllowed(userId) {
    return Array.isArray(config.gitpush?.ownerIds) && config.gitpush.ownerIds.includes(userId);
}

function missingSettings() {
    const value = settings();
    const missing = [];
    for (const key of ["token", "repository", "branch", "username", "email"]) {
        if (!value[key]) missing.push(`github.${key}`);
    }
    if (!Array.isArray(config.gitpush?.ownerIds) || !config.gitpush.ownerIds.length) missing.push("gitpush.ownerIds");
    return missing;
}

async function git(args, options = {}) {
    return execFileAsync("git", args, {
        cwd: PROJECT_ROOT,
        windowsHide: true,
        maxBuffer: 8 * 1024 * 1024,
        timeout: 120000,
        ...options
    });
}

function authEnvironment() {
    const auth = Buffer.from(`x-access-token:${settings().token}`).toString("base64");
    return {
        ...process.env,
        GIT_CONFIG_COUNT: "1",
        GIT_CONFIG_KEY_0: "http.extraheader",
        GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${auth}`,
        GIT_TERMINAL_PROMPT: "0"
    };
}

function safeError(error) {
    return String(error.stderr || error.message || "Unknown Git error")
        .replaceAll(settings().token || "\0", "[REDACTED]")
        .replace(/https:\/\/[^\s@]+:[^\s@]+@/g, "https://[REDACTED]@");
}

async function ensureRepository() {
    if (!fs.existsSync(path.join(PROJECT_ROOT, ".git"))) {
        await git(["init"]);
    }

    const value = settings();
    const remote = await git(["remote", "get-url", "origin"]).then(result => result.stdout.trim()).catch(() => "");
    if (!remote) await git(["remote", "add", "origin", value.repository]);
    else if (remote !== value.repository) await git(["remote", "set-url", "origin", value.repository]);

    await git(["config", "user.name", value.username]);
    await git(["config", "user.email", value.email]);
    await git(["checkout", "-B", value.branch]).catch(async () => {
        await git(["checkout", "--orphan", value.branch]);
    });
}

async function performPush() {
    const value = settings();
    await ensureRepository();
    await git(["rm", "--cached", "--ignore-unmatch", "config/config.js"]).catch(() => null);
    await git(["add", "-A"]);

    const staged = await git(["diff", "--cached", "--name-only"]);
    if (!staged.stdout.trim()) return { noChanges: true };
    const files = staged.stdout.trim().split("\n");
    if (files.includes("config/config.js")) {
        throw new Error("Safety check failed: config/config.js is staged. Check .gitignore before pushing.");
    }

    await git(["commit", "-m", `Update project - ${new Date().toISOString()}`]);
    await git(["push", "-u", "origin", value.branch], { env: authEnvironment() });
    return { files: files.length };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("gitpush")
        .setDescription("Review project changes and push them to the configured GitHub repository."),

    async execute(interaction) {
        if (!isAllowed(interaction.user.id)) {
            return interaction.reply({ content: "❌ You are not allowed to use this command.", flags: MessageFlags.Ephemeral });
        }

        const missing = missingSettings();
        if (missing.length) {
            return interaction.reply({
                content: `❌ Complete these settings in \`config/config.js\` first: ${missing.map(item => `\`${item}\``).join(", ")}.`,
                flags: MessageFlags.Ephemeral
            });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        try {
            await ensureRepository();
            const { stdout } = await git(["status", "--short", "--untracked-files=all"]);
            const changes = stdout.trim() ? stdout.trim().split("\n") : [];
            if (!changes.length) return interaction.editReply("ℹ️ No project changes were found to push.");

            const expiresAt = Date.now() + CONFIRM_TTL;
            const preview = changes.slice(0, 15).map(line => `\`${line.slice(0, 120)}\``).join("\n");
            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle("🚀 GitHub Push Confirmation")
                .setDescription([
                    `**Repository:** ${settings().repository}`,
                    `**Branch:** \`${settings().branch}\``,
                    `**Changed files:** ${changes.length}`,
                    "",
                    preview,
                    changes.length > 15 ? `…and ${changes.length - 15} more file(s).` : "",
                    "",
                    "⚠️ `config/config.js` is excluded from the push."
                ].filter(Boolean).join("\n"))
                .setFooter({ text: `Confirmation expires in 3 minutes • Requested by ${interaction.user.tag}` });
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`gitpush_confirm:${interaction.user.id}:${expiresAt}`).setLabel("Confirm Push").setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`gitpush_cancel:${interaction.user.id}:${expiresAt}`).setLabel("Cancel").setStyle(ButtonStyle.Danger)
            );
            return interaction.editReply({ embeds: [embed], components: [row] });
        } catch (error) {
            console.error("Git push preview error:", safeError(error));
            return interaction.editReply(`❌ Could not prepare GitHub push: ${safeError(error).slice(0, 1200)}`);
        }
    },

    async handleButton(interaction) {
        const [action, ownerId, expiresAtRaw] = interaction.customId.split(":");
        if (!isAllowed(interaction.user.id) || interaction.user.id !== ownerId) {
            return interaction.reply({ content: "❌ Only the authorized user who opened this panel can use it.", flags: MessageFlags.Ephemeral });
        }
        const expiresAt = Number(expiresAtRaw);
        if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) {
            return interaction.update({ content: "⌛ This GitHub push confirmation has expired. Run `/gitpush` again.", embeds: [], components: [] });
        }
        if (action === "gitpush_cancel") {
            return interaction.update({ content: "❎ GitHub push cancelled.", embeds: [], components: [] });
        }

        await interaction.update({ content: "⏳ Pushing project to GitHub…", embeds: [], components: [] });
        try {
            const result = await performPush();
            if (result.noChanges) return interaction.editReply("ℹ️ No staged project changes were found. Nothing was pushed.");
            return interaction.editReply(`✅ Successfully pushed **${result.files} file(s)** to **${settings().repository}** on branch **${settings().branch}**.`);
        } catch (error) {
            console.error("Git push execution error:", safeError(error));
            return interaction.editReply(`❌ GitHub push failed: ${safeError(error).slice(0, 1200)}`);
        }
    }
};
