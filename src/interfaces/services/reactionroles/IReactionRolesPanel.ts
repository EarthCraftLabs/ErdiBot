import { AttachmentBuilder, ContainerBuilder } from "discord.js";
import IReactionRolePanel from "./IReactionRolePanel";

export type ReactionRolesView = "home" | "panel" | "entry" | "media" | "picker";

/** Welches der beiden Bildfelder gerade bearbeitet wird. */
export type MediaTarget = "thumbnail" | "image";

export interface IReactionRolesState {
    guildId: string;
    view: ReactionRolesView;
    panel: IReactionRolePanel | null;
    entryId: string | null;
    target: MediaTarget | null;
    dirty: boolean;
    notice: string | null;
}

export interface IReactionRolesPanelView {
    components: ContainerBuilder[];
    files: AttachmentBuilder[];
}
