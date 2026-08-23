import { ImageFit, WelcomeLayer } from "./IWelcomeLayer";

export type WelcomeMode = "image" | "image_container" | "container";

export interface IWelcomeCard {
    width: number;
    height: number;
    background: string | null;
    fit: ImageFit;
    color: string;
    gradient: string | null;
    overlay: number;
    radius: number;
    layers: WelcomeLayer[];
}

export default interface IWelcomeConfig {
    guildId: string;
    enabled: boolean;
    channelId: string | null;
    mode: WelcomeMode;
    title: string;
    message: string;
    accent: string;
    card: IWelcomeCard;
    updatedAt: Date;
}
