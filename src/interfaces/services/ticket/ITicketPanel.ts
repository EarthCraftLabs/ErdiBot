import { ContainerBuilder } from "discord.js";
import { ITicketCategory, ITicketConfig } from "./ITicketConfig";

export type SetupView =
    | "home"
    | "channels"
    | "roles"
    | "categories"
    | "category"
    | "panel"
    | "limits"
    | "blacklist";

// Eine Aktion aus dem Ticket-Menü, wie sie in src/config/ticket.json steht.
export interface IActionOption {
    name: string;
    description: string;
    value: string;
    emoji: string;
}

export interface ISetupState {
    guildId: string;
    view: SetupView;

    config: ITicketConfig;
    draft: ITicketCategory | null;
    categoryIndex: number;

    // Die Vorstufe des Kanal-Pickers: erst Text oder Thread, dann die gefilterte Liste.
    picking: string | null;
    kind: "text" | "thread" | null;

    dirty: boolean;
    notice: string | null;
}

export interface ISetupPanelView {
    components: ContainerBuilder[];
}
