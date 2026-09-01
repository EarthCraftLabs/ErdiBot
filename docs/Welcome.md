# Welcome

Willkommensnachrichten mit einer selbst gebauten Karte: Hintergrund aus der Galerie, beliebig viele Ebenen, 25 Schriftarten, Live-Vorschau beim Einrichten.

Zugriff über den Client: `this.client.welcomeService`.

---

## Die Bausteine

| Datei | Aufgabe |
|---|---|
| `src/commands/admin/Setup.ts` | `/setup` — öffnet die Auswahl |
| `src/builder/SetupPanel.ts` | Das Auswahl-Menü |
| `src/services/WelcomeService.ts` | Konfiguration laden/speichern, Schriften registrieren, Karte rendern |
| `src/builder/WelcomePanel.ts` | Zeichnet das Setup-Panel, hält dessen Zustand |
| `src/builder/WelcomeMessage.ts` | Baut die fertige Nachricht — für Testlauf **und** echten Beitritt |
| `src/events/welcome/WelcomeHandler.ts` | Bedient das Panel (Buttons, Selects, Modals) |
| `src/events/guild/GuildMemberAdd.ts` | Schickt sie beim Beitritt raus |
| `src/constants/Welcome.ts` | Standardkarte, Grenzen, Ankermathematik, Normalisierung |
| `src/config/welcome.json` | **Alle** Select-Optionen |
| `src/database/models/WelcomeConfig.ts` | Eine Zeile pro Server |
| `src/assets/fonts/` | 25 Schriftfamilien plus Lizenzen |

---

## Die drei Ausgabemodi

| Modus | Was rausgeht |
|---|---|
| `image` | Nur die gerenderte Karte als Anhang, ohne Text |
| `image_container` | Karte **und** ComponentV2-Container mit Titel und Text |
| `container` | Nur der Container — kein Canvas, keine Rendering-Kosten |

Der Modus entscheidet auch, ob das Panel überhaupt eine Vorschau rendert: bei `container` fällt sie weg.

---

## Das Setup

```
/setup
```

Im Menü **👋 Willkommen** wählen. Mit **⬅️ Setup** geht es von jeder Ansicht wieder zur Auswahl zurück.

`Administrator` vorausgesetzt, die Antwort ist ephemeral. Das Panel arbeitet auf einer **Arbeitskopie**: alles, was du änderst, landet erst mit **💾 Speichern** in der Datenbank. **↩️ Verwerfen** holt den gespeicherten Stand zurück, **🗑️ Zurücksetzen** löscht die Zeile und stellt die Standardkarte her.

Solange etwas offen ist, steht oben ein Hinweis — der Speichern-Knopf ist sonst ausgegraut.

### Select-Menüs zeigen keine Vorauswahl

Ein Select mit `default: true` lässt sich nicht noch einmal auf denselben Wert stellen — Discord meldet keine Änderung, und der Knopf fühlt sich kaputt an.
Beim Bauen einer Karte passiert genau das ständig: Farbe testen, weiterklicken, dieselbe Farbe nochmal.

Deshalb tragen die Selects **keine** Vorauswahl, sondern immer ihren Platzhaltertext. Was gerade eingestellt ist, steht im Text darüber:

> 🎨 **Farbe:** `#2B2D31` → `#5865F2`

**Eine Ausnahme:** die Bild-Auswahl. Dort ist gerade nicht ablesbar, welches Bild drinsteckt, also markiert der Select es —
und weist darauf hin, wenn das eingestellte Bild gar nicht mehr in der Galerie liegt.

### Die Ansichten

| Ansicht | Wofür |
|---|---|
| `home` | Kanal, Modus, An/Aus, Testlauf, Speichern |
| `card` | Format, Hintergrundbild, Farben, Verlauf, Abdunklung, Ecken |
| `layers` | Liste aller Ebenen, neue anlegen |
| `layer` | Eine Ebene bearbeiten — je nach Typ andere Optionen |
| `message` | Titel, Text und Akzentfarbe des Containers |
| `category` / `image` | Zwischenschritte beim Bild-Upload und der Galerie-Auswahl |

---

## Ebenen

Bis zu **12** Stück, gezeichnet von unten nach oben — die letzte liegt vorn. `🔼 Nach vorn` und `🔽 Nach hinten` schieben sie durch den Stapel.

| Typ | Kann |
|---|---|
| `text` | Schriftart, Grösse, Farbe, fett, kursiv, Ausrichtung, Schatten, Outline, Umbruchbreite |
| `avatar` | Profilbild des neuen Mitglieds, Kreis/abgerundet/eckig, Rahmenstärke und -farbe |
| `image` | Ein Bild aus der Galerie, Grösse und Eckenradius |
| `shape` | Rechteck, Kreis oder Linie als Akzent |

Jede Ebene hat zusätzlich Anker, Versatz, Deckkraft und einen Schalter zum Ausblenden.

### Positionieren ohne Drag & Drop

Discord kennt kein Ziehen. Stattdessen: **Anker plus Versatz**.

```ts
export function AnchorPoint(anchor: Anchor, card: IWelcomeCard): { x: number; y: number } {
    const [vertical, horizontal] = anchor.split("-");

    const x = horizontal === "left" ? 0 : horizontal === "right" ? card.width : card.width / 2;
    const y = vertical === "top" ? 0 : vertical === "bottom" ? card.height : card.height / 2;

    return { x, y };
}
```

Neun Ankerpunkte, dazu ein Versatz in Pixeln über das Modal. Der Vorteil gegenüber absoluten Koordinaten: eine Ebene an `bottom-right` bleibt unten rechts, auch wenn du die Karte später von 1024×400 auf 1200×480 umstellst.

---

## Die Vorschau

Jeder Klick im Panel rendert die Karte neu und hängt sie als `welcome.png` an die Nachricht. Der Container zeigt sie über `attachment://welcome.png`.

Gerendert wird mit einem **Beispielmitglied** (`MecryTv`, 1337 Mitglieder, Discord-Standardavatar) — deshalb braucht die Vorschau weder einen echten Beitritt noch Netzzugriff auf ein Profilbild.

Beim Aktualisieren geht immer `attachments: []` mit, sonst sammeln sich die alten Vorschaubilder an der Nachricht.

---

## Bilder

Hintergründe und Bild-Ebenen kommen aus dem **Galerie-System** — es gibt keinen zweiten Bilderspeicher.

**⬆️ Hochladen** fragt zuerst nach der Kategorie:

1. Vorhandene Kategorie aus dem Select wählen, oder **➕ Neue Kategorie** anlegen
2. Bild oder `https://`-Link in den Kanal posten (90 Sekunden Zeit)
3. Der Bot speichert es über `galleryService.AddImage()`, löscht deine Nachricht und setzt es ein

**🗃️ Aus Galerie** überspringt den Upload und zeigt direkt, was schon da ist.

Gespeichert wird in der Karte nur die **Zeilen-ID** des Galerie-Bildes. Beim Rendern löst der Service sie auf und prüft dabei, dass das Bild dieser Guild oder dem Default-Scope gehört — sonst könnte eine fremde ID Bilder aus einem anderen Server auf die Karte holen. Ist das Bild inzwischen gelöscht, fällt die Karte still auf den Farbverlauf zurück.

---

## Schriftarten

25 Familien liegen als TTF in `src/assets/fonts/`, dazu ihre Lizenzen in `src/assets/fonts/licenses/`. Alles OFL oder Apache-2.0, geladen aus dem `google/fonts`-Repository.

```bash
npm run fonts
```

Das Skript liest die Familienliste in `src/scripts/DownloadFonts.ts`, holt pro Familie die Regular-Datei plus Lizenz und schreibt `manifest.json`. Die Dateien liegen im Repo — nach dem Klonen läuft alles ohne weiteren Schritt.

`WelcomeService.Initialize()` registriert sie beim Start:

```ts
GlobalFonts.registerFromPath(path.join(FONT_ROOT, font.regular), font.family);
```

**Fett und kursiv brauchen keine eigenen Dateien.** Die meisten Familien liegen bei Google nur noch als Variable Font vor, ohne statischen Bold-Schnitt. Skia synthetisiert beides aus dem Regular — nachgemessen, `bold 48px Montserrat` ist breiter als `48px Montserrat`. Ein Schnitt pro Familie reicht also, und alle 25 verhalten sich gleich.

Wählt jemand eine Schrift, die nicht auf der Platte liegt, fällt der Renderer auf `Montserrat` zurück statt auf Skias namenlose Standardschrift.

---

## Die Karte in der Datenbank

Eine Zeile pro Server, die Karte selbst als JSON-Spalte:

| Spalte | Inhalt |
|---|---|
| `guildId` | Eindeutig, ein Setup pro Server |
| `enabled`, `channelId`, `mode` | Ob, wohin, wie |
| `title`, `message`, `accent` | Der Container |
| `card` | JSON: Format, Hintergrund, Farben und alle Ebenen |

### Warum alles durch `NormalizeCard()` läuft

Eine JSON-Spalte hat kein Schema. Was von dort kommt, kann eine ältere Version sein, eine Handbearbeitung in phpMyAdmin oder schlicht kaputt. Deshalb läuft die Karte **beim Laden und beim Speichern** durch dieselbe Normalisierung:

```ts
assert.equal(NormalizeCard({ width: 99999, color: "kaputt" }).width, 2000);
assert.equal(NormalizeCard(null).layers.length, 3);
```

Unbekannte Ebenentypen werden Text, Zahlen werden geklemmt, ungültige Farben fallen auf den Standard zurück, `null` und Strings in der Ebenenliste fliegen raus. Der Renderer bekommt damit immer eine vollständige Karte und braucht selbst keine Prüfungen.

---

## Alle Select-Optionen liegen in der Config

`src/config/welcome.json` hält zwölf Listen: `fonts`, `modes`, `layers`, `anchors`, `aligns`, `effects`, `avatars`, `shapes`, `fits`, `presets`, `colors`, `placeholders`.

```json
{ "name": "Bebas Neue", "description": "Display · Bebas Neue", "value": "Bebas Neue", "emoji": "🅰️" }
```

Der `ConfigService` lädt, validiert und liefert sie:

```ts
client.configService.Options(CONFIG_KEY, "fonts");
```

Das Schema steht in `CONFIG_SCHEMAS.welcome` — ein Tippfehler fällt damit beim Start auf, nicht erst im Panel. Im Dev-Modus wird die Datei überwacht: neue Farbe eintragen, speichern, Panel neu öffnen, fertig — kein Neustart.

Eine Farbe hinzufügen heisst also: eine Zeile JSON. Kein TypeScript anfassen.

---

## Platzhalter

Siebzehn Stück, gültig in Kartentexten **und** im Container:

| Mitglied | Server | Zeit |
|---|---|---|
| `{user}` | `{server}` | `{date}` |
| `{username}` | `{membercount}` | `{time}` |
| `{displayname}` | `{ordinal}` | `{created}` |
| `{tag}` | `{boosts}` | `{accountage}` |
| `{id}` | `{tier}` | |
| | `{channels}` | |
| | `{roles}` | |
| | `{emojis}` | |

`{ordinal}` ist die Mitgliederzahl als `42.`, `{accountage}` das Kontoalter in Tagen, `{tier}` die Boost-Stufe.
Die vollständige Liste mit Beschreibungen steht in `src/config/welcome.json` und hinter dem Knopf **🔣 Platzhalter** im Panel.

Gross-/Kleinschreibung ist egal, Unbekanntes bleibt unverändert stehen — `{gibtsnicht}` wird nicht zu einer leeren Stelle.

### `{user}` verhält sich je nach Ziel anders

Eine Erwähnung ist `<@123…>` — Discord löst das im Chat auf, eine Canvas-Karte aber nicht. Dort stünde die rohe ID.
Deshalb kennt `Fill()` einen `plain`-Modus, den nur der Renderer benutzt:

```ts
service.Fill("{user}", context);        // "<@1059621019947634739>"  → Container
service.Fill("{user}", context, true);  // "@MecryTv"                → Karte
```

---

## Fallen

- **Ohne Kanal wird nicht gespeichert**, wenn das System aktiv ist — das Panel meckert stattdessen.
- **Die Vorschau kostet Rechenzeit.** Jeder Klick rendert neu. Bei `container` entfällt das komplett.
- **`{ordinal}` zählt `guild.memberCount`**, also den Stand *nach* dem Beitritt.
- **Bild-IDs sind an die Guild gebunden.** Ein Bild aus einem anderen Server wird beim Rendern übersprungen, nicht gezeichnet.
- **Der Avatar kommt über HTTP.** Fällt der Abruf aus, fehlt nur die Avatar-Ebene — die Karte selbst kommt trotzdem.
- **12 Ebenen sind Schluss.** Darüber wird der Select zum Anlegen ausgeblendet.

---

## Checks

```bash
npm test
```

`Welcome.test.ts` prüft: Farbvalidierung, Klemmen, Ankermathematik, die Normalisierung gegen absichtlich kaputtes JSON, alle Platzhalter, Anlegen/Verschieben/Löschen von Ebenen, drei echt gerenderte PNGs samt Abmessungen, dass jede Schrift aus der Config auch auf der Platte liegt, 14 Panel-Zustände gegen die Component-Limits und alle drei Ausgabemodi.

Zwei Prüfungen halten die Config und den Code zusammen: jeder Platzhalter aus `welcome.json` muss von `Fill()` auch wirklich ersetzt werden,
und keine Options-Liste darf eine Vorauswahl mitbringen.
