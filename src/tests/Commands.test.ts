import assert from "node:assert";
import path from "path";
import { pathToFileURL } from "node:url";
import { glob } from "glob";
import BotClient from "../client/BotClient";
import Category from "../enums/Category";
import Command from "../structures/Command";

// Discord prüft die Befehlsdaten erst beim Registrieren - und lehnt dann alles auf einmal
// ab. toJSON() hier ruft dieselbe Validierung lokal auf, bevor der Bot startet.
const client = { config: { DEV_USER_IDs: [] }, commands: new Map() } as unknown as BotClient;

const NAME = /^[a-z0-9_-]{1,32}$/;

async function main(): Promise<void> {
    const files = await glob("**/*.ts", { cwd: path.join(__dirname, "../commands"), absolute: true });

    assert.ok(files.length > 0, "es müssen Befehle gefunden werden");

    const names = new Set<string>();
    const byCategory = new Map<Category, number>();

    for (const file of files) {
        const imported = await import(pathToFileURL(file).href);
        const CommandClass = imported.default?.default ?? imported.default;
        const relative = path.relative(path.join(__dirname, "../commands"), file);

        assert.equal(typeof CommandClass, "function", `${relative} hat keinen default export`);

        const command: Command = new CommandClass(client);

        assert.ok(NAME.test(command.name), `${relative}: "${command.name}" ist kein gültiger Befehlsname`);
        assert.ok(command.description.length > 0, `${relative} hat keine Beschreibung`);
        assert.ok(command.data, `${relative} hat keine Befehlsdaten`);
        assert.ok(!names.has(command.name), `${relative}: der Name "${command.name}" ist doppelt vergeben`);
        assert.ok(
            Object.values(Category).includes(command.category),
            `${relative}: unbekannte Kategorie "${command.category}"`
        );

        // Wirft, sobald ein Feld gegen Discords Vorgaben verstösst - zu lange Beschreibung,
        // Pflichtoption hinter einer optionalen, ungültiger Name.
        const json = command.data.toJSON();

        assert.equal(json.name, command.name, `${relative}: Name und Befehlsdaten laufen auseinander`);

        names.add(command.name);
        byCategory.set(command.category, (byCategory.get(command.category) ?? 0) + 1);
    }

    // Die vier Kategorien aus dem /help müssen auch wirklich befüllt sein.
    for (const category of [Category.User, Category.Moderation, Category.Admin, Category.Developer]) {
        assert.ok((byCategory.get(category) ?? 0) > 0, `keine Befehle in der Kategorie ${category}`);
    }

    const summary = [...byCategory.entries()].map(([category, count]) => `${count}x ${category}`).join(", ");

    console.log(`OK - ${names.size} Befehle geladen und gegen Discords Vorgaben geprüft (${summary})`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
