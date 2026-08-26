# Server

Fastify-Server neben `index.ts` und `Guardian.ts`. Routen liegen in `src/routes` und werden vom `RouteManager` geladen, abgesichert und an Fastify gehängt.

Alles liegt unter dem Präfix **`/dcapi`** — die Schnittstelle, über die ein Minecraft-Plugin oder ein Webpanel mit dem Bot spricht. Einzige Ausnahme ist `/images/*`, das Discord selbst abruft.

Zugriff über den Client: `this.client.server`.

---

## Ablauf beim Start

1. `BotClient.Init()` ruft `server.Start()` auf — unabhängig von der Datenbank.
2. `Start()` prüft `SERVER_JWT_SECRET` (aus der `.env`, siehe [Environment.md](Environment.md)). Fehlt es oder ist es zu kurz, startet der Server gar nicht erst.
3. `@fastify/rate-limit` wird mit dem globalen Limit aus der `config.json` registriert.
4. `RouteManager.Load()` lädt **jede Datei** in `src/routes`, `Apply()` hängt sie in Fastify.
5. Beim Shutdown läuft `server.Stop()`.

### config.json

```json
"SERVER_PORT": 3000,
"SERVER_PUBLIC_URL": "https://bot.ascension-dach.org",
"SERVER_JWT_EXPIRES_IN": "30d",
"SERVER_RATE_LIMIT_MAX": 100,
"SERVER_RATE_LIMIT_WINDOW": "1 minute"
```

### .env

```bash
SERVER_JWT_SECRET="..."
```

---

## Eine Route anlegen

Eine Datei in `src/routes`, die per `default` eine Klasse exportiert. Im Editor gibt es dafür das Snippet **`route`**.

```ts
// src/routes/Stats.ts
import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import Route from "../structures/Route";

export default class Stats extends Route {
    constructor(client: BotClient) {
        super(client, {
            method: "GET",
            path: "/stats",
            description: "Guild- und Task-Zahlen für das Panel",
        });
    }

    async Handle(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
        return { guilds: this.client.guilds.cache.size, angefragtVon: request.token?.sub };
    }
}
```

| Option | Standard | Bedeutung |
|---|---|---|
| `method` | — | `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, … |
| `path` | — | Fastify-Pfad, Wildcards mit `*`, Parameter mit `:name` |
| `description` | — | Wofür die Route da ist |
| `prefixed` | `true` | `false` hängt die Route ohne `/dcapi` ein |
| `requiresAuth` | `true` | `false` macht die Route ohne Token erreichbar |
| `rateLimit` | globales Limit | `{ max, timeWindow }` überschreibt es für diese Route |

`path: "/stats"` wird also zu `/dcapi/stats`. Der Präfix steht als `API_PREFIX` in `src/structures/Route.ts` und wird schon im Konstruktor aufgelöst — `route.path` und `route.Key` zeigen immer den echten Pfad.

Der Rückgabewert von `Handle` geht als JSON raus. Wer Header oder Status setzen will, benutzt `reply` und gibt das Ergebnis zurück.

Wirft `Handle`, fängt der RouteManager das ab: 500 an den Aufrufer, Meldung im Log und ein Bericht über `guardian.HandleServer()`. Ein Request endet nie ohne Antwort.

---

## Die Discord-Endpunkte

Der Bot hängt am Gateway und hat Guilds, Rollen und Mitglieder ohnehin im Cache. Statt für jede Anfrage zu `discord.com` zu telefonieren, beantwortet der `DiscordService` sie aus diesem Cache und lädt nur nach, wenn wirklich etwas fehlt — dann kümmert sich discord.js selbst um die Rate-Limits. Nachgeladene Mitglieder liegen eine Minute in einem LRU.

| Route | Antwort |
|---|---|
| `GET /dcapi/health` | `{ status, uptime }` |
| `GET /dcapi/guilds` | Alle Server des Bots samt Rollen |
| `GET /dcapi/guilds/:guildId` | Ein Server samt Rollen, sonst 404 |
| `GET /dcapi/guilds/:guildId/members/:userId` | Nickname, Beitrittsdatum, Rollen-IDs, sonst 404 |
| `PUT /dcapi/guilds/:guildId/members/:userId/roles/:roleId` | Rolle vergeben |
| `DELETE /dcapi/guilds/:guildId/members/:userId/roles/:roleId` | Rolle entziehen |

```bash
curl -H "Authorization: Bearer $TOKEN" \
     -X PUT https://bot.ascension-dach.org/dcapi/guilds/$GUILD/members/$USER/roles/$ROLE
```

Beide Rollen-Routen antworten mit `{ "changed": true | false }`. `false` heißt: die Rolle war schon so, es wurde nichts geschrieben — damit ist ein wiederholter Aufruf folgenlos, und ein Plugin darf beim Login einfach jedes Mal `PUT` schicken.

Vergeben und Entziehen prüfen vorher, ob es überhaupt gehen kann, und liefern sonst `403` mit Klartext:

- der Bot ist nicht auf dem Server
- dem Bot fehlt die Berechtigung **Rollen verwalten**
- die Rolle ist `@everyone`
- die Rolle gehört einer Integration (Bot-Rolle, Booster-Rolle)
- die Rolle steht über der höchsten Rolle des Bots

Lehnt Discord die Änderung trotzdem ab, kommt `502` statt `500` — der Fehler liegt dann nicht in diesem Server.

Rollen in `GET /dcapi/guilds/:guildId` tragen ein `assignable`-Flag, das genau diese Prüfung vorwegnimmt. Ein Panel kann damit direkt ausgrauen, was der Bot nicht vergeben kann.

Die Zuordnung Minecraft-Account ↔ Discord-User macht der Server **nicht** — er beantwortet nur Fragen über Discord. Wer welchen Account verknüpft hat, gehört in eine eigene Tabelle (siehe [Database.md](Database.md)).

---

## Token-Pflicht

Jede Route verlangt standardmäßig einen Bearer-Token:

```
Authorization: Bearer <token>
```

Ohne oder mit ungültigem Token kommt `401` samt `WWW-Authenticate`. Der Handler wird dann nie erreicht — die Prüfung läuft als `onRequest`-Hook davor. Im Handler stehen die Nutzdaten unter `request.token` (`sub`, `scope`, `iat`, `exp`).

### Warum `/images/*` offen ist

Discord holt Bild-URLs **selbst** ab, um Embeds zu rendern, und schickt dabei keinen `Authorization`-Header mit. Eine Token-Pflicht auf `/images/*` würde jedes Galerie-Bild in Discord unsichtbar machen. Die Route steht deshalb als einzige auf `requiresAuth: false` und hat stattdessen ein eigenes, großzügigeres Rate Limit (300/Minute), weil eine Nachricht viele Bilder enthalten kann.

Sie ist aus demselben Grund auch `prefixed: false` und bleibt auf `/images/*` statt `/dcapi/images/*`: die URLs stehen in bereits verschickten Nachrichten und müssen weiter stimmen. `/dcapi` ist die Schnittstelle für Plugin und Panel, `/images` die Auslieferung für Discord — zwei verschiedene Dinge, zwei verschiedene Pfade.

Der Pfadschutz gegen Traversal und fremde Dateitypen bleibt davon unberührt (`ResolveImagePath`).

### Tokens erzeugen

```bash
npm run token -- --sub minecraft-plugin
```

| Argument | Bedeutung |
|---|---|
| `--sub <name>` | Für wen der Token ist. Pflicht. |
| `--expires <dauer>` | `30d`, `12h`, `90m`, `45s`. Standard: `SERVER_JWT_EXPIRES_IN` |
| `--scope <a,b>` | Kommagetrennte Berechtigungen, landen im Token |
| `--secret` | Erzeugt ein neues `SERVER_JWT_SECRET` |
| `--help` | Kurzhilfe |

Ein neues Secret macht **alle** bereits ausgegebenen Tokens ungültig. Tokens lassen sich nicht einzeln zurückziehen — kurze Laufzeiten sind deshalb besser als eine lange.

Die Tokens sind selbst signierte JWTs (HS256, `node:crypto`). Beim Prüfen wird das `alg` aus dem Token nie zum Auswählen des Verfahrens benutzt, es wird immer HS256 gerechnet und erst danach verglichen — die klassische alg-Confusion läuft damit ins Leere. Abgesichert in `src/tests/Auth.test.ts`.

---

## Rate Limits

Global aus der `config.json`, pro Route überschreibbar. Gezählt wird pro IP; ist das Budget aufgebraucht, kommt `429` mit `Retry-After`.

```ts
rateLimit: { max: 10, timeWindow: "1 minute" }
```

Der Zähler liegt im Arbeitsspeicher: nach einem Neustart ist er leer, und mehrere Bot-Instanzen zählen getrennt. Für eine Instanz reicht das.

---

## Die Manager-API

```ts
const server = this.client.server;

server.Routes.Size                       // Anzahl registrierter Routen
server.Routes.Keys                       // ["GET /dcapi/health", "GET /images/*", ...]
server.Routes.Get("GET /dcapi/health")   // die Route
server.Routes.Has(key)
server.Routes.Register(route)      // false bei doppelter Methode+Pfad
server.Routes.Remove(key)
server.Routes.Clear()

server.IsRunning
server.Instance                    // die Fastify-Instanz, sonst null
server.BaseURL                     // localhost im Dev-Modus, sonst SERVER_PUBLIC_URL
server.Port = 8080                 // wirft, solange der Server läuft
server.Host = "127.0.0.1"          // dito
```

`Port` und `Host` sind nur änderbar, solange der Server steht — Fastify liest beide ausschließlich beim `listen()`, ein Setter im Betrieb wäre eine Lüge.

`Register` und `Remove` wirken auf den Manager. Sie greifen erst nach einem `Stop()` und `Start()`, weil Fastify Routen nur vor dem `listen()` annimmt.

---

## developerMode

`BaseURL` zeigt im `--dev` Modus auf `http://localhost:<SERVER_PORT>`. Discord kann localhost nicht laden, deshalb schickt der GalleryService Bilder dort als Anhang statt als URL mit.
