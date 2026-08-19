# Snippets

Vorlagen für Datenbank-Models und Server-Routen.

Zwei Wege, dasselbe Ergebnis:

- **Ohne Extension** — [.vscode/erdibot.code-snippets](../.vscode/erdibot.code-snippets) liegt schon im Projekt und wird von VS Code automatisch geladen. Nichts zu tun.
- **Mit Easy Snippet** — falls du sie lieber global in deinen Benutzer-Snippets hast: unten stehen die Felder zum Abtippen.

---

## Übersicht

| Prefix | Was es einfügt |
|---|---|
| `dbmodel` | Komplette Tabellendefinition mit Imports, Spalte und UNIQUE-Index |
| `dbcol` | Eine einzelne Spalte |
| `dbenum` | ENUM- oder SET-Spalte mit Werteliste |
| `dbdecimal` | DECIMAL-Spalte für Geldbeträge |
| `dbindex` | Einen Index-Eintrag |
| `route` | Eine Server-Route |

Tippen, `Tab` drücken, mit `Tab` durch die Platzhalter springen. Bei `ColumnType` klappt eine Auswahlliste mit allen 29 Typen auf statt eines freien Feldes.

---

## Format für Easy Snippet

Die Extension zeigt ein Formular mit **Name**, **Prefix**, **Scope**, **Description** und **Body**. Der Body ist dort ganz normaler Text — Zeilenumbrüche, Tabs und Anführungszeichen schreibst du direkt hinein, das JSON-Escaping macht die Extension selbst.

Platzhalter-Syntax im Body:

| Schreibweise | Bedeutung |
|---|---|
| `$1`, `$2` | Sprungmarken in dieser Reihenfolge |
| `${1:vorgabe}` | Sprungmarke mit vorausgefülltem Text |
| `${1\|a,b,c\|}` | Sprungmarke als Auswahlliste |
| `$0` | Wo der Cursor am Ende landet |
| Gleiche Nummer mehrfach | Wird beim Tippen überall gleichzeitig gefüllt |

---

### dbmodel

| Feld | Wert |
|---|---|
| Name | `Datenbank-Model` |
| Prefix | `dbmodel` |
| Scope | `typescript` |
| Description | `Neue Tabellendefinition für src/database/models` |

**Body:**

```
import ColumnType from "../../enums/ColumnType";
import ITableDefinition from "../../interfaces/database/ITableDefinition";
import I${1:Name} from "../../interfaces/database/models/I${1:Name}";

const ${1:Name}: ITableDefinition<I${1:Name}> = {
	name: "${1:Name}",
	table: "${2:table_name}",
	columns: {
		${3:guildId}: { type: ColumnType.${4|STRING,TEXT,INTEGER,BOOLEAN,DATETIME,BIGINT,JSON,DECIMAL,ENUM,DATE,TIMESTAMP,CHAR,UUID,TINYTEXT,MEDIUMTEXT,LONGTEXT,TINYINT,SMALLINT,MEDIUMINT,FLOAT,DOUBLE,TIME,YEAR,BINARY,VARBINARY,BLOB,MEDIUMBLOB,LONGBLOB,SET|}${5:, length: 20} },
		$0
	},
	indexes: [{ name: "uniq_${2:table_name}", columns: ["${3:guildId}"], unique: true }],
};

export default ${1:Name};
```

---

### dbcol

| Feld | Wert |
|---|---|
| Name | `Model-Spalte` |
| Prefix | `dbcol` |
| Scope | `typescript` |
| Description | `Eine Spalte in einer Tabellendefinition` |

**Body:**

```
${1:feldName}: { type: ColumnType.${2|STRING,TEXT,INTEGER,BOOLEAN,DATETIME,BIGINT,JSON,DECIMAL,ENUM,DATE,TIMESTAMP,CHAR,UUID,TINYTEXT,MEDIUMTEXT,LONGTEXT,TINYINT,SMALLINT,MEDIUMINT,FLOAT,DOUBLE,TIME,YEAR,BINARY,VARBINARY,BLOB,MEDIUMBLOB,LONGBLOB,SET|}${3:, length: 255}${4:, nullable: true} },$0
```

---

### dbenum

| Feld | Wert |
|---|---|
| Name | `Model-Spalte ENUM` |
| Prefix | `dbenum` |
| Scope | `typescript` |
| Description | `ENUM- oder SET-Spalte mit Werteliste` |

**Body:**

```
${1:feldName}: { type: ColumnType.${2|ENUM,SET|}, values: ["${3:wert}", "${4:wert}"] },$0
```

---

### dbdecimal

| Feld | Wert |
|---|---|
| Name | `Model-Spalte DECIMAL` |
| Prefix | `dbdecimal` |
| Scope | `typescript` |
| Description | `DECIMAL-Spalte für Geldbeträge, kommt als string zurück` |

**Body:**

```
${1:betrag}: { type: ColumnType.DECIMAL, precision: ${2:10}, scale: ${3:2} },$0
```

---

### dbindex

| Feld | Wert |
|---|---|
| Name | `Model-Index` |
| Prefix | `dbindex` |
| Scope | `typescript` |
| Description | `Ein Index in einer Tabellendefinition` |

**Body:**

```
{ name: "${1|uniq_,idx_|}${2:name}", columns: ["${3:feldName}"]${4:, unique: true} },$0
```

---

### route

| Feld | Wert |
|---|---|
| Name | `Server-Route` |
| Prefix | `route` |
| Scope | `typescript` |
| Description | `Neue Route für src/routes` |

**Body:**

```
import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import Route from "../structures/Route";

export default class ${1:Name} extends Route {
	constructor(client: BotClient) {
		super(client, {
			method: "${2|GET,POST,PUT,PATCH,DELETE|}",
			path: "/${3:pfad}",
			description: "${4:Was die Route macht}",
		});
	}

	async Handle(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
		$0return { ok: true };
	}
}
```

---

## Von Hand statt über die Extension

Ohne Easy Snippet geht es auch direkt: **F1** → `Snippets: Configure Snippets` → `typescript.json`. Dort landen Snippets im gleichen Format wie in [.vscode/erdibot.code-snippets](../.vscode/erdibot.code-snippets), nur eben global statt im Projekt. Der Body ist dann ein Array aus Zeilen-Strings — genau das, was Easy Snippet dir abnimmt.
