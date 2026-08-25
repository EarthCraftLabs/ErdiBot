import { IReactionRoleEntry } from "./IReactionRolePanel";

export default interface IReactionRoleRecord {
    panelId: string;
    guildId: string;
    channelId: string | null;
    messageId: string | null;
    title: string;
    description: string;
    accent: string | null;
    thumbnail: string | null;
    image: string | null;
    style: string;
    mode: string;
    entries: IReactionRoleEntry[];
    updatedAt: Date;
}
