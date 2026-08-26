import BotClient from "../../../client/BotClient";
import { INotifierEvent, IPlatformAdapter } from "./INotifierEvent";
import INotifierSubscription, { Platform } from "./INotifierSubscription";

export interface IPlaceholderContext {
    name: string;
    url: string;
    platform: string;
    title: string;
    link: string;
    thumbnail: string;
    game: string;
    viewers: string;
    mention: string;
    role: string;
    discord: string;
}

export interface IPollSummary {
    checked: number;
    notified: number;
    skipped: number;
    failed: number;
}

export default interface INotifierService {
    client: BotClient;

    readonly Adapters: IPlatformAdapter[];

    Adapter(platform: Platform): IPlatformAdapter;

    List(guildId: string): Promise<INotifierSubscription[]>;
    Save(subscription: INotifierSubscription): Promise<void>;
    Remove(guildId: string, platform: Platform, identifier: string): Promise<boolean>;

    Fill(template: string, context: IPlaceholderContext): string;
    Context(subscription: INotifierSubscription, event: INotifierEvent): IPlaceholderContext;

    Poll(): Promise<IPollSummary>;
    Announce(subscription: INotifierSubscription, event: INotifierEvent): Promise<void>;
}
