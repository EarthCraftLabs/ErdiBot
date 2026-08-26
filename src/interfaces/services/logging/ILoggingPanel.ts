import { ContainerBuilder } from "discord.js";
import LogType from "../../../enums/LogType";
import IDiscordLogChannel from "../../database/models/IDiscordLogChannel";
import { ILogHealth } from "./ILoggingService";

export type PanelView = "home" | "kind" | "pick" | "status";

// "text" oder "thread" - die Vorstufe, die entscheidet, was der Kanal-Picker anzeigt.
export type ChannelKind = "text" | "thread";

export interface ILoggingState {
    guildId: string;
    view: PanelView;

    targets: Map<LogType, IDiscordLogChannel>;
    health: ILogHealth[];

    logType: LogType | null;
    kind: ChannelKind | null;

    notice: string | null;
}

export interface ILoggingPanelView {
    components: ContainerBuilder[];
}
