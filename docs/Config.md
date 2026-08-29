# config.json

Die Infrastruktur des Bots: Datenbank, Server, Dev-Einstellungen, OAuth. Alles, was der Bot **selbst betreibt** — Zugangsdaten zu fremden Diensten stehen in der `.env`.

Gelesen wird die Datei genau einmal, in `src/utils/config.ts`. Der Rest des Bots sieht nur noch ein fertiges `IConfig` über `this.client.config`.

Das Zusammenspiel beider Dateien steht in [Environment.md](Environment.md). Nicht zu verwechseln mit dem **ConfigService** (`src/config/*.json`, siehe [ConfigService.md](ConfigService.md)) — der verwaltet Auswahllisten für Discord-Panels.

---

## Einrichtung

```bash
cp config.example.json config.json
```

Die Datei liegt im **Projekt-Root**, nicht in `src`. Der Pfad wird beim Start aus `process.cwd()` aufgelöst — der Bot muss also aus dem Projekt-Root gestartet werden.

`config.json` steht in der `.gitignore`, `config.example.json` ist die Vorlage und kommt mit.

---

## Vollständige Datei

```json
{
    "DATABASE": {
        "HOST": "localhost",
        "PORT": 3306,
        "USER": "erdibot",
        "PASSWORD": "…",
        "NAME": "erdibot"
    },
    "DEV_DATABASE": {
        "HOST": "localhost",
        "PORT": 3306,
        "USER": "erdibot",
        "PASSWORD": "…",
        "NAME": "erdibot_dev"
    },

    "DEV_GUILD_ID": "1162553851187040326",
    "DEV_USER_IDs": ["1059621019947634739"],

    "SERVER_PORT": 3000,
    "SERVER_PUBLIC_URL": "https://api.deine-domain.de",
    "SERVER_JWT_EXPIRES_IN": "30d",
    "SERVER_RATE_LIMIT_MAX": 100,
    "SERVER_RATE_LIMIT_WINDOW": "1 minute",

    "OAUTH_GUILD_ID": "1162553851187040326",
    "OAUTH_ROLE_ID": "1162553851187040330"
}
```

| Feld | Typ | Pflicht | Standard |
|---|---|---|---|
| `DATABASE` | Objekt | ja | — |
| `DEV_DATABASE` | Objekt | ja | — |
| `DEV_GUILD_ID` | String | ja | — |
| `DEV_USER_IDs` | String[] | nein | `[]` |
| `SERVER_PORT` | Zahl | nein | `3000` |
| `SERVER_PUBLIC_URL` | String | nein | `http://localhost:3000` |
| `SERVER_JWT_EXPIRES_IN` | String | nein | `30d` |
| `SERVER_RATE_LIMIT_MAX` | Zahl | nein | `100` |
| `SERVER_RATE_LIMIT_WINDOW` | String | nein | `1 minute` |
| `OAUTH_GUILD_ID` | String | nein | `""` |
| `OAUTH_ROLE_ID` | String | nein | `""` |

Fehlt ein Pflichtfeld, startet der Bot **nicht** und nennt den Namen. Fehlt ein optionales, greift der Standard.

---

## Datenbank

`DATABASE` und `DEV_DATABASE` haben dieselbe Form. Welche der beiden benutzt wird, entscheidet der `--dev` Modus (`src/database/DatabaseConnection.ts`).

| Feld | Pflicht | Standard |
|---|---|---|
| `HOST` | ja | — |
| `PORT` | nein | `3306` |
| `USER` | ja | — |
| `PASSWORD` | nein | `""` |
| `NAME` | ja | — |

**Beide Sektionen müssen vorhanden sein**, auch wenn im Produktivbetrieb nur `DATABASE` benutzt wird. Geprüft wird beim Laden, nicht beim ersten Zugriff — eine fehlende `DEV_DATABASE` fällt also sofort auf und nicht erst beim nächsten `--dev` Start.

Das Passwort steht hier und nicht in der `.env`: Host, User und Passwort gehören zusammen, getrennt einzurichten ist eine Fehlerquelle mehr. Beide Dateien stehen ohnehin in der `.gitignore`. Mehr zur Verbindung in [Database.md](Database.md).

---

## Entwicklung

| Feld | Wofür |
|---|---|
| `DEV_GUILD_ID` | Server, auf dem Commands im `--dev` Modus sofort registriert werden — global dauert die Registrierung bis zu eine Stunde |
| `DEV_USER_IDs` | Wer `developerOnly`-Commands ausführen darf (`src/utils/permissions.ts`) |

`DEV_GUILD_ID` ist auch dann Pflicht, wenn nie im Dev-Modus gestartet wird.

### IDs immer als String

```json
"DEV_USER_IDs": ["1059621019947634739"]     ✅
"DEV_USER_IDs": [1059621019947634739]       ❌ wird zu 1059621019947634700
```

Discord-Snowflakes sind größer als `Number.MAX_SAFE_INTEGER`. Als JSON-Zahl geschrieben rundet der Parser sie — **still**, ohne Fehlermeldung. Die ID passt danach zu niemandem mehr. Das gilt für jede ID in dieser Datei.

---

## Server

| Feld | Wofür |
|---|---|
| `SERVER_PORT` | Port des Fastify-Servers |
| `SERVER_PUBLIC_URL` | Domain, unter der der Server von außen erreichbar ist. Baut Bild- und Redirect-URLs |
| `SERVER_JWT_EXPIRES_IN` | Standard-Gültigkeit neuer API-Tokens |
| `SERVER_RATE_LIMIT_MAX` | Anfragen pro Fenster und IP |
| `SERVER_RATE_LIMIT_WINDOW` | Länge des Fensters |

`SERVER_PUBLIC_URL` wird im `--dev` Modus ignoriert — dort ist die Basis-URL immer `http://localhost:<SERVER_PORT>`. Ein abschließender `/` wird abgeschnitten, beide Schreibweisen sind also in Ordnung.

Das JWT-Secret steht als einziger Server-Wert in der `.env`, siehe [Server.md](Server.md).

### Zwei Zeitformate

Die beiden Zeitangaben werden von **verschiedenen** Parsern gelesen und sind nicht austauschbar:

| Feld | Format | Beispiele |
|---|---|---|
| `SERVER_JWT_EXPIRES_IN` | `<Zahl><Einheit>`, Einheit `ms` `s` `m` `h` `d` `w` | `30d`, `12h`, `90m` |
| `SERVER_RATE_LIMIT_WINDOW` | ausgeschrieben, für `@fastify/rate-limit` | `1 minute`, `30 seconds` |

`"SERVER_JWT_EXPIRES_IN": "1 minute"` wird nicht erkannt und fällt auf die eingebaute Standard-Gültigkeit zurück.

---

## OAuth

| Feld | Wofür |
|---|---|
| `OAUTH_GUILD_ID` | Server, dem ein Nutzer nach dem Login automatisch beitritt |
| `OAUTH_ROLE_ID` | Rolle, die er dabei bekommt |

Beide sind optional. Fehlt `OAUTH_GUILD_ID` oder ist es keine gültige Snowflake, entfällt der Auto-Join und der Bot protokolliert eine Warnung. Fehlt nur `OAUTH_ROLE_ID`, tritt der Nutzer bei und bekommt keine Rolle. Der Bot startet in beiden Fällen normal.

Der Bot muss auf dem Server unter `OAUTH_GUILD_ID` sein und die Rolle unter seiner eigenen höchsten Rolle stehen — sonst lehnt Discord die Vergabe ab.

---

## Wenn etwas nicht stimmt

| Meldung | Ursache |
|---|---|
| `config.json fehlt - kopiere config.example.json nach config.json.` | Datei nicht vorhanden oder falsches Arbeitsverzeichnis |
| `config.json enthält kein gültiges JSON: …` | Syntaxfehler, meist ein Komma zu viel oder ein Kommentar |
| `config.json: "DATABASE" fehlt oder ist kein Objekt.` | Sektion fehlt oder ist ein Array/String |
| `config.json: "HOST" fehlt oder ist kein Text.` | Pflichtfeld fehlt, ist leer oder keine Zeichenkette |

Alle vier fliegen **vor** dem ersten Verbindungsaufbau, im Konstruktor von `BotClient`.

JSON kennt keine Kommentare. `//` oder `#` in der Datei sind ein Syntaxfehler, kein Hinweistext.

### Zwei stille Fallen

```json
"SERVER_PORT": "3001"       // ❌ String statt Zahl → wird still zu 3000
"SERVER_PUBLIC_URL": ""     // ❌ leer → wird still zu http://localhost:3000
```

Zahlenfelder akzeptieren nur echte JSON-Zahlen, alles andere fällt kommentarlos auf den Standard zurück. Leere Textfelder gelten als *nicht gesetzt* — bei Pflichtfeldern gibt das einen Fehler, bei den übrigen den Standardwert. Wer einen Wert setzt und ihn nicht wiederfindet, prüft zuerst diese beiden Punkte.

---

## Test

```bash
npx tsx src/tests/Config.test.ts
```

Prüft in einem Wegwerf-Verzeichnis, dass `.env` und `config.json` korrekt zusammenfinden, und dass die Fehlerfälle oben verständliche Meldungen erzeugen.
