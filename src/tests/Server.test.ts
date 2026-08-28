import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "path";
import assert from "node:assert";
import Server from "../Server";
import { API_PREFIX } from "../structures/Route";
import { GALLERY_ROOT } from "../constants/Gallery";
import { CreateToken, GenerateSecret } from "../utils/jwt";
import { ParseDuration } from "../utils/duration";

const PORT = 3999;
const RATE_LIMIT_MAX = 20;

const GUILD = "1162553851187040326";
const USER = "1059621019947634739";
const ROLE = "1162597983305609216";
const UNKNOWN = "1111111111111111111";

const folder = path.join(GALLERY_ROOT, "default", "__test");
const secret = GenerateSecret();

const png = Buffer.from(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6300010000050001" +
        "0d0a2db40000000049454e44ae426082",
    "hex"
);

mkdirSync(folder, { recursive: true });
writeFileSync(path.join(folder, "pixel.png"), png);

const apiGuild = {
    id: GUILD,
    name: "Ascension",
    icon: null,
    memberCount: 3,
    roles: [{ id: ROLE, name: "Team", color: 0, position: 5, managed: false, assignable: true }],
};

const apiMember = {
    id: USER,
    username: "mecrytv",
    displayName: "MecryTv",
    nickname: null,
    avatar: "https://cdn.discordapp.com/avatar.png",
    joinedAt: "2026-01-01T00:00:00.000Z",
    roles: [ROLE],
};

const discordService = {
    Guilds: () => [apiGuild],
    async Guild(guildId: string) {
        return guildId === GUILD ? { id: GUILD } : null;
    },
    async Member(guildId: string, userId: string) {
        return guildId === GUILD && userId === USER ? { id: USER } : null;
    },
    ToGuild: () => apiGuild,
    ToMember: () => apiMember,
    async GrantRole(_guildId: string, _userId: string, roleId: string) {
        return roleId === ROLE
            ? { ok: true, changed: true }
            : { ok: false, status: 404, error: "Unbekannte Rolle" };
    },
    async RevokeRole() {
        return { ok: true, changed: false };
    },
};

const oauthService = {
    Ready: false,
    Hint: "CLIENT_SECRET fehlt in der .env.",
    Authorize: () => "https://discord.com/oauth2/authorize?client_id=1&state=abc",
    async Login(code: string, state: string) {
        return code === "guter-code" && state === "guter-state"
            ? { ok: true, value: { user: { id: USER }, token: "jwt", joined: true, role: true } }
            : { ok: false, status: 400, error: "Der state ist ungültig oder abgelaufen" };
    },
};

const client = {
    developerMode: true,
    discordService,
    oauthService,
    config: {
        SERVER_PORT: PORT,
        SERVER_PUBLIC_URL: "https://bot.ascension-dach.org",
        SERVER_JWT_SECRET: secret,
        SERVER_RATE_LIMIT_MAX: RATE_LIMIT_MAX,
        SERVER_RATE_LIMIT_WINDOW: "1 minute",
    },
} as never;

const server = new Server(client);
const token = CreateToken(secret, "minecraft-plugin", ParseDuration("1h")!);
const auth = { authorization: `Bearer ${token}` };

async function main(): Promise<void> {
    assert.equal(server.IsRunning, false, "vor dem Start darf nichts laufen");
    assert.equal(server.Instance, null, "vor dem Start gibt es keine Fastify-Instanz");
    assert.throws(() => (server.Port = 0), /Ungültiger Port/, "Port 0 muss abgelehnt werden");
    assert.throws(() => (server.Host = "  "), /darf nicht leer/, "leerer Host muss abgelehnt werden");

    server.Host = "127.0.0.1";
    assert.equal(server.Host, "127.0.0.1");

    await server.Start();

    const base = `http://127.0.0.1:${PORT}`;
    const api = `${base}${API_PREFIX}`;

    assert.equal(server.IsRunning, true, "nach dem Start muss IsRunning true sein");
    assert.equal(server.Routes.Size, 10, `erwartet 10 Routen, registriert: ${server.Routes.Keys.join(", ")}`);

    assert.deepEqual(
        server.Routes.Keys.sort(),
        [
            "DELETE /dcapi/guilds/:guildId/members/:userId/roles/:roleId",
            "GET /auth/discord",
            "GET /auth/discord/callback",
            "GET /dcapi/guilds",
            "GET /dcapi/guilds/:guildId",
            "GET /dcapi/guilds/:guildId/members/:userId",
            "GET /dcapi/health",
            "GET /images/*",
            "GET /transcripts/:id",
            "PUT /dcapi/guilds/:guildId/members/:userId/roles/:roleId",
        ],
        "alles unter /dcapi ausser Bildern, Transcripts und dem OAuth2-Login"
    );

    assert.equal(server.Routes.Get("GET /dcapi/health")!.requiresAuth, true, "/dcapi/health muss geschützt sein");
    assert.equal(server.Routes.Get("GET /images/*")!.requiresAuth, false, "/images/* muss offen bleiben");

    // Wer sich erst registriert, hat noch kein Token - beide OAuth2-Routen müssen ohne auskommen.
    assert.equal(server.Routes.Get("GET /auth/discord")!.requiresAuth, false, "/auth/discord muss offen sein");
    assert.equal(
        server.Routes.Get("GET /auth/discord/callback")!.requiresAuth,
        false,
        "/auth/discord/callback muss offen sein"
    );
    assert.throws(() => (server.Port = 4000), /während der Server läuft/, "Port darf im Betrieb nicht wechseln");

    const withoutToken = await fetch(`${api}/health`);
    assert.equal(withoutToken.status, 401, "ohne Token muss /dcapi/health 401 liefern");
    assert.ok(withoutToken.headers.get("www-authenticate")?.includes("Bearer"), "401 sollte WWW-Authenticate setzen");

    const wrongToken = await fetch(`${api}/health`, { headers: { authorization: `Bearer ${token}x` } });
    assert.equal(wrongToken.status, 401, "manipulierter Token muss 401 liefern");

    const health = await fetch(`${api}/health`, { headers: auth });
    assert.equal(health.status, 200, "mit gültigem Token muss /dcapi/health 200 liefern");

    assert.equal((await fetch(`${api}/guilds`)).status, 401, "auch die Discord-Routen brauchen ein Token");

    const guilds = await fetch(`${api}/guilds`, { headers: auth });
    assert.equal(guilds.status, 200);
    assert.deepEqual(await guilds.json(), { total: 1, guilds: [apiGuild] });

    const guild = await fetch(`${api}/guilds/${GUILD}`, { headers: auth });
    assert.equal(guild.status, 200);
    assert.equal((await guild.json()).name, "Ascension");

    assert.equal((await fetch(`${api}/guilds/${UNKNOWN}`, { headers: auth })).status, 404, "unbekannter Server");

    const member = await fetch(`${api}/guilds/${GUILD}/members/${USER}`, { headers: auth });
    assert.equal(member.status, 200);
    assert.deepEqual(await member.json(), apiMember);

    const missingMember = await fetch(`${api}/guilds/${GUILD}/members/${UNKNOWN}`, { headers: auth });
    assert.equal(missingMember.status, 404, "unbekanntes Mitglied");

    const granted = await fetch(`${api}/guilds/${GUILD}/members/${USER}/roles/${ROLE}`, {
        method: "PUT",
        headers: auth,
    });

    assert.equal(granted.status, 200);
    assert.deepEqual(await granted.json(), { changed: true });

    const badRole = await fetch(`${api}/guilds/${GUILD}/members/${USER}/roles/${UNKNOWN}`, {
        method: "PUT",
        headers: auth,
    });

    assert.equal(badRole.status, 404, "der Fehlerstatus aus dem Service muss durchgereicht werden");
    assert.equal((await badRole.json()).error, "Unbekannte Rolle");

    const revoked = await fetch(`${api}/guilds/${GUILD}/members/${USER}/roles/${ROLE}`, {
        method: "DELETE",
        headers: auth,
    });

    assert.equal(revoked.status, 200);
    assert.deepEqual(await revoked.json(), { changed: false });

    // Ohne Secret meldet sich der Login als nicht eingerichtet - und nicht als 401.
    const login = await fetch(`${base}/auth/discord`, { redirect: "manual" });
    assert.equal(login.status, 503, "ohne CLIENT_SECRET muss /auth/discord 503 liefern");

    oauthService.Ready = true;

    const redirect = await fetch(`${base}/auth/discord`, { redirect: "manual" });
    assert.equal(redirect.status, 302, "eingerichtet muss /auth/discord zu Discord weiterleiten");
    assert.ok(redirect.headers.get("location")?.startsWith("https://discord.com/oauth2/authorize"), "Ziel ist Discord");

    const denied = await fetch(`${base}/auth/discord/callback?error=access_denied&error_description=Abgelehnt`);
    assert.equal(denied.status, 400, "ein Abbruch auf dem Consent-Screen ist kein Serverfehler");
    assert.equal((await denied.json()).error, "Abgelehnt");

    const replayed = await fetch(`${base}/auth/discord/callback?code=guter-code&state=alter-state`);
    assert.equal(replayed.status, 400, "ein verbrauchter state muss abgelehnt werden");

    const callback = await fetch(`${base}/auth/discord/callback?code=guter-code&state=guter-state`);
    assert.equal(callback.status, 200);
    assert.deepEqual(await callback.json(), { user: { id: USER }, token: "jwt", joined: true, role: true });

    const image = await fetch(`${base}/images/default/__test/pixel.png`);
    assert.equal(image.status, 200, "Bild sollte ohne Token und ohne Präfix ausgeliefert werden");
    assert.equal(image.headers.get("content-type"), "image/png", "Content-Type sollte image/png sein");
    assert.equal((await image.arrayBuffer()).byteLength, png.length, "Bild sollte vollständig ankommen");

    assert.equal((await fetch(`${api}/images/default/__test/pixel.png`)).status, 404, "unter /dcapi liegt kein Bild");

    const attempts = [
        "/images/../config.json",
        "/images/default/../../config.json",
        "/images/%2e%2e/config.json",
        "/images/C:/Windows/win.ini",
        "/images/default/__test/pixel.txt",
    ];

    for (const attempt of attempts) {
        const response = await fetch(`${base}${attempt}`, { redirect: "manual" });
        assert.ok(response.status >= 400, `sollte abgelehnt werden: ${attempt} (war ${response.status})`);
        assert.notEqual(response.headers.get("content-type"), "image/png", `hat Inhalt geliefert: ${attempt}`);
    }

    const missing = await fetch(`${base}/images/default/__test/gibtsnicht.png`);
    assert.equal(missing.status, 404, "fehlende Datei sollte 404 liefern");

    let limited = 0;

    for (let attempt = 0; attempt < RATE_LIMIT_MAX + 5; attempt++) {
        const response = await fetch(`${api}/health`, { headers: auth });
        if (response.status === 429) limited++;
    }

    assert.ok(limited > 0, `nach ${RATE_LIMIT_MAX} Anfragen muss 429 kommen, kam aber nie`);

    console.log(
        `OK - ${server.Routes.Size} Routen unter ${API_PREFIX}, Token-Pflicht, Discord-Endpunkte, offene Bilder, ` +
            `${attempts.length} Ausbruchsversuche, 404 und ${limited}x Rate Limit verhalten sich korrekt`
    );
}

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await server.Stop();
        rmSync(folder, { recursive: true, force: true });
    });
