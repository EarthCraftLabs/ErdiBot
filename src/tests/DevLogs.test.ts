import assert from "node:assert";
import path from "path";
import BotClient from "../client/BotClient";
import { NewPanelState, RenderPanel } from "../builder/DevLogsPanel";
import { IDevLogsState } from "../interfaces/services/devlogs/IDevLogsPanel";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import DevLogsService from "../services/DevLogsService";
import { ILogFile } from "../interfaces/services/devlogs/IDevLogsService";
import { ISessionEntry } from "../interfaces/logger/ISessionManifest";
import { Clamp, Colorize, FormatDuration, MAX_SEARCH_RESULTS, PAGE_SIZE, PagesFor, ResolveLogPath } from "../constants/DevLogs";

const folder = mkdtempSync(path.join(tmpdir(), "erdibot-devlogs-"));

assert.equal(ResolveLogPath(folder, "session-1.log"), path.join(folder, "session-1.log"));
assert.equal(ResolveLogPath(folder, "../session-1.log"), null, "kein Ausbruch nach oben");
assert.equal(ResolveLogPath(folder, "../../config.json"), null, "kein Ausbruch in den Projektordner");
assert.equal(ResolveLogPath(folder, "C:/Windows/win.ini"), null, "kein absoluter Pfad");
assert.equal(ResolveLogPath(folder, "sub/../../escape.log"), null, "kein Ausbruch über einen Umweg");
assert.equal(ResolveLogPath(folder, ""), null, "leerer Name ist kein Pfad");

assert.equal(FormatDuration(0), "0s");
assert.equal(FormatDuration(45_000), "45s");
assert.equal(FormatDuration(3 * 60_000 + 7_000), "3m 7s");
assert.equal(FormatDuration(2 * 3_600_000 + 5 * 60_000 + 1_000), "2h 5m 1s");
assert.equal(FormatDuration(-1), "?");
assert.equal(FormatDuration(Number.NaN), "?");

assert.ok(Colorize("[12:00] ERROR    kaputt").includes("\x1b[0;31m"), "ERROR wird rot");
assert.ok(Colorize("[12:00] WARN     achtung").includes("\x1b[0;33m"), "WARN wird gelb");
assert.equal(Colorize("[12:00] INFO     alles gut"), "[12:00] INFO     alles gut", "INFO bleibt unbunt");

assert.equal(Clamp(-5, 10), 0);
assert.equal(Clamp(99, 10), 10);
assert.equal(Clamp(3, 10), 3);
assert.equal(Clamp(5, -1), 0, "ein negatives Maximum darf nicht negativ zurückkommen");

assert.equal(PagesFor(0), 1, "eine leere Datei hat trotzdem eine Seite");
assert.equal(PagesFor(PAGE_SIZE), 1);
assert.equal(PagesFor(PAGE_SIZE + 1), 2);

const LINES = 200;

const content = Array.from({ length: LINES }, (_, index) => `[23.8.2026 14:00:00] INFO     Zeile ${index}`);

content[5] = "[23.8.2026 14:00:00] ERROR    frueh kaputt";
content[10] = "[23.8.2026 14:00:00] WARN     achtung";
content[LINES - 2] = "[23.8.2026 14:00:00] ERROR    spaet kaputt";

const logFile = path.join(folder, "session-1.log");
const text = content.join("\n");

writeFileSync(logFile, text, "utf8");

const entry: ISessionEntry = {
    sessionNumber: 1,
    files: ["session-1.log"],
    startedAt: new Date("2026-08-23T12:00:00.000Z").toISOString(),
    endedAt: new Date("2026-08-23T12:01:30.000Z").toISOString(),
    exitReason: "exit",
    crashed: false,
    commandCount: 7,
    eventCount: 3,
};

const file: ILogFile = {
    entry,
    file: "session-1.log",
    path: logFile,
    part: 0,
    parts: 1,
    size: Buffer.byteLength(text, "utf8"),
};

const service = new DevLogsService({} as never);

function Session(sessionNumber: number, overrides: Partial<ISessionEntry> = {}): ISessionEntry {
    return { ...entry, sessionNumber, ...overrides };
}

const sessions = [
    Session(60, { endedAt: null, crashed: true }),
    Session(59, { endedAt: null }),
    ...Array.from({ length: 58 }, (_, index) => Session(58 - index)),
];

const client = {
    devLogsService: {
        Sessions: () => sessions,
        ListPageOf: () => 0,
        Resolve: async () => file,
        Stats: (target: ILogFile) => service.Stats(target),
        Page: (target: ILogFile, page: number) => service.Page(target, page),
        Search: (target: ILogFile, term: string) => service.Search(target, term),
        Attachment: (target: ILogFile) => service.Attachment(target),
    },
} as unknown as BotClient;

async function Render(overrides: Partial<IDevLogsState> = {}): Promise<void> {
    const view = await RenderPanel(client, { ...NewPanelState(), ...overrides });

    assert.equal(view.components.length, 1, "das Panel liefert genau einen Container");

    const json = view.components[0].toJSON() as { components: unknown[] };

    assert.ok(json.components.length > 0, "der Container darf nicht leer sein");
}

async function main(): Promise<void> {
    const stats = await service.Stats(file);

    assert.equal(stats.lines, LINES, "jede Zeile muss gezählt werden");
    assert.equal(stats.errors, 2, "zwei ERROR-Zeilen");
    assert.equal(stats.warnings, 1, "eine WARN-Zeile");
    assert.equal(stats.errorPages.length, 2, "die zwei Fehler liegen auf zwei verschiedenen Seiten");
    assert.equal(stats.errorPages[0], 0, "der erste Fehler steht auf Seite 1");

    const pages = PagesFor(file.size);

    assert.ok(pages > 1, "die Testdatei muss mehrere Seiten haben, sonst prüft das hier nichts");
    assert.deepEqual(stats.errorPages, [...stats.errorPages].sort((a, b) => a - b), "Fehlerseiten aufsteigend");
    assert.ok(
        stats.errorPages.every((page) => page < pages),
        "keine Fehlerseite darf hinter dem Dateiende liegen"
    );

    assert.deepEqual(await service.Stats(file), stats, "der zweite Aufruf kommt aus dem Cache");

    const first = await service.Page(file, 0);

    assert.equal(first.page, 0);
    assert.equal(first.pages, pages);
    assert.ok(Buffer.byteLength(first.text, "utf8") <= PAGE_SIZE, "eine Seite bleibt im Byte-Budget");
    assert.ok(first.text.startsWith("[23.8.2026 14:00:00] INFO     Zeile 0"), "Seite 1 beginnt am Dateianfang");

    assert.equal((await service.Page(file, 999)).page, pages - 1, "zu große Seiten werden geklemmt");
    assert.equal((await service.Page(file, -5)).page, 0, "negative Seiten werden geklemmt");

    const errors = await service.Search(file, "ERROR");

    assert.equal(errors.total, 2);
    assert.deepEqual(
        errors.matches.map((match) => match.line),
        [6, LINES - 1],
        "Zeilennummern zählen ab 1"
    );

    const many = await service.Search(file, "zeile");

    assert.equal(many.total, LINES - 3, "Suche ignoriert Groß- und Kleinschreibung");
    assert.equal(many.matches.length, MAX_SEARCH_RESULTS, `es kommen höchstens ${MAX_SEARCH_RESULTS} Treffer zurück`);

    assert.deepEqual(await service.Search(file, "gibtesnichtimlog"), { matches: [], total: 0 });

    assert.equal(service.Attachment(file).name, "session-1.log");

    await Render();
    await Render({ listPage: 2 });
    await Render({ listPage: 99 });
    await Render({ view: "overview", session: 1 });
    await Render({ view: "overview", session: 1, notice: "⚠️ Eine Meldung" });
    await Render({ view: "page", session: 1, page: 0 });
    await Render({ view: "page", session: 1, page: stats.errorPages[1] });
    await Render({ view: "page", session: 1, page: 999 });
    await Render({ view: "search", session: 1, term: "ERROR" });
    await Render({ view: "search", session: 1, term: "gibtesnichtimlog" });
    await Render({ view: "search", session: 1, term: "zeile" });

    console.log(
        `OK - ${LINES} Zeilen gescannt, ${stats.errors} Fehler auf ${stats.errorPages.length} Seiten, ` +
            `${pages} Seiten paginiert, 11 Panel-Zustände gerendert, 6 Pfad-Ausbrüche abgewehrt`
    );
}

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(() => rmSync(folder, { recursive: true, force: true }));
