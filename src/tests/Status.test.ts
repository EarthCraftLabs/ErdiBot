import assert from "node:assert";
import { ActivityType, Collection } from "discord.js";
import BotClient from "../client/BotClient";
import StatusService from "../services/StatusService";
import IStatusEntry from "../interfaces/services/status/IStatusEntry";
import { NewPanelState, RenderPanel } from "../builder/StatusPanel";
import {
    Clamp,
    FIXED,
    KINDS,
    MAX_INTERVAL,
    MAX_STATUS_LENGTH,
    MIN_INTERVAL,
    NormalizeEntry,
    PLACEHOLDERS,
    Uptime,
} from "../constants/Status";

// ── Normalisierung ─────────────────────────────────────────────────────────
assert.equal(NormalizeEntry(null), null, "keine Zeile, kein Eintrag");
assert.equal(NormalizeEntry({ id: 1, text: "   " }), null, "ohne Text gibt es nichts anzuzeigen");
assert.equal(NormalizeEntry({ text: "ohne id" }), null, "ohne id lässt sich nichts bearbeiten");

const normalized = NormalizeEntry({ id: 7, text: "  Minecraft  ", kind: "erfunden", enabled: 1 });

assert.equal(normalized?.id, "7");
assert.equal(normalized?.text, "Minecraft", "Leerraum fliegt weg");
assert.equal(normalized?.kind, "playing", "eine unbekannte Art fällt auf den Standard zurück");
assert.equal(normalized?.enabled, true, "MySQL liefert 1 statt true");
assert.equal(normalized?.fixed, false, "aus der Datenbank ist nichts fest");

assert.equal(NormalizeEntry({ id: 8, text: "x".repeat(200) })?.text.length, MAX_STATUS_LENGTH, "Discords Grenze hält");

// ── Feste Einträge ─────────────────────────────────────────────────────────
assert.equal(FIXED.length, 2, "Help und Entwickler laufen immer mit");
assert.ok(FIXED.every((entry) => entry.fixed && entry.enabled));
assert.ok(FIXED.some((entry) => entry.text.includes("/help")));
assert.ok(FIXED.some((entry) => /MecryTv/i.test(entry.text)));
assert.equal(new Set(FIXED.map((entry) => entry.id)).size, 2, "beide brauchen eine eigene Kennung");

// ── Intervall ──────────────────────────────────────────────────────────────
assert.equal(Clamp(5, MIN_INTERVAL, MAX_INTERVAL), MIN_INTERVAL, "unter dem Limit von Discord wird angehoben");
assert.equal(Clamp(99_999, MIN_INTERVAL, MAX_INTERVAL), MAX_INTERVAL);
assert.equal(Clamp(Number.NaN, MIN_INTERVAL, MAX_INTERVAL), MIN_INTERVAL, "Buchstaben statt Zahl sperren nicht aus");
assert.equal(Clamp(45.6, MIN_INTERVAL, MAX_INTERVAL), 46);

assert.equal(Uptime(0), "0m");
assert.equal(Uptime(90 * 60_000), "1h 30m");
assert.equal(Uptime(50 * 3_600_000), "2d 2h");

// ── Aktivität ──────────────────────────────────────────────────────────────
// Der wichtigste Fall: ein Custom-Status braucht state, mit name allein zeigt Discord
// bei Bots nichts an.
function Service(overrides: Partial<BotClient> = {}): StatusService {
    return new StatusService({
        guilds: { cache: new Collection([["1", { memberCount: 120 }]]) },
        channels: { cache: new Collection([["a", {}], ["b", {}]]) },
        ws: { ping: 42 },
        uptime: 3 * 3_600_000,
        ...overrides,
    } as unknown as BotClient);
}

function Entry(kind: IStatusEntry["kind"], text = "Test"): IStatusEntry {
    return { id: "1", text, kind, enabled: true, fixed: false };
}

async function main(): Promise<void> {
    const service = Service();

    const custom = await service.Activity(Entry("custom", "Entwickelt von MecryTv"));

    assert.equal(custom.type, ActivityType.Custom);
    assert.equal(custom.state, "Entwickelt von MecryTv", "der Text steht im state");
    assert.notEqual(custom.name, "Entwickelt von MecryTv", "nicht im name — dort zeigt Discord ihn nicht an");

    const listening = await service.Activity(Entry("listening", "EarthCraft | /help"));

    assert.equal(listening.type, ActivityType.Listening);
    assert.equal(listening.name, "EarthCraft | /help");
    assert.equal(listening.state, undefined);

    for (const info of KINDS) {
        const activity = await service.Activity(Entry(info.id));

        assert.equal(activity.type, info.type, `${info.id} bekommt seinen Discord-Typ`);
    }

    // ── Platzhalter ────────────────────────────────────────────────────────
    assert.equal(await service.Resolve("{servers} Server"), "1 Server");
    assert.equal(await service.Resolve("{members} Mitglieder"), "120 Mitglieder");
    assert.equal(await service.Resolve("{channels} Kanäle"), "2 Kanäle");
    assert.equal(await service.Resolve("{ping}"), "42ms");
    assert.equal(await service.Resolve("{uptime}"), "3h 0m");
    assert.equal(await service.Resolve("ohne Bausteine"), "ohne Bausteine");
    assert.equal(await service.Resolve("{servers}/{servers}"), "1/1", "jedes Vorkommen wird ersetzt");

    // Ein unbekannter Baustein bleibt stehen, statt den Text zu zerlegen.
    assert.equal(await service.Resolve("{gibtesnicht}"), "{gibtesnicht}");

    // {tickets} fragt die Datenbank - ohne sie darf der Status trotzdem stehen.
    const offline = Service({
        database: { GetRepository: () => ({ Count: async () => Promise.reject(new Error("weg")) }) },
    } as unknown as Partial<BotClient>);

    assert.equal(await offline.Resolve("{tickets} offen"), "0 offen");

    assert.equal(
        (await service.Resolve(`{servers} ${"x".repeat(200)}`)).length,
        MAX_STATUS_LENGTH,
        "auch mit eingesetzten Zahlen bleibt der Text in Discords Grenze"
    );

    // ── Panel ──────────────────────────────────────────────────────────────
    const client = { statusService: { Current: FIXED[0] } } as unknown as BotClient;
    const entries: IStatusEntry[] = [...FIXED, Entry("watching", "die Serverstatistik")];

    let rendered = 0;

    function Render(state: Parameters<typeof RenderPanel>[1]): string {
        const view = RenderPanel(client, state);

        assert.equal(view.components.length, 1);
        rendered++;

        return JSON.stringify(view.components[0]);
    }

    const state = NewPanelState(entries, 30, true);

    assert.ok(Render(state).includes("Rotation läuft"));
    assert.ok(Render(state).includes("Hört EarthCraft | /help"), "die Vorschau zeigt den Vorsatz mit");
    assert.ok(Render({ ...state, enabled: false }).includes("Rotation steht"));

    const fixedView = Render({ ...state, view: "entry", entryId: FIXED[0].id });

    assert.ok(fixedView.includes("weder ändern noch abschalten"), "feste Einträge lassen sich nicht anfassen");
    assert.ok(!fixedView.includes("status:panel:delete"), "und schon gar nicht löschen");

    const ownView = Render({ ...state, view: "entry", entryId: "1" });

    assert.ok(ownView.includes("status:panel:delete"), "eigene schon");
    assert.ok(ownView.includes("status:panel:kind"), "und ihre Art ist wählbar");

    assert.ok(Render({ ...state, view: "placeholders" }).includes("{members}"));

    // Ein leerer Zustand darf keine Ansicht sprengen.
    for (const view of ["home", "entry", "placeholders"] as const) {
        assert.equal(RenderPanel(client, { ...state, view, entryId: null }).components.length, 1, `${view} leer`);
        rendered++;
    }

    console.log(
        `OK - ${FIXED.length} feste Einträge, ${KINDS.length} Arten, ${PLACEHOLDERS.length} Platzhalter, ` +
            `Custom-Status im state und ${rendered} Panel-Zustände verhalten sich korrekt`
    );
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
