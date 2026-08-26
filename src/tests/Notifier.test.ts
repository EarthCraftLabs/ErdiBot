import assert from "node:assert";
import BotClient from "../client/BotClient";
import ConfigService from "../services/ConfigService";
import NotifierService from "../services/NotifierService";
import BuildNotification from "../builder/NotifierMessage";
import { NewPanelState, PanelStates, RenderPanel } from "../builder/NotifierPanel";
import { ParseFeed, Decode, Tag, Attribute } from "../services/notifier/Feed";
import { INotifierEvent } from "../interfaces/services/notifier/INotifierEvent";
import INotifierSubscription from "../interfaces/services/notifier/INotifierSubscription";
import { INotifierState } from "../interfaces/services/notifier/INotifierPanel";
import {
    ClampNumber,
    DefaultSubscription,
    InQuietHours,
    IsHex,
    LocalMinutes,
    IsTime,
    Key,
    Normalize,
    PLACEHOLDERS,
    ShouldNotify,
    StyleLabel,
    SUPPORTS_LIVE,
    TemplateFor,
} from "../constants/Notifier";

const GUILD = "1162553851187040326";

// ── Bausteine ──────────────────────────────────────────────────────────────

assert.equal(IsHex("#FF0000"), true);
assert.equal(IsHex("FF0000"), false, "ohne Raute ist es keine Farbe");
assert.equal(IsTime("22:00"), true);
assert.equal(IsTime("24:00"), false, "24 Uhr gibt es nicht");
assert.equal(IsTime("7:00"), false, "einstellige Stunden sind nicht erlaubt");
assert.equal(ClampNumber(9999, 0, 1440), 1440);
assert.equal(ClampNumber(Number.NaN, 5, 100), 5);

assert.equal(Key({ platform: "twitch", identifier: "mecrytv" }), "twitch:mecrytv");
assert.equal(StyleLabel("container"), "Container");
assert.equal(SUPPORTS_LIVE.tiktok, false, "TikTok kennt keinen Live-Zustand");

// ── Ruhezeit ───────────────────────────────────────────────────────────────
// Der interessante Fall ist das Fenster über Mitternacht.

// Bewusst in UTC gebaut: die Ruhezeit muss in Europe/Berlin rechnen, nicht in Server-Zeit.
// Im Januar ist Berlin UTC+1, im Juli UTC+2 - beides wird geprüft.
const At = (hours: number, minutes = 0) => new Date(Date.UTC(2026, 0, 1, hours - 1, minutes));

assert.equal(InQuietHours("22:00", "07:00", At(23)), true, "23 Uhr liegt im Nachtfenster");
assert.equal(InQuietHours("22:00", "07:00", At(3)), true, "3 Uhr liegt im Nachtfenster");
assert.equal(InQuietHours("22:00", "07:00", At(12)), false, "Mittag nicht");
assert.equal(InQuietHours("22:00", "07:00", At(22)), true, "die Startminute zählt dazu");
assert.equal(InQuietHours("22:00", "07:00", At(7)), false, "die Endminute nicht mehr");
assert.equal(InQuietHours("09:00", "17:00", At(12)), true, "ein Fenster am Tag geht auch");
assert.equal(InQuietHours("09:00", "17:00", At(20)), false);
assert.equal(InQuietHours(null, "07:00", At(3)), false, "eine halbe Ruhezeit ist keine");
assert.equal(InQuietHours("22:00", "22:00", At(22)), false, "gleiche Zeiten sperren nicht den ganzen Tag");
assert.equal(InQuietHours("kaputt", "07:00", At(3)), false);

// Sommerzeit: im Juli ist Berlin UTC+2. 21:00 UTC sind 23:00 in Berlin und damit Ruhezeit.
assert.equal(InQuietHours("22:00", "07:00", new Date(Date.UTC(2026, 6, 1, 21, 0))), true, "Sommerzeit wird mitgerechnet");
assert.equal(InQuietHours("22:00", "07:00", new Date(Date.UTC(2026, 6, 1, 19, 0))), false, "21 Uhr Berlin liegt noch davor");

assert.equal(LocalMinutes(new Date(Date.UTC(2026, 0, 1, 11, 30))), 12 * 60 + 30, "Winterzeit: UTC+1");
assert.equal(LocalMinutes(new Date(Date.UTC(2026, 6, 1, 10, 30))), 12 * 60 + 30, "Sommerzeit: UTC+2");

// ── Normalisierung ─────────────────────────────────────────────────────────
// Alles aus der Datenbank kann veraltet oder von Hand verbogen sein.

const repaired = Normalize(
    {
        platform: "gibtsnicht",
        name: "   ",
        cooldown: 99999,
        accent: "kaputt",
        style: "regenbogen",
        quietFrom: "25:00",
        quietTo: "07:00",
        enabled: 1,
        isLive: 1,
        editOnEnd: 0,
        notifyCount: -5,
        liveRoleId: "  ",
        lastNotified: "nicht-datum",
        createdAt: "2026-01-01T00:00:00Z",
    },
    GUILD
);

assert.equal(repaired.platform, "youtube", "ein unbekannter Dienst fällt auf YouTube zurück");
assert.equal(repaired.name, "Unbenannt", "Leerzeichen sind kein Name");
assert.equal(repaired.cooldown, 1440, "der Cooldown wird gedeckelt");
assert.equal(repaired.accent, "#FF0000", "eine kaputte Farbe fällt auf die Plattformfarbe zurück");
assert.equal(repaired.style, "container");
assert.equal(repaired.quietFrom, null, "eine ungültige Uhrzeit wird verworfen");
assert.equal(repaired.enabled, true, "MySQL liefert 1 statt true");
assert.equal(repaired.isLive, true);
assert.equal(repaired.editOnEnd, false, "0 zählt als aus");
assert.equal(repaired.notifyCount, 0, "negativ zählen geht nicht");
assert.equal(repaired.liveRoleId, null, "Leerzeichen sind keine Rolle");
assert.equal(repaired.lastNotified, null, "ein kaputtes Datum wird zu null");
assert.equal(repaired.createdAt.getUTCFullYear(), 2026);
assert.equal(repaired.guildId, GUILD);

assert.equal(Normalize(null, GUILD).platform, "youtube", "gar nichts ergibt trotzdem einen Eintrag");
assert.equal(Normalize({ platform: "tiktok", liveRoleId: "123" }, GUILD).liveRoleId, null, "TikTok kann keine Live-Rolle");
assert.equal(Normalize({ platform: "twitch", liveRoleId: "123" }, GUILD).liveRoleId, "123");

// ── Melden oder nicht ──────────────────────────────────────────────────────

// lastItemId ist gesetzt: die Erstsichtung ist damit vorbei und die übrigen Regeln greifen.
function Sub(overrides: Partial<INotifierSubscription> = {}): INotifierSubscription {
    return {
        ...DefaultSubscription(GUILD, "twitch"),
        name: "MecryTv",
        identifier: "mecrytv",
        channelId: "1",
        enabled: true,
        cooldown: 0,
        lastItemId: "gesehen",
        ...overrides,
    };
}

const now = At(12);

// Die Erstsichtung darf niemals melden - sonst blasst das Einrichten das letzte Video raus.
assert.equal(ShouldNotify(Sub({ lastItemId: null }), "stream-1", "live", now).reason, "Erstsichtung");
assert.equal(ShouldNotify(Sub({ lastItemId: null }), "video-1", "video", now).notify, false, "auch bei Videos nicht");
assert.equal(DefaultSubscription(GUILD, "youtube").lastItemId, null, "ein neuer Eintrag startet ohne Erinnerung");

assert.equal(ShouldNotify(Sub(), "stream-1", "live", now).notify, true);
assert.equal(ShouldNotify(Sub({ enabled: false }), "stream-1", "live", now).reason, "deaktiviert");
assert.equal(ShouldNotify(Sub({ channelId: null }), "stream-1", "live", now).reason, "kein Kanal");
assert.equal(ShouldNotify(Sub({ lastItemId: "stream-1" }), "stream-1", "live", now).reason, "bereits gemeldet");
assert.equal(ShouldNotify(Sub({ isLive: true }), "stream-2", "live", now).reason, "läuft bereits");
assert.equal(ShouldNotify(Sub({ isLive: true }), "video-2", "video", now).notify, true, "ein Video während des Streams zählt");
assert.equal(ShouldNotify(Sub({ quietFrom: "09:00", quietTo: "17:00" }), "stream-1", "live", now).reason, "Ruhezeit");

const recent = Sub({ cooldown: 30, lastNotified: new Date(now.getTime() - 5 * 60_000) });
assert.equal(ShouldNotify(recent, "stream-9", "live", now).reason, "Cooldown");

const cooled = Sub({ cooldown: 30, lastNotified: new Date(now.getTime() - 45 * 60_000) });
assert.equal(cooled.lastNotified !== null && ShouldNotify(cooled, "stream-9", "live", now).notify, true, "nach dem Cooldown geht es wieder");

assert.equal(TemplateFor(Sub(), "live"), Sub().liveTemplate);
assert.equal(TemplateFor(Sub(), "video"), Sub().videoTemplate);

// ── Feed-Parser ────────────────────────────────────────────────────────────

assert.equal(Decode("Rock &amp; Roll &lt;3"), "Rock & Roll <3");
assert.equal(Decode("&#65;&#x42;"), "AB");
assert.equal(Tag("<title>Hallo</title>", "title"), "Hallo");
assert.equal(Tag("<title><![CDATA[Roh & Wild]]></title>", "title"), "Roh & Wild", "CDATA wird ausgepackt");
assert.equal(Tag("<nichts/>", "title"), null);
assert.equal(Attribute('<link rel="alternate" href="https://a.b"/>', "link", "href"), "https://a.b");

const ATOM = `<?xml version="1.0"?><feed>
<title>MecryTv</title>
<entry>
  <id>yt:video:ABC123</id><yt:videoId>ABC123</yt:videoId>
  <title>Neues Video &amp; mehr</title>
  <link rel="alternate" href="https://www.youtube.com/watch?v=ABC123"/>
  <published>2026-08-26T10:00:00+00:00</published>
  <media:group><media:thumbnail url="https://i.ytimg.com/vi/ABC123/hq.jpg" width="480"/></media:group>
</entry>
<entry><yt:videoId>OLD</yt:videoId><title>Alt</title><link href="https://x"/></entry>
</feed>`;

const atom = ParseFeed(ATOM);

assert.ok(atom, "der Atom-Feed muss gelesen werden");
assert.equal(atom.id, "ABC123", "yt:videoId hat Vorrang vor <id>");
assert.equal(atom.title, "Neues Video & mehr", "Entities werden aufgelöst");
assert.equal(atom.link, "https://www.youtube.com/watch?v=ABC123");
assert.equal(atom.thumbnail, "https://i.ytimg.com/vi/ABC123/hq.jpg");
assert.equal(atom.published?.getUTCHours(), 10);

const RSS = `<rss><channel><title>TikTok</title>
<item>
  <title><![CDATA[Mein Clip]]></title>
  <link>https://www.tiktok.com/@x/video/999</link>
  <guid>999</guid>
  <pubDate>Tue, 26 Aug 2026 09:00:00 GMT</pubDate>
  <description>&lt;img src="https://cdn/thumb.jpg"&gt;</description>
</item></channel></rss>`;

const rss = ParseFeed(RSS);

assert.ok(rss, "der RSS-Feed muss gelesen werden");
assert.equal(rss.id, "999", "guid ist die ID");
assert.equal(rss.title, "Mein Clip");
assert.equal(rss.thumbnail, "https://cdn/thumb.jpg", "das Bild steckt in der Beschreibung");

assert.equal(ParseFeed("<feed></feed>"), null, "ein leerer Feed ergibt nichts");
assert.equal(ParseFeed("kein xml"), null);
assert.equal(ParseFeed("<feed><entry><title>Ohne Link</title></entry></feed>"), null, "ohne Link ist der Eintrag wertlos");

// ── Platzhalter ────────────────────────────────────────────────────────────

const service = new NotifierService({ config: { YOUTUBE_API_KEY: "", TWITCH_CLIENT_ID: "", TWITCH_CLIENT_SECRET: "" } } as never);

const subscription = Sub({
    mentionRoleId: "5000",
    liveRoleId: "6000",
    discordUserId: "7000",
    sourceUrl: "https://www.twitch.tv/mecrytv",
});

const event: INotifierEvent = {
    kind: "live",
    id: "stream-1",
    title: "Wir bauen einen Bot",
    url: "https://www.twitch.tv/mecrytv",
    thumbnail: "https://cdn/preview.jpg",
    game: "Software and Game Development",
    viewers: 42,
    publishedAt: new Date(),
};

const context = service.Context(subscription, event);

assert.equal(service.Fill("{name} auf {platform}", context), "MecryTv auf Twitch");
assert.equal(service.Fill("{title}", context), "Wir bauen einen Bot");
assert.equal(service.Fill("{mention}", context), "<@&5000>");
assert.equal(service.Fill("{role}", context), "<@&6000>");
assert.equal(service.Fill("{discord}", context), "<@7000>");
assert.equal(service.Fill("{game} · {viewers}", context), "Software and Game Development · 42");
assert.equal(service.Fill("{GIBTSNICHT}", context), "{GIBTSNICHT}", "Unbekanntes bleibt stehen statt zu verschwinden");
assert.equal(service.Fill("{NAME}", context), "MecryTv", "Grossschreibung ist egal");

// Ohne Ping-Rolle darf keine leere Zeile mit Leerzeichen übrig bleiben.
const bare = service.Context(Sub(), event);
assert.equal(service.Fill("{mention} \n**{name}**", bare), "**MecryTv**", "leere Platzhalter hinterlassen keinen Müll");

for (const placeholder of PLACEHOLDERS) {
    assert.notEqual(
        service.Fill(placeholder.token, context),
        placeholder.token,
        `${placeholder.token} steht in der Liste, wird aber nicht ersetzt`
    );
}

// ── Nachricht ──────────────────────────────────────────────────────────────

const mentions = { roles: ["5000"], users: ["7000"] };

const plain = BuildNotification({ ...subscription, style: "text" }, event, "Hallo", mentions);

assert.equal(plain.content, "Hallo");
assert.equal(plain.flags, undefined, "Klartext trägt kein ComponentsV2-Flag");
assert.deepEqual(plain.allowedMentions, mentions);

const card = BuildNotification(subscription, event, "Hallo", mentions);

assert.ok(card.components && card.components.length === 1);
assert.equal(
    card.content,
    undefined,
    "eine ComponentsV2-Nachricht darf kein content tragen - Discord lehnt sie sonst ab"
);
assert.deepEqual(card.allowedMentions, mentions, "nur die eingestellte Rolle darf gepingt werden");

const json = JSON.stringify(card.components?.[0]);

assert.ok(json.includes("LIVE"), "das Live-Abzeichen fehlt");
assert.ok(json.includes("Software and Game Development"), "das Spiel fehlt");
assert.ok(json.includes("https://cdn/preview.jpg"), "das Vorschaubild fehlt");

const asVideo = JSON.stringify(BuildNotification(subscription, { ...event, kind: "video" }, "Hallo", mentions).components?.[0]);

assert.ok(asVideo.includes("NEU"), "ein Video bekommt kein Live-Abzeichen");

// ── Panel ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
    const configService = new ConfigService({ developerMode: false } as never);
    await configService.Initialize();

    assert.ok(configService.Has("notifier"), "src/config/notifier.json muss geladen werden");
    assert.equal(configService.Options("notifier", "styles").length, 2);
    assert.ok(configService.Options("notifier", "colors").length > 0);
    assert.ok(configService.Value("notifier", "tiktok_bridge", "").includes("{handle}"), "die Bridge braucht {handle}");

    const client = { config: { YOUTUBE_API_KEY: "", TWITCH_CLIENT_ID: "", TWITCH_CLIENT_SECRET: "" }, configService } as unknown as BotClient;
    const notifierService = new NotifierService(client);

    (client as { notifierService: NotifierService }).notifierService = notifierService;

    assert.equal(notifierService.Adapters.length, 3);
    assert.equal(notifierService.Adapter("youtube").Ready, true, "YouTube läuft auch ohne Key über RSS");
    assert.equal(notifierService.Adapter("twitch").Ready, false, "Twitch braucht zwingend Client-ID und Secret");
    assert.equal(notifierService.Adapter("tiktok").Ready, true, "TikTok braucht nur die Bridge aus der Config");

    const entries = [subscription, { ...Sub({ platform: "youtube", name: "EarthCraft", identifier: "UC123" }), lastError: "kaputt" }];
    const base = NewPanelState(GUILD, entries);

    let rendered = 0;

    function Render(overrides: Partial<INotifierState>): string {
        const view = RenderPanel(client, { ...base, ...overrides });

        assert.equal(view.components.length, 1);
        rendered++;

        return JSON.stringify(view.components[0]);
    }

    assert.ok(Render({ view: "home" }).includes("MecryTv"));
    assert.ok(Render({ view: "home" }).includes("Twitch"), "ein fehlender Key wird im Panel benannt");
    assert.ok(Render({ view: "add" }).includes("Plattform"));
    assert.ok(Render({ view: "entry", index: 0 }).includes("MecryTv"));
    assert.ok(Render({ view: "message", index: 0 }).includes("{title}"), "die Platzhalter stehen im Panel");
    assert.ok(Render({ view: "roles", index: 0 }).includes("Live-Rolle"));
    assert.ok(Render({ view: "options", index: 0 }).includes("Ruhezeit"));
    assert.ok(Render({ view: "status" }).includes("kaputt"), "der letzte Fehler steht im Status");

    // TikTok kennt keine Live-Rolle - das Panel darf sie gar nicht erst anbieten.
    const tiktok = [Sub({ platform: "tiktok", name: "Clips", identifier: "clips" })];
    const tikState = { ...NewPanelState(GUILD, tiktok), view: "roles" as const, index: 0 };

    assert.ok(!JSON.stringify(RenderPanel(client, tikState).components[0]).includes("liverole"), "TikTok darf keine Live-Rolle anbieten");
    rendered++;

    // Ein Entwurf hat Vorrang vor dem gespeicherten Eintrag.
    const draft = { ...base, view: "entry" as const, index: 0, draft: Sub({ name: "Entwurf" }), dirty: true };

    assert.ok(Render(draft).includes("Entwurf"), "der Entwurf muss angezeigt werden");
    assert.ok(Render(draft).includes("Ungespeicherte"), "ungespeicherte Änderungen werden gemeldet");

    // Ohne Einträge darf keine Ansicht ins Leere laufen.
    const empty = NewPanelState(GUILD, []);

    for (const view of ["home", "add", "entry", "message", "roles", "options", "status"] as const) {
        const result = RenderPanel(client, { ...empty, view });

        assert.equal(result.components.length, 1, `${view} ohne Einträge muss trotzdem rendern`);
        rendered++;
    }

    assert.equal(PanelStates.max, 50);

    console.log(
        `OK - Ruhezeit über Mitternacht, ${PLACEHOLDERS.length} Platzhalter, Feed-Parser für Atom und RSS, ` +
            `7 Melde-Regeln, kaputte Datenbankzeilen und ${rendered} Panel-Zustände verhalten sich korrekt`
    );
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
