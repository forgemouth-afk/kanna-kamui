async function fetchAvatarImage(user) {
    const avatarUrl = user.displayAvatarURL({
        extension: "png",
        forceStatic: true,
        size: 256
    });

    const response = await fetch(avatarUrl);
    if (!response.ok) {
        throw new Error(`Could not fetch avatar image: HTTP ${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
        throw new Error(`Avatar response is not an image: ${contentType || "unknown content type"}`);
    }

    return Buffer.from(await response.arrayBuffer());
}

module.exports = { fetchAvatarImage };
