import { AttachmentBuilder } from "discord.js";

export type ReactionRoleMode = "toggle" | "unique" | "verify";

export type ReactionRoleStyle = "buttons" | "select";

export type ReactionRoleTone = "primary" | "secondary" | "success" | "danger";

/** Ein Emoji so, wie Discord es braucht: Unicode hat keine id, Server-Emojis schon. */
export interface IEmojiRef {
    id: string | null;
    name: string;
    animated: boolean;
}

/** Aufgelöste Bilder einer Nachricht: eigene Adresse direkt, Galerie-Bild je nach Modus als Anhang. */
export interface IPanelMedia {
    thumbnail: string | null;
    image: string | null;
    files: AttachmentBuilder[];
}

export interface IReactionRoleEntry {
    id: string;
    roleId: string;
    label: string;
    description: string | null;
    emoji: IEmojiRef | null;
    tone: ReactionRoleTone;
}

export default interface IReactionRolePanel {
    panelId: string;
    guildId: string;
    channelId: string | null;
    messageId: string | null;
    title: string;
    description: string;
    accent: string | null;
    /** https-Adresse **oder** ID eines Galerie-Bildes. */
    thumbnail: string | null;
    image: string | null;
    style: ReactionRoleStyle;
    mode: ReactionRoleMode;
    entries: IReactionRoleEntry[];
    updatedAt: Date;
}
