# Umgebung

Die Einstellungen des Bots liegen in **zwei** Dateien im Projekt-Root. Die Trennung folgt einer einzigen Regel:

> **`.env` = Zugangsdaten zu fremden Diensten. `config.json` = alles, was der Bot selbst betreibt.**

Das Datenbank-Passwort steht deshalb in der `config.json`, direkt bei Host, Port und User: Zugangsdaten, die zusammengehören, richtet man auch zusammen ein. Getrennt über zwei Dateien ist eine Fehlerquelle mehr, ohne Sicherheitsgewinn — beide Dateien stehen ohnehin in der `.gitignore`.

Zusammengesetzt werden beide genau einmal, in `src/utils/config.ts`. Der Rest des Bots sieht nur noch ein fertiges `IConfig` über `this.client.config` und muss nicht wissen, woher ein Wert kam.

Nicht zu verwechseln mit dem **ConfigService** (`src/config/*.json`, siehe [Config.md](Config.md)) — der verwaltet Auswahllisten für Discord-Panels, nicht die Zugangsdaten des Bots.

---

## Einrichtung

```bash
cp .env.example .env
cp config.example.json config.json
npm run token -- --secret     # erzeugt SERVER_JWT_SECRET
```

Danach in der `.env` Token und Passwörter eintragen. `.env` steht in der `.gitignore` und darf niemals committet werden — `.env.example` ist die Vorlage, die mitkommt.

---

## `.env` — Geheimnisse

| Variable | Pflicht | Wofür |
|---|---|---|
| `CLIENT_TOKEN` | ja | Bot-Token für den Produktivbetrieb |
| `CLIENT_ID` | ja | Application-ID für den Produktivbetrieb |
| `DEV_CLIENT_TOKEN` | ja | Bot-Token im `--dev` Modus |
| `DEV_CLIENT_ID` | ja | Application-ID im `--dev` Modus |
| `SERVER_JWT_SECRET` | ja | Signiert die API-Tokens, mindestens 32 Zeichen |
| `YOUTUBE_API_KEY` | nein | Notifier · YouTube Data API v3, siehe [Notifier.md](Notifier.md) |
| `TWITCH_CLIENT_ID` | nein | Notifier · Twitch Application |
| `TWITCH_CLIENT_SECRET` | nein | Notifier · Twitch Application |

Fehlt eine Pflichtvariable, startet der Bot **nicht** und nennt den Namen. Fehlen die Notifier-Keys, startet er normal — die betroffene Plattform meldet sich im `/notifier` Panel als *nicht konfiguriert*.

### Werte immer in Anführungszeichen

```bash
SERVER_JWT_SECRET="ab#cd"     # ✅
SERVER_JWT_SECRET=ab#cd       # ❌ wird zu "ab"
```

Ein unmaskiertes `#` startet einen Kommentar. Ohne Anführungszeichen verschwindet der Rest der Zeile **still** — es gibt keine Fehlermeldung, nur ein Wert, der nicht funktioniert. Deshalb: jeden Wert quoten, nicht nur die mit Sonderzeichen.

In der `config.json` stellt sich die Frage nicht, JSON kennt keine Kommentare.

### Echte Umgebungsvariablen gewinnen

`process.loadEnvFile()` überschreibt nichts, was bereits in der Umgebung gesetzt ist. Ein `CLIENT_TOKEN` aus Docker-Compose, systemd oder der Shell hat also immer Vorrang vor der Datei. Damit läuft derselbe Code lokal wie im Container, ohne dass eine `.env` ins Image muss.

Ein `dotenv`-Paket wird nicht gebraucht — `process.loadEnvFile()` ist seit Node 20.12 in der Standard-Bibliothek.

---

## `config.json` — Infrastruktur

```json
{
    "DATABASE":     { "HOST": "localhost", "PORT": 3306, "USER": "erdibot", "PASSWORD": "…", "NAME": "erdibot" },
    "DEV_DATABASE": { "HOST": "localhost", "PORT": 3306, "USER": "erdibot", "PASSWORD": "…", "NAME": "erdibot_dev" },

    "DEV_GUILD_ID": "1162553851187040326",
    "DEV_USER_IDs": ["1059621019947634739"],

    "SERVER_PORT": 3000,
    "SERVER_PUBLIC_URL": "https://api.deine-domain.de",
    "SERVER_JWT_EXPIRES_IN": "30d",
    "SERVER_RATE_LIMIT_MAX": 100,
    "SERVER_RATE_LIMIT_WINDOW": "1 minute"
}
```

| Feld | Standard | Wofür |
|---|---|---|
| `DATABASE` / `DEV_DATABASE` | — | Vollständige Zugangsdaten: Host, Port, User, Passwort, Name |
| `DEV_GUILD_ID` | — | Server, auf dem Commands im `--dev` Modus sofort registriert werden |
| `DEV_USER_IDs` | `[]` | Wer `developerOnly`-Commands ausführen darf |
| `SERVER_PORT` | `3000` | Port des Fastify-Servers |
| `SERVER_PUBLIC_URL` | `http://localhost:3000` | Domain, unter der der Server von außen erreichbar ist. Baut die Bild-URLs |
| `SERVER_JWT_EXPIRES_IN` | `30d` | Standard-Gültigkeit neuer API-Tokens |
| `SERVER_RATE_LIMIT_MAX` | `100` | Anfragen pro Fenster und IP |
| `SERVER_RATE_LIMIT_WINDOW` | `1 minute` | Länge des Fensters |

`PORT` darf fehlen und fällt auf `3306`, `PASSWORD` darf fehlen und gilt dann als leer. `HOST`, `USER` und `NAME` sind Pflicht — fehlt eines, startet der Bot nicht.

`config.json` steht ebenfalls in der `.gitignore`, obwohl nichts Geheimes mehr drin steht. Wer die Datei versionieren will, kann die Zeile entfernen; die Vorlage `config.example.json` kommt so oder so mit.

---

## Ablauf beim Start

1. `BotClient` ruft im Konstruktor `LoadConfig()` auf.
2. `.env` wird geladen, sofern vorhanden. Bereits gesetzte Umgebungsvariablen bleiben unberührt.
3. `config.json` wird gelesen und geparst.
4. Beide Quellen werden zu einem `IConfig` zusammengesetzt und dabei geprüft.
5. Fehlt etwas Notwendiges, fliegt ein `Error` mit dem konkreten Namen — noch bevor eine Verbindung aufgebaut wird.

Die Pfade werden erst **beim Aufruf** aus `process.cwd()` aufgelöst, nicht beim Import des Moduls. Sonst würde das Arbeitsverzeichnis beim Laden einfrieren, und Aufrufer, die es später wechseln, läsen die falschen Dateien.

---

## Test

```bash
npx tsx src/tests/Config.test.ts
```

Prüft in einem Wegwerf-Verzeichnis, dass die beiden Quellen korrekt zusammenfinden, und dass acht Fehlerfälle (fehlende `.env`, fehlende `config.json`, kaputtes JSON, leere Werte, fehlende Sektionen) verständliche Meldungen erzeugen.
