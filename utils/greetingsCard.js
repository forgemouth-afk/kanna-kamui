const { JSX, Builder, loadImage, Font } = require("canvacord");

class GreetingsCard extends Builder {
    constructor() {
        super(1200, 420);
        this.bootstrap({
            displayName: "",
            type: "welcome",
            avatar: "",
            message: ""
        });
    }

    setDisplayName(value) {
        this.options.set("displayName", value);
        return this;
    }

    setType(value) {
        this.options.set("type", value);
        return this;
    }

    setAvatar(value) {
        this.options.set("avatar", value);
        return this;
    }

    setMessage(value) {
        this.options.set("message", value);
        return this;
    }

    async render() {
        const { type, displayName, avatar, message } = this.options.getOptions();
        const image = await loadImage(avatar);
        const isWelcome = type === "welcome";
        const accent = isWelcome ? "#7C9CFF" : "#FF7B86";
        const glow = isWelcome ? "rgba(88,101,242,0.32)" : "rgba(237,66,69,0.28)";
        const heading = isWelcome ? "A NEW ADVENTURE BEGINS" : "UNTIL WE MEET AGAIN";
        const title = isWelcome ? "WELCOME" : "GOODBYE";

        return JSX.createElement(
            "div",
            {
                className: "h-full w-full flex items-center justify-center overflow-hidden",
                style: {
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "linear-gradient(125deg, #0B1020 0%, #151D33 52%, #222B42 100%)"
                }
            },
            JSX.createElement(
                "div",
                {
                    className: "relative w-[94%] h-[86%] flex items-center rounded-2xl px-12",
                    style: {
                        display: "flex",
                        alignItems: "center",
                        background: "linear-gradient(110deg, #202A40 0%, #182236 58%, #111827 100%)",
                        border: `2px solid ${accent}`,
                        boxShadow: `0 0 38px ${glow}`
                    }
                },
                JSX.createElement("div", {
                    className: "absolute top-0 right-0 w-[300px] h-[300px] rounded-full opacity-20",
                    style: { display: "flex", background: accent, filter: "blur(90px)" }
                }),
                JSX.createElement(
                    "div",
                    {
                        className: "flex items-center justify-center w-[260px] h-[260px] rounded-full shrink-0",
                        style: {
                            display: "flex",
                            background: `linear-gradient(145deg, ${accent}, #29344D)`,
                            padding: "9px",
                            boxShadow: `0 0 28px ${glow}`
                        }
                    },
                    JSX.createElement("img", {
                        src: image.toDataURL(),
                        className: "w-full h-full rounded-full",
                        style: { border: "8px solid #111827" }
                    })
                ),
                JSX.createElement(
                    "div",
                    { className: "flex flex-col ml-12 flex-1", style: { display: "flex", flexDirection: "column" } },
                    JSX.createElement(
                        "p",
                        { className: "text-lg font-bold m-0", style: { color: accent, letterSpacing: "0.35em" } },
                        heading
                    ),
                    JSX.createElement(
                        "h1",
                        { className: "text-6xl font-extrabold text-white m-0 mt-3", style: { letterSpacing: "0.04em" } },
                        title
                    ),
                    JSX.createElement(
                        "h2",
                        { className: "text-4xl font-bold text-white m-0 mt-2" },
                        displayName
                    ),
                    JSX.createElement("div", {
                        className: "w-[110px] h-[5px] rounded-full mt-5 mb-4",
                        style: { display: "flex", background: accent }
                    }),
                    JSX.createElement(
                        "p",
                        { className: "text-2xl text-gray-300 m-0", style: { lineHeight: "1.35" } },
                        message
                    )
                )
            )
        );
    }
}

let fontLoaded = false;

async function createGreetingsCard(member, type, message) {
    if (!fontLoaded) {
        Font.loadDefault();
        fontLoaded = true;
    }

    const card = new GreetingsCard()
        .setAvatar(member.user.displayAvatarURL({ extension: "png", size: 256 }))
        .setDisplayName(member.user.globalName || member.displayName || member.user.username)
        .setType(type)
        .setMessage(type === "welcome" ? "We're glad to have you here." : "We're sorry to see you go.");

    return card.build({ format: "png" });
}

module.exports = { createGreetingsCard };
