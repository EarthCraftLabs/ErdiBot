import assert from "node:assert";
import path from "path";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import LoadConfig from "../utils/config";

const KEYS = [
    "CLIENT_TOKEN",
    "CLIENT_ID",
    "DEV_CLIENT_TOKEN",
    "DEV_CLIENT_ID",
    "SERVER_JWT_SECRET",
    "YOUTUBE_API_KEY",
    "TWITCH_CLIENT_ID",
    "TWITCH_CLIENT_SECRET",
];

const FULL_ENV = [
    'CLIENT_TOKEN="token-prod"',
    'CLIENT_ID="1"',
    'DEV_CLIENT_TOKEN="token-dev"',
    'DEV_CLIENT_ID="2"',
    'SERVER_JWT_SECRET="secret"',
].join("\n");

const FULL_CONFIG = {
    DATABASE: { HOST: "localhost", PORT: 3306, USER: "erdibot", PASSWORD: "#raute-am-anfang", NAME: "erdibot" },
    DEV_DATABASE: { HOST: "localhost", USER: "erdibot", PASSWORD: "dev-pass", NAME: "erdibot_dev" },
    DEV_GUILD_ID: "123",
    DEV_USER_IDs: ["456"],
    SERVER_PORT: 3000,
    SERVER_PUBLIC_URL: "https://api.example.com",
    SERVER_JWT_EXPIRES_IN: "30d",
    SERVER_RATE_LIMIT_MAX: 100,
    SERVER_RATE_LIMIT_WINDOW: "1 minute",
};

const origin = process.cwd();
const sandbox = mkdtempSync(path.join(tmpdir(), "erdibot-config-"));

// loadEnvFile überschreibt nichts, was schon gesetzt ist - zwischen den Fällen muss also aufgeräumt werden.
function Attempt(env: string | null, config: unknown): IResult {
    for (const key of KEYS) delete process.env[key];

    if (env === null) rmSync(path.join(sandbox, ".env"), { force: true });
    else writeFileSync(path.join(sandbox, ".env"), env);

    if (config === null) rmSync(path.join(sandbox, "config.json"), { force: true });
    else writeFileSync(path.join(sandbox, "config.json"), typeof config === "string" ? config : JSON.stringify(config));

    try {
        return { ok: true, config: LoadConfig() };
    } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
}

type IResult = { ok: true; config: ReturnType<typeof LoadConfig> } | { ok: false; message: string };

function Fails(result: IResult, needle: string, hint: string): void {
    assert.equal(result.ok, false, hint);
    assert.ok(result.ok === false && result.message.includes(needle), `${hint} - Meldung war: ${JSON.stringify(result)}`);
}

process.chdir(sandbox);

try {
    const good = Attempt(FULL_ENV, FULL_CONFIG);

    assert.ok(good.ok, `Vollständige Konfiguration muss laden: ${good.ok === false ? good.message : ""}`);
    assert.equal(good.config.CLIENT_TOKEN, "token-prod");
    assert.equal(good.config.DEV_CLIENT_TOKEN, "token-dev");

    // Das Passwort steht bei seinen Zugangsdaten in der config.json, nicht in der .env.
    assert.equal(good.config.DATABASE.PASSWORD, "#raute-am-anfang", "JSON braucht kein Maskieren der Raute");

    assert.equal(good.config.DATABASE.PORT, 3306);
    assert.equal(good.config.DEV_DATABASE.PORT, 3306, "fehlender Port fällt auf 3306");
    assert.equal(good.config.DEV_DATABASE.PASSWORD, "dev-pass", "jede Datenbank hat ihr eigenes Passwort");

    const noPassword = Attempt(FULL_ENV, { ...FULL_CONFIG, DATABASE: { HOST: "h", USER: "u", NAME: "n" } });

    assert.ok(noPassword.ok, "eine Datenbank ohne Passwort ist erlaubt");
    assert.equal(noPassword.ok && noPassword.config.DATABASE.PASSWORD, "", "und wird zum leeren String");
    assert.deepEqual(good.config.DEV_USER_IDs, ["456"]);
    assert.equal(good.config.SERVER_PUBLIC_URL, "https://api.example.com");

    // Ohne Notifier-Keys startet der Bot trotzdem - die Plattformen melden sich dann als nicht konfiguriert.
    assert.equal(good.config.YOUTUBE_API_KEY, "");
    assert.equal(good.config.TWITCH_CLIENT_ID, "");

    const withKeys = Attempt(`${FULL_ENV}\nYOUTUBE_API_KEY="yt-key"\nTWITCH_CLIENT_ID="tw-id"`, FULL_CONFIG);

    assert.ok(withKeys.ok);
    assert.equal(withKeys.config.YOUTUBE_API_KEY, "yt-key");
    assert.equal(withKeys.config.TWITCH_CLIENT_ID, "tw-id");

    Fails(Attempt(null, FULL_CONFIG), "CLIENT_TOKEN", "ohne .env fehlt der Token");
    Fails(Attempt(FULL_ENV, null), "config.json fehlt", "ohne config.json gibt es eine klare Meldung");
    Fails(Attempt(FULL_ENV.replace('SERVER_JWT_SECRET="secret"', ""), FULL_CONFIG), "SERVER_JWT_SECRET", "ein fehlendes Secret wird benannt");
    Fails(Attempt(FULL_ENV.replace('CLIENT_ID="1"', 'CLIENT_ID="   "'), FULL_CONFIG), "CLIENT_ID", "Leerzeichen zählen nicht als Wert");
    Fails(Attempt(FULL_ENV, { ...FULL_CONFIG, DATABASE: undefined }), "DATABASE", "eine fehlende Datenbank-Sektion fliegt auf");
    Fails(Attempt(FULL_ENV, { ...FULL_CONFIG, DATABASE: { HOST: "localhost", NAME: "x" } }), "USER", "ein fehlender Datenbank-User fliegt auf");
    Fails(Attempt(FULL_ENV, { ...FULL_CONFIG, DEV_GUILD_ID: undefined }), "DEV_GUILD_ID", "eine fehlende Dev-Guild fliegt auf");

    Fails(Attempt(FULL_ENV, "{ kaputt"), "gültiges JSON", "kaputtes JSON wird benannt");

    console.log("OK - .env und config.json werden korrekt zusammengesetzt, 8 Fehlerfälle melden sich verständlich");
} finally {
    process.chdir(origin);
    rmSync(sandbox, { recursive: true, force: true });
}
