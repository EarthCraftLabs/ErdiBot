import assert from "node:assert";
import path from "path";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import GalleryService from "../services/GalleryService";
import {
    GALLERY_ROOT,
    IsPrivateHost,
    IsScope,
    ParseSource,
    PRIVATE_SCOPE,
    ResolveImagePath,
    SanitizeName,
} from "../constants/Gallery";

for (const relative of ["default/rocketleague/gc.png", "123456789012345678/memes/sub/cat.webp"]) {
    const resolved = ResolveImagePath(relative);
    assert.ok(resolved?.startsWith(GALLERY_ROOT + path.sep), `sollte erlaubt sein: ${relative}`);
}

const blocked = [
    "../config.json",
    "../../etc/passwd",
    "default/../../config.json",
    "C:/Windows/win.ini",
    "/etc/passwd",
    "default/rocketleague/notes.txt",
    "default/rocketleague/payload.exe",
    "",
];

for (const relative of blocked) {
    assert.equal(ResolveImagePath(relative), null, `sollte blockiert sein: ${relative}`);
}

const privateHosts = [
    "localhost",
    "127.0.0.1",
    "10.0.0.5",
    "172.16.3.9",
    "172.31.255.254",
    "192.168.1.1",
    "169.254.169.254",
    "0.0.0.0",
    "nas.local",
    "vault.internal",
    "::1",
    "fd00::1",
    "fe80::1",
];

for (const host of privateHosts) {
    assert.equal(IsPrivateHost(host), true, `sollte privat sein: ${host}`);
}

for (const host of ["cdn.discordapp.com", "8.8.8.8", "172.32.0.1", "bot.ascension-dach.org"]) {
    assert.equal(IsPrivateHost(host), false, `sollte öffentlich sein: ${host}`);
}

assert.equal(ParseSource("https://cdn.discordapp.com/a/b.png").hostname, "cdn.discordapp.com");
assert.throws(() => ParseSource("http://cdn.discordapp.com/a.png"), /https/);
assert.throws(() => ParseSource("file:///etc/passwd"), /https/);
assert.throws(() => ParseSource("https://169.254.169.254/latest/meta-data/"), /interne/);
assert.throws(() => ParseSource("kein-link"), /URL/);

assert.equal(SanitizeName("../../etc"), "etc");
assert.equal(SanitizeName("Rocket League!"), "rocketleague");
assert.equal(SanitizeName("  ranks  "), "ranks");
assert.equal(SanitizeName("a/b\\c"), "abc");
assert.equal(SanitizeName("x".repeat(80)).length, 32);
assert.equal(SanitizeName("###"), "");

assert.equal(IsScope("default"), true);
assert.equal(IsScope("1162553851187040326"), true);
assert.equal(IsScope(".."), false);
assert.equal(IsScope(PRIVATE_SCOPE), false, "der privacy-Scope darf für die Gallery-Commands unsichtbar bleiben");
assert.equal(IsScope(""), false);

console.log(
    `OK - ${blocked.length} Pfad-Ausbrüche, ${privateHosts.length} interne Hosts und alle Namens-Checks abgewehrt`
);

const png = Buffer.from(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6300010000050001" +
        "0d0a2db40000000049454e44ae426082",
    "hex"
);

const assets = path.join(GALLERY_ROOT, PRIVATE_SCOPE, "__test");

mkdirSync(assets, { recursive: true });
writeFileSync(path.join(assets, "Welcome Card.png"), png);

function Service(developerMode: boolean): GalleryService {
    return new GalleryService({
        developerMode,
        server: { BaseURL: "https://bot.ascension-dach.org" },
    } as never);
}

async function main(): Promise<void> {
    const asset = `${PRIVATE_SCOPE}/__test/Welcome Card.png`;

    assert.deepEqual(
        await Service(false).Asset(asset),
        { media: ["https://bot.ascension-dach.org/images/privacy/__test/Welcome%20Card.png"], files: [] },
        "im Normalbetrieb kommt die Web-URL, kein Upload"
    );

    const dev = await Service(true).Asset(asset);

    assert.equal(dev.media[0], "attachment://privacy___test_Welcome_Card.png", "im Dev-Modus wird angehängt");
    assert.equal(dev.files.length, 1, "und die Datei muss mitgeschickt werden");

    const broken = [`${PRIVATE_SCOPE}/__test/fehlt.png`, "../../config.json", `${PRIVATE_SCOPE}/__test`, ""];

    for (const key of broken) {
        const result = await Service(false).Asset(key);

        assert.deepEqual(result, { media: [], files: [] }, `darf nichts liefern: ${key}`);
    }

    console.log(`OK - Assets als URL und als Attachment, ${broken.length} Fehlgriffe sauber abgefangen`);
}

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(() => rmSync(assets, { recursive: true, force: true }));
