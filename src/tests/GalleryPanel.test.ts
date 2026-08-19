import assert from "node:assert";
import BotClient from "../client/BotClient";
import { NewPanelState, RenderPanel } from "../builder/GalleryPanel";
import { ICategoryEntry, IGalleryEntry } from "../interfaces/services/gallery/IGalleryService";

const GUILD = "123456789012345678";

function Image(index: number): IGalleryEntry {
    return {
        guildId: GUILD,
        category: "rocketleague",
        subcategory: null,
        file: `bild-${index}.png`,
        createdAt: new Date(),
        id: `${index}`.padStart(24, "0"),
        url: `https://bot.ascension-dach.org/images/${GUILD}/rocketleague/bild-${index}.png`,
        path: `Ascension/rocketleague/bild-${index}.png`,
        shortPath: `rocketleague/bild-${index}.png`,
    };
}

function Category(name: string, guildId = GUILD, parent: string | null = null): ICategoryEntry {
    return { guildId, name, parent, scope: guildId === "default" ? "default" : "custom", images: 3 };
}

function FakeClient(categories: ICategoryEntry[], subcategories: ICategoryEntry[], images: IGalleryEntry[]) {
    return {
        developerMode: false,
        galleryService: {
            GetCategories: async () => categories,
            GetSubcategories: async () => subcategories,
            GetImages: async () => images,
            Attach: (slice: IGalleryEntry[]) => ({ media: slice.map((image) => image.url), files: [] }),
        },
    } as unknown as BotClient;
}

const many = Array.from({ length: 34 }, (_, index) => Image(index));
const categories = Array.from({ length: 30 }, (_, index) => Category(`kategorie-${index}`));
const subcategories = Array.from({ length: 30 }, (_, index) => Category(`unter-${index}`, GUILD, "rocketleague"));

async function Render(client: BotClient, overrides: Partial<ReturnType<typeof NewPanelState>> = {}) {
    const view = await RenderPanel(client, { ...NewPanelState(GUILD), ...overrides });

    assert.equal(view.components.length, 1, "Panel sollte genau einen Container liefern");

    const json = view.components[0].toJSON() as { components: unknown[] };
    assert.ok(json.components.length > 0, "Container sollte nicht leer sein");

    return json;
}

async function main(): Promise<void> {
    await Render(FakeClient([], [], []));

    await Render(FakeClient([Category("rocketleague")], [], [Image(0)]), { category: "rocketleague" });

    const full = FakeClient(categories, subcategories, many);

    for (const page of [0, 1, 3]) {
        await Render(full, { category: "rocketleague", page });
    }

    await Render(full, { category: "rocketleague", mode: "delete" });
    await Render(full, { category: "rocketleague", mode: "delete", marked: [many[0].id, many[1].id] });

    await Render(full, { category: "rocketleague", mode: "move" });
    await Render(full, { category: "rocketleague", mode: "move", moving: many[0].id });

    await Render(full, { scope: "default", category: "rocketleague" });

    await Render(FakeClient(categories, subcategories, []), { category: "rocketleague" });

    await Render(full, { category: "rocketleague", page: 99 });

    console.log("OK - 11 Panel-Zustände gerendert, alle innerhalb der Component-Limits");
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
