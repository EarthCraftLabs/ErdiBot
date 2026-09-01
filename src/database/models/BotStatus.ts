import ColumnType from "../../enums/ColumnType";
import ITableDefinition from "../../interfaces/database/ITableDefinition";
import { IStatusRecord } from "../../interfaces/services/status/IStatusEntry";
import { KINDS } from "../../constants/Status";

// Der Bot-Status gilt für alle Server gleichzeitig - deshalb ohne guildId.
const BotStatus: ITableDefinition<IStatusRecord> = {
    name: "BotStatus",
    table: "bot_status",
    columns: {
        text: { type: ColumnType.STRING, length: 128 },
        kind: { type: ColumnType.ENUM, values: KINDS.map((entry) => entry.id) },
        enabled: { type: ColumnType.BOOLEAN, default: 1 },
        createdAt: { type: ColumnType.DATETIME },
        updatedAt: { type: ColumnType.DATETIME },
    },
    indexes: [{ name: "idx_bot_status_enabled", columns: ["enabled"] }],
};

export default BotStatus;
