import assert from "node:assert";
import { GuildMember, PermissionFlagsBits, PermissionsBitField } from "discord.js";
import BotClient from "../client/BotClient";
import Category from "../enums/Category";
import { Blocked, IsAdmin, IsDeveloper, IsModerator, VisibleCategories } from "../utils/permissions";

const GUILD = "1162553851187040326";
const OWNER = "1000000000000000001";
const BOT = "1539748672546410516";
const DEVELOPER = "1059621019947634739";

const client = { config: { DEV_USER_IDs: [DEVELOPER] } } as BotClient;

// Der Bot selbst steht auf Position 50 - alles darüber kann er nicht anfassen.
let botPosition = 50;

function Role(position: number) {
    return { position, comparePositionTo: (other: { position: number }) => position - other.position };
}

function Member(id: string, position: number, permissions: bigint[] = []): GuildMember {
    return {
        id,
        permissions: new PermissionsBitField(permissions),
        roles: { highest: Role(position) },
        client: { user: { id: BOT } },
        guild: {
            id: GUILD,
            ownerId: OWNER,
            get members() {
                return { me: { roles: { highest: Role(botPosition) } } };
            },
        },
    } as unknown as GuildMember;
}

const plain = Member("2000000000000000001", 10);
const moderator = Member("2000000000000000002", 20, [PermissionFlagsBits.ModerateMembers]);
const admin = Member("2000000000000000003", 30, [PermissionFlagsBits.Administrator]);
const owner = Member(OWNER, 90, [PermissionFlagsBits.Administrator]);
const developer = Member(DEVELOPER, 10);

// ── Wer ist was ────────────────────────────────────────────────────────
assert.equal(IsModerator(plain), false);
assert.equal(IsModerator(moderator), true);
assert.equal(IsModerator(admin), true, "ein Administrator darf alles, was ein Moderator darf");
assert.equal(IsAdmin(moderator), false, "ein Moderator ist noch lange kein Administrator");
assert.equal(IsAdmin(admin), true);
assert.equal(IsModerator(null), false, "ausserhalb eines Servers gibt es keine Rechte");
assert.equal(IsDeveloper(client, DEVELOPER), true);
assert.equal(IsDeveloper(client, plain.id), false);

// ── Wer sieht welche Kategorie im /help ────────────────────────────────
assert.deepEqual(VisibleCategories(client, plain, plain.id), [Category.User], "ein Mitglied sieht nur User");

assert.deepEqual(
    VisibleCategories(client, moderator, moderator.id),
    [Category.User, Category.Moderation],
    "ein Moderator sieht keine Admin-Befehle"
);

assert.deepEqual(
    VisibleCategories(client, admin, admin.id),
    [Category.User, Category.Moderation, Category.Admin],
    "ein Administrator sieht alles ausser Developer"
);

assert.deepEqual(
    VisibleCategories(client, developer, DEVELOPER),
    [Category.User, Category.Developer, Category.Testing],
    "Entwickler hängen an der ID aus der config.json, nicht an Serverrechten"
);

assert.deepEqual(VisibleCategories(client, null, plain.id), [Category.User], "in Direktnachrichten bleibt nur User");

// ── An wem darf sich ein Moderator vergreifen ──────────────────────────
assert.ok(Blocked(moderator, moderator), "niemand moderiert sich selbst");
assert.ok(Blocked(moderator, Member(BOT, 5)), "der Bot ist tabu");
assert.ok(Blocked(moderator, owner), "der Serverinhaber ist tabu");
assert.ok(Blocked(moderator, admin), "über sich selbst hinaus geht nichts");
assert.ok(Blocked(moderator, Member("2000000000000000004", 20)), "gleiche Höhe zählt nicht als darunter");
assert.equal(Blocked(admin, plain), null, "unter sich und unter dem Bot ist erlaubt");
assert.equal(Blocked(owner, admin), null, "der Inhaber steht über der Hierarchie");

// Der Bot kann nur, was seine eigene Rolle zulässt - sonst lehnt Discord später ab.
botPosition = 5;

assert.ok(Blocked(admin, plain)?.includes("über meiner höchsten Rolle"), "unter dem Bot heisst wirklich unter dem Bot");

botPosition = 50;

console.log("OK - Kategorien, Rollenrang und Bot-Hierarchie werden in 20 Fällen korrekt entschieden");
