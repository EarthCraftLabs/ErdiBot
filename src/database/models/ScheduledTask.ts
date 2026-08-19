import ColumnType from "../../enums/ColumnType";
import TaskTypes from "../../enums/TaskTypes";
import ITableDefinition from "../../interfaces/database/ITableDefinition";
import IRunnableModel from "../../interfaces/services/runnables/IRunnableModel";

const ScheduledTask: ITableDefinition<IRunnableModel> = {
    name: "ScheduledTask",
    table: "scheduled_tasks",
    columns: {
        name: { type: ColumnType.STRING, length: 64 },
        type: { type: ColumnType.ENUM, values: Object.values(TaskTypes) },

        time: { type: ColumnType.STRING, length: 5, nullable: true },
        date: { type: ColumnType.STRING, length: 10, nullable: true },
        expression: { type: ColumnType.STRING, length: 32, nullable: true },

        nextRun: { type: ColumnType.DATETIME, nullable: true },
        lastRun: { type: ColumnType.DATETIME, nullable: true },
        lastError: { type: ColumnType.TEXT, nullable: true },
        retryCount: { type: ColumnType.INTEGER, unsigned: true },

        enabled: { type: ColumnType.BOOLEAN },
        isRunning: { type: ColumnType.BOOLEAN },
    },
    indexes: [
        { name: "uniq_task_name", columns: ["name"], unique: true },
        { name: "idx_task_due", columns: ["enabled", "isRunning", "nextRun"] },
    ],
    cache: false,
};

export default ScheduledTask;
