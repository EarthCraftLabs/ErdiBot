import { AttachmentBuilder } from "discord.js";
import { Row } from "../../database/IQuery";
import IGalleryImage from "./IGalleryImage";

export type GalleryDocument = Row<IGalleryImage>;

export interface IGalleryEntry extends IGalleryImage {
    id: string;
    url: string;
    path: string;
    shortPath: string;
}

export interface ICategoryEntry {
    guildId: string;
    name: string;
    parent: string | null;
    scope: "default" | "custom";
    images: number;
}

export interface IGalleryFolder {
    category: string;
    subcategory?: string | null;
}

export interface IGalleryTarget extends IGalleryFolder {
    guildId: string;
}

export interface IListOptions {
    requireImages?: boolean;
}

export interface IAttachedMedia {
    media: string[];
    files: AttachmentBuilder[];
}

export interface ISearchOptions {
    includeDefault?: boolean;
    limit?: number;
}

export default interface IGalleryService {
    Initialize(): Promise<void>;

    GetCategories(guildId: string, options?: IListOptions): Promise<ICategoryEntry[]>;
    GetSubcategories(guildId: string, category: string, options?: IListOptions): Promise<ICategoryEntry[]>;
    GetImages(target: IGalleryTarget): Promise<IGalleryEntry[]>;
    GetImage(id: string): Promise<IGalleryEntry | null>;
    SearchImages(guildId: string, query: string, options?: ISearchOptions): Promise<IGalleryEntry[]>;
    Attach(images: IGalleryEntry[]): IAttachedMedia;
    Asset(assetPath: string): Promise<IAttachedMedia>;

    CreateCategory(target: IGalleryTarget): Promise<boolean>;
    DeleteCategory(target: IGalleryTarget): Promise<number>;

    AddImage(target: IGalleryTarget, url: string, fileName?: string): Promise<IGalleryEntry>;
    MoveImage(id: string, folder: IGalleryFolder): Promise<boolean>;
    DeleteImage(id: string): Promise<boolean>;
}
