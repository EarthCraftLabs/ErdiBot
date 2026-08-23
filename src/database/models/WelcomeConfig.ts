import ColumnType from "../../enums/ColumnType";
import ITableDefinition from "../../interfaces/database/ITableDefinition";
import IWelcomeRecord from "../../interfaces/services/welcome/IWelcomeRecord";

const WelcomeConfig: ITableDefinition<IWelcomeRecord> = {
    name: "WelcomeConfig",
    table: "welcome_config",
    columns: {
        guildId: { type: ColumnType.STRING, length: 20 },
        enabled: { type: ColumnType.BOOLEAN, default: 0 },
        channelId: { type: ColumnType.STRING, length: 20, nullable: true, blankAsNull: true },
        mode: { type: ColumnType.STRING, length: 20 },
        title: { type: ColumnType.STRING, length: 100 },
        message: { type: ColumnType.TEXT },
        accent: { type: ColumnType.CHAR, length: 7 },
        card: { type: ColumnType.JSON },
        updatedAt: { type: ColumnType.DATETIME },
    },
    indexes: [{ name: "uniq_welcome_guild", columns: ["guildId"], unique: true }],
};

export default WelcomeConfig;
