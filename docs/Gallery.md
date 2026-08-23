# Gallery

Bildverwaltung für den Bot: Dateien liegen auf der Platte, MariaDB hält den Index, ein Fastify-Server liefert sie unter einer öffentlichen URL aus.

Zugriff überall über den Client: `this.client.galleryService` (in Commands und Events), bzw. `client.galleryService`.

---

## Die Bausteine

| Datei | Aufgabe |
|---|---|
| `src/services/GalleryService.ts` | Kategorien und Bilder lesen, anlegen, verschieben, löschen |
| `src/Server.ts` + `src/routes/Images.ts` | Liefert `src/images` unter `/images/*` aus |
| `src/builder/GalleryPanel.ts` | Zeichnet das `/gallery`-Panel, hält dessen Zustand |
| `src/events/client/InteractionHandler.ts` | Bedient das Panel (Buttons, Selects, Modal) |
| `src/constants/Gallery.ts` | Pfad-Auflösung, Sanitizing, Host-Filter — ohne Abhängigkeiten |
| `src/utils/galleryOptions.ts` | Gemeinsames Autocomplete aller Bild-Commands |
| `src/database/models/GalleryImage.ts` | Ein Bild |
| `src/database/models/GalleryCategory.ts` | Ein Ordner (auch ein leerer) |

---

## Ablauf beim Start

1. `BotClient.Init()` startet den `Server` sofort — der braucht keine Datenbank.
2. Nach `database.Connect()` läuft `galleryService.Initialize()`.
3. `Initialize()` legt `src/images/default` an und ruft `SyncDefaults()`.
4. `SyncDefaults()` liest den Ordner einmal ein, upsertet alles nach MariaDB und löscht Einträge zu Dateien, die es nicht mehr gibt.

Ab da ist **die Datenbank die einzige Quelle** für alle Lesezugriffe — auch für die mitgelieferten Bilder. Deshalb gibt es keinen zweiten Codepfad für Default gegen Custom.

---

## Wo die Bilder liegen

```
src/images/
├── default/                    ← kommt mit dem Repo, schreibgeschützt
│   └── rocketleague/
│       ├── logo.png
│       └── ranks/
│           └── gc.png
├── privacy/                    ← kommt mit dem Repo, für die Commands unsichtbar
│   └── Welcome_Card.png
└── 1162553851187040326/        ← eine Guild-ID, per Upload gefüllt
    └── memes/
        └── katze.png
```

Genau **zwei Ebenen**: Kategorie und optional eine Unterkategorie. Tiefer wird nicht gescannt.

`privacy/` fällt aus diesem Schema heraus: der Ordner wird **nicht** gescannt und steht in keiner Tabelle.
Er ist für feste Bot-Bilder da, die kein Nutzer über die Gallery-Commands sehen oder löschen soll —
abgerufen wird er nur aus dem Code über [`Asset()`](#feste-bilder-aus-dem-code).

Die `.gitignore` hält es so, dass die mitgelieferten Bilder im Repo landen und Guild-Uploads nicht:

```
/src/images/*
!/src/images/default
!/src/images/privacy
```

`GALLERY_ROOT` wird über `process.cwd()` aufgelöst, nicht über `__dirname` — sonst zeigte der Pfad im Build nach `dist`. Der Bot muss also aus dem Projekt-Root gestartet werden (`npm run dev` / `npm start`), und beim Deploy muss `src/images` mit auf den Server.

### Die zwei Collections

```ts
// GalleryImage
{ guildId, category, subcategory, file, createdAt }

// GalleryCategory
{ guildId, name, parent, createdAt }
```

`guildId` ist entweder eine Snowflake oder `"default"`. Bei `GalleryCategory` bedeutet `parent: null` eine Hauptkategorie.

Zwei Collections statt einer, weil eine **leere** Kategorie sonst nicht existieren könnte — du legst ja erst den Ordner an und lädst danach hinein.

Beide sind gecacht (Standard des `DatabaseConnection`): leselastig, selten geschrieben.

---

## Die Commands

| Command | Wofür |
|---|---|
| `/gallery` | Das Panel — ansehen, hochladen, verschieben, löschen, Kategorien verwalten |
| `/viewimages [kategorie] [unterkategorie]` | Ohne Optionen öffnet das Panel, mit Kategorie direkt die Galerie |
| `/uploadimage kategorie [bild] [url] [unterkategorie] [name]` | Ein Bild per Anhang oder URL |
| `/deleteimage bild` | Ein Bild, mit Rückfrage |
| `/moveimage bild ziel-kategorie [ziel-unterkategorie]` | Ein Bild umhängen |
| `/manageimagecategories erstellen \| loeschen \| liste` | Kategorien ohne Panel |

Alle brauchen `Administrator`. Die Optionen `kategorie`, `unterkategorie`, `ziel-kategorie`, `ziel-unterkategorie` und `bild` sind durchgehend **Autocomplete** — es gibt keine Modal-Kaskaden.

---

## Das Panel

`/gallery` schickt eine ephemere ComponentV2-Nachricht, die sich bei jedem Klick selbst neu zeichnet.

```
🖼️ | Galerie
⭐ Server › rocketleague › ranks
✅ 4 Bild(er) hochgeladen
────────────────────────────
[ Media-Galerie: bis zu 10 Bilder ]
12 Bild(er) · Seite 1 von 2
────────────────────────────
📁 Kategorie wählen...        ▾
📂 Unterordner wählen...      ▾
[◀️ Zurück] [▶️ Weiter]
[⬆️ Hochladen] [🗑️ Bilder löschen] [📦 Verschieben] [🔄 Aktualisieren]
[➕ Kategorie anlegen] [➖ Kategorie löschen]
```

### Zustand

Der Zustand liegt **im Speicher**, nicht in der customId — die ist auf 100 Zeichen begrenzt und liefe mit Guild-ID, Kategorie, Unterordner und Seite über.

```ts
import { PanelStates, NewPanelState, RenderPanel } from "../builder/GalleryPanel";

const state = NewPanelState(interaction.guildId);
const view = await RenderPanel(client, state);

// Der Schlüssel ist die Nachrichten-ID - nur so findet der Handler den Zustand wieder
PanelStates.set(message.id, state);
```

`PanelStates` ist eine `LRUCache` mit 200 Einträgen und 30 Minuten TTL. Ein vergessenes Panel verfällt von selbst, ein aktives wird bei jeder Interaktion neu geschrieben. Nach einem Neustart oder Ablauf antwortet der Handler mit „Panel abgelaufen".

### Modi

| Modus | Was passiert |
|---|---|
| `browse` | Blättern, navigieren, Aktionen starten |
| `delete` | Multi-Select über bis zu 25 Bilder, dann Bestätigen |
| `move` | Erst Bild wählen, dann zum Zielordner navigieren und „📥 Hierher verschieben" |

Verschieben nutzt bewusst die normale Navigation als Zielauswahl, statt ein eigenes Menü zu bauen.

### Multi-Upload

**⬆️ Hochladen** setzt das Panel auf Warten und sammelt **eine** Nachricht mit Anhängen aus dem Kanal (90 Sekunden, Discord erlaubt 10 Anhänge pro Nachricht). Jede Datei läuft einzeln durch `AddImage()` — eine kaputte bricht den Rest nicht ab, sie landet in der Übersprungen-Zählung. Die Upload-Nachricht wird danach gelöscht.

### customIds

Alles unter dem Präfix `gallery:panel`:

```
gallery:panel:cat | :sub | :pick          Select-Menüs
gallery:panel:prev | :next                Blättern
gallery:panel:upload | :delete | :move    Aktion starten
gallery:panel:confirm | :cancel           Aktion abschliessen
gallery:panel:movehere                    Ziel bestätigen
gallery:panel:newcat | :delcat            Kategorien
gallery:panel:refresh                     Neu zeichnen
gallery:panel:newcat:<messageId>          Modal
```

Der `InteractionHandler` reagiert **nur** auf dieses Präfix. Buttons anderer Commands (Blättern in `/viewimages`, Bestätigen in `/deleteimage`) laufen über eigene Collectors — würde der Handler sie mitbeantworten, gäbe es `40060 Interaction has already been acknowledged`.

---

## Der Service

| Methode | Gibt zurück |
|---|---|
| `GetCategories(guildId, { requireImages })` | Hauptkategorien der Guild **und** aus `default` |
| `GetSubcategories(guildId, category, { requireImages })` | Unterordner einer Kategorie |
| `GetImages(target)` | Alle Bilder eines Ordners, nach Dateiname sortiert |
| `GetImage(id)` | Ein Bild über seine Zeilen-ID |
| `SearchImages(guildId, query, { includeDefault, limit })` | Max. 25 Treffer — für Autocomplete gebaut |
| `Attach(images)` | `{ media, files }` für eine Nachricht (siehe unten) |
| `Asset(assetPath)` | `{ media, files }` für **ein festes Bild** aus dem Code, ohne Datenbank |
| `CreateCategory(target)` | `boolean` — `false`, wenn es sie schon gibt |
| `DeleteCategory(target)` | Anzahl gelöschter Bilder |
| `AddImage(target, url, fileName?)` | Den fertigen `IGalleryEntry`, **wirft** bei Problemen |
| `MoveImage(id, folder)` | `boolean` |
| `DeleteImage(id)` | `boolean` |

`requireImages` ist standardmäßig `true` und blendet leere Ordner aus. Für Upload- und Verwaltungs-UIs auf `false` setzen, sonst siehst du den Ordner nicht, den du gerade angelegt hast.

### Ein Bild

```ts
interface IGalleryEntry {
    guildId: string;          // Snowflake oder "default"
    category: string;
    subcategory: string | null;
    file: string;             // "gc.png"
    createdAt: Date;

    id: string;               // Zeilen-ID - der Wert für Selects und Autocomplete
    url: string;              // https://bot.ascension-dach.org/images/…/gc.png
    path: string;             // "Ascension/rocketleague/ranks/gc.png"  (mit Guild-Namen)
    shortPath: string;        // "rocketleague/ranks/gc.png"            (ohne Scope)
}
```

Select-Werte sind immer die **`id`**, nie ein Pfad: Discord begrenzt Werte auf 100 Zeichen, eine Zeilen-ID ist eine kurze Zahl.

### Beispiele

```ts
// Alle Bilder eines Ordners
const images = await this.client.galleryService.GetImages({
    guildId: interaction.guildId,
    category: "rocketleague",
    subcategory: "ranks",
});
```

```ts
// Hochladen - wirft mit einer Meldung, die direkt an den Nutzer gehen kann
try {
    const image = await this.client.galleryService.AddImage(
        { guildId: interaction.guildId, category: "memes", subcategory: null },
        attachment.url,
        attachment.name
    );
} catch (error) {
    // "Nur https-URLs werden akzeptiert." / "Bild ist größer als 8 MB." / …
}
```

```ts
// Kategorie anlegen (nur in der eigenen Guild, nie in "default")
const created = await this.client.galleryService.CreateCategory({
    guildId: interaction.guildId,
    category: "memes",
    subcategory: "katzen",
});
```

---

## Bilder in eine Nachricht bekommen

**Nicht** `image.url` direkt in `.gallery()` stecken. Im Dev-Modus zeigt die URL auf `localhost`, und das kann Discord nicht laden — die Galerie bliebe leer.

```ts
const { media, files } = this.client.galleryService.Attach(images);

await interaction.reply({
    ...new ComponentV2Builder()
        .title("🖼️ | Galerie")
        .separator()
        .gallery(...media)
        .toMessage({ ephemeral: true }),
    files,
});
```

`Attach()` liefert in Produktion die echten URLs und `files: []`, im Dev-Modus `attachment://`-URLs plus die passenden `AttachmentBuilder`. Der aufrufende Code merkt davon nichts.

Beim **Bearbeiten** einer Nachricht zusätzlich `attachments: []` mitgeben, sonst sammeln sich die Anhänge der vorherigen Seite an:

```ts
await interaction.update({ ...view, flags: MessageFlags.IsComponentsV2, attachments: [] });
```

### Feste Bilder aus dem Code

Für Bilder, die fest zum Bot gehören — Willkommenskarte, Transcript-Banner, Panel-Header — gibt es `Asset()`.
Es nimmt einen Pfad relativ zu `src/images` statt einer Zeilen-ID und fragt die Datenbank gar nicht erst:

```ts
const { media, files } = await this.client.galleryService.Asset("privacy/Welcome_Card.png");

await channel.send({
    ...new ComponentV2Builder()
        .title("👋 | Willkommen")
        .gallery(...media)
        .toMessage(),
    files,
});
```

Rückgabe ist dasselbe `{ media, files }` wie bei `Attach()`, inklusive Dev-Modus-Umschaltung — in Produktion die Web-URL, im Dev-Modus ein `attachment://`. Der Anhang heißt nach dem vollen Pfad (`privacy_Welcome_Card.png`), damit zwei gleichnamige Dateien aus verschiedenen Ordnern nicht kollidieren.

Der Pfad läuft durch dieselbe `ResolveImagePath()`-Prüfung wie die HTTP-Route: kein Ausbruch aus `src/images`, nur erlaubte Bild-Endungen. Fehlt die Datei, kommt `{ media: [], files: [] }` plus eine Warnung im Log — ein vergessenes Bild reißt also keinen Command mit.

```ts
await gallery.Asset("privacy/Welcome_Card.png");        // versteckt, nur aus dem Code
await gallery.Asset("default/rocketleague/ranks/gc.png"); // geht auch, ist aber zusätzlich im Panel sichtbar
```

---

## Der Server

| Route | Antwort |
|---|---|
| `GET /dcapi/health` | `{ status: "ok", uptime }` |
| `GET /images/*` | Die Datei, oder 403 / 404 |

Lauscht auf `0.0.0.0:SERVER_PORT`. `/images/*` ist bewusst ohne Token erreichbar, alle anderen Routen verlangen einen - Details in [Server.md](Server.md). Die Basis-URL kommt aus `Server.BaseURL`:

- Dev (`--dev`): `http://localhost:<SERVER_PORT>`
- Produktion: `SERVER_PUBLIC_URL` aus der `config.json`

```json
"SERVER_PORT": 3000,
"SERVER_PUBLIC_URL": "https://bot.ascension-dach.org"
```

Damit Discord die Bilder rendern kann, muss ein Reverse Proxy die Domain auf den Port legen. Testen mit `https://bot.ascension-dach.org/health`.

Kein `@fastify/static` — der Handler sind 20 Zeilen, und die Pfadprüfung bräuchtest du ohnehin selbst.

---

## Sicherheit

Alles Sicherheitsrelevante liegt in `src/constants/Gallery.ts`, ohne Abhängigkeiten und damit einzeln testbar.

| Funktion | Verhindert |
|---|---|
| `ResolveImagePath(relative)` | `../`-Ausbrüche und absolute Pfade — erst `resolve()`, dann Wurzel prüfen. Gibt `null` statt eines Pfads ausserhalb |
| `SanitizeName(value)` | Pfadwechsel über Ordner- und Dateinamen. Erlaubt nur `a-z0-9_-`, max. 32 Zeichen |
| `IsScope(value)` | Fremde Werte als Verzeichnisnamen. Nur Snowflakes und `"default"` |
| `IsPrivateHost(hostname)` | Downloads ins eigene Netz (`127.0.0.1`, `10.x`, `169.254.169.254`, `::1`, `*.local` …) |
| `ParseSource(url)` | Alles ausser `https` |

Beim Download zusätzlich:

- **8 MB Limit**, mitgezählt beim Streamen — `maxContentLength` von axios greift nur, wenn der Server einen `Content-Length`-Header schickt
- **15 Sekunden Timeout**, max. 3 Redirects
- **Dateityp aus dem `Content-Type` der Antwort**, nicht aus der URL — eine URL auf `.png` sagt nichts darüber, was ankommt
- Bei einem Abbruch wird die halbe Datei wieder gelöscht

Kein Schutz gegen DNS-Rebinding — reicht, solange nur Administratoren Uploads auslösen.

---

## Autocomplete in eigenen Commands

```ts
import GalleryAutoComplete, { ParseCategory } from "../../../utils/galleryOptions";

async AutoComplete(interaction: AutocompleteInteraction): Promise<void> {
    await GalleryAutoComplete(interaction, { includeDefault: false, requireImages: false });
}
```

Erwartete Optionsnamen: `kategorie`, `unterkategorie`, `ziel-kategorie`, `ziel-unterkategorie`, `bild`.

| Option | Wert |
|---|---|
| `kategorie`, `ziel-kategorie` | `"<guildId>:<name>"` → mit `ParseCategory()` zerlegen |
| `unterkategorie`, `ziel-unterkategorie` | Nur der Name — die Ebene darüber steht schon in der Kategorie-Option |
| `bild` | Die Zeilen-ID |

```ts
const target = ParseCategory(interaction.options.getString("kategorie", true));
if (!target || target.guildId !== interaction.guildId) {
    // "default" oder eine fremde Guild - Schreibzugriff verweigern
}
```

`includeDefault: false` blendet die Default-Kategorien aus. Für alles Schreibende richtig, sonst schlägst du dem Nutzer Ordner vor, die er nicht anfassen darf.

Damit Autocomplete überhaupt ankommt, routet der `CommandHandler` `isAutocomplete()` an `Command.AutoComplete()`. Fehler landen dort nur im Log — das 3-Sekunden-Fenster ist zu kurz für einen Guardian-Report.

---

## Fallen

- **`Attach()` nicht vergessen.** `image.url` direkt in `.gallery()` funktioniert im Dev-Modus nicht.
- **Beim `editReply` kein `ephemeral` mitschicken.** Nach einem `deferReply` steht das Flag fest, Discord lehnt Änderungen ab. `toMessage()` ohne Argument nehmen.
- **`attachments: []` beim Bearbeiten**, sonst wachsen die Anhänge mit jeder Seite.
- **Gleicher Dateiname überschreibt.** Ein Upload mit bereits vergebenem Namen ersetzt die Datei und behält den DB-Eintrag.
- **Der Default-Scope ist schreibgeschützt.** `CreateCategory`, `AddImage`, `MoveImage` und `DeleteImage` lehnen `guildId: "default"` ab.
- **Select-Menüs fassen 25 Optionen.** Kategorien, Unterordner und Bildlisten werden abgeschnitten, das Panel weist darauf hin.
- **Datenbank weg heisst nicht Fehler.** `CommandHandler` und `InteractionHandler` prüfen `client.database.IsReady` und antworten mit „Datenbank nicht erreichbar", statt den Guardian zu alarmieren.

---

## Checks

```bash
npm test
```

Deckt ab: die Sicherheitsregeln (`Gallery.test.ts`), das Rendern des Panels in 11 Zuständen gegen die Component-Limits (`GalleryPanel.test.ts`) und die Auslieferung samt Ausbruchsversuchen über echtes HTTP (`Server.test.ts`).
