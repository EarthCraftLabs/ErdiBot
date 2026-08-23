import { AttachmentBuilder, ContainerBuilder } from "discord.js";
import IWelcomeConfig from "./IWelcomeConfig";

export type WelcomeView = "home" | "card" | "layers" | "layer" | "message" | "category" | "image";

export type ImageTarget = "background" | "layer";

export interface IWelcomeState {
    guildId: string;
    view: WelcomeView;
    config: IWelcomeConfig;
    layerId: string | null;
    target: ImageTarget | null;
    category: string | null;
    dirty: boolean;
    notice: string | null;
}

export interface IWelcomePanelView {
    components: ContainerBuilder[];
    files: AttachmentBuilder[];
}
