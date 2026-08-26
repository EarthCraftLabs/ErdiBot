# Notifier

Meldet neue Streams und Videos von **YouTube** und **Twitch** in einen Discord-Kanal. Eingerichtet wird alles über `/notifier` — ein ComponentV2-Panel, ohne eine einzige Zeile JSON von Hand.

Zugriff über den Client: `this.client.notifierService`.

---

## Was der Notifier kann

| | |
|---|---|
| **Mehrere Kanäle** | Bis zu 25 pro Server, beliebig über beide Plattformen verteilt |
| **Eigene Texte** | Getrennt für Live, Video und „Stream vorbei", mit 11 Platzhaltern |
| **Live-Rolle** | Wird beim Stream-Start vergeben und beim Stream-Ende **wieder entzogen** |
| **Ping-Rolle** | Separate Rolle, die erwähnt wird — nie `@everyone`, auch wenn es jemand ins Template schreibt |
| **Discord-Verknüpfung** | Das Discord-Konto des Creators bekommt die Live-Rolle und steht als `{discord}` im Text |
| **Cooldown** | Mindestabstand zwischen zwei Meldungen desselben Kanals |
| **Ruhezeit** | Zeitfenster, in dem nichts gemeldet wird. Läuft auch über Mitternacht |
| **Auto-Publish** | Meldungen in Ankündigungs-Kanälen werden automatisch veröffentlicht |
| **Thread** | Legt zu jeder Meldung automatisch einen Diskussions-Thread an |
| **Nach dem Stream** | Bearbeitet die alte Meldung, statt stundenlang „ist jetzt live" stehen zu lassen |
| **Testlauf** | Schickt eine Beispiel-Meldung — ohne Pings, ohne auf einen echten Stream zu warten |
| **Status** | Pro Kanal: wie oft gemeldet, letzte Prüfung, letzter Fehler |

---

## Einrichten

```
/notifier
```

1. **Kanal hinzufügen** → Plattform wählen
2. Link oder Handle eingeben. Der Bot löst daraus den echten Kanal auf und übernimmt Name und Profilbild
3. Benachrichtigungs-Kanal wählen
4. **Speichern**, dann **Aktivieren**

Alles Weitere — Texte, Rollen, Cooldown — geht über die Knöpfe **Nachricht**, **Rollen** und **Optionen**.

### Was als Eingabe erkannt wird

| Plattform | Erkannt wird |
|---|---|
| YouTube | `UCX6OQ3DkcsbYNE6H8uQQuVA`, `youtube.com/channel/UC…`, `@handle`¹ |
| Twitch | `mecrytv`, `twitch.tv/mecrytv` |

¹ Ein `@handle` bei YouTube braucht den API-Key. Eine Kanal-ID funktioniert auch ohne.

---

## Platzhalter

| Platzhalter | Wird ersetzt durch |
|---|---|
| `{name}` | Anzeigename des Kanals |
| `{platform}` | YouTube oder Twitch |
| `{title}` | Titel des Streams oder Videos |
| `{link}` | Direktlink zum Stream oder Video |
| `{url}` | Link zum Kanal selbst |
| `{thumbnail}` | Vorschaubild |
| `{game}` | Kategorie oder Spiel — nur Twitch |
| `{viewers}` | Zuschauerzahl — nur Twitch |
| `{mention}` | Ping der eingestellten Rolle |
| `{role}` | Name der Live-Rolle |
| `{discord}` | Erwähnung des verknüpften Discord-Kontos |

Groß- und Kleinschreibung ist egal. Unbekannte Platzhalter bleiben unverändert stehen, statt still zu verschwinden — ein Tippfehler fällt so sofort auf. Leere Platzhalter hinterlassen keine Leerzeilen.

**Standard für Live:**

```
{mention} **{name}** ist jetzt live auf {platform}!

**{title}**
{link}
```

---

## Darstellung

| Stil | Was rausgeht |
|---|---|
| **Container** | ComponentV2-Karte mit Abzeichen, Profilbild, Vorschaubild und Knöpfen |
| **Klartext** | Eine Zeile, Discord baut die Link-Vorschau selbst |

Beides gleichzeitig geht nicht: Discord lehnt eine Nachricht mit dem `IsComponentsV2`-Flag ab, wenn sie zusätzlich ein `content`-Feld trägt. Erwähnungen im Container-Text pingen trotzdem.

---

## Wie erkannt wird

Ein Runnable (`NotifierPoll`) läuft **jede Minute** und fragt nur die Kanäle ab, deren Plattform-Intervall abgelaufen ist. Ein kürzerer Takt erzeugt also keine einzige zusätzliche Anfrage.

| Plattform | Intervall | Woher | Kosten |
|---|---|---|---|
| Twitch | 60 s | Helix `/streams` | 1 Anfrage für **alle** Kanäle des Bots |
| YouTube | 5 min | RSS-Feed | 0 — kein Key, kein Quota |

### YouTube: RSS zum Finden, API zum Anreichern

Der RSS-Feed (`youtube.com/feeds/videos.xml`) kostet nichts und meldet jedes neue Video. Die YouTube Data API wird nur für ein **neu gesehenes** Video aufgerufen, um Vorschaubild und Live-Status zu holen — das ist **1 Quota-Einheit**. Bei 10.000 Einheiten Tagesbudget reicht das für rund 10.000 Videos pro Tag.

Zum Vergleich: Wer stattdessen `search.list` zum Pollen benutzt, zahlt **100 Einheiten pro Abfrage** und ist nach 100 Abfragen für den Tag gesperrt.

Ohne `YOUTUBE_API_KEY` läuft die Erkennung trotzdem — es fehlen dann nur das API-Vorschaubild und die Unterscheidung zwischen Live und Video.

### Twitch: eine Anfrage für alle

`/helix/streams` nimmt bis zu 100 `user_login`-Parameter auf einmal. Der Bot fragt deshalb **alle** beobachteten Twitch-Kanäle in einer Anfrage ab, egal auf wie vielen Servern sie eingerichtet sind. Wer nicht in der Antwort steht, ist offline — genau daran erkennt der Bot das Stream-Ende und entzieht die Live-Rolle.

Bei einem `429` wartet der Adapter bis zum Zeitpunkt aus dem `Ratelimit-Reset`-Header und fragt bis dahin gar nicht erst an — jeder Versuch währenddessen würde die Sperre nur verlängern.

### TikTok gibt es nicht

Geprüft und verworfen. TikTok hat **keine** Schnittstelle, über die sich die Uploads eines fremden Creators beobachten lassen:

- Die **Display API** zeigt nur die Videos eines Creators, der die App vorher per OAuth autorisiert hat — und die App muss dafür ein App-Review durchlaufen, das Tage bis Wochen dauert.
- Die **Content Posting API** geht in die Gegenrichtung: sie *veröffentlicht* Videos auf TikTok im Namen eines eingeloggten Creators. Sie liest nichts.

Bliebe eine RSS-Bridge eines Drittanbieters. Die funktioniert, hängt aber an fremder Infrastruktur, die gedrosselt wird, ausfällt oder verschwindet — für einen Notifier, der zuverlässig sein soll, die falsche Grundlage. TikTok ist deshalb bewusst nicht dabei.

Die Plattform-Liste ist eine Konstante (`PLATFORMS` in `src/constants/Notifier.ts`) und der Adapter ein Interface mit vier Methoden — sollte TikTok je eine echte API bekommen, ist es eine Datei plus ein Listeneintrag.


---

## Zwei Regeln gegen Spam

**Die Erstsichtung wird nie gemeldet.** Beim allerersten Durchlauf merkt sich der Bot nur, was gerade aktuell ist. Sonst würde das Einrichten sofort das letzte Video herausblasen — das oft Wochen alt ist und das längst jeder gesehen hat. Ab dem nächsten Durchlauf zählt nur noch, was danach dazukommt.

Zum Prüfen, ob die Meldung richtig aussieht, gibt es den **Testlauf**-Knopf.

**Jede Meldung wird genau einmal verschickt.** Der Bot merkt sich die letzte Video- beziehungsweise Stream-ID in der Datenbank. Ein Bot-Neustart, ein Twitch-Reconnect oder ein doppelter Poll lösen deshalb keine zweite Meldung aus.

---

## Ruhezeit

Rechnet immer in **Europe/Berlin**, nicht in der Zeitzone des Servers — dieselbe Zeitzone wie im `RunnableService`. Wer `22:00` einträgt, meint deutsche Zeit. Auf einer UTC-Maschine läge das Fenster sonst um ein bis zwei Stunden daneben, je nach Sommerzeit unterschiedlich.

Das Fenster darf über Mitternacht laufen: `22:00` bis `07:00` sperrt die Nacht, `09:00` bis `17:00` den Arbeitstag. Beide Zeiten müssen gesetzt und verschieden sein — eine halbe Ruhezeit ist keine.

---

## API-Keys

Alle Keys stehen in der `.env`, siehe [Environment.md](Environment.md). Fehlt einer, startet der Bot trotzdem — die betroffene Plattform meldet sich im Panel als *nicht eingerichtet*.

| Variable | Für | Pflicht |
|---|---|---|
| `YOUTUBE_API_KEY` | Vorschaubild, Live-Erkennung, `@handle`-Auflösung | nein |
| `TWITCH_CLIENT_ID` | Twitch komplett | ja, für Twitch |
| `TWITCH_CLIENT_SECRET` | Twitch komplett | ja, für Twitch |

---

## Sicherheit

**Pings sind eingegrenzt.** Jede Meldung geht mit `allowedMentions` raus, das ausschließlich die eingestellte Ping-Rolle und das verknüpfte Discord-Konto erlaubt. Ein `@everyone` im Template wird als Text angezeigt, löst aber keinen Ping aus.

**API-Keys landen nicht in den Logs.** Query-Parameter wie `key=`, `client_secret=` und `access_token=` werden vor jeder Log-Ausgabe ersetzt.

**Der Testlauf pingt nicht.** Er soll zeigen, wie die Meldung aussieht, und niemanden aus dem Bett klingeln.

---

## Dateien

| Datei | Aufgabe |
|---|---|
| `src/services/NotifierService.ts` | Polling, Dedupe, Live-Rollen, Verschicken |
| `src/services/notifier/YouTubeAdapter.ts` | RSS-Erkennung, API-Anreicherung |
| `src/services/notifier/TwitchAdapter.ts` | App-Token, Sammelabfrage, Rate-Limit |
| `src/services/notifier/Feed.ts` | Atom-Parser für den YouTube-Feed, ohne Dependency |
| `src/services/notifier/Http.ts` | Timeout, Rate-Limit-Erkennung, Key-Maskierung |
| `src/builder/NotifierPanel.ts` | Das Setup-Panel |
| `src/builder/NotifierMessage.ts` | Die Meldung selbst |
| `src/events/notifier/NotifierHandler.ts` | Buttons, Selects, Modals |
| `src/commands/admin/Notifier.ts` | `/notifier` |
| `src/runnables/NotifierPoll.ts` | Der Minuten-Takt |
| `src/constants/Notifier.ts` | Standards, Normalisierung, Regeln |
| `src/database/models/NotifierSubscription.ts` | Die Tabelle |
| `src/config/notifier.json` | Stile und Farben |

---

## Test

```bash
npx tsx src/tests/Notifier.test.ts
```

Prüft ohne Netz und ohne Datenbank: Ruhezeit über Mitternacht und über den Sommerzeit-Wechsel, alle 11 Platzhalter, den Atom-Parser, die sieben Melde-Regeln (inklusive Erstsichtung), das Reparieren kaputter Datenbankzeilen und 18 Panel-Zustände.

Läuft absichtlich auch unter `TZ=UTC` — genau dort fällt ein Zeitzonen-Fehler in der Ruhezeit auf.
