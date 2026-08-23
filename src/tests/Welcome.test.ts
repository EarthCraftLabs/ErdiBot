import assert from "node:assert";
import BotClient from "../client/BotClient";
import ConfigService from "../services/ConfigService";
import WelcomeService from "../services/WelcomeService";
import { NewPanelState, RenderPanel } from "../builder/WelcomePanel";
import BuildWelcome from "../builder/WelcomeMessage";
import { IWelcomeState } from "../interfaces/services/welcome/IWelcomePanel";
import IWelcomeConfig from "../interfaces/services/welcome/IWelcomeConfig";
import { ITextLayer, WelcomeLayer } from "../interfaces/services/welcome/IWelcomeLayer";
import { IPlaceholderContext } from "../interfaces/services/welcome/IWelcomeService";
import {
    AnchorPoint,
    ClampNumber,
    DefaultCard,
    DefaultConfig,
    IsHex,
    LayerPosition,
    MAX_LAYERS,
    NormalizeCard,
    NormalizeMode,
} from "../constants/Welcome";

assert.equal(IsHex("#5865F2"), true);
assert.equal(IsHex("#5865f2"), true);
assert.equal(IsHex("5865F2"), false, "ohne Raute ist es keine Farbe");
assert.equal(IsHex("#58"), false);
assert.equal(IsHex("rot"), false);

assert.equal(ClampNumber(50, 0, 100), 50);
assert.equal(ClampNumber(-10, 0, 100), 0);
assert.equal(ClampNumber(500, 0, 100), 100);
assert.equal(ClampNumber(12.6, 0, 100), 13, "wird gerundet");
assert.equal(ClampNumber(Number.NaN, 5, 100), 5, "NaN fällt auf das Minimum");

const card = DefaultCard();

assert.deepEqual(AnchorPoint("top-left", card), { x: 0, y: 0 });
assert.deepEqual(AnchorPoint("bottom-right", card), { x: card.width, y: card.height });
assert.deepEqual(AnchorPoint("middle-center", card), { x: card.width / 2, y: card.height / 2 });

const anchored = { ...card.layers[0], anchor: "bottom-right" as const, offsetX: -50, offsetY: -20 };

assert.deepEqual(LayerPosition(anchored, card), { x: card.width - 50, y: card.height - 20 });

// Die Karte kommt als JSON aus der Datenbank - alles daran kann kaputt sein.
const repaired = NormalizeCard({
    width: 99999,
    height: -40,
    color: "kaputt",
    gradient: "auch kaputt",
    overlay: 500,
    fit: "irgendwas",
    background: 42,
    layers: [
        { type: "text", size: 9999, color: "#abcdef", align: "diagonal", effect: "regenbogen", opacity: -5 },
        { type: "gibtsnicht" },
        null,
        "kaputt",
        { type: "avatar", shape: "dreieck", border: 999 },
    ],
});

assert.equal(repaired.width, 2000, "Breite wird auf das Maximum geklemmt");
assert.equal(repaired.height, 200, "Höhe wird auf das Minimum geklemmt");
assert.equal(repaired.color, "#2B2D31", "eine kaputte Farbe fällt auf den Standard zurück");
assert.equal(repaired.gradient, null, "ein kaputter Verlauf wird abgeschaltet");
assert.equal(repaired.overlay, 100);
assert.equal(repaired.fit, "cover");
assert.equal(repaired.background, null, "eine Zahl ist kein Bild");
assert.equal(repaired.layers.length, 3, "null, Strings und der Rest bleiben - unbekannte Typen werden Text");

const text = repaired.layers[0] as ITextLayer;

assert.equal(text.size, 200, "Schriftgrösse wird gedeckelt");
assert.equal(text.color, "#ABCDEF", "gültige Farben werden gross geschrieben");
assert.equal(text.align, "left");
assert.equal(text.effect, "none");
assert.equal(text.opacity, 0);

assert.equal(NormalizeCard(null).layers.length, DefaultCard().layers.length, "kein JSON = Standardkarte");
assert.equal(NormalizeCard("kaputt").width, 1024);
assert.equal(NormalizeCard({ layers: Array.from({ length: 50 }, () => ({ type: "text" })) }).layers.length, MAX_LAYERS);

assert.equal(NormalizeMode("container"), "container");
assert.equal(NormalizeMode("was anderes"), "image_container");
assert.equal(NormalizeMode(undefined), "image_container");

const service = new WelcomeService({} as never);

const context: IPlaceholderContext = {
    mention: "<@1059621019947634739>",
    username: "mecrytv",
    displayName: "MecryTv",
    tag: "mecrytv",
    guild: "EarthCraft",
    memberCount: 1337,
    avatar: "https://cdn.discordapp.com/embed/avatars/0.png",
    joinedAt: new Date("2026-08-23T12:00:00.000Z"),
};

assert.equal(service.Fill("Hallo {displayname}!", context), "Hallo MecryTv!");
assert.equal(service.Fill("{user} auf {server}", context), "<@1059621019947634739> auf EarthCraft");
assert.equal(service.Fill("Du bist {ordinal} Mitglied", context), "Du bist 1337. Mitglied");
assert.equal(service.Fill("{DISPLAYNAME}", context), "MecryTv", "Platzhalter sind case-insensitive");
assert.equal(service.Fill("{gibtsnicht}", context), "{gibtsnicht}", "Unbekanntes bleibt stehen");
assert.equal(service.Fill("100% {membercount}", context), "100% 1337");

const editable = DefaultCard();
const before = editable.layers.length;

const added = service.AddLayer(editable, "shape");

assert.equal(editable.layers.length, before + 1);
assert.equal(added.type, "shape");
assert.equal(editable.layers[editable.layers.length - 1].id, added.id, "neue Ebenen liegen oben");

assert.equal(service.MoveLayer(editable, added.id, -1), true);
assert.equal(editable.layers[before - 1].id, added.id, "eine Ebene nach unten geschoben");
assert.equal(service.MoveLayer(editable, added.id, 1), true);
assert.equal(service.MoveLayer(editable, editable.layers[0].id, -1), false, "die unterste kann nicht tiefer");
assert.equal(service.MoveLayer(editable, "gibtsnicht", 1), false);

assert.equal(service.RemoveLayer(editable, added.id), true);
assert.equal(service.RemoveLayer(editable, added.id), false, "zweimal löschen geht nicht");
assert.equal(editable.layers.length, before);

function Dimensions(png: Buffer): { width: number; height: number } {
    assert.deepEqual([...png.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47], "das ist kein PNG");

    return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

async function main(): Promise<void> {
    await service.Initialize();

    assert.ok(service.Fonts.length >= 20, `es sollten die geladenen Schriften da sein, sind aber ${service.Fonts.length}`);
    assert.equal(service.HasFont("Bebas Neue"), true);
    assert.equal(service.HasFont("Comic Sans MS"), false, "nicht mitgelieferte Schriften gelten als unbekannt");

    const config: IWelcomeConfig = DefaultConfig("1162553851187040326");

    // Avatar und Galeriebilder brauchen Netz beziehungsweise Datenbank - hier wird die Zeichenlogik geprüft.
    config.card.layers = config.card.layers.filter((layer): layer is WelcomeLayer => layer.type !== "avatar");

    const attachment = await service.Render(config, context);
    const png = attachment.attachment as Buffer;

    assert.equal(attachment.name, "welcome.png");
    assert.deepEqual(Dimensions(png), { width: config.card.width, height: config.card.height });

    const fancy = DefaultConfig("1162553851187040326");

    fancy.card.width = 720;
    fancy.card.height = 300;
    fancy.card.radius = 40;
    fancy.card.overlay = 60;
    fancy.card.gradient = null;
    fancy.card.layers = [
        {
            id: "wrap",
            type: "text",
            name: "Umbruch",
            anchor: "top-left",
            offsetX: 20,
            offsetY: 20,
            opacity: 80,
            hidden: false,
            text: "Ein sehr langer Willkommenstext für {displayname}, der garantiert umbrechen muss",
            font: "Playfair Display",
            size: 32,
            color: "#FFFFFF",
            bold: true,
            italic: true,
            align: "left",
            effect: "both",
            effectColor: "#000000",
            maxWidth: 300,
        },
        {
            id: "unsichtbar",
            type: "text",
            name: "Versteckt",
            anchor: "middle-center",
            offsetX: 0,
            offsetY: 0,
            opacity: 100,
            hidden: true,
            text: "Darf nicht auftauchen",
            font: "Anton",
            size: 60,
            color: "#ED4245",
            bold: false,
            italic: false,
            align: "center",
            effect: "none",
            effectColor: "#000000",
            maxWidth: 0,
        },
        {
            id: "linie",
            type: "shape",
            name: "Linie",
            anchor: "bottom-left",
            offsetX: 20,
            offsetY: -40,
            opacity: 100,
            hidden: false,
            shape: "line",
            width: 300,
            height: 6,
            color: "#5865F2",
            radius: 3,
        },
        {
            id: "kreis",
            type: "shape",
            name: "Kreis",
            anchor: "bottom-right",
            offsetX: -120,
            offsetY: -120,
            opacity: 50,
            hidden: false,
            shape: "circle",
            width: 100,
            height: 100,
            color: "#EB459E",
            radius: 0,
        },
    ];

    const second = (await service.Render(fancy, context)).attachment as Buffer;

    assert.deepEqual(Dimensions(second), { width: 720, height: 300 });
    assert.ok(second.byteLength > 1000, "eine gezeichnete Karte ist nicht winzig");

    const unknown = DefaultConfig("1162553851187040326");

    unknown.card.layers = [{ ...(DefaultCard().layers[1] as ITextLayer), font: "GibtEsNicht" }];

    const third = (await service.Render(unknown, context)).attachment as Buffer;

    assert.deepEqual(Dimensions(third), { width: 1024, height: 400 }, "unbekannte Schrift darf nicht crashen");

    const configService = new ConfigService({} as never);

    await configService.Initialize();

    assert.ok(configService.Has("welcome"), "src/config/welcome.json muss geladen sein");
    assert.equal(configService.Options("welcome", "fonts").length, service.Fonts.length, "Config und Manifest müssen dieselben Schriften kennen");

    for (const font of configService.Options("welcome", "fonts")) {
        assert.equal(service.HasFont(font.value), true, `Schrift aus der Config fehlt auf der Platte: ${font.value}`);
    }

    const panelClient = {
        configService,
        welcomeService: service,
        guilds: { cache: new Map() },
        galleryService: {
            GetCategories: async () => [],
            SearchImages: async () => [],
        },
    } as unknown as BotClient;

    const layerIds = DefaultCard().layers.map((entry) => entry.id);

    async function Panel(overrides: Partial<IWelcomeState> = {}): Promise<void> {
        const base = NewPanelState("1162553851187040326", DefaultConfig("1162553851187040326"));
        const view = await RenderPanel(panelClient, { ...base, ...overrides });

        assert.equal(view.components.length, 1, "das Panel liefert genau einen Container");

        const json = view.components[0].toJSON() as { components: unknown[] };

        assert.ok(json.components.length > 0, "der Container darf nicht leer sein");
    }

    await Panel();
    await Panel({ dirty: true, notice: "⚠️ Test" });
    await Panel({ view: "card" });
    await Panel({ view: "layers" });
    await Panel({ view: "message" });
    await Panel({ view: "category", target: "background" });
    await Panel({ view: "image", target: "background" });
    await Panel({ view: "layer", layerId: layerIds[0] });
    await Panel({ view: "layer", layerId: layerIds[1] });
    await Panel({ view: "layer", layerId: "gibtsnicht" });

    const withShapes = DefaultConfig("1162553851187040326");

    service.AddLayer(withShapes.card, "shape");
    service.AddLayer(withShapes.card, "image");

    for (const entry of withShapes.card.layers) {
        await Panel({ config: withShapes, view: "layer", layerId: entry.id });
    }

    for (const mode of ["image", "image_container", "container"] as const) {
        const variant = DefaultConfig("1162553851187040326");

        variant.mode = mode;
        variant.card.layers = variant.card.layers.filter((entry) => entry.type !== "avatar");

        const built = await BuildWelcome(panelClient, variant, context);

        assert.equal(built.files.length, mode === "container" ? 0 : 1, `${mode}: falsche Anzahl Dateien`);
        assert.equal(built.components.length, mode === "image" ? 0 : 1, `${mode}: falsche Anzahl Container`);
        assert.equal(built.componentsV2, mode !== "image", `${mode}: falsches Nachrichtenformat`);
    }

    console.log(
        `OK - ${service.Fonts.length} Schriften registriert, Normalisierung repariert kaputtes JSON, ` +
            `Platzhalter, Ebenen, 3 gerenderte Karten, 14 Panel-Zustände und 3 Ausgabemodi verhalten sich korrekt`
    );
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
