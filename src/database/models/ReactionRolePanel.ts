import ColumnType from "../../enums/ColumnType";
import ITableDefinition from "../../interfaces/database/ITableDefinition";
import IReactionRoleRecord from "../../interfaces/services/reactionroles/IReactionRoleRecord";

const ReactionRolePanel: ITableDefinition<IReactionRoleRecord> = {
    name: "ReactionRolePanel",
    table: "reaction_role_panel",
    columns: {
        panelId: { type: ColumnType.STRING, length: 32 },
        guildId: { type: ColumnType.STRING, length: 20 },
        channelId: { type: ColumnType.STRING, length: 20, nullable: true, blankAsNull: true },
        messageId: { type: ColumnType.STRING, length: 20, nullable: true, blankAsNull: true },
        title: { type: ColumnType.STRING, length: 100 },
        description: { type: ColumnType.TEXT },
        accent: { type: ColumnType.CHAR, length: 7, nullable: true, blankAsNull: true },
        thumbnail: { type: ColumnType.STRING, length: 512, nullable: true, blankAsNull: true },
        image: { type: ColumnType.STRING, length: 512, nullable: true, blankAsNull: true },
        style: { type: ColumnType.STRING, length: 10 },
        mode: { type: ColumnType.STRING, length: 10 },
        entries: { type: ColumnType.JSON },
        updatedAt: { type: ColumnType.DATETIME },
    },
    indexes: [
        { name: "uniq_rr_panel", columns: ["panelId"], unique: true },
        { name: "idx_rr_guild", columns: ["guildId"] },
    ],
};

export default ReactionRolePanel;
