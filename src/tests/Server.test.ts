import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "path";
import assert from "node:assert";
import Server from "../Server";
import { GALLERY_ROOT } from "../constants/Gallery";
import { CreateToken, GenerateSecret } from "../utils/jwt";
import { ParseDuration } from "../utils/duration";

const PORT = 3999;
const RATE_LIMIT_MAX = 20;

const folder = path.join(GALLERY_ROOT, "default", "__test");
const secret = GenerateSecret();

const png = Buffer.from(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6300010000050001" +
        "0d0a2db40000000049454e44ae426082",
    "hex"
);

mkdirSync(folder, { recursive: true });
writeFileSync(path.join(folder, "pixel.png"), png);

const client = {
    developerMode: true,
    config: {
        SERVER_PORT: PORT,
        SERVER_PUBLIC_URL: "https://bot.ascension-dach.org",
        SERVER_JWT_SECRET: secret,
        SERVER_RATE_LIMIT_MAX: RATE_LIMIT_MAX,
        SERVER_RATE_LIMIT_WINDOW: "1 minute",
    },
} as never;

const server = new Server(client);
const token = CreateToken(secret, "test", ParseDuration("1h")!);

async function main(): Promise<void> {
    assert.equal(server.IsRunning, false, "vor dem Start darf nichts laufen");
    assert.equal(server.Instance, null, "vor dem Start gibt es keine Fastify-Instanz");
    assert.throws(() => (server.Port = 0), /Ungültiger Port/, "Port 0 muss abgelehnt werden");
    assert.throws(() => (server.Host = "  "), /darf nicht leer/, "leerer Host muss abgelehnt werden");

    server.Host = "127.0.0.1";
    assert.equal(server.Host, "127.0.0.1");

    await server.Start();
    const base = `http://127.0.0.1:${PORT}`;

    assert.equal(server.IsRunning, true, "nach dem Start muss IsRunning true sein");
    assert.ok(server.Routes.Has("GET /health"), "GET /health sollte registriert sein");
    assert.ok(server.Routes.Has("GET /images/*"), "GET /images/* sollte registriert sein");
    assert.equal(server.Routes.Size, 2, `erwartet 2 Routen, registriert: ${server.Routes.Keys.join(", ")}`);
    assert.equal(server.Routes.Register(server.Routes.Get("GET /health")!), false, "Duplikate müssen abprallen");
    assert.throws(() => (server.Port = 4000), /während der Server läuft/, "Port darf im Betrieb nicht wechseln");

    assert.equal(server.Routes.Get("GET /health")!.requiresAuth, true, "/health muss geschützt sein");
    assert.equal(server.Routes.Get("GET /images/*")!.requiresAuth, false, "/images/* muss offen bleiben");

    const withoutToken = await fetch(`${base}/health`);
    assert.equal(withoutToken.status, 401, "ohne Token muss /health 401 liefern");
    assert.ok(withoutToken.headers.get("www-authenticate")?.includes("Bearer"), "401 sollte WWW-Authenticate setzen");

    const wrongToken = await fetch(`${base}/health`, { headers: { authorization: `Bearer ${token}x` } });
    assert.equal(wrongToken.status, 401, "manipulierter Token muss 401 liefern");

    const health = await fetch(`${base}/health`, { headers: { authorization: `Bearer ${token}` } });
    assert.equal(health.status, 200, "mit gültigem Token muss /health 200 liefern");

    const image = await fetch(`${base}/images/default/__test/pixel.png`);
    assert.equal(image.status, 200, "Bild sollte ohne Token ausgeliefert werden");
    assert.equal(image.headers.get("content-type"), "image/png", "Content-Type sollte image/png sein");
    assert.equal((await image.arrayBuffer()).byteLength, png.length, "Bild sollte vollständig ankommen");

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
        const response = await fetch(`${base}/health`, { headers: { authorization: `Bearer ${token}` } });
        if (response.status === 429) limited++;
    }

    assert.ok(limited > 0, `nach ${RATE_LIMIT_MAX} Anfragen muss 429 kommen, kam aber nie`);

    console.log(
        `OK - ${server.Routes.Size} Routen über den Manager, Token-Pflicht, offene Bilder, ` +
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
