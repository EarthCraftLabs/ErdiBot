import assert from "node:assert";
import { Collection, GuildMember, PermissionFlagsBits, PermissionsBitField } from "discord.js";
import BotClient from "../client/BotClient";
import Command from "../structures/Command";
import Category from "../enums/Category";
import { RenderHelp, Sections } from "../builder/HelpPanel";
import { RenderSetup, SECTIONS } from "../builder/SetupPanel";

const DEVELOPER = "1059621019947634739";

function Fake(name: string, category: Category): Command {
    return { name, description: `${name} Beschreibung`, category } as Command;
}

const commands = new Collection<string, Command>([
    ["help", Fake("help", Category.User)],
    ["ban", Fake("ban", Category.Moderation)],
    ["setup", Fake("setup", Category.Admin)],
    ["devlogs", Fake("devlogs", Category.Developer)],
]);

const client = {
    commands,
    config: { DEV_USER_IDs: [DEVELOPER] },
    user: { username: "ErdiBot" },
} as unknown as BotClient;

function Member(id: string, permissions: bigint[] = []): GuildMember {
    return { id, permissions: new PermissionsBitField(permissions) } as unknown as GuildMember;
}

const plain = Member("2000000000000000001");
const moderator = Member("2000000000000000002", [PermissionFlagsBits.ModerateMembers]);
const admin = Member("2000000000000000003", [PermissionFlagsBits.Administrator]);
const developer = Member(DEVELOPER);

function Render(member: GuildMember, selected: string | null = null): string {
    const view = RenderHelp(client, member, member.id, selected).toMessage();

    assert.equal(view.components.length, 1, "Help sollte genau einen Container liefern");

    const json = view.components[0].toJSON() as { components: unknown[] };
    assert.ok(json.components.length > 0, "Container sollte nicht leer sein");

    return JSON.stringify(json);
}

// ── Wer welche Einträge im Menü hat ────────────────────────────────────
assert.deepEqual(Sections(client, plain, plain.id), [Category.User]);
assert.deepEqual(Sections(client, moderator, moderator.id), [Category.User, Category.Moderation]);
assert.deepEqual(Sections(client, admin, admin.id), [Category.User, Category.Moderation, Category.Admin]);

// Testing steht in der Kategorie-Liste, hat aber keinen Befehl - im Menü hat es nichts verloren.
assert.deepEqual(
    Sections(client, developer, developer.id),
    [Category.User, Category.Developer],
    "leere Kategorien gehören nicht ins Menü"
);

// ── Was die Auswahl anzeigt ────────────────────────────────────────────
assert.match(Render(plain), /\/help/, "die Startansicht zeigt die User-Befehle");
assert.match(Render(admin, Category.Admin), /\/setup/, "die gewählte Kategorie wird gezeigt");
assert.match(Render(developer, Category.Developer), /\/devlogs/);

// Die Rechte werden bei jedem Klick neu geprüft: eine fremde Kategorie fällt auf User zurück.
const smuggled = Render(plain, Category.Admin);
assert.ok(!smuggled.includes("/setup"), "ohne Rechte darf die Admin-Liste nicht erscheinen");
assert.match(smuggled, /\/help/);

// Ein unbekannter Wert darf das Panel nicht leer lassen.
assert.match(Render(admin, "gibtesnicht"), /\/help/);

// ── Setup-Menü ─────────────────────────────────────────────────────────
const setup = RenderSetup(client, "EarthCraft").build().toJSON() as { components: unknown[] };

assert.ok(setup.components.length > 0, "Setup-Container sollte nicht leer sein");
assert.equal(SECTIONS.length, 4, "Welcome, Tickets, Notifier und Logging gehören ins Menü");
assert.equal(new Set(SECTIONS.map((section) => section.value)).size, 4, "doppelte Werte im Setup-Menü");

console.log(`OK - Help zeigt pro Rolle die richtigen Kategorien, Setup bündelt ${SECTIONS.length} Bereiche`);
