import ColumnType from "../../enums/ColumnType";
import ITableDefinition from "../../interfaces/database/ITableDefinition";
import ITeamRoles from "../../interfaces/database/models/ITeamRoles";

const TeamRoles: ITableDefinition<ITeamRoles> = {
    name: "TeamRoles",
    table: "team_roles",
    columns: {
        guildId: { type: ColumnType.STRING, length: 20 },
        roleName: { type: ColumnType.STRING, length: 100 },
        roleId: { type: ColumnType.STRING, length: 20 },
        sortIndex: { type: ColumnType.INTEGER },
    },
    indexes: [{ name: "uniq_team_role", columns: ["guildId", "roleId"], unique: true }],
};

export default TeamRoles;
