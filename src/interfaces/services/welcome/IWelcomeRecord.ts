import { IWelcomeCard, WelcomeMode } from "./IWelcomeConfig";

export default interface IWelcomeRecord {
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
