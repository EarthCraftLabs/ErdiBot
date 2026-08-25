# ReactionRoles

Rollen, die sich Mitglieder selbst geben: eine ComponentV2-Nachricht mit Buttons oder einem Auswahlmenü, pro Eintrag ein eigenes Emoji — Unicode oder ein Emoji des Servers.

Zugriff über den Client: `this.client.reactionRolesService`.

---

## Die Bausteine

| Datei | Aufgabe |
|---|---|
| `src/builder/SetupPanel.ts` | Meldet das Modul beim `/setup`-Hub an ([Setup](Setup.md)) |
| `src/services/ReactionRolesService.ts` | Panels laden/speichern, veröffentlichen, Rollen setzen |
| `src/builder/ReactionRolesPanel.ts` | Zeichnet das Setup-Panel, hält dessen Zustand |
| `src/builder/ReactionRolesMessage.ts` | Baut die **veröffentlichte** Nachricht |
| `src/services/GalleryService.ts` | Liefert die Bilder für Thumbnail und grosses Bild ([Gallery](Gallery.md)) |
| `src/events/reactionroles/ReactionRolesHandler.ts` | Bedient das Setup (Buttons, Selects, Modals) |
| `src/events/reactionroles/ReactionRolesClaim.ts` | Vergibt die Rollen, wenn jemand klickt |
| `src/constants/ReactionRoles.ts` | Grenzen, Emoji-Erkennung, Rollen-Logik, Normalisierung |
| `src/config/reactionroles.json` | Alle Select-Optionen |
| `src/database/models/ReactionRolePanel.ts` | Eine Zeile pro Panel |

---

## Zwei Nachrichten, zwei Präfixe

| Präfix | Wo | Wer darf |
|---|---|---|
| `rr:panel` | Setup-Panel (ephemeral) | Administratoren |
| `rr:claim` / `rr:pick` | Veröffentlichte Nachricht | alle |

Das trennt sauber: das Setup lebt in einem LRU-Zustand und läuft nach 30 Minuten ab, die veröffentlichte Nachricht liest ihr Panel bei **jedem** Klick frisch aus der Datenbank (Repository-Cache davor). Sie funktioniert deshalb auch nach einem Neustart noch.

---

## Das Setup

```
/setup  →  🎭 Reaktionsrollen
```

```
Übersicht          alle Panels des Servers, 🟢 veröffentlicht / ⚪ Entwurf
   └─ Panel        Kanal, Anzeige, Vergabe, Farbe, Rollenliste
        ├─ Eintrag Rolle, Emoji, Beschriftung, Button-Farbe, Reihenfolge
        └─ Bilder   Thumbnail und grosses Bild
             └─ Galerie   Auswahl aus der Bildergalerie
```

Wie beim Welcome-Setup wird auf einer **Arbeitskopie** gearbeitet: Änderungen landen erst mit **💾 Speichern** in der Datenbank, **↩️ Verwerfen** holt den gespeicherten Stand zurück.

**Speichern aktualisiert eine bereits veröffentlichte Nachricht automatisch mit** — sonst würde im Kanal ein alter Stand mit Buttons stehen, die auf gelöschte Einträge zeigen.

| Knopf | Was passiert |
|---|---|
| 🚀 Veröffentlichen | Postet die Nachricht oder aktualisiert die vorhandene |
| 🚫 Nachricht entfernen | Löscht die Nachricht, das Panel bleibt als Entwurf |
| 🗑️ Panel löschen | Nachricht **und** Datenbankzeile weg |

Ein Kanalwechsel setzt `messageId` zurück: die alte Nachricht bleibt stehen, wird aber nicht mehr angefasst — im Panel steht ein Hinweis.

---

## Aussehen der Nachricht

| Knopf | Was er setzt |
|---|---|
| 📝 Titel & Text | Überschrift und der Absatz darunter |
| 🖼️ Bilder | Öffnet die Bilder-Ansicht: **Thumbnail** (klein, rechts neben dem Text) und **grosses Bild** (volle Breite unter den Rollen) |
| 🎨 Akzentfarbe | Der farbige Balken links — inklusive Option **🚫 Keine Farbe** |

Ohne Thumbnail sind Titel und Text zwei normale Textblöcke; mit Thumbnail werden sie zu einer Section, denn nur die trägt ein Bild daneben.

### Bilder: Galerie oder eigene Adresse

Jedes der beiden Felder hat drei Knöpfe:

| Knopf | Was er tut |
|---|---|
| 🗃️ Galerie | Auswahl aus der [Galerie](Gallery.md) des Servers (inklusive Default-Bilder) |
| 🔗 URL | Modal für eine eigene `https`-Adresse — leer lassen entfernt das Bild |
| 🚫 entfernen | Setzt das Feld auf nichts |

Gespeichert wird in beiden Fällen ein String: entweder die Adresse (beginnt mit `https://`) oder die **ID des Galerie-Bildes**. Verwechseln kann man die beiden nicht — Galerie-IDs sind Zahlen.

Aufgelöst wird erst beim Senden, in `ReactionRolesService.Media()`:

```ts
const media = await this.Media(panel);
const message = { ...BuildReactionRoles(panel, guild, media), files: media.files };
```

Für Galerie-Bilder übernimmt das `GalleryService.Attach()` — und das entscheidet nach Modus:

| Modus | Was in der Nachricht steht |
|---|---|
| Produktion | Die öffentliche Adresse des Bot-Servers, kein Anhang |
| Entwicklung | `attachment://…` plus Datei, weil Discord `localhost` nicht laden kann |

Ein Galerie-Bild, das gelöscht wurde, fällt beim Senden einfach weg — die Nachricht bleibt heil. In der Bilder-Ansicht steht dann ⚠️ *dieses Galerie-Bild gibt es nicht mehr*.

> **Discord-Anhänge taugen nicht als eigene Adresse.** Links auf `cdn.discordapp.com/attachments/…` tragen seit einer Weile eine Signatur mit Ablaufdatum — nach ein paar Stunden ist das Bild weg. Nimm die Galerie oder eine dauerhafte Quelle.

Eine ungültige Adresse lässt den alten Wert stehen und meldet das, statt ihn still zu löschen.

---

## Die drei Vergabe-Modi

| Modus | Klick auf eine Rolle, die man **nicht** hat | Klick auf eine, die man **hat** |
|---|---|---|
| `toggle` — Mehrfach | Rolle dazu | Rolle weg |
| `unique` — Nur eine | Rolle dazu, andere Rollen **dieses Panels** weg | Rolle weg |
| `verify` — Nur vergeben | Rolle dazu | passiert nichts |

Beim Auswahlmenü ersetzt die Auswahl den bisherigen Stand des Panels: was nicht mehr markiert ist, wird abgegeben (`verify` nimmt nie etwas weg, `unique` erlaubt nur eine Markierung).

### Das Menü setzt sich nach jeder Auswahl zurück

Ein Select behält seine Auswahl im Client. Dieselbe Option ein zweites Mal anzuklicken wäre für Discord keine Änderung — es käme keine Interaktion mehr an, und das Menü fühlt sich kaputt an.

Deshalb läuft ein Menü-Klick über `deferUpdate()`: erst werden die Rollen gesetzt, dann wird die Nachricht neu geschrieben (das leert das Menü für alle), und die Rückmeldung kommt als eigene ephemere Nachricht per `followUp()`. Button-Klicks brauchen das nicht — Knöpfe haben keinen Zustand — und antworten weiterhin direkt.

Der Preis ist ein zusätzlicher Edit pro Menü-Klick. Für ein Rollen-Panel ist das unkritisch; sollte ein Panel jemals in einen Edit-Rate-Limit laufen, wäre der Ausweg, den Reset nur bei `unique` zu machen.

Rollen **ausserhalb** des Panels bleiben in jedem Fall unberührt — die Logik bekommt die Panel-Rollen als Filter mit:

```ts
ResolveClick("unique", ["r2", "adminrolle"], ["r1", "r2", "r3"], "r1")
// { add: ["r1"], remove: ["r2"] }
```

Beide Funktionen (`ResolveClick`, `ResolveSelect`) sind reine Funktionen in `constants/ReactionRoles.ts` und ohne Discord testbar.

---

## Emojis

Das Modal hinter **😀 Emoji setzen** nimmt vier Schreibweisen:

| Eingabe | Ergebnis |
|---|---|
| `👍`, `👍🏽`, `🇩🇪`, `1️⃣`, `👨‍👩‍👧` | Unicode-Emoji |
| `earthcraft` | Server-Emoji über den Namen, Gross/klein egal |
| `:earthcraft:` | dasselbe |
| `<a:hype:222…>` | Server-Emoji über die ID, animiert inklusive |

Gespeichert wird `{ id, name, animated }`. Alles, was der Bot nicht wirklich benutzen kann, wird **abgelehnt** statt gespeichert — ein unbekanntes Emoji würde Discord beim Bauen der Buttons ablehnen und damit das ganze Panel unbrauchbar machen.

Aus demselben Grund prüft `UsableEmoji()` beim Rendern, ob ein Server-Emoji noch existiert. Wurde es gelöscht, erscheint der Knopf ohne Emoji statt gar nicht.

---

## Rollen, die nicht gehen

`Issue(guild, roleId)` liefert den Grund im Klartext oder `null`:

- `gelöscht`
- `@everyone geht nicht`
- `wird von einer Integration verwaltet` (Bot- und Booster-Rollen)
- `mir fehlt „Rollen verwalten“`
- `liegt über meiner höchsten Rolle`

Die Prüfung läuft an drei Stellen:

1. **Beim Eintragen** — `@everyone` und Integrationsrollen werden abgelehnt, alles andere kommt mit Warnung rein (die Hierarchie lässt sich ja noch reparieren).
2. **Beim Rendern des Setups** — betroffene Einträge stehen mit ⚠️ und Grund in der Liste.
3. **Beim Klick** — betroffene Rollen werden übersprungen, das Mitglied bekommt den Grund ephemeral zu sehen. Der Rest der Auswahl geht trotzdem durch.

---

## Grenzen

| Grenze | Wert | Warum |
|---|---|---|
| Panels pro Server | 25 | Select-Limit der Übersicht |
| Rollen pro Panel | 25 | Select-Limit, und 5 Button-Reihen à 5 |
| Beschriftung | 80 | Discord-Limit für Button-Labels |
| Beschreibung je Eintrag | 100 | Discord-Limit für Select-Beschreibungen |
| Titel / Text | 100 / 1000 | Datenbankspalte beziehungsweise Lesbarkeit |
| Bild-Adressen | 512 | Datenbankspalte |

Ein volles Panel mit 25 Buttons, Thumbnail und Bild kommt auf 37 Komponenten — der `ComponentV2Builder` erlaubt 40. Der Test rendert genau diesen Fall, damit die Grenze nicht still reisst.

---

## Config

`src/config/reactionroles.json` hält vier Listen: `styles`, `modes`, `tones`, `colors`. In `colors` steht ganz oben **🚫 Keine Farbe** mit dem Wert `none` — der Handler macht daraus `accent: null`. Sie füllen die Select-Menüs im Setup; das Schema steht in `CONFIG_SCHEMAS.reactionroles`.

Die Werte sind an den Code gebunden — `NormalizeStyle`, `NormalizeMode` und `NormalizeTone` fangen alles ab, was dort nicht hineingehört. Neue Farben in `colors` gehen dagegen jederzeit, im Dev-Modus sogar ohne Neustart.

---

## Datenbank

Eine Zeile pro Panel, die Einträge liegen als JSON daneben:

| Spalte | Typ | Inhalt |
|---|---|---|
| `panel_id` | `VARCHAR(32)` | eigener Schlüssel, steckt in jeder customId |
| `guild_id` | `VARCHAR(20)` | Server |
| `channel_id` / `message_id` | `VARCHAR(20)` | wo die Nachricht steht — `NULL` beim Entwurf |
| `accent` | `CHAR(7)` | Akzentfarbe — `NULL` heisst "keine Farbe" |
| `thumbnail` / `image` | `VARCHAR(512)` | `https`-Adresse **oder** Galerie-ID — `NULL` heisst "keins" |
| `entries` | `JSON` | Rollen, Emojis, Beschriftungen, Farben |

`NormalizeEntries()` liest die JSON-Spalte defensiv: Einträge ohne Rolle fliegen raus, zu lange Texte werden gekürzt, unbekannte Button-Farben fallen auf grau zurück.

---

## Tests

`npx tsx src/tests/ReactionRoles.test.ts` prüft ohne Discord und ohne Datenbank:

- Emoji-Erkennung inklusive Ablehnung unbekannter Server-Emojis
- alle drei Modi für Button- und Menü-Klicks
- kaputtes JSON aus der Datenbank
- Bild-Adressen: `https` ja, `http`, `attachment://` und zu lange Adressen nein
- die Auflösung der Bildfelder: eigene Adresse direkt, Galerie-ID als Anhang, gelöschtes Bild als `null`
- ein volles Panel mit 25 Rollen in beiden Anzeigearten, mit und ohne Bilder und Farbe
- zehn Zustände des Setup-Panels und den Setup-Hub
