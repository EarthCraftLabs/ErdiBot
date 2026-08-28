import assert from "node:assert";
import OAuthService from "../services/OAuthService";
import { GenerateSecret, VerifyToken } from "../utils/jwt";

const GUILD = "1162553851187040326";
const ROLE = "1162597983305609216";
const USER = "1059621019947634739";

const secret = GenerateSecret();

// Was der Testlauf gerade von Discord hören will.
let tokenScope = "identify guilds guilds.join";
let tokenOk = true;
let member: { id: string } | null = null;
let added: { userId: string; roles: string[] | undefined } | null = null;
let granted: string[] = [];

const guild = {
    id: GUILD,
    name: "EarthCraft",
    members: {
        async add(userId: string, options: { accessToken: string; roles?: string[] }) {
            added = { userId, roles: options.roles };

            assert.equal(options.accessToken, "access-123", "der Beitritt braucht das Token des Nutzers");

            return { id: userId };
        },
    },
};

const discordService = {
    async Guild(guildId: string) {
        return guildId === GUILD ? guild : null;
    },
    async Member(_guildId: string, _userId: string) {
        return member;
    },
    async GrantRole(_guildId: string, userId: string, roleId: string) {
        granted.push(`${userId}:${roleId}`);

        return { ok: true as const, changed: true };
    },
    Invalidate() {},
};

const config = {
    CLIENT_ID: "prod-id",
    CLIENT_SECRET: "prod-secret",
    DEV_CLIENT_ID: "dev-id",
    DEV_CLIENT_SECRET: "dev-secret",
    OAUTH_GUILD_ID: GUILD,
    OAUTH_ROLE_ID: ROLE,
    SERVER_JWT_SECRET: secret,
    SERVER_JWT_EXPIRES_IN: "30d",
};

const client = {
    developerMode: true,
    config,
    discordService,
    server: { BaseURL: "http://localhost:3000" },
} as never;

// Discord antwortet hier aus dem Speicher - der Test darf nie ins Netz.
const requests: string[] = [];

globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
    requests.push(String(url));

    if (String(url).endsWith("/oauth2/token")) {
        const body = new URLSearchParams(String(init.body));

        assert.equal(body.get("grant_type"), "authorization_code");
        assert.equal(body.get("client_secret"), "dev-secret", "im Dev-Modus zählt das Dev-Secret");
        assert.equal(
            body.get("redirect_uri"),
            "http://localhost:3000/auth/discord/callback",
            "die Redirect-URI muss zum Eintrag im Developer Portal passen"
        );

        return tokenOk
            ? { ok: true, json: async () => ({ access_token: "access-123", scope: tokenScope }) }
            : { ok: false, status: 400, statusText: "Bad Request" };
    }

    return {
        ok: true,
        json: async () => ({ id: USER, username: "mecrytv", global_name: "MecryTv", avatar: "abc" }),
    };
}) as never;

function StateOf(url: string): string {
    return new URL(url).searchParams.get("state") ?? "";
}

function Reset(): void {
    added = null;
    granted = [];
    member = null;
    tokenOk = true;
    tokenScope = "identify guilds guilds.join";
}

async function main(): Promise<void> {
    const service = new OAuthService(client);

    assert.equal(service.Ready, true, "mit Dev-Secret ist der Dienst bereit");
    assert.equal(service.RedirectURI, "http://localhost:3000/auth/discord/callback");

    const url = new URL(service.Authorize());

    assert.equal(url.origin + url.pathname, "https://discord.com/oauth2/authorize");
    assert.equal(url.searchParams.get("client_id"), "dev-id");
    assert.equal(url.searchParams.get("response_type"), "code");
    assert.equal(
        url.searchParams.get("scope"),
        "identify guilds guilds.join",
        "ohne guilds.join gäbe es keinen Beitritt"
    );
    assert.ok(url.searchParams.get("state"), "jeder Anlauf braucht einen state");
    assert.notEqual(StateOf(service.Authorize()), StateOf(service.Authorize()), "jeder state ist neu");

    // 1. Ein unbekannter state darf nicht durchkommen.
    const forged = await service.Login("code", "ausgedacht");

    assert.equal(forged.ok, false);
    assert.equal(forged.ok === false && forged.status, 400);
    assert.equal(requests.length, 0, "ein falscher state darf Discord gar nicht erst erreichen");

    // 2. Neuer Nutzer: beitreten und Rolle bekommen.
    Reset();

    const state = StateOf(service.Authorize());
    const login = await service.Login("code-1", state);

    assert.ok(login.ok, `Login muss durchlaufen: ${login.ok === false ? login.error : ""}`);
    assert.equal(login.ok && login.value.user.id, USER);
    assert.equal(login.ok && login.value.user.username, "mecrytv");
    assert.equal(login.ok && login.value.joined, true, "wer noch nicht drin war, tritt bei");
    assert.equal(login.ok && login.value.role, true);
    assert.deepEqual(added, { userId: USER, roles: [ROLE] }, "die Rolle geht direkt mit dem Beitritt raus");

    const payload = login.ok ? VerifyToken(login.value.token, secret) : null;

    assert.equal(payload?.sub, USER, "das ausgestellte Token gehört dem Discord-Nutzer");

    // 3. Derselbe state ein zweites Mal: abgelehnt.
    const replay = await service.Login("code-1", state);

    assert.equal(replay.ok, false, "ein state ist genau einen Callback lang gültig");

    // 4. Wer schon Mitglied ist: kein Beitritt, aber die Rolle kommt trotzdem.
    //    Discord ignoriert bei 204 die Rollen im Beitritts-Request - genau das fängt GrantRole ab.
    Reset();
    member = { id: USER };

    const existing = await service.Login("code-2", StateOf(service.Authorize()));

    assert.ok(existing.ok);
    assert.equal(existing.ok && existing.value.joined, false, "ein bestehendes Mitglied tritt nicht erneut bei");
    assert.equal(existing.ok && existing.value.role, true, "die Rolle muss es trotzdem bekommen");
    assert.equal(added, null, "kein Beitritts-Request für ein bestehendes Mitglied");
    assert.deepEqual(granted, [`${USER}:${ROLE}`], "die Rolle wird nachgezogen");

    // 5. Ohne Ziel-Server bleibt der Login gültig, nur der Beitritt fällt aus.
    Reset();
    config.OAUTH_GUILD_ID = "";

    const noGuild = await service.Login("code-3", StateOf(service.Authorize()));

    assert.ok(noGuild.ok, "eine fehlende OAUTH_GUILD_ID darf den Login nicht kippen");
    assert.equal(noGuild.ok && noGuild.value.joined, false);
    assert.equal(noGuild.ok && noGuild.value.role, false);
    assert.deepEqual(granted, [], "ohne Server wird auch keine Rolle vergeben");

    config.OAUTH_GUILD_ID = GUILD;

    // 6. Lehnt Discord den Code ab, ist das kein 500.
    Reset();
    tokenOk = false;

    const rejected = await service.Login("abgelaufen", StateOf(service.Authorize()));

    assert.equal(rejected.ok, false);
    assert.equal(rejected.ok === false && rejected.status, 401);

    // 7. Ohne Secret meldet sich der Dienst als nicht eingerichtet, statt blind loszulaufen.
    Reset();
    config.DEV_CLIENT_SECRET = "";

    assert.equal(service.Ready, false);
    assert.ok(service.Hint.includes("CLIENT_SECRET"), "der Hinweis muss sagen, was fehlt");

    const unconfigured = await service.Login("code", StateOf(service.Authorize()));

    assert.equal(unconfigured.ok === false && unconfigured.status, 503);

    console.log("OK - state ist einmalig, Beitritt und Rolle greifen in beiden Fällen, 4 Fehlerfälle bleiben sauber");
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
