import assert from "node:assert";
import { MessageFlags } from "discord.js";
import BotClient from "../client/BotClient";
import ConfigService from "../services/ConfigService";
import TicketMode from "../enums/TicketMode";
import TicketPriority from "../enums/TicketPriority";
import TicketStatus from "../enums/TicketStatus";
import BuildTicketMessage, { BuildTicketPanel } from "../builder/TicketMessage";
import { BuildTranscriptDM, BuildTranscriptLog, CardLayout, Duration } from "../builder/TranscriptMessage";
import { ActiveCategory, NewSetupState, RenderSetup, SetupStates } from "../builder/TicketSetupPanel";
import { ISetupState } from "../interfaces/services/ticket/ITicketPanel";
import { ITicket } from "../interfaces/services/ticket/ITicket";
import { ITicketConfig } from "../interfaces/services/ticket/ITicketConfig";
import { ITranscriptResult } from "../services/TicketService";
import {
    ALL_ROLES,
    Clamp,
    DefaultCategory,
    DefaultConfig,
    GenerateTranscriptId,
    IsPriority,
    IsReady,
    IsTranscriptId,
    MAX_CATEGORIES,
    MissingPieces,
    NormalizeConfig,
    NormalizeTicket,
    MayUseAction,
    Number4,
    PRIORITIES,
    Priority,
    ResponsibleRoles,
} from "../constants/Ticket";

const GUILD = "1162553851187040326";

// ── Prioritäten ────────────────────────────────────────────────────────────

assert.equal(PRIORITIES.length, 4);
assert.equal(Priority(TicketPriority.CRITICAL).label, "Kritisch");
assert.equal(Priority("kaputt").id, TicketPriority.LOW, "Unbekanntes fällt auf die niedrigste Stufe");
assert.equal(Priority(undefined).id, TicketPriority.LOW);
assert.equal(IsPriority("high"), true);
assert.equal(IsPriority("mittel"), false);

// Nur hoch und kritisch wecken das Team per Direktnachricht.
assert.deepEqual(
    PRIORITIES.filter((entry) => entry.alerts).map((entry) => entry.id),
    [TicketPriority.HIGH, TicketPriority.CRITICAL]
);

for (const entry of PRIORITIES) {
    assert.match(entry.accent, /^#[0-9A-F]{6}$/i, `${entry.id} braucht eine gültige Farbe`);
}

assert.equal(Number4(7), "0007");
assert.equal(Number4(12345), "12345", "fünfstellige Nummern werden nicht abgeschnitten");
assert.equal(Clamp(99999, 0, 25), 25);
assert.equal(Clamp(Number.NaN, 3, 25), 3);

// ── Transcript-IDs ─────────────────────────────────────────────────────────

const id = GenerateTranscriptId();

assert.equal(id.length, 19);
assert.equal(IsTranscriptId(id), true);
assert.equal(IsTranscriptId("ABCD-EFGH-IJKL"), false, "drei Blöcke reichen nicht");
assert.equal(IsTranscriptId("../../etc/passwd"), false, "ein Pfad ist keine ID");
assert.equal(IsTranscriptId("ABCD-EFGH-IJKL-MNO!"), false);
assert.equal(IsTranscriptId(null), false);

const generated = new Set(Array.from({ length: 500 }, () => GenerateTranscriptId()));

assert.equal(generated.size, 500, "500 IDs müssen verschieden sein");

// ── Normalisierung ─────────────────────────────────────────────────────────

const repaired = NormalizeConfig(
    {
        mode: "gibtsnicht",
        maxOpenTickets: 9999,
        accent: "kaputt",
        supportRoleIds: '["1","2"]',
        categories: '[{"name":"Support"},{"name":""},{"nix":1},null]',
        panelTitle: "   ",
        enabled: 1,
        ticketCounter: -5,
    },
    GUILD
);

assert.equal(repaired.mode, TicketMode.FORUM, "ein unbekannter Modus fällt auf Forum zurück");
assert.equal(repaired.maxOpenTickets, 25, "das Limit wird gedeckelt");
assert.equal(repaired.accent, "#5865F2", "eine kaputte Farbe fällt auf den Standard zurück");
assert.deepEqual(repaired.supportRoleIds, ["1", "2"], "JSON-Spalten kommen als String zurück");
assert.equal(repaired.categories.length, 1, "Einträge ohne Namen fliegen raus");
assert.equal(repaired.categories[0].name, "Support");
assert.equal(repaired.categories[0].roleId, ALL_ROLES, "ohne Rolle sind alle zuständig");
assert.equal(repaired.categories[0].priority, TicketPriority.LOW);
assert.equal(repaired.panelTitle, DefaultConfig(GUILD).panelTitle, "Leerzeichen sind kein Titel");
assert.equal(repaired.enabled, true, "MySQL liefert 1 statt true");
assert.equal(repaired.ticketCounter, 0, "negativ zählen geht nicht");

assert.equal(NormalizeConfig(null, GUILD).guildId, GUILD, "gar nichts ergibt trotzdem eine Konfiguration");
assert.equal(
    NormalizeConfig({ categories: JSON.stringify(Array.from({ length: 50 }, (_, i) => ({ name: `K${i}` }))) }, GUILD)
        .categories.length,
    MAX_CATEGORIES,
    "die Anzahl Kategorien wird gedeckelt"
);

const ticket = NormalizeTicket(
    {
        channelId: "999",
        guildId: GUILD,
        ticketNumber: 42,
        creatorId: "111",
        status: "gibtsnicht",
        priority: "extrem",
        slowmode: 999999,
        anonymous: 1,
        frozen: 0,
        staffNotes: '[{"note":"ok","staffName":"A"},{"note":""},null]',
        addedUsers: '["1","2"]',
        meeting: '{"scheduledAt":"2026-09-01T10:00:00.000Z","description":"Call"}',
        createdAt: "2026-08-01T10:00:00.000Z",
    },
    GUILD
);

assert.equal(ticket.status, TicketStatus.OPEN, "ein unbekannter Status gilt als offen");
assert.equal(ticket.priority, TicketPriority.LOW);
assert.equal(ticket.slowmode, 21600, "Slowmode wird auf das Discord-Maximum geklemmt");
assert.equal(ticket.anonymous, true);
assert.equal(ticket.frozen, false);
assert.equal(ticket.staffNotes.length, 1, "leere Notizen fliegen raus");
assert.equal(ticket.staffNotes[0].id.length > 0, true, "alte Notizen ohne ID bekommen eine");
assert.deepEqual(ticket.addedUsers, ["1", "2"]);
assert.equal(ticket.meeting?.description, "Call");
assert.equal(ticket.meeting?.confirmed, false, "ohne Bestätigung wird nicht erinnert");
assert.equal(NormalizeTicket({ meeting: '{"description":"ohne Datum"}' }, GUILD).meeting, null);
assert.equal(ticket.createdAt.getUTCMonth(), 7);

// ── Vollständigkeit ────────────────────────────────────────────────────────

const empty = DefaultConfig(GUILD);

assert.equal(IsReady(empty), false);
assert.deepEqual(MissingPieces(empty), [
    "Forum-Kanal",
    "Panel-Kanal",
    "mindestens eine Ticket-Kategorie",
    "mindestens eine Support-Rolle",
]);

// Im Kategorie-Modus wird die Kategorie verlangt, nicht das Forum.
assert.ok(MissingPieces({ ...empty, mode: TicketMode.CATEGORY }).includes("Ticket-Kategorie"));

function Ready(overrides: Partial<ITicketConfig> = {}): ITicketConfig {
    return {
        ...DefaultConfig(GUILD),
        forumChannelId: "100",
        panelChannelId: "200",
        supportRoleIds: ["900"],
        categories: [
            { ...DefaultCategory("Allgemein"), priority: TicketPriority.LOW },
            { ...DefaultCategory("Notfall"), priority: TicketPriority.CRITICAL, roleId: "901" },
        ],
        enabled: true,
        ...overrides,
    };
}

assert.equal(IsReady(Ready()), true);
assert.deepEqual(MissingPieces(Ready()), []);

// ── Zuständigkeit ──────────────────────────────────────────────────────────

const config = Ready();

assert.deepEqual(ResponsibleRoles(config, "Allgemein"), ["900"], '"all" bedeutet alle Support-Rollen');
assert.deepEqual(ResponsibleRoles(config, "Notfall"), ["901"], "eine eigene Rolle gewinnt");
assert.deepEqual(ResponsibleRoles(config, "gibtsnicht"), ["900"], "unbekannte Kategorie fällt zurück");

// ── Laufzeit ───────────────────────────────────────────────────────────────

const base = new Date("2026-08-01T10:00:00.000Z");

assert.equal(Duration(base, new Date("2026-08-01T10:00:30.000Z")), "1 Min.", "Sekunden werden gerundet");
assert.equal(Duration(base, new Date("2026-08-01T10:45:00.000Z")), "45 Min.");
assert.equal(Duration(base, new Date("2026-08-01T13:00:00.000Z")), "3 Std.");
assert.equal(Duration(base, new Date("2026-08-01T13:20:00.000Z")), "3 Std. 20 Min.");
assert.equal(Duration(base, new Date("2026-08-03T14:00:00.000Z")), "2 Tag(e) 4 Std.");
assert.equal(Duration(base, new Date("2026-07-01T10:00:00.000Z")), "0 Min.", "rückwärts gibt es nicht");

// ── Nachrichten ────────────────────────────────────────────────────────────

function Ticket(overrides: Partial<ITicket> = {}): ITicket {
    return {
        channelId: "555",
        guildId: GUILD,
        ticketNumber: 42,
        creatorId: "111",
        categoryName: "Allgemein",
        mode: TicketMode.FORUM,
        priority: TicketPriority.HIGH,
        status: TicketStatus.OPEN,
        claimedById: null,
        claimedAt: null,
        mainMessageId: "777",
        anonymous: false,
        frozen: false,
        slowmode: 0,
        staffNotes: [],
        addedUsers: [],
        meeting: null,
        createdAt: base,
        closedAt: null,
        ...overrides,
    };
}

const actions = [
    { name: "Beanspruchen", value: "claim", description: "Übernehmen", emoji: "✅" },
    { name: "Schließen", value: "close", description: "Beenden", emoji: "❌" },
];

const main = BuildTicketMessage(Ticket(), config, config.categories[0], ["900"], actions);
const mainJson = JSON.stringify(main.components?.[0]);

assert.equal(main.flags, MessageFlags.IsComponentsV2);
assert.equal(main.content, undefined, "ComponentsV2 verträgt kein content");
assert.deepEqual(main.allowedMentions, { parse: [] }, "die Hauptnachricht pingt nicht selbst");
assert.ok(mainJson.includes("Ticket #0042"));
assert.ok(mainJson.includes("noch niemand"), "unbeansprucht wird als solches angezeigt");
assert.ok(mainJson.includes("ticket:menu"), "das Team-Menü hängt dran");

const claimed = BuildTicketMessage(
    Ticket({ claimedById: "222", frozen: true, anonymous: true, slowmode: 30, staffNotes: [{ id: "n1", staffId: "1", staffName: "A", note: "x", createdAt: base.toISOString() }] }),
    config,
    config.categories[0],
    ["900"],
    actions
);
const claimedJson = JSON.stringify(claimed.components?.[0]);

assert.ok(claimedJson.includes("<@222>"), "der Bearbeiter steht drin");
assert.ok(claimedJson.includes("eingefroren"));
assert.ok(claimedJson.includes("anonymer Team-Modus"));
assert.ok(claimedJson.includes("Slowmode 30s"));
assert.ok(claimedJson.includes("1 Team-Notiz"));

const panel = BuildTicketPanel(config);
const panelJson = JSON.stringify(panel.components?.[0]);

assert.ok(panelJson.includes("ticket:open"), "das Panel bietet die Kategorien an");
assert.ok(panelJson.includes("Allgemein") && panelJson.includes("Notfall"));
assert.ok(panelJson.includes("höchstens"), "das Limit steht im Panel");

// Bild und Thumbnail: das eine als Galerie unten, das andere als Section daneben.
const withImages = JSON.stringify(
    BuildTicketPanel({ ...config, panelImage: "https://cdn.test/bild.png", panelThumbnail: "https://cdn.test/thumb.png" })
);

assert.ok(withImages.includes("bild.png") && withImages.includes("thumb.png"));
assert.ok(withImages.includes('"type":9'), "mit Thumbnail wird der Text zur Section");
assert.ok(!JSON.stringify(BuildTicketPanel(config)).includes('"type":9'), "ohne Thumbnail bleibt es reiner Text");

// Ein Panel ohne Kategorien darf kein leeres Menü bauen - der Builder würde werfen.
assert.doesNotThrow(() => BuildTicketPanel({ ...config, categories: [] }));
assert.ok(!JSON.stringify(BuildTicketPanel({ ...config, categories: [] })).includes("ticket:open"));

// ── Transcript-Nachrichten ─────────────────────────────────────────────────

const transcript: ITranscriptResult = {
    transcriptId: "AAAA-BBBB-CCCC-DDDD",
    url: "https://example.com/transcripts/AAAA-BBBB-CCCC-DDDD",
    messageCount: 37,
    participants: ["111", "222"],
};

const closed = Ticket({
    claimedById: "222",
    claimedAt: new Date("2026-08-01T10:12:00.000Z"),
    closedAt: new Date("2026-08-01T12:00:00.000Z"),
    status: TicketStatus.CLOSED,
    staffNotes: [{ id: "n1", staffId: "222", staffName: "Mecry", note: "Intern: Rückerstattung geprüft", createdAt: base.toISOString() }],
});

const payload = {
    guild: { name: "EarthCraft", id: GUILD } as never,
    ticket: closed,
    closedBy: { id: "222", displayName: "Mecry" } as never,
    creator: { id: "111", displayName: "MecryTv | Joe" } as never,
    handler: { id: "222", displayName: "Mecry" } as never,
    transcript,
    channelName: "ticket-0042",
    reason: "Anliegen erledigt",
};

// Die Zahlen stehen jetzt im gezeichneten Bild - geprüft wird deshalb, was hineingeht.
const layout = JSON.stringify(CardLayout(payload, false));

assert.ok(layout.includes('"value":"37"'), "die Anzahl Nachrichten steht drin");
assert.ok(layout.includes("2 Person"), "die Beteiligten werden gezählt");
assert.ok(layout.includes("2 Std."), "die Laufzeit steht drin");
assert.ok(layout.includes("nach 12 Min. übernommen"), "die Reaktionszeit steht drin");
assert.ok(layout.includes("@MecryTv | Joe"), "der Ersteller steht mit Namen da, nicht als Erwähnung");
assert.ok(!layout.includes("<@111>"), "eine Erwähnung würde ein Bild nicht auflösen");
assert.ok(layout.includes('"id":"111"'), "die ID steht neben dem Namen — Namen ändern sich, IDs nicht");
assert.ok(layout.includes('"id":"222"'));

// Der Ersteller darf sein eigenes Ticket schliessen - und nur das.
assert.equal(MayUseAction("close", false, true), true, "der Ersteller schliesst sein Ticket selbst");
assert.equal(MayUseAction("freeze", false, true), false, "einfrieren bleibt dem Team vorbehalten");
assert.equal(MayUseAction("blacklist", false, true), false, "sperren erst recht");
assert.equal(MayUseAction("close", false, false), false, "ein Unbeteiligter schliesst gar nichts");
assert.equal(MayUseAction("close", true, false), true, "das Team darf immer");
assert.equal(MayUseAction("freeze", true, false), true, "das Team darf jede Aktion");
assert.equal(MayUseAction(undefined, false, true), false, "ohne Aktion gibt es kein Schlupfloch");

assert.equal(CardLayout(payload, false).reason, "Anliegen erledigt", "der Schliessgrund gehört auf die Karte");

const idle = JSON.stringify(CardLayout({ ...payload, ticket: Ticket({ claimedById: null, closedAt: new Date() }) }, false));

assert.ok(idle.includes("nie beansprucht"));
assert.ok(idle.includes('"value":"niemand"'), "ohne Bearbeiter steht dort niemand");

// ── Setup-Panel ────────────────────────────────────────────────────────────

async function main2(): Promise<void> {
    const configService = new ConfigService({ developerMode: false } as never);
    await configService.Initialize();

    assert.ok(configService.Has("ticket"), "src/config/ticket.json muss geladen werden");
    assert.equal(configService.Options("ticket", "actions").length, 15, "es sind 15 Team-Aktionen");

    const values = configService.Options("ticket", "actions").map((option) => option.value);

    assert.equal(new Set(values).size, values.length, "jede Aktion kommt nur einmal vor");
    for (const required of ["claim", "close", "priority", "blacklist", "notes"]) {
        assert.ok(values.includes(required), `die Aktion "${required}" fehlt`);
    }

    const guild = {
        roles: { cache: new Map([["900", { name: "Support" }]]) },
        emojis: {
            cache: new Map(
                Array.from({ length: 30 }, (_, index) => [
                    `emoji${index}`,
                    { id: `emoji${index}`, name: `erdi${index}`, animated: false },
                ])
            ),
        },
    };

    const client = {
        configService,
        guilds: { cache: new Map([[GUILD, guild]]) },
        galleryService: { SearchImages: async () => [] },
    } as unknown as BotClient;

    const state = NewSetupState(GUILD, Ready(), "300");

    let rendered = 0;

    async function Render(overrides: Partial<ISetupState>): Promise<string> {
        const view = await RenderSetup(client, { ...state, ...overrides });

        assert.equal(view.components.length, 1);
        rendered++;

        return JSON.stringify(view.components[0]);
    }

    assert.ok((await Render({ view: "home" })).includes("Aktiv"));
    assert.ok((await Render({ view: "channels" })).includes("Forum-Beiträge"));
    assert.ok((await Render({ view: "roles" })).includes("<@&900>"), "die Rolle steht als Erwähnung da");
    assert.ok((await Render({ view: "roles" })).includes("Support"), "und im Entfernen-Menü mit ihrem Namen");
    assert.ok((await Render({ view: "categories" })).includes("Notfall"));
    assert.ok((await Render({ view: "category", categoryIndex: 1 })).includes("Kritisch"));
    assert.ok(
        (await Render({ view: "category", categoryIndex: 1 })).includes("Direktnachricht"),
        "der Alarm-Hinweis steht dabei"
    );
    assert.ok((await Render({ view: "panel" })).includes("Titel"));
    assert.ok((await Render({ view: "limits" })).includes("Support-Zeiten"));
    assert.ok((await Render({ view: "blacklist" })).includes("Sperre"));

    // Kategorie-Ansicht: Emojis vom Server, Zuständigkeit nur aus dem Support-Team.
    const category = await Render({ view: "category", categoryIndex: 0 });

    assert.ok(category.includes('"ticket:setup:emoji"'), "die Server-Emojis stehen zur Auswahl");
    assert.ok(category.includes("(1/2)"), "30 Emojis passen nicht auf eine Seite");
    assert.ok(category.includes("Alle Support-Rollen"));
    assert.ok(category.includes("Support"), "die Support-Rolle steht mit Namen im Menü");
    assert.ok(!category.includes('"ROLE_SELECT"') && !category.includes('"type":6'), "keine freie Rollenwahl mehr");

    assert.ok((await Render({ view: "category", categoryIndex: 0, emojiPage: 1 })).includes("(2/2)"));
    assert.ok((await Render({ view: "category", categoryIndex: 0, emojiPage: 9 })).includes("(2/2)"), "Seite wird begrenzt");

    // Eine Kategorie-Rolle, die nicht mehr im Support-Team steht, wird angemerkt.
    assert.ok((await Render({ view: "category", categoryIndex: 1 })).includes("nicht mehr im Support-Team"));

    // Die Kanal-Vorstufe: erst Text oder Thread, dann die gefilterte Liste.
    const before = await Render({ view: "channels", picking: "panel", kind: null });

    // Genau die customId, nicht als Teilstring: "ticket:setup:channels" ist der Zurück-Knopf.
    const PICKER = '"ticket:setup:channel"';

    assert.ok(before.includes("Kanal-Art"), "ohne Wahl kommt erst die Kanal-Art");
    assert.ok(!before.includes(PICKER), "der Kanal-Picker kommt erst nach der Wahl");

    const text = await Render({ view: "channels", picking: "panel", kind: "text" });
    const thread = await Render({ view: "channels", picking: "panel", kind: "thread" });

    assert.ok(text.includes(PICKER), "danach kommt der Kanal-Picker");
    assert.ok(!text.includes('"channel_types":[11') && !text.includes("11,12"), "der Text-Picker zeigt keine Threads");
    assert.ok(thread.includes("11"), "der Thread-Picker filtert auf Threads");

    // Forum und Warteraum haben keine Text/Thread-Wahl.
    const container = await Render({ view: "channels", picking: "container", kind: null });

    assert.ok(!container.includes("Kanal-Art"), "beim Forum gibt es nichts zu wählen");
    assert.ok(container.includes(PICKER));

    // Eine unvollständige Einrichtung darf keine Ansicht sprengen.
    const fresh = NewSetupState(GUILD, DefaultConfig(GUILD));

    for (const view of [
        "home",
        "channels",
        "roles",
        "categories",
        "category",
        "panel",
        "gallery",
        "limits",
        "blacklist",
    ] as const) {
        assert.equal((await RenderSetup(client, { ...fresh, view })).components.length, 1, `${view} leer`);
        rendered++;
    }

    assert.ok((await RenderSetup(client, fresh)).components.length === 1);
    assert.equal(ActiveCategory(fresh), null, "ohne Kategorie gibt es keine aktive");

    const withDraft = { ...state, view: "category" as const, draft: DefaultCategory("Entwurf"), dirty: true };

    assert.equal(ActiveCategory(withDraft)?.name, "Entwurf", "der Entwurf hat Vorrang");
    assert.ok((await Render(withDraft)).includes("Ungespeicherte"));

    assert.equal(SetupStates.max, 50);

    // ── Abschlussnachricht ─────────────────────────────────────────────────
    // Die Karte wird wirklich gezeichnet: ein kaputtes Layout fällt hier auf, nicht erst
    // im Ticket-Kanal.
    const log = await BuildTranscriptLog(payload);
    const dm = await BuildTranscriptDM(payload);

    for (const [label, message] of [["Log", log], ["DM", dm]] as const) {
        const png = (message.files as { attachment: Buffer }[])[0].attachment;

        assert.ok(png.length > 10_000, `${label}: die Karte ist gerendert`);
        assert.equal(png.subarray(1, 4).toString(), "PNG", `${label}: und wirklich ein PNG`);
        assert.ok(JSON.stringify(message.components).includes(transcript.url), `${label}: der Link ist klickbar`);
    }

    // Discord würde die HTML-Datei als Code-Vorschau ausrollen - nirgends hängt sie an,
    // der Knopf führt zum Transcript auf dem Webserver.
    assert.equal(log.files?.length, 1, "im Kanal hängt nur die Karte");
    assert.equal(dm.files?.length, 1, "und in der Direktnachricht auch");

    // Der wichtigste Unterschied: interne Notizen dürfen den Ersteller nie erreichen.
    assert.ok(log.content?.includes("Rückerstattung"), "Team-Notizen stehen im Ticket-Log");
    assert.ok(!dm.content?.includes("Rückerstattung"), "interne Notizen gehen NICHT an den Ersteller");

    console.log(
        `OK - Normalisierung repariert kaputte Zeilen, ${PRIORITIES.length} Prioritäten, 15 Team-Aktionen, ` +
            `Text/Thread getrennt, interne Notizen bleiben intern, die Abschlusskarte wird gezeichnet ` +
            `und ${rendered} Panel-Zustände verhalten sich korrekt`
    );
}

main2().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
