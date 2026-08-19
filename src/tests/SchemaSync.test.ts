import assert from "node:assert";
import { RowDataPacket } from "mysql2/promise";
import SchemaSync from "../database/SchemaSync";
import GalleryImage from "../database/models/GalleryImage";
import TeamRoles from "../database/models/TeamRoles";
import ColumnType from "../enums/ColumnType";
import IExecutor from "../interfaces/database/IExecutor";
import ITableDefinition from "../interfaces/database/ITableDefinition";

interface IColumnRow {
    name: string;
    dataType: string;
    columnType?: string;
    length?: number | null;
    precision?: number | null;
    numericPrecision?: number | null;
    numericScale?: number | null;
    nullable?: boolean;
    unsigned?: boolean;
}

function Column(row: IColumnRow): RowDataPacket {
    return {
        COLUMN_NAME: row.name,
        DATA_TYPE: row.dataType,
        COLUMN_TYPE: row.columnType ?? (row.unsigned ? `${row.dataType} unsigned` : row.dataType),
        CHARACTER_MAXIMUM_LENGTH: row.length ?? null,
        DATETIME_PRECISION: row.precision ?? null,
        NUMERIC_PRECISION: row.numericPrecision ?? null,
        NUMERIC_SCALE: row.numericScale ?? null,
        IS_NULLABLE: row.nullable ? "YES" : "NO",
    } as unknown as RowDataPacket;
}

function Index(name: string, column: string, unique = true): RowDataPacket {
    return { INDEX_NAME: name, NON_UNIQUE: unique ? 0 : 1, COLUMN_NAME: column } as unknown as RowDataPacket;
}

function Probe(columns: RowDataPacket[], indexes: RowDataPacket[], tables: string[] = []) {
    const ddl: string[] = [];

    const executor: IExecutor = {
        async Rows(sql) {
            if (sql.includes("information_schema.COLUMNS")) return columns;
            if (sql.includes("information_schema.STATISTICS")) return indexes;

            return tables.map((name) => ({ TABLE_NAME: name }) as unknown as RowDataPacket);
        },
        async Run() {
            throw new Error("SchemaSync darf keine Daten-Statements ausführen");
        },
        async Raw(sql) {
            ddl.push(sql.replace(/\s+/g, " ").trim());
        },
    };

    return { executor, ddl };
}

const MATCHING_COLUMNS = [
    Column({ name: "id", dataType: "int", unsigned: true }),
    Column({ name: "guild_id", dataType: "varchar", length: 20 }),
    Column({ name: "role_name", dataType: "varchar", length: 100 }),
    Column({ name: "role_id", dataType: "varchar", length: 20 }),
    Column({ name: "sort_index", dataType: "int" }),
];

const MATCHING_INDEXES = [Index("uniq_team_role", "guild_id"), Index("uniq_team_role", "role_id")];

const CATALOG: ITableDefinition<any> = {
    name: "Catalog",
    table: "catalog",
    columns: {
        code: { type: ColumnType.CHAR, length: 8 },
        title: { type: ColumnType.STRING, length: 120 },
        hint: { type: ColumnType.TINYTEXT, nullable: true },
        note: { type: ColumnType.MEDIUMTEXT, nullable: true },
        story: { type: ColumnType.LONGTEXT, nullable: true },
        externalId: { type: ColumnType.UUID },

        tiny: { type: ColumnType.TINYINT, unsigned: true },
        small: { type: ColumnType.SMALLINT },
        medium: { type: ColumnType.MEDIUMINT },
        hits: { type: ColumnType.BIGINT, unsigned: true },
        ratio: { type: ColumnType.FLOAT },
        precise: { type: ColumnType.DOUBLE },
        amount: { type: ColumnType.DECIMAL, precision: 12, scale: 4 },

        active: { type: ColumnType.BOOLEAN },

        birthday: { type: ColumnType.DATE, nullable: true },
        seenAt: { type: ColumnType.TIMESTAMP, precision: 6 },
        openFrom: { type: ColumnType.TIME },
        season: { type: ColumnType.YEAR },

        checksum: { type: ColumnType.BINARY, length: 32 },
        token: { type: ColumnType.VARBINARY, nullable: true },
        thumb: { type: ColumnType.BLOB, nullable: true },
        payload: { type: ColumnType.LONGBLOB, nullable: true },

        settings: { type: ColumnType.JSON, nullable: true },
        state: { type: ColumnType.ENUM, values: ["neu", "aktiv"] },
        flags: { type: ColumnType.SET, values: ["a", "b"], nullable: true },
    },
};

const SMALL_CATALOG: ITableDefinition<any> = {
    name: "SmallCatalog",
    table: "small_catalog",
    columns: {
        state: { type: ColumnType.ENUM, values: ["neu", "aktiv"] },
        amount: { type: ColumnType.DECIMAL, precision: 12, scale: 4 },
    },
};

const only = (ddl: string[], keyword: string) => ddl.filter((statement) => statement.includes(keyword));

async function main(): Promise<void> {
    {
        const { executor, ddl } = Probe([], []);
        await new SchemaSync(executor).Run([TeamRoles]);

        assert.equal(ddl.length, 1, `erwartet genau ein CREATE, war: ${ddl.join(" | ")}`);
        assert.ok(ddl[0].startsWith("CREATE TABLE `team_roles`"), ddl[0]);
        assert.ok(ddl[0].includes("`id` INT UNSIGNED NOT NULL AUTO_INCREMENT"), ddl[0]);
        assert.ok(ddl[0].includes("`guild_id` VARCHAR(20) NOT NULL"), ddl[0]);
        assert.ok(ddl[0].includes("`sort_index` INT NOT NULL"), ddl[0]);
        assert.ok(ddl[0].includes("PRIMARY KEY (`id`)"), ddl[0]);
        assert.ok(ddl[0].includes("UNIQUE KEY `uniq_team_role` (`guild_id`, `role_id`)"), ddl[0]);
    }

    {
        const { executor, ddl } = Probe([], []);
        await new SchemaSync(executor).Run([GalleryImage]);

        assert.ok(ddl[0].includes("`subcategory` VARCHAR(32) NOT NULL DEFAULT ''"), ddl[0]);
        assert.ok(ddl[0].includes("`created_at` DATETIME(3) NOT NULL"), ddl[0]);
        assert.ok(ddl[0].includes("KEY `idx_image_scope` (`guild_id`, `category`)"), ddl[0]);
    }

    {
        const { executor, ddl } = Probe(MATCHING_COLUMNS, MATCHING_INDEXES, ["team_roles"]);
        await new SchemaSync(executor).Run([TeamRoles]);

        assert.deepEqual(ddl, [], `ein passendes Schema darf nichts aendern, war: ${ddl.join(" | ")}`);
    }

    {
        const columns = MATCHING_COLUMNS.filter((row) => row.COLUMN_NAME !== "role_name");
        const { executor, ddl } = Probe(columns, MATCHING_INDEXES);

        await new SchemaSync(executor).Run([TeamRoles]);

        assert.equal(only(ddl, "ADD COLUMN").length, 1, ddl.join(" | "));
        assert.ok(ddl[0].includes("ADD COLUMN `role_name` VARCHAR(100) NOT NULL"), ddl[0]);
    }

    {
        const columns = [...MATCHING_COLUMNS, Column({ name: "alt_feld", dataType: "varchar", length: 50 })];
        const { executor, ddl } = Probe(columns, MATCHING_INDEXES);

        await new SchemaSync(executor).Run([TeamRoles]);

        assert.deepEqual(ddl, ["ALTER TABLE `team_roles` DROP COLUMN `alt_feld`"], ddl.join(" | "));
    }

    {
        const columns = MATCHING_COLUMNS.map((row) =>
            row.COLUMN_NAME === "role_id" ? Column({ name: "role_id", dataType: "varchar", length: 10 }) : row
        );

        const { executor, ddl } = Probe(columns, MATCHING_INDEXES);
        await new SchemaSync(executor).Run([TeamRoles]);

        assert.deepEqual(ddl, ["ALTER TABLE `team_roles` MODIFY COLUMN `role_id` VARCHAR(20) NOT NULL"], ddl.join(" | "));
    }

    {
        const columns = MATCHING_COLUMNS.map((row) =>
            row.COLUMN_NAME === "role_name"
                ? Column({ name: "role_name", dataType: "varchar", length: 100, nullable: true })
                : row
        );

        const { executor, ddl } = Probe(columns, MATCHING_INDEXES);
        await new SchemaSync(executor).Run([TeamRoles]);

        assert.equal(only(ddl, "MODIFY COLUMN `role_name`").length, 1, ddl.join(" | "));
    }

    {
        const { executor, ddl } = Probe(MATCHING_COLUMNS, []);
        await new SchemaSync(executor).Run([TeamRoles]);

        assert.deepEqual(
            ddl,
            ["ALTER TABLE `team_roles` ADD UNIQUE KEY `uniq_team_role` (`guild_id`, `role_id`)"],
            ddl.join(" | ")
        );
    }

    {
        const { executor, ddl } = Probe(MATCHING_COLUMNS, [Index("uniq_team_role", "guild_id")]);
        await new SchemaSync(executor).Run([TeamRoles]);

        assert.equal(ddl.length, 2, ddl.join(" | "));
        assert.ok(ddl[0].includes("DROP INDEX `uniq_team_role`"), ddl[0]);
        assert.ok(ddl[1].includes("ADD UNIQUE KEY `uniq_team_role`"), ddl[1]);
    }

    {
        const indexes = [...MATCHING_INDEXES, Index("idx_alt", "role_name", false)];
        const { executor, ddl } = Probe(MATCHING_COLUMNS, indexes);

        await new SchemaSync(executor).Run([TeamRoles]);

        assert.deepEqual(ddl, ["ALTER TABLE `team_roles` DROP INDEX `idx_alt`"], ddl.join(" | "));
    }

    {
        const { executor, ddl } = Probe([], []);
        await new SchemaSync(executor).Run([CATALOG]);

        const expected: Array<[string, string]> = [
            ["code", "CHAR(8) NOT NULL"],
            ["title", "VARCHAR(120) NOT NULL"],
            ["hint", "TINYTEXT NULL"],
            ["note", "MEDIUMTEXT NULL"],
            ["story", "LONGTEXT NULL"],
            ["external_id", "CHAR(36) NOT NULL"],
            ["tiny", "TINYINT UNSIGNED NOT NULL"],
            ["small", "SMALLINT NOT NULL"],
            ["medium", "MEDIUMINT NOT NULL"],
            ["hits", "BIGINT UNSIGNED NOT NULL"],
            ["ratio", "FLOAT NOT NULL"],
            ["precise", "DOUBLE NOT NULL"],
            ["amount", "DECIMAL(12,4) NOT NULL"],
            ["active", "TINYINT(1) NOT NULL"],
            ["birthday", "DATE NULL"],
            ["seen_at", "TIMESTAMP(6) NOT NULL"],
            ["open_from", "TIME NOT NULL"],
            ["season", "YEAR NOT NULL"],
            ["checksum", "BINARY(32) NOT NULL"],
            ["token", "VARBINARY(255) NULL"],
            ["thumb", "BLOB NULL"],
            ["payload", "LONGBLOB NULL"],
            ["settings", "JSON NULL"],
            ["state", "ENUM('neu','aktiv') NOT NULL"],
            ["flags", "SET('a','b') NULL"],
        ];

        for (const [column, sql] of expected) {
            assert.ok(ddl[0].includes(`\`${column}\` ${sql}`), `${column} sollte "${sql}" sein: ${ddl[0]}`);
        }
    }

    {
        const matching = [
            Column({ name: "state", dataType: "enum", columnType: "enum('neu','aktiv')" }),
            Column({ name: "amount", dataType: "decimal", numericPrecision: 12, numericScale: 4 }),
        ];

        const { executor, ddl } = Probe(matching, []);
        await new SchemaSync(executor).Run([SMALL_CATALOG]);

        assert.deepEqual(ddl, [], `passende ENUM- und DECIMAL-Spalten duerfen nichts aendern: ${ddl.join(" | ")}`);
    }

    {
        const outdated = [
            Column({ name: "state", dataType: "enum", columnType: "enum('neu')" }),
            Column({ name: "amount", dataType: "decimal", numericPrecision: 12, numericScale: 4 }),
        ];

        const { executor, ddl } = Probe(outdated, []);
        await new SchemaSync(executor).Run([SMALL_CATALOG]);

        assert.deepEqual(
            ddl,
            ["ALTER TABLE `small_catalog` MODIFY COLUMN `state` ENUM('neu','aktiv') NOT NULL"],
            ddl.join(" | ")
        );
    }

    {
        const outdated = [
            Column({ name: "state", dataType: "enum", columnType: "enum('neu','aktiv')" }),
            Column({ name: "amount", dataType: "decimal", numericPrecision: 10, numericScale: 2 }),
        ];

        const { executor, ddl } = Probe(outdated, []);
        await new SchemaSync(executor).Run([SMALL_CATALOG]);

        assert.deepEqual(
            ddl,
            ["ALTER TABLE `small_catalog` MODIFY COLUMN `amount` DECIMAL(12,4) NOT NULL"],
            ddl.join(" | ")
        );
    }

    {
        const { executor, ddl } = Probe([Column({ name: "settings", dataType: "longtext", nullable: true })], []);

        await new SchemaSync(executor).Run([
            { name: "Json", table: "json_probe", columns: { settings: { type: ColumnType.JSON, nullable: true } } },
        ]);

        assert.deepEqual(ddl, [], `JSON als longtext muss als passend gelten: ${ddl.join(" | ")}`);
    }

    const broken: ITableDefinition<any> = {
        name: "Broken",
        table: "broken",
        columns: { feld: { type: ColumnType.STRING } },
        indexes: [{ name: "idx_broken", columns: ["gibtsNicht"] }],
    };

    const { executor } = Probe([], []);
    await assert.rejects(new SchemaSync(executor).Run([broken]), /unbekanntes Feld "gibtsNicht"/);

    await assert.rejects(
        new SchemaSync(executor).Run([{ name: "Leer", table: "leer", columns: {} }]),
        /keine Spalten/
    );

    await assert.rejects(
        new SchemaSync(executor).Run([{ name: "Kollision", table: "kollision", columns: { id: { type: ColumnType.STRING } } }]),
        /kollidiert mit der automatischen Spalte/
    );

    console.log("OK - CREATE, ADD, MODIFY, DROP, Index-Abgleich und Definitions-Prüfung verhalten sich korrekt");
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
