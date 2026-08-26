# API-Keys besorgen

Was der [Notifier](Notifier.md) braucht, wo man es herbekommt und wo es hingehört. Alle Werte landen in der `.env` — siehe [Environment.md](Environment.md).

| Plattform | Was du brauchst | Aufwand | Ohne geht… |
|---|---|---|---|
| YouTube | `YOUTUBE_API_KEY` | ~5 Min. | …eingeschränkt: neue Videos werden erkannt, aber ohne Vorschaubild und ohne Live-Erkennung |
| Twitch | `TWITCH_CLIENT_ID` + `TWITCH_CLIENT_SECRET` | ~5 Min. | …gar nicht |

---

## YouTube

Du brauchst einen **API-Key** (kein OAuth). Der Notifier liest nur öffentliche Daten, dafür reicht ein einfacher Key.

1. **Projekt anlegen** — [console.cloud.google.com](https://console.cloud.google.com) öffnen, oben in der Projekt-Auswahl auf **Neues Projekt**. Name egal, z.B. `ErdiBot`.
2. **API aktivieren** — links **APIs und Dienste → Bibliothek**, nach `YouTube Data API v3` suchen, öffnen, **Aktivieren**.
3. **Key erzeugen** — **APIs und Dienste → Anmeldedaten**, oben **Anmeldedaten erstellen → API-Schlüssel**. Der Key erscheint sofort.
4. **Key einschränken** — auf **Schlüssel einschränken** klicken. Unter *API-Einschränkungen* **Schlüssel einschränken** wählen und nur `YouTube Data API v3` ankreuzen. Speichern.

   > Ohne diese Einschränkung funktioniert der Key für **jede** Google-API deines Projekts. Wird er versehentlich öffentlich, ist der Schaden ungleich größer.

5. In die `.env`:

   ```bash
   YOUTUBE_API_KEY="AIzaSy..."
   ```

### Quota

Google gibt dir **10.000 Einheiten pro Tag**, kostenlos. Der Notifier verbraucht davon fast nichts:

| Was | Kosten |
|---|---|
| Nach neuen Videos schauen | **0** — läuft über den RSS-Feed |
| Ein neu gesehenes Video anreichern | **1** Einheit |
| *(zum Vergleich: `search.list` zum Pollen)* | *100 Einheiten — nach 100 Abfragen ist der Tag vorbei* |

In der Praxis reicht das Budget für rund 10.000 Videos am Tag. Du wirst es nicht ausschöpfen.

---

## Twitch

Du brauchst **Client-ID und Client-Secret**. Beides kommt aus einer registrierten Anwendung.

1. **2FA aktivieren** — ohne Zwei-Faktor-Authentifizierung am Twitch-Konto lässt sich keine App registrieren. Unter [Sicherheit und Privatsphäre](https://www.twitch.tv/settings/security) einrichten.
2. **App registrieren** — [dev.twitch.tv/console](https://dev.twitch.tv/console) öffnen, Reiter **Applications**, dann **Register Your Application**.
3. **Formular ausfüllen:**

   | Feld | Wert |
   |---|---|
   | Name | Muss über **ganz Twitch** eindeutig sein. `ErdiBot` ist vermutlich vergeben — nimm etwas wie `ErdiBot EarthCraft` |
   | OAuth Redirect URLs | `http://localhost` — der Notifier nutzt den Client-Credentials-Flow und ruft die URL nie auf. Das Feld ist trotzdem Pflicht |
   | Category | `Application Integration` |
   | Client Type | `Confidential` |

4. **CAPTCHA lösen und Create.** Das musst du selbst machen.
5. **Manage** neben der neuen App → **Client-ID** kopieren.
6. **New Secret** klicken → Secret kopieren.

   > Das Secret wird **genau einmal** angezeigt. Wer es verpasst, erzeugt ein neues — das alte wird dabei ungültig.

7. In die `.env`:

   ```bash
   TWITCH_CLIENT_ID="abcdefghijklmnop..."
   TWITCH_CLIENT_SECRET="qrstuvwxyz..."
   ```

Der Bot tauscht die beiden Werte selbst gegen ein App-Access-Token und erneuert es, bevor es abläuft. Du musst nichts weiter tun.

### Rate-Limit

Twitch gibt 800 Punkte pro Minute. Der Notifier fragt **alle** beobachteten Kanäle in einer einzigen Anfrage ab — das ist ein Punkt pro Minute, unabhängig davon, wie viele Kanäle eingerichtet sind.

---

## TikTok — nicht dabei

Geprüft und verworfen. TikTok bietet **keine** Schnittstelle an, über die sich die Uploads eines fremden Creators beobachten lassen.

| Was es gibt | Was es tut | Warum es nicht reicht |
|---|---|---|
| **Display API** | Zeigt Videos eines Creators in einer fremden App | Der Creator muss die App per OAuth autorisieren, und die App muss ein App-Review durchlaufen (Tage bis Wochen) |
| **Content Posting API** | *Veröffentlicht* Videos auf TikTok | Genau die Gegenrichtung — sie schreibt, sie liest nicht |

Bliebe eine RSS-Bridge eines Drittanbieters. Die funktioniert technisch, hängt aber an fremder Infrastruktur, die gedrosselt wird, ausfällt oder verschwindet. Für einen Notifier, auf den Verlass sein soll, ist das die falsche Grundlage — deshalb ist TikTok bewusst nicht dabei.

Sollte TikTok je eine echte Lese-API anbieten: Die Plattform-Liste ist eine Konstante in `src/constants/Notifier.ts`, der Adapter ein Interface mit vier Methoden. Dann sind es eine Datei und ein Listeneintrag.


---

## Prüfen, ob es geklappt hat

Nach dem Eintragen den Bot neu starten und `/notifier` aufrufen → **Status**. Dort steht pro Plattform, ob sie bereit ist:

```
📺 YouTube — ✅ bereit
🟣 Twitch  — ❌ nicht eingerichtet
```

Steht dort *nicht eingerichtet*, obwohl der Key in der `.env` steht, dann fast immer aus einem dieser drei Gründe:

- **Anführungszeichen vergessen.** Ein `#` im Wert startet in der `.env` einen Kommentar und leert ihn still.
- **Bot nicht neu gestartet.** Die `.env` wird nur beim Start gelesen, anders als die JSON-Configs.
- **Tippfehler im Variablennamen.** Er muss exakt `YOUTUBE_API_KEY`, `TWITCH_CLIENT_ID` beziehungsweise `TWITCH_CLIENT_SECRET` heißen.

---

## Wenn ein Key doch mal rausgeht

- **YouTube:** In den *Anmeldedaten* den Key löschen und einen neuen erzeugen. Der alte ist sofort tot.
- **Twitch:** Unter *Manage* auf **New Secret**. Das alte wird dabei automatisch ungültig.

Beide Keys stehen ausschließlich in der `.env`, und die steht in der `.gitignore`. Der Bot entfernt sie außerdem aus allen URLs, bevor er etwas loggt — ein Key kann also nicht über die Logdateien nach draußen wandern.
