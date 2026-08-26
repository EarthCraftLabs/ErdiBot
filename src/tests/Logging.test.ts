import assert from "node:assert";
import { ChannelType, MessageFlags } from "discord.js";
import BotClient from "../client/BotClient";
import LogType from "../enums/LogType";
import BuildLogMessage from "../builder/LogMessage";
import { NewPanelState, PanelStates, RenderPanel } from "../builder/LoggingPanel";
import { ILoggingState } from "../interfaces/services/logging/ILoggingPanel";
import IDiscordLogChannel from "../interfaces/database/models/IDiscordLogChannel";
import { ILogHealth } from "../interfaces/services/logging/ILoggingService";
import {
    CATEGORIES,
    CHANNEL_TYPES,
    Category,
    Change,
    Channel,
    Cut,
    IsChannelKind,
    IsLogType,
    Line,
    List,
    MAX_LIST_ITEMS,
    Mention,
    Stamp,
} from "../constants/Logging";

const GUILD = "1162553851187040326";

// ── Kategorien ─────────────────────────────────────────────────────────────

assert.equal(CATEGORIES.length, 10, "es sind zehn Kategorien vorgesehen");

const types = CATEGORIES.map((category) => category.type);

assert.equal(new Set(types).size, types.length, "jede Kategorie kommt nur einmal vor");
assert.equal(new Set(Object.values(LogType)).size, CATEGORIES.length, "jeder LogType hat eine Kategorie");

for (const category of CATEGORIES) {
    assert.ok(category.label.trim(), `${category.type} braucht ein Label`);
    assert.ok(category.events.trim(), `${category.type} muss erklären, was dort landet`);
    assert.match(category.accent, /^#[0-9A-F]{6}$/i, `${category.type} braucht eine gültige Farbe`);
    assert.equal(Category(category.type), category);
}

// Der Guardian sucht diesen String fest verdrahtet - er darf sich nicht ändern.
assert.equal(LogType.ERROR, "errorLog", "Guardian.GetServiceIDs sucht genau nach 'errorLog'");

assert.equal(IsLogType("errorLog"), true);
assert.equal(IsLogType("gibtsnicht"), false);
assert.equal(IsLogType(42), false);
assert.throws(() => Category("kaputt" as LogType), /keine Log-Kategorie/);

// ── Text oder Thread ───────────────────────────────────────────────────────
// Der Kern der Anforderung: der Picker zeigt entweder Text-Kanäle oder Threads,
// niemals beides gemischt.

assert.equal(IsChannelKind("text"), true);
assert.equal(IsChannelKind("thread"), true);
assert.equal(IsChannelKind("forum"), false);
assert.equal(IsChannelKind(null), false);

assert.ok(CHANNEL_TYPES.text.includes(ChannelType.GuildText));
assert.ok(CHANNEL_TYPES.text.includes(ChannelType.GuildAnnouncement));
assert.ok(CHANNEL_TYPES.thread.includes(ChannelType.PublicThread));
assert.ok(CHANNEL_TYPES.thread.includes(ChannelType.PrivateThread));
assert.ok(CHANNEL_TYPES.thread.includes(ChannelType.AnnouncementThread));

const overlap = CHANNEL_TYPES.text.filter((type) => CHANNEL_TYPES.thread.includes(type));

assert.equal(overlap.length, 0, "Text und Thread dürfen sich nicht überschneiden");

// ── Formatierung ───────────────────────────────────────────────────────────

assert.equal(Cut("kurz", 10), "kurz");
assert.equal(Cut("viel zu langer Text", 10), "viel zu l…");
assert.equal(Cut("  Rand  ", 10), "Rand", "Leerzeichen fallen weg");

assert.equal(Line("👤", "Autor", "wer"), "👤 **Autor:** wer");
assert.equal(Mention("123", "user#1"), "<@123> (`user#1`)");
assert.equal(Mention("123"), "<@123> (`123`)", "ohne Tag steht die ID da");
assert.equal(Mention(null), "_unbekannt_");
assert.equal(Channel("456"), "<#456> (`456`)");
assert.equal(Channel(undefined), "_unbekannt_");
assert.match(Stamp(new Date(0)), /^<t:0:f> · <t:0:R>$/);

// Unveränderte Werte ergeben null - so bleiben sie aus dem Log raus.
assert.equal(Change("Name", "gleich", "gleich"), null);
assert.equal(Change("Name", "alt", "neu"), "✏️ **Name:** `alt` → `neu`");
assert.equal(Change("Aktiv", true, false), "✏️ **Aktiv:** ja → nein");
assert.equal(Change("Thema", null, "neu"), "✏️ **Thema:** _leer_ → `neu`");
assert.equal(Change("Thema", "", null), null, "leer und null sind beide leer");
assert.equal(Change("Zahl", 0, 5, "🔢"), "🔢 **Zahl:** `0` → `5`");

assert.equal(List([]), "_keine_");
assert.equal(List(["a", "b"]), "a, b");

const many = Array.from({ length: MAX_LIST_ITEMS + 7 }, (_, index) => `r${index}`);

assert.ok(List(many).includes(`und 7 weitere`), "lange Listen werden gedeckelt");
assert.ok(List(many).length < many.join(", ").length);

// ── Nachricht ──────────────────────────────────────────────────────────────

const message = BuildLogMessage({
    type: LogType.MESSAGE,
    title: "Nachricht gelöscht",
    description: "Irgendwer hat etwas gelöscht",
});

assert.equal(message.flags, MessageFlags.IsComponentsV2);
assert.equal(message.components?.length, 1);
assert.equal(message.content, undefined, "ComponentsV2 verträgt kein content");

// Ein Log darf niemanden anpingen - sonst weckt jede gelöschte @everyone-Nachricht den Server.
assert.deepEqual(message.allowedMentions, { parse: [] });

const json = JSON.stringify(message.components?.[0]);

assert.ok(json.includes("Nachricht gelöscht"));
assert.ok(json.includes("Irgendwer hat etwas gelöscht"));
assert.ok(json.includes(Category(LogType.MESSAGE).emoji), "das Kategorie-Emoji steht im Titel");

const withImages = BuildLogMessage({
    type: LogType.CONNECTION,
    title: "Beigetreten",
    description: "Text",
    thumbnailUrl: "https://cdn/avatar.png",
    imageUrl: "https://cdn/banner.png",
});

const imageJson = JSON.stringify(withImages.components?.[0]);

assert.ok(imageJson.includes("https://cdn/avatar.png"), "der Avatar wird zum Thumbnail");
assert.ok(imageJson.includes("https://cdn/banner.png"), "das Bild landet in der Galerie");

// Ein sehr langer Text darf den Container nicht sprengen.
assert.doesNotThrow(() =>
    BuildLogMessage({ type: LogType.AUDIT, title: "Lang", description: "x".repeat(9000) })
);

// ── Panel ──────────────────────────────────────────────────────────────────

const client = {} as unknown as BotClient;

function Target(logType: LogType, channelId: string): IDiscordLogChannel {
    return { guildId: GUILD, name: `log-${logType}`, logType, channelId };
}

const targets = [Target(LogType.MESSAGE, "111"), Target(LogType.CONNECTION, "222")];
const base = NewPanelState(GUILD, targets);

assert.equal(base.view, "home");
assert.equal(base.targets.size, 2);
assert.equal(base.targets.get(LogType.MESSAGE)?.channelId, "111");

let rendered = 0;

function Render(overrides: Partial<ILoggingState>): string {
    const view = RenderPanel(client, { ...base, ...overrides });

    assert.equal(view.components.length, 1);
    rendered++;

    return JSON.stringify(view.components[0]);
}

const home = Render({ view: "home" });

assert.ok(home.includes("<#111>"), "eingerichtete Kanäle stehen in der Übersicht");
assert.ok(home.includes("2 von 10"), "der Zähler stimmt");

for (const category of CATEGORIES) {
    assert.ok(home.includes(category.label), `${category.label} fehlt in der Übersicht`);
}

const kind = Render({ view: "kind", logType: LogType.VOICE });

assert.ok(kind.includes("Text-Kanal"), "die Kanal-Art-Auswahl bietet Text an");
assert.ok(kind.includes("Thread"), "und Thread");
assert.ok(kind.includes(Category(LogType.VOICE).events), "es steht da, was dort landen wird");

// Ohne eingerichteten Kanal gibt es nichts zu entfernen und nichts zu testen.
assert.ok(kind.includes('"disabled":true'), "Entfernen und Testlauf sind ohne Kanal gesperrt");

const kindWithChannel = Render({ view: "kind", logType: LogType.MESSAGE });

assert.ok(kindWithChannel.includes("<#111>"), "der aktuelle Kanal steht dabei");

const pickText = Render({ view: "pick", logType: LogType.VOICE, kind: "text" });
const pickThread = Render({ view: "pick", logType: LogType.VOICE, kind: "thread" });

assert.ok(pickText.includes(String(ChannelType.GuildText)), "der Text-Picker filtert auf Text-Kanäle");
assert.ok(!pickText.includes(String(ChannelType.PublicThread)), "und zeigt keine Threads");
assert.ok(pickThread.includes(String(ChannelType.PublicThread)), "der Thread-Picker filtert auf Threads");
assert.ok(pickThread.includes("gesperrt"), "der Hinweis auf gesperrte Threads steht dabei");

const health: ILogHealth[] = [
    { logType: LogType.MESSAGE, channelId: "111", name: "a", exists: true, isThread: false, archived: false, writable: true, problem: null },
    { logType: LogType.CONNECTION, channelId: "222", name: "b", exists: true, isThread: true, archived: true, writable: false, problem: "Dem Bot fehlt die Schreibberechtigung" },
];

const status = Render({ view: "status", health });

assert.ok(status.includes("Dem Bot fehlt die Schreibberechtigung"), "Probleme stehen im Status");
assert.ok(status.includes("archiviert"), "ein archivierter Thread wird benannt");
assert.ok(status.includes("1 Kategorie(n) können nicht schreiben"), "die Warnung zählt richtig");

assert.ok(Render({ view: "status", health: [] }).includes("nichts zu prüfen"));

// Eine Detail-Ansicht ohne gewählte Kategorie darf nicht ins Leere laufen.
const stray = { ...base, view: "pick" as const, logType: null };

assert.ok(RenderPanel(client, stray).components.length === 1);
assert.equal(stray.view, "home", "die Ansicht fällt auf die Übersicht zurück");
rendered++;

assert.ok(Render({ view: "home", notice: "🔔 Hinweis" }).includes("🔔 Hinweis"));

// Ganz ohne Einrichtung muss jede Ansicht trotzdem rendern.
const empty = NewPanelState(GUILD, []);

for (const view of ["home", "kind", "pick", "status"] as const) {
    assert.equal(RenderPanel(client, { ...empty, view, logType: LogType.TICKET }).components.length, 1, `${view} leer`);
    rendered++;
}

assert.equal(PanelStates.max, 50);

console.log(
    `OK - ${CATEGORIES.length} Kategorien, Text/Thread sauber getrennt, Formatierung, ` +
        `Nachrichten ohne Pings und ${rendered} Panel-Zustände verhalten sich korrekt`
);
