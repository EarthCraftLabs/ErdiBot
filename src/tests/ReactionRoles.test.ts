import assert from "node:assert";
import { Collection, Events } from "discord.js";
import BotClient from "../client/BotClient";
import ConfigService from "../services/ConfigService";
import ReactionRolesService from "../services/ReactionRolesService";
import BuildReactionRoles from "../builder/ReactionRolesMessage";
import { NewPanelState, RenderPanel } from "../builder/ReactionRolesPanel";
import { RenderHub } from "../builder/SetupPanel";
import Setup from "../commands/admin/Setup";
import SetupHandler from "../events/setup/SetupHandler";
import ReactionRolesHandler from "../events/reactionroles/ReactionRolesHandler";
import ReactionRolesClaim from "../events/reactionroles/ReactionRolesClaim";
import { IReactionRolesState } from "../interfaces/services/reactionroles/IReactionRolesPanel";
import IReactionRolePanel from "../interfaces/services/reactionroles/IReactionRolePanel";
import {
    DefaultPanel,
    MAX_ENTRIES,
    NormalizeAccent,
    NormalizeEntries,
    NormalizeMode,
    NormalizeStyle,
    NormalizeTone,
    NormalizeUrl,
    ParseEmoji,
    ResolveClick,
    ResolveSelect,
} from "../constants/ReactionRoles";

const GUILD = "1162553851187040326";
const BILD = "https://example.com/panel.png";

assert.equal(NormalizeMode("unique"), "unique");
assert.equal(NormalizeMode("gibtsnicht"), "toggle");
assert.equal(NormalizeStyle("select"), "select");
assert.equal(NormalizeStyle(undefined), "buttons");
assert.equal(NormalizeTone("danger"), "danger");
assert.equal(NormalizeTone(42), "secondary");

assert.equal(NormalizeAccent("#5865f2"), "#5865F2");
assert.equal(NormalizeAccent("keine"), null, "eine kaputte Farbe heisst keine Farbe");
assert.equal(NormalizeAccent(null), null);

assert.equal(NormalizeUrl("https://example.com/bild.png"), "https://example.com/bild.png");
assert.equal(NormalizeUrl("  https://example.com/b.png  "), "https://example.com/b.png", "wird getrimmt");
assert.equal(NormalizeUrl("http://example.com/b.png"), null, "Discord lädt nur über https");
assert.equal(NormalizeUrl("attachment://b.png"), null);
assert.equal(NormalizeUrl("example.com/b.png"), null);
assert.equal(NormalizeUrl(""), null);
assert.equal(NormalizeUrl(`https://example.com/${"x".repeat(600)}`), null, "zu lang für die Spalte");

// Die entries-Spalte ist JSON - alles daran kann kaputt sein.
const repaired = NormalizeEntries([
    { id: "a", roleId: "1", label: "A".repeat(200), description: "x".repeat(200), tone: "lila" },
    { roleId: "2", emoji: { name: "herz", id: "9", animated: true } },
    { roleId: "3", emoji: { id: "9" } },
    { label: "ohne Rolle" },
    null,
    "kaputt",
]);

assert.equal(repaired.length, 3, "Einträge ohne Rolle fliegen raus");
assert.equal(repaired[0].label.length, 80, "Beschriftungen werden auf Button-Länge gekürzt");
assert.equal(repaired[0].description!.length, 100);
assert.equal(repaired[0].tone, "secondary", "unbekannte Farben fallen auf grau zurück");
assert.deepEqual(repaired[1].emoji, { id: "9", name: "herz", animated: true });
assert.equal(repaired[2].emoji, null, "ein Emoji ohne Namen ist keins");
assert.ok(repaired[1].id.length > 0, "fehlende IDs werden nachgezogen");
assert.equal(NormalizeEntries("kaputt").length, 0);
assert.equal(NormalizeEntries(Array.from({ length: 40 }, () => ({ roleId: "1" }))).length, MAX_ENTRIES);

const panelRoles = ["r1", "r2", "r3"];

assert.deepEqual(ResolveClick("toggle", [], panelRoles, "r1"), { add: ["r1"], remove: [] });
assert.deepEqual(ResolveClick("toggle", ["r1"], panelRoles, "r1"), { add: [], remove: ["r1"] });
assert.deepEqual(
    ResolveClick("toggle", ["r2"], panelRoles, "r1"),
    { add: ["r1"], remove: [] },
    "Mehrfach lässt die anderen in Ruhe"
);

assert.deepEqual(
    ResolveClick("unique", ["r2", "fremd"], panelRoles, "r1"),
    { add: ["r1"], remove: ["r2"] },
    "Nur-eine räumt die Geschwister weg, fremde Rollen aber nicht"
);
assert.deepEqual(ResolveClick("unique", ["r1"], panelRoles, "r1"), { add: [], remove: ["r1"] });

assert.deepEqual(ResolveClick("verify", [], panelRoles, "r1"), { add: ["r1"], remove: [] });
assert.deepEqual(
    ResolveClick("verify", ["r1"], panelRoles, "r1"),
    { add: [], remove: [] },
    "Nur-vergeben nimmt nichts wieder weg"
);

assert.deepEqual(ResolveSelect("toggle", ["r1", "fremd"], panelRoles, ["r2"]), { add: ["r2"], remove: ["r1"] });
assert.deepEqual(ResolveSelect("toggle", ["r1"], panelRoles, []), { add: [], remove: ["r1"] });
assert.deepEqual(ResolveSelect("toggle", ["r1"], panelRoles, ["r1"]), { add: [], remove: [] });
assert.deepEqual(ResolveSelect("verify", ["r1"], panelRoles, ["r2"]), { add: ["r2"], remove: [] });
assert.deepEqual(
    ResolveSelect("toggle", [], panelRoles, ["fremd"]),
    { add: [], remove: [] },
    "Rollen ausserhalb des Panels werden nie angefasst"
);

function Emoji(id: string, name: string, animated = false) {
    return { id, name, animated };
}

const guildEmojis = new Collection<string, ReturnType<typeof Emoji>>([
    ["111111111111111111", Emoji("111111111111111111", "earthcraft")],
    ["222222222222222222", Emoji("222222222222222222", "hype", true)],
]);

const guild = {
    id: GUILD,
    emojis: { cache: guildEmojis },
    client: { emojis: { cache: new Collection() } },
} as never;

assert.deepEqual(ParseEmoji("👍", guild), { id: null, name: "👍", animated: false });
assert.deepEqual(ParseEmoji("👍🏽", guild), { id: null, name: "👍🏽", animated: false }, "Hautfarben bleiben dran");
assert.deepEqual(ParseEmoji("🇩🇪", guild), { id: null, name: "🇩🇪", animated: false }, "Flaggen sind Emojis");
assert.ok(ParseEmoji("1️⃣", guild), "Keycaps sind Emojis");
assert.ok(ParseEmoji("👨‍👩‍👧", guild), "ZWJ-Ketten sind Emojis");

assert.deepEqual(ParseEmoji("<:earthcraft:111111111111111111>", guild), {
    id: "111111111111111111",
    name: "earthcraft",
    animated: false,
});
assert.deepEqual(ParseEmoji("<a:hype:222222222222222222>", guild), {
    id: "222222222222222222",
    name: "hype",
    animated: true,
});
assert.deepEqual(ParseEmoji(":earthcraft:", guild), Emoji("111111111111111111", "earthcraft"));
assert.deepEqual(ParseEmoji("EARTHCRAFT", guild), Emoji("111111111111111111", "earthcraft"), "Gross/klein egal");
assert.deepEqual(ParseEmoji("hype", guild), Emoji("222222222222222222", "hype", true));

assert.equal(ParseEmoji("<:fremd:999999999999999999>", guild), null, "unbekannte Server-Emojis werden abgelehnt");
assert.equal(ParseEmoji("gibtsnicht", guild), null);
assert.equal(ParseEmoji("", guild), null);
assert.equal(ParseEmoji("kein emoji sondern text", guild), null);
assert.equal(ParseEmoji("x".repeat(200), guild), null);

const service = new ReactionRolesService({} as never);
const draft = DefaultPanel(GUILD);

assert.ok(service.AddEntry(draft, "r1", "Erste"), "die erste Rolle geht rein");
assert.equal(service.AddEntry(draft, "r1", "Nochmal"), null, "dieselbe Rolle nicht zweimal");

const second = service.AddEntry(draft, "r2", "Zweite")!;

assert.equal(draft.entries.length, 2);
assert.equal(service.MoveEntry(draft, second.id, -1), true);
assert.equal(draft.entries[0].id, second.id, "der Eintrag ist nach oben gerutscht");
assert.equal(service.MoveEntry(draft, draft.entries[0].id, -1), false, "der oberste kann nicht höher");
assert.equal(service.MoveEntry(draft, "gibtsnicht", 1), false);
assert.equal(service.RemoveEntry(draft, second.id), true);
assert.equal(service.RemoveEntry(draft, second.id), false, "zweimal löschen geht nicht");

function Panel(overrides: Partial<IReactionRolePanel> = {}): IReactionRolePanel {
    const panel = DefaultPanel(GUILD);

    for (let index = 0; index < MAX_ENTRIES; index++) {
        service.AddEntry(panel, `role-${index}`, `Rolle ${index}`);
    }

    panel.entries[0].emoji = Emoji("111111111111111111", "earthcraft");
    panel.entries[1].emoji = Emoji("999999999999999999", "geloescht");
    panel.entries[2].emoji = { id: null, name: "🎮", animated: false };
    panel.channelId = "1";

    return { ...panel, ...overrides };
}

const messageGuild = { id: GUILD, emojis: { cache: guildEmojis } } as never;

// Bildet nach, was der Service macht: Adresse durchreichen, Galerie-ID zum Anhang, Fehlendes weglassen.
function MediaOf(panel: IReactionRolePanel) {
    const resolve = (value: string | null) => {
        if (value === null) return null;
        if (value.startsWith("https://")) return value;

        return value === "7" ? "attachment://0-banner.png" : null;
    };

    return { thumbnail: resolve(panel.thumbnail), image: resolve(panel.image), files: [] };
}

async function main(): Promise<void> {
    const configService = new ConfigService({} as never);

    await configService.Initialize();

    assert.ok(configService.Options("reactionroles", "modes").length >= 3, "reactionroles.json fehlt");
    assert.ok(configService.Options("setup", "modules").length >= 2, "setup.json fehlt");

    // 25 Rollen plus Thumbnail und Bild sind der teuerste Fall - das Komponenten-Budget muss reichen.
    for (const style of ["buttons", "select"] as const) {
        for (const extras of [{}, { thumbnail: BILD, image: BILD }, { accent: null }] as const) {
            const target = Panel({ style, ...extras });
            const built = BuildReactionRoles(target, messageGuild, MediaOf(target));
            const json = built.components[0].toJSON() as { components: unknown[]; accent_color?: number };

            assert.ok(json.components.length > 0, `${style}: der Container ist leer`);

            if ("accent" in extras) {
                assert.equal(json.accent_color ?? null, null, "ohne Farbe darf kein Akzent gesetzt sein");
            }
        }
    }

    const empty = BuildReactionRoles(DefaultPanel(GUILD), messageGuild, MediaOf(DefaultPanel(GUILD)));

    assert.equal(empty.components.length, 1, "auch ein leeres Panel liefert einen Container");

    // Ein Bildfeld hält entweder eine Adresse oder eine Galerie-ID - beides muss richtig aufgelöst werden.
    const gallery = {
        GetImage: async (id: string) =>
            id === "7" ? { id: "7", file: "banner.png", shortPath: "server/banner.png" } : null,
        Attach: (images: Array<{ file: string }>) => ({
            media: images.map((image, index) => `attachment://${index}-${image.file}`),
            files: images.map((image) => image.file),
        }),
        SearchImages: async () => [{ id: "7", file: "banner.png", shortPath: "server/banner.png" }],
    };

    const withGallery = new ReactionRolesService({ galleryService: gallery } as never);
    const resolved = await withGallery.Media({ ...DefaultPanel(GUILD), thumbnail: "7", image: "404" });

    assert.equal(resolved.thumbnail, "attachment://0-banner.png", "die Galerie-ID wird zum Anhang");
    assert.equal(resolved.image, null, "ein gelöschtes Galerie-Bild fällt weg statt zu blockieren");
    assert.equal(resolved.files.length, 1);

    const direct = await withGallery.Media({ ...DefaultPanel(GUILD), thumbnail: BILD, image: null });

    assert.equal(direct.thumbnail, BILD, "eine eigene Adresse geht unverändert durch");
    assert.equal(direct.files.length, 0, "eigene Adressen brauchen keinen Anhang");

    const panelClient = {
        configService,
        galleryService: gallery,
        reactionRolesService: {
            List: async () => [Panel(), Panel({ messageId: "42" })],
            Media: async (panel: IReactionRolePanel) => MediaOf(panel),
            Issue: (_guild: unknown, roleId: string) => (roleId === "role-1" ? "liegt über meiner höchsten Rolle" : null),
        },
        welcomeService: {
            Get: async () => ({ enabled: true, channelId: "1", card: { layers: [] } }),
        },
        guilds: { cache: new Map([[GUILD, { id: GUILD, name: "EarthCraft", emojis: { cache: guildEmojis } }]]) },
    } as unknown as BotClient;

    async function Render(overrides: Partial<IReactionRolesState> = {}): Promise<void> {
        const view = await RenderPanel(panelClient, { ...NewPanelState(GUILD), ...overrides });

        assert.equal(view.components.length, 1, "das Panel liefert genau einen Container");

        const json = view.components[0].toJSON() as { components: unknown[] };

        assert.ok(json.components.length > 0, "der Container darf nicht leer sein");
    }

    const full = Panel();

    await Render();
    await Render({ notice: "⚠️ Test", dirty: true });
    await Render({ view: "panel", panel: full });
    await Render({ view: "panel", panel: full, dirty: true });
    await Render({ view: "panel", panel: DefaultPanel(GUILD) });
    await Render({ view: "panel", panel: Panel({ style: "select", messageId: "42" }) });
    await Render({ view: "panel", panel: Panel({ accent: null, thumbnail: BILD, image: BILD }) });
    await Render({ view: "media", panel: Panel({ thumbnail: BILD, image: "7" }) });
    await Render({ view: "media", panel: Panel({ thumbnail: "404", image: null }) });
    await Render({ view: "picker", panel: Panel(), target: "thumbnail" });
    await Render({ view: "picker", panel: Panel(), target: null });
    await Render({ view: "entry", panel: full, entryId: full.entries[0].id });
    await Render({ view: "entry", panel: full, entryId: full.entries[1].id });
    await Render({ view: "entry", panel: full, entryId: full.entries[2].id });
    await Render({ view: "entry", panel: full, entryId: "gibtsnicht" });
    await Render({ view: "panel", panel: null });

    // Beim Start werden Commands und Events genau so gebaut - ein kaputter Builder killt sonst den Bot.
    const setupCommand = new Setup(panelClient);
    const registered = setupCommand.data.toJSON() as { name: string };

    assert.equal(registered.name, "setup");

    for (const Handler of [SetupHandler, ReactionRolesHandler, ReactionRolesClaim]) {
        const handler = new Handler(panelClient);

        assert.equal(handler.name, Events.InteractionCreate, `${Handler.name} hört auf das falsche Event`);
        assert.equal(handler.once, false);
    }

    const hub = await RenderHub(panelClient, GUILD);
    const hubJson = hub.components[0].toJSON() as { components: unknown[] };

    assert.equal(hub.components.length, 1, "der Setup-Hub liefert genau einen Container");
    assert.ok(hubJson.components.length >= 3, "der Hub braucht Titel, Übersicht und Auswahl");

    console.log(
        "OK - Emoji-Erkennung, Rollen-Logik in 3 Modi, kaputtes JSON, Galerie und eigene Adressen, 25 Rollen mit Bildern, " +
            "16 Panel-Zustände, der Setup-Hub, /setup und 3 Handler verhalten sich korrekt"
    );
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
