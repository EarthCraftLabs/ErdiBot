import assert from "node:assert";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "path";
import ConfigService, { CONFIG_ROOT } from "../services/ConfigService";
import { CONFIG_SCHEMAS, OPTIONS } from "../constants/ConfigSchemas";
import IConfigEntry from "../interfaces/services/config/IConfigEntry";

const folder = mkdtempSync(path.join(tmpdir(), "erdibot-config-"));
const reports: string[] = [];

CONFIG_SCHEMAS.probe = { options: OPTIONS };
CONFIG_SCHEMAS.probeemojis = {
    pllogo: { type: "string" },
    server_custom: { type: "object", entries: { type: "string" } },
};

function Client(developerMode: boolean) {
    return {
        developerMode,
        guardian: {
            async HandleGeneric(message: string) {
                reports.push(message);
            },
        },
    } as never;
}

function write(name: string, content: unknown): void {
    const body = typeof content === "string" ? content : JSON.stringify(content, null, 4);

    writeFileSync(path.join(folder, name), body);
}

function options(count: number, prefix = "opt") {
    return Array.from({ length: count }, (_value, index) => ({
        name: `${prefix} ${index + 1}`,
        description: `Beschreibung ${index + 1}`,
        value: `${prefix}-${index + 1}`,
        emoji: "1️⃣",
    }));
}

async function WaitFor(check: () => boolean, timeout: number): Promise<boolean> {
    const deadline = Date.now() + timeout;

    while (Date.now() < deadline) {
        if (check()) return true;

        await new Promise((resolve) => setTimeout(resolve, 50));
    }

    return check();
}

write("valid.json", [{ pagination: false, options: options(1, "first") }]);
write("legacy.json", [{ panigation: true, titel: "alt" }]);
write("paged.json", [{ pagination: true, options: options(7) }]);
write("flat.json", [{ pagination: false, options: options(5), marker: "original" }]);
write("probeemojis.json", [
    { pagination: false, pllogo: "1421580627140153364", server_custom: { ACCL: "1162854539058229288" } },
]);
write("probe.json", [{ pagination: false, options: [{ name: "Name", description: "d", value: "name" }] }]);
write("notarray.json", { pagination: false });
write("missing.json", [{ titel: "ohne pagination" }]);
write("broken.json", "{ das ist kein json");

interface IValid extends IConfigEntry {
    options: Array<{ name: string; value: string }>;
}

async function main(): Promise<void> {
    const service = new ConfigService(Client(false), folder);
    await service.Initialize();

    assert.equal(service.IsLoaded, true);
    assert.equal(service.Root, folder);

    assert.deepEqual(
        service.Keys.sort(),
        ["flat", "legacy", "paged", "probeemojis", "valid"],
        `nur die gueltigen Dateien duerfen geladen sein, geladen: ${service.Keys.join(", ")}`
    );

    assert.equal(reports.length, 4, `erwartet 4 Meldungen, war: ${reports.length} -> ${reports.join(" | ")}`);
    assert.ok(reports.some((message) => message.includes("probe.json") && message.includes("emoji fehlt")));
    assert.ok(reports.some((message) => message.includes("kein Array")));
    assert.ok(reports.some((message) => message.includes("missing.json") && message.includes("pagination fehlt")));
    assert.ok(reports.some((message) => message.includes("broken.json")));

    assert.equal(service.Has("valid"), true);
    assert.equal(service.Has("gibtsnicht"), false);
    assert.equal(service.Get<IValid>("valid")?.[0].options[0].value, "first-1");
    assert.equal(service.GetOne<IValid>("valid")?.options[0].name, "first 1");

    const before = reports.length;
    assert.equal(service.Get("gibtsnicht"), null);
    assert.equal(service.GetOne("gibtsnicht"), null);
    assert.equal(reports.length, before + 2, "ein fehlender Schluessel muss gemeldet werden");

    assert.equal(service.Require<IValid>("valid").options.length, 1);
    assert.throws(() => service.Require("gibtsnicht"), /fehlt oder ist leer/);

    assert.equal(service.Options("valid", "options").length, 1);
    assert.deepEqual(service.Options("valid", "gibtsnicht"), []);
    assert.equal(service.Option("valid", "options", "first-1")?.name, "first 1");
    assert.equal(service.Option("valid", "options", "gibtsnicht"), null);

    assert.equal(service.Value("probeemojis", "server_custom.ACCL", ""), "1162854539058229288");
    assert.equal(service.Value("probeemojis", "server_custom.WEG", "fallback"), "fallback");
    assert.equal(service.Value("probeemojis", "pllogo.tiefer", "fallback"), "fallback");
    assert.equal(service.Value("gibtsnicht", "a.b", 42), 42);

    const legacy = service.GetOne("legacy");
    assert.equal(legacy?.pagination, true, "panigation muss als pagination ankommen");
    assert.equal("panigation" in (legacy ?? {}), false, "der Tippfehler darf nicht uebrig bleiben");

    const frozen = service.GetOne<IValid>("valid")!;
    assert.throws(() => ((frozen as IConfigEntry).pagination = true), /read only|not extensible/i);
    assert.throws(() => frozen.options.push({ name: "x", value: "x" }), /read only|not extensible/i);

    const second = service.Page("paged", "options", 2, 3);
    assert.equal(second.total, 7);
    assert.equal(second.pages, 3);
    assert.equal(second.page, 2);
    assert.deepEqual(second.options.map((option) => option.value), ["opt-4", "opt-5", "opt-6"]);
    assert.equal(second.hasPrevious, true);
    assert.equal(second.hasNext, true);

    assert.equal(service.Page("paged", "options", 99, 3).page, 3, "zu hohe Seiten muessen geklemmt werden");
    assert.equal(service.Page("paged", "options", 0, 3).page, 1, "Seite 0 muss auf 1 geklemmt werden");
    assert.equal(service.Page("paged", "options", 3, 3).hasNext, false);

    const flat = service.Page("flat", "options", 2, 2);
    assert.equal(flat.pages, 1, "bei pagination: false gibt es genau eine Seite");
    assert.equal(flat.options.length, 5);

    const menu = service.SelectOptions("paged", "options", 1).map((option) => option.toJSON());
    assert.equal(menu.length, 7);
    assert.equal(menu[0].label, "opt 1");
    assert.equal(menu[0].value, "opt-1");
    assert.equal(menu[0].description, "Beschreibung 1");
    assert.equal(menu[0].emoji?.name, "1️⃣", "Unicode-Emoji muss als name rausgehen");

    const custom = new ConfigService(Client(false), folder);
    await custom.Initialize();

    write("custom.json", [
        { pagination: false, options: [{ name: "Logo", description: "d", value: "logo", emoji: "1421580627140153364" }] },
    ]);

    await custom.Reload("custom");

    assert.equal(
        custom.SelectOptions("custom", "options")[0].toJSON().emoji?.id,
        "1421580627140153364",
        "eine Snowflake muss als Custom-Emoji rausgehen"
    );

    let notified = "";
    const off = service.OnChange((name) => {
        notified = name;
    });

    write("valid.json", [{ pagination: true, options: options(2, "first") }]);
    await service.Reload("valid");

    assert.equal(notified, "valid", "OnChange muss beim Reload feuern");
    assert.equal(service.GetOne("valid")?.pagination, true, "Reload muss die Datei neu einlesen");
    assert.equal(service.Size, 5, "Reload eines Schluessels darf die anderen nicht anfassen");

    off();
    notified = "";
    await service.Reload("valid");
    assert.equal(notified, "", "nach dem Abmelden darf der Handler nicht mehr feuern");

    write("flat.dev.json", [{ marker: "aus dem overlay", options: options(2) }]);

    const production = new ConfigService(Client(false), folder);
    await production.Initialize();
    assert.equal(production.Value("flat", "marker", ""), "original", "in Produktion wird kein Overlay gelesen");
    assert.equal(production.Options("flat", "options").length, 5);

    const development = new ConfigService(Client(true), folder);
    await development.Initialize();
    assert.equal(development.Value("flat", "marker", ""), "aus dem overlay", "im Dev-Modus gewinnt das Overlay");
    assert.equal(development.Options("flat", "options").length, 2, "Arrays werden ersetzt, nicht gemischt");
    assert.equal(development.GetOne("flat")?.pagination, false, "nicht ueberschriebene Felder bleiben stehen");

    const watched = new ConfigService(Client(false), folder);
    await watched.Initialize();

    assert.equal(watched.IsWatching, false);
    assert.equal(watched.Watch(), true);
    assert.equal(watched.IsWatching, true);
    assert.equal(watched.Watch(), false, "doppeltes Watch darf nicht doppelt starten");

    write("flat.json", [{ pagination: false, options: options(5), marker: "vom watcher" }]);

    const picked = await WaitFor(() => watched.Value<string>("flat", "marker", "") === "vom watcher", 5000);
    assert.ok(picked, "Watch muss eine geaenderte Datei automatisch neu laden");

    watched.Unwatch();
    assert.equal(watched.IsWatching, false);

    const real = new ConfigService(Client(false), CONFIG_ROOT);
    const beforeReal = reports.length;

    await real.Initialize();

    assert.equal(
        reports.length,
        beforeReal,
        `der echte Config-Ordner darf beim Laden nichts melden: ${reports.slice(beforeReal).join(" | ")}`
    );

    console.log(
        `OK - Laden, Validierung, Freeze, Seiten, Select-Optionen, OnChange, Dev-Overlay und Watch ` +
            `verhalten sich korrekt (${real.Size} echte Konfiguration(en) im Projekt)`
    );
}

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(() => rmSync(folder, { recursive: true, force: true }));
