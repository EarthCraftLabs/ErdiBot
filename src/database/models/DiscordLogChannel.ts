import ColumnType from "../../enums/ColumnType";
import ITableDefinition from "../../interfaces/database/ITableDefinition";
import IDiscordLogChannel from "../../interfaces/database/models/IDiscordLogChannel";

const DiscordLogChannel: ITableDefinition<IDiscordLogChannel> = {
    name: "DiscordLogChannel",
    table: "discord_log_channels",
    columns: {
        guildId: { type: ColumnType.STRING, length: 20 },
        name: { type: ColumnType.STRING, length: 100 },
        logType: { type: ColumnType.STRING, length: 50 },
        channelId: { type: ColumnType.STRING, length: 20 },
    },
    indexes: [{ name: "uniq_log_channel", columns: ["guildId", "logType"], unique: true }],
};

export default DiscordLogChannel;
