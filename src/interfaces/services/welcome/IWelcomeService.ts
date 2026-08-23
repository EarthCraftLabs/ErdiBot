import { AttachmentBuilder, GuildMember } from "discord.js";
import IWelcomeConfig, { IWelcomeCard } from "./IWelcomeConfig";
import { LayerType, WelcomeLayer } from "./IWelcomeLayer";

export interface IFontEntry {
    family: string;
    slug: string;
    category: string;
    regular: string;
    license: string;
    source: string;
}

export interface IPlaceholderContext {
    mention: string;
    username: string;
    displayName: string;
    tag: string;
    guild: string;
    memberCount: number;
    avatar: string;
    joinedAt: Date;
}

export default interface IWelcomeService {
    Initialize(): Promise<void>;

    readonly Fonts: IFontEntry[];
    HasFont(family: string): boolean;

    Get(guildId: string): Promise<IWelcomeConfig>;
    Save(config: IWelcomeConfig): Promise<void>;
    Reset(guildId: string): Promise<void>;

    AddLayer(card: IWelcomeCard, type: LayerType): WelcomeLayer;
    RemoveLayer(card: IWelcomeCard, id: string): boolean;
    MoveLayer(card: IWelcomeCard, id: string, direction: -1 | 1): boolean;

    Fill(template: string, context: IPlaceholderContext): string;
    Context(member: GuildMember): IPlaceholderContext;

    Render(config: IWelcomeConfig, context: IPlaceholderContext): Promise<AttachmentBuilder>;
    Preview(config: IWelcomeConfig, guildName: string): Promise<AttachmentBuilder>;
}
