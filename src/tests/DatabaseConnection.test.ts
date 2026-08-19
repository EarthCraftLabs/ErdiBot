import assert from "node:assert";
import { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import Repository from "../database/Repository";
import GalleryImage from "../database/models/GalleryImage";
import ScheduledTask from "../database/models/ScheduledTask";
import ColumnType from "../enums/ColumnType";
import IExecutor, { QueryParam } from "../interfaces/database/IExecutor";
import ITableDefinition from "../interfaces/database/ITableDefinition";
import IGalleryImage from "../interfaces/services/gallery/IGalleryImage";
import IRunnableModel from "../interfaces/services/runnables/IRunnableModel";

interface IConversions {
    settings: Record<string, unknown> | null;
    flags: string[] | null;
    amount: string;
    hits: number;
    active: boolean;
    thumb: Buffer | null;
}

const CONVERSIONS: ITableDefinition<IConversions> = {
    name: "Conversions",
    table: "conversions",
    columns: {
        settings: { type: ColumnType.JSON, nullable: true },
        flags: { type: ColumnType.SET, values: ["a", "b", "c"], nullable: true },
        amount: { type: ColumnType.DECIMAL, precision: 12, scale: 4 },
        hits: { type: ColumnType.BIGINT, unsigned: true },
        active: { type: ColumnType.BOOLEAN },
        thumb: { type: ColumnType.BLOB, nullable: true },
    },
    cache: false,
};

interface ICall {
    sql: string;
    params: QueryParam[];
}

const calls: ICall[] = [];
let nextRows: RowDataPacket[] = [];

const executor: IExecutor = {
    async Rows(sql, params = []) {
        calls.push({ sql: sql.replace(/\s+/g, " ").trim(), params });
        return nextRows;
    },
    async Run(sql, params = []) {
        calls.push({ sql: sql.replace(/\s+/g, " ").trim(), params });
        return { affectedRows: 1, insertId: 7 } as ResultSetHeader;
    },
    async Raw() {
        throw new Error("Ein Repository darf kein DDL ausführen");
    },
};

const images = new Repository<IGalleryImage>(executor, GalleryImage);
const tasks = new Repository<IRunnableModel>(executor, ScheduledTask);
const mixed = new Repository<IConversions>(executor, CONVERSIONS);

const row = (values: Record<string, unknown>) => values as RowDataPacket;
const last = (): ICall => calls[calls.length - 1];

const since = () => {
    const before = calls.length;
    return () => calls.length - before;
};

async function main(): Promise<void> {
    const when = new Date("2026-01-02T03:04:05.000Z");

    nextRows = [];

    await images.Find({ guildId: "1", category: "ranks" });
    assert.equal(last().sql, "SELECT * FROM `gallery_images` WHERE `guild_id` = ? AND `category` = ?");
    assert.deepEqual(last().params, ["1", "ranks"], "camelCase muss auf snake_case abgebildet werden");

    await images.Find({ guildId: { in: ["default", "1"] } });
    assert.ok(last().sql.includes("`guild_id` IN (?, ?)"), last().sql);
    assert.deepEqual(last().params, ["default", "1"]);

    await images.Find({ id: { in: [] } });
    assert.ok(last().sql.includes("WHERE 1 = 0"), last().sql);

    await images.Find({ category: { notIn: [] } });
    assert.ok(last().sql.includes("WHERE 1 = 1"), last().sql);

    await tasks.Find({ nextRun: { not: null } });
    assert.ok(last().sql.includes("`next_run` IS NOT NULL"), last().sql);

    await tasks.Find({ lastError: null });
    assert.ok(last().sql.includes("`last_error` IS NULL"), last().sql);

    await tasks.Find({ enabled: true, isRunning: false, nextRun: { lte: when } });
    assert.equal(
        last().sql,
        "SELECT * FROM `scheduled_tasks` WHERE `enabled` = ? AND `is_running` = ? AND `next_run` <= ?"
    );
    assert.deepEqual(last().params, [1, 0, when], "Booleans muessen als 1/0 rausgehen");

    await images.Find({ guildId: "order" }, { orderBy: { category: "ASC", file: "DESC" }, limit: 10 });
    assert.ok(last().sql.endsWith("ORDER BY `category` ASC, `file` DESC LIMIT 10"), last().sql);

    await images.Find({ guildId: "1", subcategory: null });
    assert.ok(last().sql.includes("`subcategory` = ?"), last().sql);
    assert.deepEqual(last().params, ["1", ""]);

    await images.Insert({ guildId: "1", category: "ranks", subcategory: null, file: "gc.png", createdAt: when });
    assert.equal(
        last().sql,
        "INSERT INTO `gallery_images` (`guild_id`, `category`, `subcategory`, `file`, `created_at`) " +
            "VALUES (?, ?, ?, ?, ?)"
    );
    assert.equal(last().params[2], "", "null muss auf einer blankAsNull-Spalte als '' landen");

    await tasks.Update({ name: "Heartbeat", isRunning: false }, { isRunning: true });
    assert.equal(last().sql, "UPDATE `scheduled_tasks` SET `is_running` = ? WHERE `name` = ? AND `is_running` = ?");
    assert.deepEqual(last().params, [1, "Heartbeat", 0]);

    await images.Upsert({ guildId: "1", category: "ranks", subcategory: null, file: "gc.png" }, { createdAt: when });
    const [insert, select] = calls.slice(-2);
    assert.ok(insert.sql.includes("ON DUPLICATE KEY UPDATE `id` = `id`"), insert.sql);
    assert.ok(select.sql.startsWith("SELECT * FROM `gallery_images`"), select.sql);

    nextRows = [row({ id: 5, guild_id: "1", category: "ranks", subcategory: "", file: "gc.png", created_at: when })];

    const [image] = await images.Find({ file: "gc.png" });
    assert.equal(image.id, 5);
    assert.equal(image.subcategory, null, "'' muss wieder als null ankommen");
    assert.deepEqual(image.createdAt, when);

    nextRows = [
        row({
            id: 3,
            name: "Heartbeat",
            type: "INTERVAL",
            time: null,
            date: null,
            expression: "15m",
            next_run: when,
            last_run: null,
            last_error: null,
            retry_count: 2,
            enabled: 1,
            is_running: 0,
        }),
    ];

    const task = await tasks.FindOne({ name: "Heartbeat" });
    assert.equal(task?.enabled, true, "TINYINT 1 muss true werden");
    assert.equal(task?.isRunning, false, "TINYINT 0 muss false werden");
    assert.equal(task?.retryCount, 2);
    assert.equal(task?.time, null);

    const blob = Buffer.from("xy");

    await mixed.Insert({
        settings: { theme: "dark", tags: ["a"] },
        flags: ["a", "c"],
        amount: "12.3400",
        hits: 7,
        active: true,
        thumb: blob,
    });

    assert.deepEqual(
        last().params,
        ['{"theme":"dark","tags":["a"]}', "a,c", "12.3400", 7, 1, blob],
        "JSON muss serialisiert, SET zusammengefügt und boolean zu 1 werden"
    );

    nextRows = [
        row({
            id: 1,
            settings: '{"theme":"dark"}',
            flags: "a,c",
            amount: "12.3400",
            hits: "42",
            active: 1,
            thumb: blob,
        }),
    ];

    const [entry] = await mixed.Find({ id: 1 });

    assert.deepEqual(entry.settings, { theme: "dark" }, "JSON muss geparst ankommen");
    assert.deepEqual(entry.flags, ["a", "c"], "SET muss als Array ankommen");
    assert.equal(entry.amount, "12.3400", "DECIMAL muss string bleiben, sonst ist die Genauigkeit weg");
    assert.equal(entry.hits, 42, "Zahlen muessen als number ankommen");
    assert.equal(entry.active, true);
    assert.ok(Buffer.isBuffer(entry.thumb), "BLOB muss ein Buffer bleiben");

    nextRows = [row({ id: 2, settings: null, flags: "", amount: "0.0000", hits: 0, active: 0, thumb: null })];

    const [empty] = await mixed.Find({ id: 2 });

    assert.deepEqual(empty.flags, [], "leeres SET muss ein leeres Array werden");
    assert.equal(empty.settings, null);
    assert.equal(empty.active, false);

    nextRows = [row({ id: 3, settings: "{kaputt", flags: "", amount: "0.0000", hits: 0, active: 0, thumb: null })];

    await assert.rejects(mixed.Find({ id: 3 }), /kein gültiges JSON/, "kaputtes JSON darf nicht still durchrutschen");

    nextRows = [];

    let count = since();
    await images.Find({ guildId: "cache" });
    await images.Find({ guildId: "cache" });
    await images.Find({ guildId: "cache" });
    assert.equal(count(), 1, "identische Find muessen aus dem Cache kommen");

    count = since();
    await images.Find({ guildId: "cache" }, { limit: 5 });
    assert.equal(count(), 1, "andere Optionen duerfen sich einen Eintrag nicht teilen");

    count = since();
    await images.Delete({ guildId: "cache" });
    await images.Find({ guildId: "cache" });
    assert.equal(count(), 2, "nach einem Schreibzugriff muss neu geladen werden");

    count = since();
    await images.Find({ guildId: "invalidate" });
    await images.Find({ guildId: "invalidate" });
    images.Invalidate();
    await images.Find({ guildId: "invalidate" });
    assert.equal(count(), 2, "Invalidate muss den Cache leeren");

    count = since();
    await tasks.Find({ name: "ohne-cache" });
    await tasks.Find({ name: "ohne-cache" });
    assert.equal(count(), 2, "cache:false darf nichts cachen");

    count = since();
    assert.equal(await images.FindById("keine-zahl"), null);
    assert.equal(await images.FindById("0"), null);
    assert.equal(count(), 0, "unbrauchbare IDs duerfen die Datenbank nie erreichen");

    await assert.rejects(images.Delete({}), /ohne Bedingung/, "Delete ohne where muss scheitern");
    await assert.rejects(images.Find({ tippfehler: 1 } as any), /Unbekannte Spalte/, "Tippfehler muss auffliegen");
    await assert.rejects(
        images.Find({ guildId: { in: ["a"], not: "b" } } as any),
        /Genau ein Operator/,
        "zwei Operatoren auf einer Spalte muessen scheitern"
    );

    console.log(`OK - SQL-Aufbau, Typ-Umwandlung, Cache und Schutzgeländer bestanden (${calls.length} Statements)`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
