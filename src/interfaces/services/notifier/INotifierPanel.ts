import { ContainerBuilder } from "discord.js";
import INotifierSubscription, { Platform } from "./INotifierSubscription";

export type PanelView = "home" | "add" | "entry" | "message" | "roles" | "options" | "status";

export interface INotifierState {
    guildId: string;
    view: PanelView;

    entries: INotifierSubscription[];
    index: number;

    draft: INotifierSubscription | null;
    platform: Platform | null;

    dirty: boolean;
    notice: string | null;
}

export interface INotifierPanelView {
    components: ContainerBuilder[];
}
