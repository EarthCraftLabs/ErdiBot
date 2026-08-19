import assert from "node:assert";
import path from "path";
import { GALLERY_ROOT, IsPrivateHost, IsScope, ParseSource, ResolveImagePath, SanitizeName } from "../constants/Gallery";

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
assert.equal(IsScope("privacy"), false);
assert.equal(IsScope(""), false);

console.log(
    `OK - ${blocked.length} Pfad-Ausbrüche, ${privateHosts.length} interne Hosts und alle Namens-Checks abgewehrt`
);
