# Database

MariaDB-Anbindung über `mysql2` mit Connection-Pool, automatischem Schema-Abgleich, Repository-Loader und optionalem LRU-Cache pro Tabelle.

Zugriff überall über den Client: `this.client.database` (in Commands und Events), bzw. `client.database`.

---

## Ablauf beim Start

1. `BotClient.Init()` ruft `database.Connect()` auf.
2. `Connect()` baut den Pool aus `DEV_DATABASE` (im `--dev` Modus) oder `DATABASE` in der `config.json` (siehe [Environment.md](Environment.md)) und pingt einmal — falsche Zugangsdaten fallen sofort auf, nicht erst beim ersten Query.
3. `LoadRepositories()` lädt **jede Datei** in `src/database/models` und baut daraus ein `Repository`.
4. `SyncSchema()` gleicht die Datenbank mit genau diesen Definitionen ab.
5. Beim Shutdown (`logger.beforeExit`) läuft `database.Disconnect()`.

Du musst also weder ein Repository registrieren noch eine Migration schreiben — **Model-Datei anlegen reicht.**

### config.json

```json
"DATABASE": {
    "HOST": "localhost",
    "PORT": 3306,
    "USER": "erdibot",
    "PASSWORD": "",
    "NAME": "erdibot"
}
```

`DEV_DATABASE` hat dieselbe Form und wird im `--dev` Modus benutzt. `PORT` und `PASSWORD` sind optional.

---

## Eine Tabelle anlegen

Eine Datei in `src/database/models`, die per `default` ein `ITableDefinition` exportiert. Im Editor gibt es dafür das Snippet **`dbmodel`** (siehe unten).

```ts
// src/database/models/GuildSettings.ts
import ColumnType from "../../enums/ColumnType";
import ITableDefinition from "../../interfaces/database/ITableDefinition";
import IGuildSettings from "../../interfaces/database/models/IGuildSettings";

const GuildSettings: ITableDefinition<IGuildSettings> = {
    name: "GuildSettings",
    table: "guild_settings",
    columns: {
        guildId: { type: ColumnType.STRING, length: 20 },
        welcomeChannelId: { type: ColumnType.STRING, length: 20, nullable: true },
        maxWarnings: { type: ColumnType.INTEGER, unsigned: true },
        createdAt: { type: ColumnType.DATE },
    },
    indexes: [{ name: "uniq_guild", columns: ["guildId"], unique: true }],
};

export default GuildSettings;
```

Beim nächsten Start legt der Schema-Abgleich die Tabelle an. Fertig.

| Feld | Pflicht | Bedeutung |
|---|---|---|
| `name` | ja | Schlüssel, unter dem du das Repository abrufst. |
| `table` | ja | Tabellenname in der Datenbank. |
| `columns` | ja | Ein Eintrag pro Feld des Interfaces — TypeScript erzwingt Vollständigkeit. |
| `indexes` | nein | UNIQUE- und normale Indizes. `columns` nennt **Feldnamen**, nicht Spaltennamen. |
| `cache` | nein | Der Query-Cache ist **standardmäßig an**. `false` schaltet ihn ab, `{ max, ttl }` überschreibt die Defaults (`500` Einträge, `5 * 60 * 1000` ms). |

Jede Zeile bekommt automatisch eine `id` (`INT UNSIGNED AUTO_INCREMENT`, Primary Key). Die steht nicht in `columns`, kommt aber in jedem Ergebnis mit — ein eigenes Feld namens `id` wird beim Start abgelehnt.

### ColumnType

`src/enums/ColumnType.ts`. Der Wert steuert beides: die Umwandlung zwischen SQL und TypeScript **und** den SQL-Typ, den der Schema-Abgleich erzeugt. Die komplette Zuordnung steht in `TYPE_SPECS` in [src/database/Columns.ts](../src/database/Columns.ts) — alles über Spaltentypen an genau einer Stelle.

**Text**

| ColumnType | SQL | TypeScript |
|---|---|---|
| `CHAR` | `CHAR(length ?? 1)` | `string` — feste Länge, wird mit Leerzeichen aufgefüllt |
| `STRING` | `VARCHAR(length ?? 255)` | `string` — der Normalfall |
| `TINYTEXT` | `TINYTEXT` | `string` — bis 255 Bytes |
| `TEXT` | `TEXT` | `string` — bis 64 KB |
| `MEDIUMTEXT` | `MEDIUMTEXT` | `string` — bis 16 MB |
| `LONGTEXT` | `LONGTEXT` | `string` — bis 4 GB |
| `UUID` | `CHAR(36)` | `string` — UUID in Textform |

**Zahlen**

| ColumnType | SQL | TypeScript |
|---|---|---|
| `TINYINT` | `TINYINT` | `number` — −128..127, mit `unsigned` 0..255 |
| `SMALLINT` | `SMALLINT` | `number` — bis 32.767 |
| `MEDIUMINT` | `MEDIUMINT` | `number` — bis ~8,3 Mio |
| `INTEGER` | `INT` | `number` — bis ~2,1 Mrd |
| `BIGINT` | `BIGINT` | `number` — **ab 2^53 ungenau**, für Snowflakes lieber `STRING` mit `length: 20` |
| `FLOAT` | `FLOAT` | `number` — ungenau |
| `DOUBLE` | `DOUBLE` | `number` — ungenau |
| `DECIMAL` | `DECIMAL(precision ?? 10, scale ?? 2)` | `string` — exakt, für Geld. Kommt bewusst als String, sonst wäre die Genauigkeit sofort wieder weg |

Alle Zahlentypen verstehen `unsigned: true`.

**Wahrheitswert**

| ColumnType | SQL | TypeScript |
|---|---|---|
| `BOOLEAN` | `TINYINT(1)` | `boolean` — 1/0 werden zu `true`/`false` |

**Datum und Zeit**

| ColumnType | SQL | TypeScript |
|---|---|---|
| `DATE` | `DATE` | `Date` — nur der Tag |
| `DATETIME` | `DATETIME(precision ?? 3)` | `Date` — der Normalfall, immer UTC |
| `TIMESTAMP` | `TIMESTAMP(precision ?? 3)` | `Date` — wie DATETIME, aber nur 1970..2038 |
| `TIME` | `TIME(precision ?? 0)` | `string` — z.B. `"10:30:00"` |
| `YEAR` | `YEAR` | `number` |

**Binär**

| ColumnType | SQL | TypeScript |
|---|---|---|
| `BINARY` | `BINARY(length ?? 16)` | `Buffer` |
| `VARBINARY` | `VARBINARY(length ?? 255)` | `Buffer` |
| `BLOB` | `BLOB` | `Buffer` — bis 64 KB |
| `MEDIUMBLOB` | `MEDIUMBLOB` | `Buffer` — bis 16 MB |
| `LONGBLOB` | `LONGBLOB` | `Buffer` — bis 4 GB |

**Strukturiert**

| ColumnType | SQL | TypeScript |
|---|---|---|
| `JSON` | `JSON` | beliebig — wird beim Schreiben serialisiert und beim Lesen geparst |
| `ENUM` | `ENUM('a','b')` | `string` — braucht `values` |
| `SET` | `SET('a','b')` | `string[]` — braucht `values` |

Nicht dabei sind die Geodaten-Typen (`GEOMETRY`, `POINT`, `POLYGON`, …). Die lassen sich ohne SQL-Funktionen wie `ST_GeomFromText` weder sinnvoll schreiben noch lesen — dafür wäre eine eigene Behandlung im Repository nötig.

### Spalten-Optionen

| Option | Bedeutung |
|---|---|
| `type` | Pflicht, siehe oben. |
| `length` | Bei `CHAR`, `STRING`, `BINARY`, `VARBINARY`. |
| `precision` | Bei `DATETIME`, `TIMESTAMP`, `TIME` die Sekundenbruchteile; bei `DECIMAL` die Gesamtzahl der Stellen. |
| `scale` | Nur bei `DECIMAL`: Stellen nach dem Komma. Standard 2. |
| `values` | Pflicht bei `ENUM` und `SET`: die erlaubten Werte. |
| `unsigned` | Nur bei Zahlentypen. |
| `column` | Spaltenname, falls er nicht dem Feldnamen in snake_case entspricht. `welcomeChannelId` → `welcome_channel_id` passiert automatisch. |
| `nullable` | Die Spalte darf echtes SQL `NULL` enthalten. |
| `blankAsNull` | `null` wird als `''` gespeichert und als `null` gelesen; die Spalte ist in SQL `NOT NULL DEFAULT ''`. **Nötig für jede nullable Spalte, die Teil eines UNIQUE-Index ist** — MariaDB zählt `NULL` dort nie als Dublette, zwei „leere" Zeilen kämen sonst doppelt durch. |
| `default` | SQL-`DEFAULT` als fertiges Literal (`0`, `"''"`). Nur beim Erzeugen der Spalte, wird nicht abgeglichen. Nötig, wenn du eine `NOT NULL` Spalte zu einer Tabelle hinzufügst, in der schon Zeilen stehen. |

---

## Schema-Abgleich

`SchemaSync` liest bei jedem Start das echte Schema aus `information_schema` und vergleicht es mit den Model-Dateien. Ohne Abweichung passiert nichts.

**Was angelegt oder angepasst wird**

- Fehlende Tabelle → `CREATE TABLE`
- Fehlende Spalte → `ADD COLUMN`
- Abweichender Typ, Länge oder Nullable-Zustand → `MODIFY COLUMN`
- Fehlender oder geänderter Index → `DROP INDEX` + `ADD`

**Was gelöscht wird**

- Spalten, die in keinem Model mehr stehen → `DROP COLUMN`
- Indizes, die in keinem Model mehr stehen → `DROP INDEX`

Jeder zerstörende oder verändernde Schritt wird vorher als `warn` geloggt, mit Tabelle und Spaltenname. **Eine im Code gelöschte Spalte löscht beim nächsten Start die Spalte samt Daten** — das ist so gewollt, aber es heißt auch: Model-Dateien sind die einzige Wahrheit über das Schema.

Ganze Tabellen ohne Model werden **nicht** gelöscht. Sie werden beim Start einmal als Warnung aufgelistet und bleiben sonst unangetastet.

Ein Typwechsel gibt keine Rückfrage: ein verkleinertes `VARCHAR` schneidet vorhandene Werte ab. Bei einer Änderung an einer Spalte mit echten Daten also vorher ein Dump.

Verhalten abgesichert in `src/tests/SchemaSync.test.ts`.

---

## Die Methoden

`GetRepository<T>(name)` liefert das Repository, `Invalidate(name)` leert dessen Cache von Hand. Beide werfen mit klarer Meldung, wenn der Name nicht geladen ist.

| Methode | Wofür |
|---|---|
| `Find(where?, options?)` | Liste. `options` kennt `orderBy`, `limit`, `offset`. |
| `FindOne(where)` | Erste Zeile oder `null`. |
| `FindById(id)` | Zeile per ID. Unbrauchbare IDs geben `null` zurück, ohne die Datenbank zu belasten. |
| `Count(where?)` | Anzahl Zeilen. |
| `Insert(values)` | Legt eine Zeile an, gibt die neue `id` zurück. |
| `InsertMissing(entries)` | Legt fehlende Zeilen an, lässt vorhandene unangetastet (der UNIQUE-Index entscheidet). |
| `Upsert(match, defaults?)` | Legt die Zeile an, falls es sie nicht gibt, und gibt sie in jedem Fall zurück. |
| `Update(where, values)` | Gibt die Anzahl betroffener Zeilen zurück. |
| `Delete(where)` | Gibt die Anzahl gelöschter Zeilen zurück. |
| `Invalidate()` | Leert den Cache dieser Tabelle. |

### Filter

`where` ist ein Objekt aus Spalte → Wert oder Spalte → **genau einem** Operator:

```ts
{ guildId: "123" }                      // `guild_id` = ?
{ lastError: null }                     // `last_error` IS NULL
{ guildId: { in: ["default", "1"] } }   // IN (?, ?)
{ name: { notIn: [...keys] } }          // NOT IN (...)
{ nextRun: { not: null } }              // IS NOT NULL
{ nextRun: { lte: new Date() } }        // <= ?
```

Verfügbar: `in`, `notIn`, `not`, `lt`, `lte`, `gt`, `gte`.

Werte gehen **immer** als Platzhalter raus, Spaltennamen kommen **immer** aus der Tabellendefinition. Ein unbekanntes Feld wirft sofort, statt still eine falsche Query zu bauen.

---

## Beispiele

### Lesen im Command

```ts
const settings = await this.client.database
    .GetRepository<IGuildSettings>("GuildSettings")
    .FindOne({ guildId: interaction.guildId });

const current = settings?.welcomeChannelId ? `<#${settings.welcomeChannelId}>` : "nicht gesetzt";
```

### Schreiben im Command

```ts
const settings = this.client.database.GetRepository<IGuildSettings>("GuildSettings");

await settings.Upsert({ guildId: interaction.guildId }, { createdAt: new Date(), maxWarnings: 3 });
await settings.Update({ guildId: interaction.guildId }, { welcomeChannelId: channel.id });
```

`Upsert` legt die Zeile beim ersten Mal an, `Update` setzt den Wert. Der Cache räumt sich bei jedem Schreibzugriff selbst — kein manuelles `Invalidate` nötig.

### Listen, Sortieren, Zählen

```ts
const configured = await settings.Find({ welcomeChannelId: { not: null } }, { orderBy: { guildId: "ASC" } });
const total = await settings.Count();
```

### Löschen

```ts
await settings.Delete({ guildId: interaction.guildId });
```

`Delete` ohne Bedingung wirft — die ganze Tabelle zu leeren darf nie aus Versehen passieren.

### Änderung von außen

```ts
// DBeaver, zweite Bot-Instanz, Skript - davon weiß der Cache nichts
this.client.database.Invalidate("GuildSettings");
```

---

## Cache-Verhalten

Der Cache ist ein **Query-Cache** pro Tabelle: Schlüssel ist die Query selbst (Operation + Filter + Optionen). Damit greifen auch zusammengesetzte Filter und Listen — nicht nur Suchen über ein einzelnes Feld.

**Gecacht wird** `Find`, `FindOne`, `FindById` und `Count`, inklusive Negativtreffer (`null` und leere Listen).

**Geleert wird der komplette Tabellen-Cache** bei jedem Schreibzugriff: `Insert`, `InsertMissing`, `Upsert`, `Update`, `Delete`. Grob, aber dadurch lückenlos — es gibt keinen Schreibweg, nach dem noch alte Daten kommen.

**Nicht mitbekommen** kann der Cache Änderungen von außen. Dagegen hilft nur die TTL oder ein manuelles `Invalidate(name)`.

**Ergebnisse nicht verändern.** Zwei Aufrufer bekommen dasselbe Objekt zurück. Wer hineinschreibt, ändert es für alle anderen mit.

### Wann `cache: false`

Wenn die Tabelle schreiblastig ist oder mit wechselnden Werten gefiltert wird. `ScheduledTask` ist beides: der Poll filtert alle 30 Sekunden mit `nextRun: { lte: new Date() }`, jedes Mal ein neuer Schlüssel. Der Cache würde nie treffen und nur volllaufen.

---

## Editor-Snippets

Liegen in `.vscode/erdibot.code-snippets` und stehen in jeder `.ts`-Datei zur Verfügung — `dbmodel`, `dbcol`, `dbenum`, `dbdecimal`, `dbindex`, `route`. Tippen, `Tab` drücken, mit `Tab` durch die Platzhalter springen; bei `ColumnType` klappt eine Auswahlliste mit allen Typen auf.

Details und die Vorlagen für die Easy-Snippet-Extension stehen in [Snippets.md](Snippets.md).

---

## Fallen

- **`blankAsNull` bei UNIQUE-Spalten nicht vergessen.** Ohne die Option kommt dieselbe Zeile beliebig oft durch den Index, weil MariaDB `NULL` nie als Dublette zählt.
- **Das Model ist die Wahrheit.** Eine im Code gelöschte Spalte ist beim nächsten Start auch in der Datenbank weg.
- **Index-Namen stabil halten.** Daran erkennt der Abgleich einen Index wieder. Ein umbenannter Index wird gelöscht und neu aufgebaut.
- **Startfenster:** `Connect()` läuft parallel zum Discord-Login. In den ersten Sekunden kann ein Command `Repository "X" is not loaded.` werfen. Wenn das stört, `Init()` async machen und `Connect()` vor `login()` awaiten.
- **Genau ein Operator pro Spalte.** `{ nextRun: { not: null, lte: date } }` wirft. In SQL ist das auch nicht nötig — `<=` schließt `NULL` ohnehin aus.
- **Zeiten laufen als UTC** rein und raus (`timezone: "Z"` am Pool), damit keine Zeitumstellung die Tasks verschiebt.

Abgesichert mit `npm test`, einzeln `npx tsx src/tests/DatabaseConnection.test.ts` und `npx tsx src/tests/SchemaSync.test.ts`.

---

## developerMode

Im `--dev` Modus (`npm run dev`):

- baut den Pool aus `DEV_DATABASE` statt `DATABASE`
- loggt jedes Statement samt Parametern über den ChronicleLogger (`logger.debug`)
