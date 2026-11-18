const {
    MessageFlags,
    REST,
    Routes,
    PermissionFlagsBits
} = require("discord.js");
const fs = require("node:fs");
const path = require("node:path");
const config = require("../config/config");
const { recordCommandUsage } = require("../utils/commandLogs");

async function loadSlashCommands(client, clientId) {
    const commandsPath = path.join(__dirname, "..", "commands");
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith(".js"));
    const commands = [];

    client.commands = new Map();

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        delete require.cache[require.resolve(filePath)];

        const command = require(filePath);
        if (!command.data || typeof command.execute !== "function") {
            console.warn(`Skipped invalid command file: ${file}`);
            continue;
        }

        client.commands.set(command.data.name, command);
        commands.push(command.data.toJSON());
    }

    const rest = new REST({ version: "10" }).setToken(config.discord.token);
    await rest.put(Routes.applicationCommands(clientId), { body: commands });

    console.log(`Registered ${commands.length} slash commands.`);
}

async function handleSlashCommands(interaction) {
    const command = interaction.client.commands.get(interaction.commandName);
    if (!command) return;

    if (interaction.commandName !== "log") {
        await recordCommandUsage(interaction).catch(error => {
            console.error("Command usage log error:", error);
        });
    }

    if (command.adminOnly && !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({
            content: "❌ This command is available to server administrators only.",
            flags: MessageFlags.Ephemeral
        });
    }

    await command.execute(interaction);
}

module.exports = { loadSlashCommands, handleSlashCommands };