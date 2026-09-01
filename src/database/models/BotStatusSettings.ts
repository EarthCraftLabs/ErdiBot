import ColumnType from "../../enums/ColumnType";
import ITableDefinition from "../../interfaces/database/ITableDefinition";
import { IStatusSettings } from "../../interfaces/services/status/IStatusEntry";

// Eine einzige Zeile für die Rotation selbst. Der scope hält sie eindeutig, damit ein
// zweiter Aufruf sie aktualisiert statt eine weitere anzulegen.
const BotStatusSettings: ITableDefinition<IStatusSettings> = {
    name: "BotStatusSettings",
    table: "bot_status_settings",
    columns: {
        scope: { type: ColumnType.STRING, length: 20 },
        interval: { type: ColumnType.SMALLINT, unsigned: true, default: 30 },
        enabled: { type: ColumnType.BOOLEAN, default: 1 },
        updatedAt: { type: ColumnType.DATETIME },
    },
    indexes: [{ name: "uniq_bot_status_settings", columns: ["scope"], unique: true }],
};

export default BotStatusSettings;
