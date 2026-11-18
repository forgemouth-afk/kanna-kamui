function disableActionRows(components) {
    return components.map(component => {
        const raw = typeof component.toJSON === "function"
            ? component.toJSON()
            : { ...component };

        if (raw.type === 1 && Array.isArray(raw.components)) {
            raw.components = raw.components.map(button => ({
                ...button,
                disabled: true
            }));
            return raw;
        }

        if (raw.type === 17 && Array.isArray(raw.components)) {
            raw.components = disableActionRows(raw.components);
            return raw;
        }

        return raw;
    });
}

function scheduleDisableButtons(interaction, delay = 120000) {
    const timer = setTimeout(async () => {
        try {
            const message = await interaction.fetchReply();
            if (!message.components?.length) return;

            await message.edit({
                components: disableActionRows(message.components)
            });
        } catch (error) {
            if (error.code !== 10008 && error.code !== 10062) {
                console.error("Could not disable inactive buttons:", error.message);
            }
        }
    }, delay);

    timer.unref?.();
}

module.exports = { scheduleDisableButtons };
