import { Guild, GuildMember } from "discord.js";
import IReactionRolePanel, { IPanelMedia, IReactionRoleEntry } from "./IReactionRolePanel";

/** Was ein Klick am Mitglied ändert — getrennt berechnet, damit es ohne Discord testbar bleibt. */
export interface IRoleChange {
    add: string[];
    remove: string[];
}

export default interface IReactionRolesService {
    List(guildId: string): Promise<IReactionRolePanel[]>;
    Get(panelId: string): Promise<IReactionRolePanel | null>;
    Create(guildId: string): IReactionRolePanel;
    Save(panel: IReactionRolePanel): Promise<void>;
    Delete(panelId: string): Promise<void>;

    AddEntry(panel: IReactionRolePanel, roleId: string, label: string): IReactionRoleEntry | null;
    RemoveEntry(panel: IReactionRolePanel, entryId: string): boolean;
    MoveEntry(panel: IReactionRolePanel, entryId: string, direction: -1 | 1): boolean;

    Media(panel: IReactionRolePanel): Promise<IPanelMedia>;
    Publish(panel: IReactionRolePanel): Promise<void>;
    Unpublish(panel: IReactionRolePanel): Promise<boolean>;

    Apply(member: GuildMember, change: IRoleChange, reason: string): Promise<void>;
    Issue(guild: Guild, roleId: string): string | null;
}
