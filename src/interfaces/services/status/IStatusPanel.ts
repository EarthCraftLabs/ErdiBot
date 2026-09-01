import { ContainerBuilder } from "discord.js";
import IStatusEntry from "./IStatusEntry";

export type StatusView = "home" | "entry" | "placeholders";

export interface IStatusState {
    view: StatusView;
    entries: IStatusEntry[];
    interval: number;
    enabled: boolean;
    // Welcher Eintrag gerade bearbeitet wird - die feste Kennung, nicht der Index:
    // nach dem Löschen zeigt ein Index auf den falschen Nachbarn.
    entryId: string | null;
    notice: string | null;
}

export interface IStatusPanelView {
    components: ContainerBuilder[];
}
